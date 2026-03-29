import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Search, Users, Download, Loader2, Smartphone, Filter,
  CheckCircle2, AlertCircle, RefreshCw, Copy, UserCheck, ShieldCheck
} from "lucide-react";

interface GroupInfo {
  jid: string;
  name: string;
  participants_count: number;
}

interface ExtractedLead {
  phone: string;
  name: string;
  group_jid: string;
  group_name: string;
  is_admin: boolean;
}

export default function GroupLeadExtractor() {
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState("");
  const [leads, setLeads] = useState<ExtractedLead[]>([]);
  const [totalBeforeDedup, setTotalBeforeDedup] = useState(0);
  const [lidSkipped, setLidSkipped] = useState(0);
  const [searchGroups, setSearchGroups] = useState("");
  const [searchLeads, setSearchLeads] = useState("");

  // Filters
  const [brazilOnly, setBrazilOnly] = useState(false);
  const [participantType, setParticipantType] = useState<"all" | "admin" | "member">("all");

  // Fetch user's connected devices
  const { data: devices = [] } = useQuery({
    queryKey: ["devices-for-extractor"],
    queryFn: async () => {
      const { data } = await supabase
        .from("devices")
        .select("id, name, number, status, uazapi_base_url")
        .not("uazapi_base_url", "is", null)
        .order("name");
      return (data || []).filter(d =>
        ["Ready", "Connected", "connected", "authenticated", "open", "active"].includes(d.status)
      );
    },
    staleTime: 30_000,
  });

  // Load groups from selected device
  const handleLoadGroups = async () => {
    if (!selectedDevice) return;
    setLoadingGroups(true);
    setGroups([]);
    setSelectedGroups(new Set());
    setLeads([]);
    try {
      const { data, error } = await supabase.functions.invoke("extract-group-leads", {
        body: { action: "list_groups", device_id: selectedDevice },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setGroups(data.groups || []);
      if ((data.groups || []).length === 0) {
        toast.warning("Nenhum grupo encontrado nesta instância");
      } else {
        toast.success(`${data.groups.length} grupos encontrados`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao buscar grupos");
    } finally {
      setLoadingGroups(false);
    }
  };

  // Extract participants
  const handleExtract = async () => {
    if (selectedGroups.size === 0) {
      toast.warning("Selecione pelo menos um grupo");
      return;
    }
    setExtracting(true);
    setLeads([]);
    setLidSkipped(0);
    setExtractProgress("Iniciando extração...");

    try {
      const allGroupInfos = groups
        .filter(g => selectedGroups.has(g.jid))
        .map(g => ({ jid: g.jid, name: g.name }));

      // Process in batches of 20 to avoid timeouts
      const BATCH_SIZE = 20;
      const allLeads: ExtractedLead[] = [];
      let totalLidSkipped = 0;
      let totalRaw = 0;

      for (let i = 0; i < allGroupInfos.length; i += BATCH_SIZE) {
        const batch = allGroupInfos.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(allGroupInfos.length / BATCH_SIZE);
        setExtractProgress(`Processando lote ${batchNum}/${totalBatches} (${i + batch.length}/${allGroupInfos.length} grupos)...`);

        const { data, error } = await supabase.functions.invoke("extract-group-leads", {
          body: {
            action: "extract_participants",
            device_id: selectedDevice,
            group_jids: batch,
            filters: {
              brazil_only: brazilOnly,
              participant_type: participantType === "all" ? null : participantType,
            },
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        allLeads.push(...(data.participants || []));
        totalLidSkipped += data.lid_skipped || 0;
        totalRaw += data.total_before_dedup || 0;
      }

      // Final client-side dedup across batches
      const seen = new Map<string, ExtractedLead>();
      for (const l of allLeads) {
        if (!seen.has(l.phone)) seen.set(l.phone, l);
      }
      const deduplicated = Array.from(seen.values());

      setLeads(deduplicated);
      setTotalBeforeDedup(allLeads.length);
      setLidSkipped(totalLidSkipped);
      setExtractProgress("");

      const dupes = allLeads.length - deduplicated.length;
      let msg = `${deduplicated.length} leads extraídos`;
      if (dupes > 0) msg += ` (${dupes} duplicados removidos)`;
      if (totalLidSkipped > 0) msg += ` — ${totalLidSkipped} contatos de comunidade ignorados (número oculto)`;
      toast.success(msg);
    } catch (err: any) {
      toast.error(err?.message || "Erro na extração");
      setExtractProgress("");
    } finally {
      setExtracting(false);
    }
  };

  const filteredGroups = useMemo(() => {
    if (!searchGroups) return groups;
    const q = searchGroups.toLowerCase();
    return groups.filter(g => g.name.toLowerCase().includes(q) || g.jid.includes(q));
  }, [groups, searchGroups]);

  const filteredLeads = useMemo(() => {
    if (!searchLeads) return leads;
    const q = searchLeads.toLowerCase();
    return leads.filter(l =>
      l.phone.includes(q) || l.name.toLowerCase().includes(q) || l.group_name.toLowerCase().includes(q)
    );
  }, [leads, searchLeads]);

  const toggleGroup = (jid: string) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      next.has(jid) ? next.delete(jid) : next.add(jid);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedGroups.size === filteredGroups.length) {
      setSelectedGroups(new Set());
    } else {
      setSelectedGroups(new Set(filteredGroups.map(g => g.jid)));
    }
  };

  const copyAllPhones = () => {
    const phones = leads.map(l => l.phone).join("\n");
    navigator.clipboard.writeText(phones);
    toast.success(`${leads.length} números copiados!`);
  };

  const exportCSV = useCallback(() => {
    const header = "Número,Nome,Grupo,Admin\n";
    const rows = leads.map(l => `${l.phone},"${l.name.replace(/"/g, '""')}","${l.group_name.replace(/"/g, '""')}",${l.is_admin ? "Sim" : "Não"}`).join("\n");
    const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
  }, [leads]);

  const exportXLSX = useCallback(async () => {
    const XLSX = await import("xlsx");
    const data = leads.map((l, i) => ({
      "#": i + 1,
      "Número": l.phone,
      "Nome": l.name || "",
      "Grupo": l.group_name,
      "Tipo": l.is_admin ? "Admin" : "Membro",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    // Auto column widths
    ws["!cols"] = [
      { wch: 5 },
      { wch: 18 },
      { wch: 25 },
      { wch: 30 },
      { wch: 10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads");
    XLSX.writeFile(wb, `leads_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("XLSX exportado!");
  }, [leads]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          Extrator de Grupos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Extraia leads de grupos e comunidades do WhatsApp
        </p>
      </div>

      {/* Step 1: Select Instance */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-primary" />
            1. Selecionar Instância
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma instância conectada" />
                </SelectTrigger>
                <SelectContent>
                  {devices.map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} {d.number ? `(${d.number})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleLoadGroups} disabled={!selectedDevice || loadingGroups}>
              {loadingGroups ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Buscar Grupos
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Groups List */}
      {groups.length > 0 && (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                2. Selecionar Grupos
                <Badge variant="secondary" className="ml-2">{groups.length} grupos</Badge>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{selectedGroups.size} selecionados</Badge>
                <Button variant="ghost" size="sm" onClick={toggleAll}>
                  {selectedGroups.size === filteredGroups.length ? "Desmarcar todos" : "Selecionar todos"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar grupo..."
                value={searchGroups}
                onChange={e => setSearchGroups(e.target.value)}
                className="pl-9"
              />
            </div>
            <ScrollArea className="h-[300px] rounded-md border border-border/30">
              <div className="space-y-0.5 p-2">
                {filteredGroups.map(g => (
                  <label
                    key={g.jid}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                      selectedGroups.has(g.jid)
                        ? "bg-primary/10 border border-primary/20"
                        : "hover:bg-muted/40 border border-transparent"
                    }`}
                  >
                    <Checkbox
                      checked={selectedGroups.has(g.jid)}
                      onCheckedChange={() => toggleGroup(g.jid)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{g.name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono truncate">{g.jid}</p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[11px]">
                      <Users className="w-3 h-3 mr-1" />
                      {g.participants_count || "?"}
                    </Badge>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Filters */}
      {groups.length > 0 && (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Filter className="w-4 h-4 text-primary" />
              3. Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-6 items-center">
              <div className="flex items-center gap-2">
                <Switch checked={brazilOnly} onCheckedChange={setBrazilOnly} />
                <span className="text-sm">🇧🇷 Apenas números brasileiros (+55)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Tipo:</span>
                <Select value={participantType} onValueChange={(v: any) => setParticipantType(v)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <span className="flex items-center gap-2"><Users className="w-3.5 h-3.5" /> Todos</span>
                    </SelectItem>
                    <SelectItem value="admin">
                      <span className="flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5" /> Apenas Admins</span>
                    </SelectItem>
                    <SelectItem value="member">
                      <span className="flex items-center gap-2"><UserCheck className="w-3.5 h-3.5" /> Apenas Membros</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              className="mt-4 w-full"
              size="lg"
              onClick={handleExtract}
              disabled={selectedGroups.size === 0 || extracting}
            >
              {extracting ? (
                <div className="flex flex-col items-center gap-1">
                  <span className="flex items-center"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Extraindo leads...</span>
                  {extractProgress && <span className="text-[11px] opacity-70">{extractProgress}</span>}
                </div>
              ) : (
                <><Download className="w-4 h-4 mr-2" /> Extrair Leads de {selectedGroups.size} grupo(s)</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Results */}
      {leads.length > 0 && (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Leads Extraídos
                <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">{leads.length}</Badge>
                {totalBeforeDedup > leads.length && (
                  <span className="text-[11px] text-muted-foreground">
                    ({totalBeforeDedup - leads.length} duplicados removidos)
                  </span>
                )}
                {lidSkipped > 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    • {lidSkipped} ocultos (comunidade)
                  </span>
                )}
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyAllPhones}>
                  <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar Números
                </Button>
                <Button variant="outline" size="sm" onClick={exportCSV}>
                  <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
                </Button>
                <Button variant="outline" size="sm" onClick={exportXLSX}>
                  <Download className="w-3.5 h-3.5 mr-1.5" /> XLSX
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar lead por número, nome ou grupo..."
                value={searchLeads}
                onChange={e => setSearchLeads(e.target.value)}
                className="pl-9"
              />
            </div>
            <ScrollArea className="h-[400px] rounded-md border border-border/30">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">#</TableHead>
                    <TableHead>Número</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Grupo</TableHead>
                    <TableHead className="w-[80px]">Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead, i) => (
                    <TableRow key={`${lead.phone}-${lead.group_jid}-${i}`}>
                      <TableCell className="text-muted-foreground text-[11px]">{i + 1}</TableCell>
                      <TableCell className="font-mono text-sm">{lead.phone}</TableCell>
                      <TableCell className="text-sm">{lead.name || <span className="text-muted-foreground/50">—</span>}</TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">{lead.group_name}</TableCell>
                      <TableCell>
                        {lead.is_admin ? (
                          <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20">
                            <ShieldCheck className="w-3 h-3 mr-0.5" /> Admin
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Membro</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {groups.length === 0 && !loadingGroups && (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              Selecione uma instância e clique em "Buscar Grupos" para começar
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
