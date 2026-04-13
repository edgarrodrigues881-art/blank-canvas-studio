import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Search, Link2, Download, Loader2, Smartphone, Copy, Trash2, Plus,
  CheckCircle2, AlertCircle, RefreshCw, Users, ExternalLink, Check,
  ArrowLeft, FolderOpen,
} from "lucide-react";

/* ─── Types ─── */

interface GroupInfo {
  jid: string;
  name: string;
  participants_count: number;
  cached_invite_link?: string;
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

function isPermissionDeniedResult(result: ExtractedLink) {
  return result.diagnostics?.error_stage === "permission_denied"
    || (result.error || "").toLowerCase().includes("sem permissão")
    || (result.error || "").toLowerCase().includes("uazapi bloqueou");
}

function isRateLimitedResult(result: ExtractedLink) {
  return result.diagnostics?.error_stage === "rate_limited"
    || (result.error || "").toLowerCase().includes("limite temporário da uazapi");
}

function getFriendlyErrorMessage(result: ExtractedLink) {
  if (isPermissionDeniedResult(result)) return "Link não disponível nesta leitura.";
  if (isRateLimitedResult(result)) return "Limite temporário. Tente novamente em instantes.";
  return result.error || "Não foi possível extrair o link";
}

/* ─── Campaign List View ─── */

function CampaignListView({ onOpen, onCreate }: { onOpen: (id: string) => void; onCreate: () => void }) {
  const queryClient = useQueryClient();
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["invite-extract-campaigns"],
    queryFn: async () => {
      const { data } = await supabase
        .from("invite_extract_campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const deleteCampaign = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from("invite_extract_campaigns").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["invite-extract-campaigns"] });
    toast.success("Campanha removida");
  };

  return (
    <div className="space-y-4 p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Extrator de Links de Convite</h1>
          <p className="text-sm text-muted-foreground mt-1">Organize seus links extraídos em campanhas</p>
        </div>
        <Button onClick={onCreate}>
          <Plus className="w-4 h-4 mr-2" /> Nova Campanha
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderOpen className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhuma campanha criada ainda.</p>
            <p className="text-sm text-muted-foreground mt-1">Crie uma campanha para começar a extrair e salvar links.</p>
            <Button className="mt-4" onClick={onCreate}><Plus className="w-4 h-4 mr-2" /> Criar Primeira Campanha</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {campaigns.map((c: any) => (
            <Card key={c.id} className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => onOpen(c.id)}>
              <CardContent className="flex items-center gap-4 py-4">
                <FolderOpen className="w-5 h-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{c.name}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {c.device_name && <span>📱 {c.device_name}</span>}
                    <span>{c.total_links} link(s)</span>
                    <span>{new Date(c.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive shrink-0" onClick={(e) => deleteCampaign(c.id, e)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Campaign Detail View (extraction + saved links) ─── */

function CampaignDetailView({ campaignId, onBack }: { campaignId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [selectedDevice, setSelectedDevice] = useState("");
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [results, setResults] = useState<ExtractedLink[]>([]);
  const [searchGroups, setSearchGroups] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchLinks, setSearchLinks] = useState("");

  const { data: campaign } = useQuery({
    queryKey: ["invite-extract-campaign", campaignId],
    queryFn: async () => {
      const { data } = await supabase.from("invite_extract_campaigns").select("*").eq("id", campaignId).single();
      return data;
    },
  });

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

  const { data: savedLinks = [], isLoading: loadingSaved } = useQuery({
    queryKey: ["campaign-links", campaignId],
    queryFn: async () => {
      const { data } = await supabase
        .from("extracted_invite_links")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("extracted_at", { ascending: false });
      return data || [];
    },
  });

  const filteredSaved = useMemo(() => {
    if (!searchLinks) return savedLinks;
    const q = searchLinks.toLowerCase();
    return savedLinks.filter((h: any) =>
      (h.group_name || "").toLowerCase().includes(q) || (h.invite_link || "").toLowerCase().includes(q)
    );
  }, [savedLinks, searchLinks]);

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

  const saveLinksToDb = useCallback(async (links: ExtractedLink[], deviceId: string) => {
    const device = devices.find((d: any) => d.id === deviceId);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const rows = links.filter((r) => r.link).map((r) => ({
      user_id: user.id,
      device_id: deviceId,
      device_name: device?.name || device?.number || deviceId,
      group_jid: r.jid,
      group_name: r.name || null,
      invite_link: r.link!,
      campaign_id: campaignId,
      extracted_at: new Date().toISOString(),
    }));
    if (rows.length === 0) return;

    await supabase.from("extracted_invite_links").upsert(rows, { onConflict: "user_id,group_jid,invite_link", ignoreDuplicates: false });

    // Update campaign counters
    const { count } = await supabase.from("extracted_invite_links").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);
    await supabase.from("invite_extract_campaigns").update({
      total_links: count || 0,
      device_id: deviceId,
      device_name: device?.name || device?.number || deviceId,
      updated_at: new Date().toISOString(),
    }).eq("id", campaignId);

    queryClient.invalidateQueries({ queryKey: ["campaign-links", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["invite-extract-campaign", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["invite-extract-campaigns"] });
  }, [devices, campaignId, queryClient]);

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
      if (ok > 0) saveLinksToDb(nextResults, selectedDevice).catch(console.error);

      const failed = items.length - ok;
      if (ok === items.length) toast.success(`${ok}/${items.length} links extraídos com sucesso`);
      else if (ok > 0) toast.warning(`${ok}/${items.length} links extraídos. ${failed} ficaram pendentes.`);
      else toast.error("Nenhum link foi extraído agora.");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao extrair links");
    } finally {
      setExtracting(false);
    }
  };

  const toggleGroup = (jid: string) => {
    setSelectedGroups((prev) => { const next = new Set(prev); next.has(jid) ? next.delete(jid) : next.add(jid); return next; });
  };
  const toggleAll = () => {
    setSelectedGroups(selectedGroups.size === filteredGroups.length ? new Set() : new Set(filteredGroups.map((g) => g.jid)));
  };

  const copyLink = async (link: string, id: string) => {
    await navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success("Link copiado!");
  };

  const copySavedLinks = async () => {
    const text = filteredSaved.map((h: any) => h.invite_link).join("\n");
    await navigator.clipboard.writeText(text);
    toast.success(`${filteredSaved.length} links copiados!`);
  };
  const copySavedWithNames = async () => {
    const text = filteredSaved.map((h: any) => `${h.group_name || h.group_jid}: ${h.invite_link}`).join("\n");
    await navigator.clipboard.writeText(text);
    toast.success(`${filteredSaved.length} links copiados!`);
  };
  const exportSavedCSV = () => {
    const rows = [["Grupo", "JID", "Link", "Data"], ...filteredSaved.map((h: any) => [h.group_name || "", h.group_jid, h.invite_link, new Date(h.extracted_at).toLocaleString("pt-BR")])];
    const csv = rows.map((r) => r.map((c: string) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${campaign?.name || "campanha"}-links.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const deleteLink = async (id: string) => {
    await supabase.from("extracted_invite_links").delete().eq("id", id);
    const { count } = await supabase.from("extracted_invite_links").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);
    await supabase.from("invite_extract_campaigns").update({ total_links: count || 0 }).eq("id", campaignId);
    queryClient.invalidateQueries({ queryKey: ["campaign-links", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["invite-extract-campaigns"] });
    toast.success("Link removido");
  };

  return (
    <div className="space-y-4 p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="w-5 h-5" /></Button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{campaign?.name || "Campanha"}</h1>
          <p className="text-sm text-muted-foreground">{savedLinks.length} link(s) salvos • {campaign?.device_name || "Sem instância"}</p>
        </div>
      </div>

      {/* Extraction */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Smartphone className="w-4 h-4" /> Extrair Links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Select value={selectedDevice} onValueChange={(v) => { setSelectedDevice(v); setGroups([]); setSelectedGroups(new Set()); setResults([]); }}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="Selecionar instância..." /></SelectTrigger>
              <SelectContent>
                {devices.map((d: any) => (<SelectItem key={d.id} value={d.id}>{d.name || d.number || d.id}</SelectItem>))}
              </SelectContent>
            </Select>
            <Button onClick={handleLoadGroups} disabled={!selectedDevice || loadingGroups}>
              {loadingGroups ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span className="ml-1.5 hidden sm:inline">Carregar</span>
            </Button>
          </div>

          {groups.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{groups.length} grupos</Badge>
                  <Badge variant="outline">{selectedGroups.size} selecionado(s)</Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={toggleAll}>
                  {selectedGroups.size === filteredGroups.length ? "Desmarcar" : "Selecionar"} todos
                </Button>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar grupo..." value={searchGroups} onChange={(e) => setSearchGroups(e.target.value)} className="pl-9" />
              </div>
              <ScrollArea className="h-[250px] border rounded-lg">
                {filteredGroups.map((g) => (
                  <div key={g.jid} className="flex items-center gap-3 px-3 py-2 border-b border-border/30 hover:bg-muted/30 cursor-pointer" onClick={() => toggleGroup(g.jid)}>
                    <Checkbox checked={selectedGroups.has(g.jid)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{g.name || "Grupo sem nome"}</p>
                      <p className="text-[11px] text-muted-foreground font-mono truncate">{g.jid}</p>
                    </div>
                    {g.participants_count > 0 && <Badge variant="secondary" className="text-[10px] shrink-0">{g.participants_count}</Badge>}
                  </div>
                ))}
              </ScrollArea>
              <Button onClick={handleExtract} disabled={selectedGroups.size === 0 || extracting} className="w-full">
                {extracting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Extraindo...</> : <><Link2 className="w-4 h-4 mr-2" /> Extrair Links ({selectedGroups.size})</>}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Live results */}
      {results.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Link2 className="w-4 h-4" /> Resultado da Extração
              <Badge variant="default" className="bg-emerald-600 ml-1">{successLinks.length} ok</Badge>
              {failedLinks.length > 0 && <Badge variant="destructive" className="ml-1">{failedLinks.length} falha(s)</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[250px]">
              <div className="space-y-1">
                {results.map((r) => (
                  <div key={r.jid} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/30">
                    {r.link ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <AlertCircle className="w-4 h-4 text-destructive shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.name || "Grupo sem nome"}</p>
                      {r.link ? <p className="text-xs text-muted-foreground font-mono truncate">{r.link}</p> : <p className="text-xs text-destructive">{getFriendlyErrorMessage(r)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Saved links */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FolderOpen className="w-4 h-4" /> Links Salvos
              <Badge variant="secondary" className="ml-1">{savedLinks.length}</Badge>
            </CardTitle>
            {filteredSaved.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={copySavedLinks}><Copy className="w-3.5 h-3.5 mr-1.5" /> Só Links</Button>
                <Button variant="outline" size="sm" onClick={copySavedWithNames}><Copy className="w-3.5 h-3.5 mr-1.5" /> Links + Nomes</Button>
                <Button variant="outline" size="sm" onClick={exportSavedCSV}><Download className="w-3.5 h-3.5 mr-1.5" /> CSV</Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {savedLinks.length > 5 && (
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar link..." value={searchLinks} onChange={(e) => setSearchLinks(e.target.value)} className="pl-9" />
            </div>
          )}
          {loadingSaved ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : filteredSaved.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              {savedLinks.length === 0 ? "Nenhum link salvo nesta campanha. Extraia links acima." : "Nenhum resultado para essa busca."}
            </p>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-1">
                {filteredSaved.map((h: any) => (
                  <div key={h.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/30 hover:bg-muted/20">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{h.group_name || "Grupo sem nome"}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{h.invite_link}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(h.extracted_at).toLocaleString("pt-BR")}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyLink(h.invite_link, h.id)}>
                        {copiedId === h.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                        <a href={h.invite_link} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5" /></a>
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteLink(h.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Create Campaign View ─── */

function CreateCampaignView({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Digite um nome para a campanha"); return; }
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const { data, error } = await supabase.from("invite_extract_campaigns").insert({ user_id: user.id, name: name.trim() }).select("id").single();
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["invite-extract-campaigns"] });
      toast.success("Campanha criada!");
      onCreated(data.id);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao criar campanha");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onCancel}><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Nova Campanha</h1>
      </div>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Nome da Campanha</label>
            <Input placeholder="Ex: Grupos de Marketing, Grupos Nicho X..." value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreate()} autoFocus />
          </div>
          <Button onClick={handleCreate} disabled={!name.trim() || creating} className="w-full">
            {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            Criar Campanha e Extrair Links
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Main Component ─── */

export default function GroupInviteExtractor() {
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);

  if (view === "create") {
    return <CreateCampaignView onCreated={(id) => { setActiveCampaignId(id); setView("detail"); }} onCancel={() => setView("list")} />;
  }

  if (view === "detail" && activeCampaignId) {
    return <CampaignDetailView campaignId={activeCampaignId} onBack={() => { setActiveCampaignId(null); setView("list"); }} />;
  }

  return <CampaignListView onOpen={(id) => { setActiveCampaignId(id); setView("detail"); }} onCreate={() => setView("create")} />;
}
