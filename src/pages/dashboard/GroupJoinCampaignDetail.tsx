import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Play, Pause, StopCircle, RefreshCw, Copy, CheckCircle2,
  XCircle, Clock, Loader2, Download, Trash2,
  Users, BarChart3, List, ChevronDown, ChevronUp, ExternalLink
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import * as XLSX from "xlsx";

/* ── Status map ── */
const queueStatusConfig: Record<string, { label: string; color: string; bgColor: string; icon: any; order: number }> = {
  success:          { label: "Sucesso",     color: "text-primary",           bgColor: "bg-primary/10",       icon: CheckCircle2, order: 0 },
  already_member:   { label: "Sucesso",     color: "text-primary",           bgColor: "bg-primary/10",       icon: CheckCircle2, order: 0 },
  pending_approval: { label: "Sucesso",     color: "text-primary",           bgColor: "bg-primary/10",       icon: CheckCircle2, order: 0 },
  pending:          { label: "Pendente",    color: "text-muted-foreground",  bgColor: "bg-muted/30",         icon: Clock,        order: 2 },
  error:            { label: "Erro",        color: "text-destructive",       bgColor: "bg-destructive/10",   icon: XCircle,      order: 3 },
  cancelled:        { label: "Pendente",    color: "text-muted-foreground",  bgColor: "bg-muted/30",         icon: Clock,        order: 2 },
  skipped:          { label: "Erro",        color: "text-destructive",       bgColor: "bg-destructive/10",   icon: XCircle,      order: 3 },
};

/* ── Friendly error messages ── */
function friendlyError(raw: string | null): string {
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower.includes("invalid") || lower.includes("inválid")) return "Link inválido";
  if (lower.includes("expired") || lower.includes("expirad") || lower.includes("revoked") || lower.includes("revogad")) return "Convite expirado";
  if (lower.includes("full") || lower.includes("cheio") || lower.includes("limit")) return "Grupo cheio";
  if (lower.includes("already") || lower.includes("já")) return "Já é membro";
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("tempo")) return "Tempo limite excedido";
  if (lower.includes("not found") || lower.includes("não encontr")) return "Grupo não encontrado";
  if (lower.includes("unavailable") || lower.includes("indisponív")) return "Indisponível temporariamente";
  if (lower.includes("forbidden") || lower.includes("blocked") || lower.includes("bloqueado")) return "Acesso bloqueado";
  if (lower.includes("disconnect") || lower.includes("desconect")) return "Instância desconectada";
  if (lower.includes("private") || lower.includes("privad") || lower.includes("approval") || lower.includes("request sent") || lower.includes("solicita") || lower.includes("aguardando")) return "Entrada solicitada";
  if (raw.length > 60) return raw.substring(0, 55) + "…";
  return raw;
}

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function GroupJoinCampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"status" | "time">("status");
  const [confirmAction, setConfirmAction] = useState<"cancel" | "delete" | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("links");
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const isActive = (s: string) => ["running", "paused", "draft"].includes(s);

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["group-join-campaign", id],
    queryFn: async () => {
      const { data } = await supabase.from("group_join_campaigns" as any).select("id, name, status, total_links, joined_count, failed_count, started_at, completed_at, created_at, updated_at, last_error").eq("id", id).single();
      return data as any;
    },
    enabled: !!id && !!user,
    refetchInterval: (query) => {
      if (document.hidden) return false;
      const camp = query.state.data as any;
      return camp && isActive(camp.status) ? 10_000 : false;
    },
    staleTime: 3_000,
  });

  const { data: queueItems = [] } = useQuery({
    queryKey: ["group-join-queue", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("group_join_queue" as any)
        .select("id, group_link, group_name, device_id, device_name, status, error_message, processed_at, attempt, created_at")
        .eq("campaign_id", id)
        .order("created_at", { ascending: true });
      return (data || []) as any[];
    },
    enabled: !!id && !!user,
    refetchInterval: () => {
      if (document.hidden) return false;
      return campaign && isActive(campaign.status) ? 10_000 : false;
    },
    staleTime: 5_000,
  });

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`group-join-detail-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_join_campaigns", filter: `id=eq.${id}` },
        () => { queryClient.invalidateQueries({ queryKey: ["group-join-campaign", id] }); queryClient.invalidateQueries({ queryKey: ["group-join-campaigns-list"] }); })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_join_queue", filter: `campaign_id=eq.${id}` },
        () => { queryClient.invalidateQueries({ queryKey: ["group-join-queue", id] }); queryClient.invalidateQueries({ queryKey: ["group-join-campaign", id] }); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, queryClient]);

  const stats = useMemo(() => {
    const s = { success: 0, error: 0, pending: 0, total: 0 };
    for (const item of queueItems) {
      s.total++;
      if (item.status === "success" || item.status === "already_member" || item.status === "pending_approval") s.success++;
      else if (item.status === "error" || item.status === "skipped") s.error++;
      else s.pending++;
    }
    return s;
  }, [queueItems]);

  const sortedAndFilteredItems = useMemo(() => {
    let items = statusFilter === "all" ? [...queueItems] : queueItems.filter((i: any) => {
      if (statusFilter === "success") return i.status === "success" || i.status === "already_member" || i.status === "pending_approval";
      if (statusFilter === "error") return i.status === "error" || i.status === "skipped";
      if (statusFilter === "pending") return i.status === "pending" || i.status === "cancelled";
      return i.status === statusFilter;
    });

    if (sortBy === "status") {
      items.sort((a, b) => {
        const orderA = queueStatusConfig[a.status]?.order ?? 2;
        const orderB = queueStatusConfig[b.status]?.order ?? 2;
        if (orderA !== orderB) return orderA - orderB;
        return new Date(b.processed_at || b.created_at).getTime() - new Date(a.processed_at || a.created_at).getTime();
      });
    } else {
      items.sort((a, b) => new Date(b.processed_at || b.created_at).getTime() - new Date(a.processed_at || a.created_at).getTime());
    }
    return items;
  }, [queueItems, statusFilter, sortBy]);

  const instanceMetrics = useMemo(() => {
    const map = new Map<string, { name: string; assigned: number; success: number; error: number; pending: number }>();
    for (const item of queueItems) {
      const key = item.device_id;
      if (!map.has(key)) map.set(key, { name: item.device_name, assigned: 0, success: 0, error: 0, pending: 0 });
      const m = map.get(key)!;
      m.assigned++;
      if (item.status === "success" || item.status === "already_member" || item.status === "pending_approval") m.success++;
      else if (item.status === "error" || item.status === "skipped") m.error++;
      else m.pending++;
    }
    return Array.from(map.entries()).map(([id, m]) => ({ id, ...m }));
  }, [queueItems]);

  const processed = stats.success + stats.error;
  const progress = stats.total > 0 ? (processed / stats.total) * 100 : 0;

  const cancelMut = useMutation({
    mutationFn: async () => {
      await supabase.from("group_join_campaigns" as any).update({ status: "cancelled", completed_at: new Date().toISOString() } as any).eq("id", id);
      await supabase.from("group_join_queue" as any).update({ status: "cancelled" } as any).eq("campaign_id", id).eq("status", "pending");
    },
    onSuccess: () => { toast.success("Campanha cancelada"); setConfirmAction(null); queryClient.invalidateQueries({ queryKey: ["group-join-campaign", id] }); },
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      await supabase.from("group_join_queue" as any).delete().eq("campaign_id", id);
      await supabase.from("group_join_campaigns" as any).delete().eq("id", id);
    },
    onSuccess: () => { toast.success("Campanha excluída"); navigate("/dashboard/group-join"); },
  });

  const pauseMut = useMutation({
    mutationFn: async () => { await supabase.from("group_join_campaigns" as any).update({ status: "paused" } as any).eq("id", id); },
    onSuccess: () => { toast.success("Campanha pausada"); queryClient.invalidateQueries({ queryKey: ["group-join-campaign", id] }); },
  });

  const resumeMut = useMutation({
    mutationFn: async () => {
      await supabase.from("group_join_campaigns" as any).update({ status: "running" } as any).eq("id", id);
      supabase.functions.invoke("process-group-join-campaign", { body: { campaign_id: id } }).catch(() => {});
    },
    onSuccess: () => { toast.success("Campanha retomada"); queryClient.invalidateQueries({ queryKey: ["group-join-campaign", id] }); },
  });

  const retryFailedMut = useMutation({
    mutationFn: async () => {
      await supabase.from("group_join_queue" as any).update({ status: "pending", error_message: null, attempt: 0 } as any).eq("campaign_id", id).in("status", ["error", "skipped"] as any);
      await supabase.from("group_join_campaigns" as any).update({ status: "running" } as any).eq("id", id);
      supabase.functions.invoke("process-group-join-campaign", { body: { campaign_id: id } }).catch(() => {});
    },
    onSuccess: () => { toast.success("Reprocessando falhas"); queryClient.invalidateQueries({ queryKey: ["group-join-campaign", id] }); queryClient.invalidateQueries({ queryKey: ["group-join-queue", id] }); },
  });

  const copyFailedLinks = () => {
    const failed = queueItems.filter((i: any) => i.status === "error" || i.status === "skipped").map((i: any) => i.group_link);
    if (failed.length === 0) return toast.info("Nenhum link com falha");
    navigator.clipboard.writeText(failed.join("\n"));
    setCopied(true); toast.success(`${failed.length} links copiados`);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportReport = () => {
    const rows = queueItems.map((item: any) => ({
      Link: item.group_link, Grupo: item.group_name || "", Instância: item.device_name || "",
      Status: queueStatusConfig[item.status]?.label || item.status,
      Motivo: item.error_message || "", Tentativas: item.attempt || 0,
      Processado_em: item.processed_at ? formatDate(item.processed_at) : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório");
    XLSX.writeFile(wb, `relatorio-${campaign?.name || "campanha"}.xlsx`);
    toast.success("Relatório exportado");
  };

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (!campaign) return <div className="text-center py-24"><p className="text-muted-foreground mb-3">Campanha não encontrada</p><Button variant="link" onClick={() => navigate("/dashboard/group-join")}>Voltar</Button></div>;

  const isRunning = campaign.status === "running";
  const isPaused = campaign.status === "paused";
  const isDraft = campaign.status === "draft";
  const isFinished = ["done", "cancelled", "error"].includes(campaign.status);

  const campaignStatusLabel = isRunning ? "Em execução" : isPaused ? "Pausada" : isDraft ? "Rascunho" : campaign.status === "done" ? "Concluída" : "Finalizada";
  const campaignDotColor = isRunning ? "bg-emerald-500" : isPaused ? "bg-amber-500" : isDraft ? "bg-muted-foreground" : "bg-primary";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-12 sm:px-6 lg:px-10">
      {/* Header — single back button */}
      <div className="flex items-start gap-3 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/group-join")} className="rounded-xl h-10 w-10 mt-0.5">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground truncate">{campaign.name}</h1>
            <div className="flex items-center gap-1.5 rounded-full border border-border/30 px-2.5 py-1 shrink-0">
              <div className={`w-1.5 h-1.5 rounded-full ${campaignDotColor} ${isRunning ? 'animate-pulse' : ''}`} />
              <span className="text-[10px] font-medium text-foreground">{campaignStatusLabel}</span>
            </div>
          </div>
          {campaign.description && <p className="text-sm text-muted-foreground truncate">{campaign.description}</p>}
        </div>
      </div>

      {/* Stats Cards — 4 cards: Sucesso, Pendente, Erro, Total */}
      <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
        {[
          { label: "Sucesso", value: stats.success, color: "text-primary", borderColor: "border-primary/20" },
          { label: "Pendente", value: stats.pending, color: "text-muted-foreground", borderColor: "border-border/30" },
          { label: "Erro", value: stats.error, color: stats.error > 0 ? "text-destructive" : "text-muted-foreground", borderColor: stats.error > 0 ? "border-destructive/20" : "border-border/30" },
          { label: "Total", value: stats.total, color: "text-foreground", borderColor: "border-border/30" },
        ].map((s, i) => (
          <div key={i} className={`rounded-2xl border ${s.borderColor} bg-card p-4 text-center`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Progress Bar */}
      <div className="rounded-2xl border border-border/30 bg-card p-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-foreground">{processed} de {stats.total} processados</span>
          <span className="text-xs font-medium text-muted-foreground">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mb-6">
        {isDraft && (
          <Button onClick={() => resumeMut.mutate()} className="gap-2 rounded-xl h-10 px-5 shadow-lg">
            <Play className="w-4 h-4" /> Iniciar
          </Button>
        )}
        {isRunning && (
          <>
            <Button onClick={() => pauseMut.mutate()} variant="outline" className="gap-2 rounded-xl h-10">
              <Pause className="w-4 h-4" /> Pausar
            </Button>
            <Button onClick={() => setConfirmAction("cancel")} variant="destructive" className="gap-2 rounded-xl h-10">
              <StopCircle className="w-4 h-4" /> Cancelar
            </Button>
          </>
        )}
        {isPaused && (
          <>
            <Button onClick={() => resumeMut.mutate()} className="gap-2 rounded-xl h-10 px-5 shadow-lg">
              <Play className="w-4 h-4" /> Continuar
            </Button>
            <Button onClick={() => setConfirmAction("cancel")} variant="destructive" className="gap-2 rounded-xl h-10">
              <StopCircle className="w-4 h-4" /> Cancelar
            </Button>
          </>
        )}
        {stats.error > 0 && (
          <Button onClick={() => retryFailedMut.mutate()} variant="outline" className="gap-2 rounded-xl h-10">
            <RefreshCw className="w-4 h-4" /> Reprocessar falhas ({stats.error})
          </Button>
        )}
        {stats.error > 0 && (
          <Button onClick={copyFailedLinks} variant="ghost" className="gap-2 rounded-xl h-10 text-xs">
            {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copiar falhas
          </Button>
        )}
        <div className="flex-1" />
        <Button onClick={exportReport} variant="outline" className="gap-2 rounded-xl h-10 text-xs">
          <Download className="w-4 h-4" /> Exportar
        </Button>
        {isFinished && (
          <Button onClick={() => setConfirmAction("delete")} variant="ghost" className="gap-2 rounded-xl h-10 text-xs text-destructive hover:text-destructive">
            <Trash2 className="w-4 h-4" /> Excluir
          </Button>
        )}
      </div>

      {/* Config Summary */}
      <div className="rounded-2xl border border-border/30 bg-card p-5 mb-6">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Configuração</p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Delay", value: `${campaign.min_delay}s — ${campaign.max_delay}s` },
            { label: "Pausa a cada", value: `${campaign.pause_every || 5} grupos` },
            { label: "Duração da pausa", value: `${Math.floor((campaign.pause_duration || 180) / 60)}min` },
            { label: "Instâncias", value: `${(campaign.device_ids as any[])?.length || 0}` },
          ].map((c, i) => (
            <div key={i}>
              <p className="text-[10px] text-muted-foreground mb-0.5">{c.label}</p>
              <p className="text-sm font-semibold text-foreground">{c.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-auto bg-muted/20 border border-border/20 rounded-xl p-1 w-full sm:w-auto">
          <TabsTrigger value="links" className="text-xs rounded-lg gap-1.5 px-5 py-2.5 flex-1 sm:flex-none">
            <List className="w-3.5 h-3.5" /> Log de Entradas ({stats.total})
          </TabsTrigger>
          <TabsTrigger value="instances" className="text-xs rounded-lg gap-1.5 px-5 py-2.5 flex-1 sm:flex-none">
            <BarChart3 className="w-3.5 h-3.5" /> Por Instância ({instanceMetrics.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="links" className="mt-4">
          <div className="rounded-2xl border border-border/30 bg-card overflow-hidden">
            {/* Filter bar */}
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border/20">
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { key: "all", label: "Todos", count: stats.total },
                  { key: "success", label: "Sucesso", count: stats.success },
                  { key: "pending", label: "Pendente", count: stats.pending },
                  { key: "error", label: "Erro", count: stats.error },
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => setStatusFilter(f.key)}
                    className={`text-[11px] px-3 py-1 rounded-full border transition-all ${
                      statusFilter === f.key
                        ? "border-primary/30 bg-primary/10 text-foreground font-semibold"
                        : "border-border/20 text-muted-foreground hover:border-border/40"
                    }`}
                  >
                    {f.label} <span className="ml-1 font-mono">{f.count}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setSortBy(s => s === "status" ? "time" : "status")}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 shrink-0"
              >
                {sortBy === "status" ? "Por status" : "Cronológico"}
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>

            {/* Items */}
            <div className="max-h-[600px] overflow-y-auto divide-y divide-border/10">
              {sortedAndFilteredItems.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground/50">Nenhum item encontrado</div>
              ) : (
                sortedAndFilteredItems.map((item: any) => {
                  const st = queueStatusConfig[item.status] || queueStatusConfig.pending;
                  const Icon = st.icon;
                  const isExpanded = expandedItem === item.id;
                  const hasError = item.error_message && (item.status === "error" || item.status === "skipped");
                  const friendly = friendlyError(item.error_message);
                  const isPendingApproval = item.status === "pending_approval";

                  return (
                    <div key={item.id} className="hover:bg-muted/5 transition-colors">
                      <div
                        className="flex items-center gap-3 px-5 py-3 cursor-pointer"
                        onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                      >
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${st.bgColor}`}>
                          <Icon className={`w-3.5 h-3.5 ${st.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono text-foreground/80 truncate">{item.group_link}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {item.device_name && <span className="text-[10px] text-muted-foreground/50">{item.device_name}</span>}
                            {hasError && <span className="text-[10px] text-destructive/80">• {friendly}</span>}
                            {isPendingApproval && <span className="text-[10px] text-primary/70">• Entrada solicitada</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0 flex items-center gap-2">
                          <div>
                            <Badge variant="outline" className={`text-[10px] ${st.color} border-0 ${st.bgColor} px-2`}>{st.label}</Badge>
                            {item.processed_at && <p className="text-[9px] text-muted-foreground/40 mt-0.5">{formatDate(item.processed_at)}</p>}
                          </div>
                          {(hasError || item.processed_at) && (
                            isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/30" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/30" />
                          )}
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="px-5 pb-3 pl-16">
                          <div className="rounded-xl bg-muted/10 border border-border/15 p-3 text-xs space-y-1.5">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Status</span>
                              <span className={`font-medium ${st.color}`}>{st.label}</span>
                            </div>
                            {item.device_name && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Instância</span>
                                <span className="text-foreground">{item.device_name}</span>
                              </div>
                            )}
                            {(item.attempt || 0) > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Tentativas</span>
                                <span className="text-foreground">{item.attempt}</span>
                              </div>
                            )}
                            {item.error_message && (
                              <div className="pt-1 border-t border-border/10">
                                <p className="text-muted-foreground mb-0.5">Detalhe</p>
                                <p className="text-foreground/70 font-mono text-[10px] break-all">{item.error_message}</p>
                              </div>
                            )}
                            <a href={item.group_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline pt-1">
                              <ExternalLink className="w-3 h-3" /> Abrir link
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="instances" className="mt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {instanceMetrics.map(inst => {
              const instProcessed = inst.success + inst.error;
              const instProgress = inst.assigned > 0 ? (instProcessed / inst.assigned) * 100 : 0;
              return (
                <div key={inst.id} className="rounded-2xl border border-border/30 bg-card p-5 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Users className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-sm font-bold text-foreground truncate">{inst.name}</span>
                  </div>
                  <Progress value={instProgress} className="h-1.5" />
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      { label: "Atribuído", value: inst.assigned, color: "text-foreground" },
                      { label: "Sucesso", value: inst.success, color: "text-primary" },
                      { label: "Erro", value: inst.error, color: inst.error > 0 ? "text-destructive" : "text-muted-foreground" },
                      { label: "Pendente", value: inst.pending, color: "text-muted-foreground" },
                    ].map((m, i) => (
                      <div key={i}>
                        <p className={`text-base font-bold ${m.color}`}>{m.value}</p>
                        <p className="text-[10px] text-muted-foreground">{m.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {instanceMetrics.length === 0 && (
              <div className="col-span-full text-center py-16 text-sm text-muted-foreground/50">Nenhuma instância processou links ainda</div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Confirm Dialogs */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction === "delete" ? "Excluir campanha?" : "Cancelar campanha?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "delete"
                ? "Todos os dados e logs serão removidos permanentemente."
                : "Itens pendentes serão marcados como cancelados. Esta ação não pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAction === "delete" ? deleteMut.mutate() : cancelMut.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {confirmAction === "delete" ? "Excluir" : "Cancelar Campanha"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
