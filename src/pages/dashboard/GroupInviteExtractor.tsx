import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Search, Link2, Download, Loader2, Smartphone, Copy,
  CheckCircle2, AlertCircle, RefreshCw, Users, ExternalLink, Check,
} from "lucide-react";

interface GroupInfo {
  jid: string;
  name: string;
  participants_count: number;
}

interface ExtractedLink {
  jid: string;
  name: string;
  link: string | null;
  error?: string;
  diagnostics?: {
    http_status?: number;
    error_stage?: string;
    provider_message?: string;
  };
}

export default function GroupInviteExtractor() {
  const [selectedDevice, setSelectedDevice] = useState("");
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [results, setResults] = useState<ExtractedLink[]>([]);
  const [searchGroups, setSearchGroups] = useState("");
  const [copiedJid, setCopiedJid] = useState<string | null>(null);

  const { data: devices = [] } = useQuery({
    queryKey: ["devices-for-invite-extractor"],
    queryFn: async () => {
      const { data } = await supabase
        .from("devices")
        .select("id, name, number, status, uazapi_base_url")
        .not("uazapi_base_url", "is", null)
        .order("name");
      return (data || []).filter((d) =>
        ["Ready", "Connected", "connected", "authenticated", "open", "active"].includes(d.status)
      );
    },
    staleTime: 30_000,
  });

  const filteredGroups = useMemo(() => {
    if (!searchGroups) return groups;
    const q = searchGroups.toLowerCase();
    return groups.filter((g) => (g.name || g.jid).toLowerCase().includes(q));
  }, [groups, searchGroups]);

  const successLinks = useMemo(() => results.filter((r) => r.link), [results]);
  const failedLinks = useMemo(() => results.filter((r) => !r.link), [results]);

  const handleLoadGroups = async () => {
    if (!selectedDevice) return;
    setLoadingGroups(true);
    setGroups([]);
    setSelectedGroups(new Set());
    setResults([]);
    try {
      const { data, error } = await supabase.functions.invoke("extract-invite-links", {
        body: { action: "list_groups", device_id: selectedDevice },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setGroups(data.groups || []);
      if ((data.groups?.length || 0) === 0) {
        toast.warning("Nenhum grupo encontrado nesta instância");
      } else {
        toast.success(`${data.groups.length} grupos encontrados`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar grupos");
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleExtract = async () => {
    if (selectedGroups.size === 0) return;
    setExtracting(true);
    setResults([]);
    try {
      const items = Array.from(selectedGroups).map((jid) => {
        const g = groups.find((g) => g.jid === jid);
        return { jid, name: g?.name || "" };
      });
      const { data, error } = await supabase.functions.invoke("extract-invite-links", {
        body: { action: "extract_links", device_id: selectedDevice, group_jids: items },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const nextResults = data.results || [];
      setResults(nextResults);
      const ok = nextResults.filter((r: ExtractedLink) => r.link).length;
      const failed = items.length - ok;

      if (ok === items.length) {
        toast.success(`${ok}/${items.length} links extraídos com sucesso`);
      } else if (ok > 0) {
        toast.warning(`${ok}/${items.length} links extraídos. ${failed} grupo(s) falharam — veja o motivo abaixo.`);
      } else {
        toast.error("Nenhum link foi extraído — veja o motivo detalhado abaixo.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao extrair links");
    } finally {
      setExtracting(false);
    }
  };

  const toggleGroup = (jid: string) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      next.has(jid) ? next.delete(jid) : next.add(jid);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedGroups.size === filteredGroups.length) {
      setSelectedGroups(new Set());
    } else {
      setSelectedGroups(new Set(filteredGroups.map((g) => g.jid)));
    }
  };

  const copyLink = async (link: string, jid: string) => {
    await navigator.clipboard.writeText(link);
    setCopiedJid(jid);
    setTimeout(() => setCopiedJid(null), 2000);
    toast.success("Link copiado!");
  };

  const copyAllLinks = async () => {
    const text = successLinks
      .map((r) => `${r.name || r.jid}: ${r.link}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    toast.success(`${successLinks.length} links copiados!`);
  };

  const exportCSV = () => {
    const rows = [
      ["Grupo", "JID", "Link"],
      ...successLinks.map((r) => [r.name || "", r.jid, r.link || ""]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "invite-links.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 p-4 sm:p-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Extrator de Links de Convite</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Extraia links de convite dos grupos da sua instância
        </p>
      </div>

      {/* Step 1 - Select device */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Smartphone className="w-4 h-4" />
            1. Selecione a instância
          </CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Select value={selectedDevice} onValueChange={(v) => { setSelectedDevice(v); setGroups([]); setSelectedGroups(new Set()); setResults([]); }}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Selecionar instância..." />
            </SelectTrigger>
            <SelectContent>
              {devices.map((d: any) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name || d.number || d.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleLoadGroups} disabled={!selectedDevice || loadingGroups}>
            {loadingGroups ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-1.5 hidden sm:inline">Carregar</span>
          </Button>
        </CardContent>
      </Card>

      {/* Step 2 - Select groups */}
      {groups.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="w-4 h-4" />
                2. Selecione os grupos
                <Badge variant="secondary" className="ml-1">{groups.length}</Badge>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{selectedGroups.size} selecionado(s)</Badge>
                <Button variant="ghost" size="sm" onClick={toggleAll}>
                  {selectedGroups.size === filteredGroups.length ? "Desmarcar" : "Selecionar"} todos
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar grupo..."
                value={searchGroups}
                onChange={(e) => setSearchGroups(e.target.value)}
                className="pl-9"
              />
            </div>
            <ScrollArea className="h-[300px] border rounded-lg">
              {filteredGroups.map((g) => (
                <div
                  key={g.jid}
                  className="flex items-center gap-3 px-3 py-2 border-b border-border/30 hover:bg-muted/30 cursor-pointer"
                  onClick={() => toggleGroup(g.jid)}
                >
                  <Checkbox checked={selectedGroups.has(g.jid)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{g.name || "Grupo sem nome"}</p>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">{g.jid}</p>
                  </div>
                  {g.participants_count > 0 && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {g.participants_count}
                    </Badge>
                  )}
                </div>
              ))}
            </ScrollArea>
            <Button
              onClick={handleExtract}
              disabled={selectedGroups.size === 0 || extracting}
              className="w-full"
            >
              {extracting ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Extraindo links...</>
              ) : (
                <><Link2 className="w-4 h-4 mr-2" /> Extrair Links ({selectedGroups.size})</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 3 - Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Link2 className="w-4 h-4" />
                3. Links Extraídos
                <Badge variant="default" className="bg-emerald-600 ml-1">{successLinks.length} ok</Badge>
                {failedLinks.length > 0 && (
                  <Badge variant="destructive" className="ml-1">{failedLinks.length} falha(s)</Badge>
                )}
              </CardTitle>
              <div className="flex gap-2">
                {successLinks.length > 0 && (
                  <>
                    <Button variant="outline" size="sm" onClick={copyAllLinks}>
                      <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar Todos
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportCSV}>
                      <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <div className="space-y-1">
                {results.map((r) => (
                  <div
                    key={r.jid}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/30 hover:bg-muted/20"
                  >
                    {r.link ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.name || "Grupo sem nome"}</p>
                      {r.link ? (
                        <p className="text-xs text-muted-foreground font-mono truncate">{r.link}</p>
                      ) : (
                        <p className="text-xs text-destructive">{r.error || "Não foi possível extrair o link"}</p>
                      )}
                    </div>
                    {r.link && (
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => copyLink(r.link!, r.jid)}
                        >
                          {copiedJid === r.jid ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          asChild
                        >
                          <a href={r.link} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
