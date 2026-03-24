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
  XCircle, Clock, AlertTriangle, Loader2, LogIn, Download, Filter,
  Users, BarChart3, List
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const queueStatusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending:          { label: "Pendente",       color: "text-muted-foreground",  icon: Clock },
  success:          { label: "Entrou",         color: "text-emerald-500",       icon: CheckCircle2 },
  already_member:   { label: "Já era membro",  color: "text-blue-500",          icon: CheckCircle2 },
  error:            { label: "Falhou",         color: "text-destructive",       icon: XCircle },
  cancelled:        { label: "Cancelado",      color: "text-muted-foreground",  icon: XCircle },
  pending_approval: { label: "Aguardando",     color: "text-amber-500",         icon: Clock },
  skipped:          { label: "Ignorado",       color: "text-muted-foreground",  icon: XCircle },
};

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function GroupJoinCampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("links");

  const isActive = (s: string) => ["running", "paused", "draft"].includes(s);

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["group-join-campaign", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("group_join_campaigns" as any)
        .select("*")
        .eq("id", id)
        .single();
      return data as any;
    },
    enabled: !!id && !!user,
    refetchInterval: (query) => {
      if (document.hidden) return false;
      const camp = query.state.data as any;
      return camp && isActive(camp.status) ? 10_000 : false;
    },
    staleTime: 5_000,
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
    refetchInterval: (query) => {
      if (document.hidden) return false;
      return campaign && isActive(campaign.status) ? 5_000 : false;
    },
    staleTime: 5_000,
  });

  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`group-join-detail-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_join_campaigns", filter: `id=eq.${id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["group-join-campaign", id] });
          queryClient.invalidateQueries({ queryKey: ["group-join-campaigns-list"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_join_queue", filter: `campaign_id=eq.${id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["group-join-queue", id] });
          queryClient.invalidateQueries({ queryKey: ["group-join-campaign", id] });
          queryClient.invalidateQueries({ queryKey: ["group-join-campaigns-list"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  const filteredItems = useMemo(() => {
    if (statusFilter === "all") return queueItems;
    return queueItems.filter((i: any) => i.status === statusFilter);
  }, [queueItems, statusFilter]);

  const stats = useMemo(() => {
    const s = { success: 0, already: 0, pendingApproval: 0, error: 0, pending: 0, cancelled: 0, total: 0 };
    for (const item of queueItems) {
      s.total++;
      if (item.status === "success") s.success++;
      else if (item.status === "already_member") s.already++;
      else if (item.status === "pending_approval") s.pendingApproval++;
      else if (item.status === "error") s.error++;
      else if (item.status === "cancelled") s.cancelled++;
      else s.pending++;
    }
    return s;
  }, [queueItems]);

  // Per-instance metrics
  const instanceMetrics = useMemo(() => {
    const map = new Map<string, { name: string; assigned: number; success: number; error: number; already: number; pending: number; lastAt: string | null }>();
    for (const item of queueItems) {
      const key = item.device_id;
      if (!map.has(key)) {
        map.set(key, { name: item.device_name, assigned: 0, success: 0, error: 0, already: 0, pending: 0, lastAt: null });
      }
      const m = map.get(key)!;
      m.assigned++;
      if (item.status === "success") m.success++;
      else if (item.status === "already_member") m.already++;
      else if (item.status === "error") m.error++;
      else m.pending++;
      if (item.processed_at && (!m.lastAt || item.processed_at > m.lastAt)) m.lastAt = item.processed_at;
    }
    return Array.from(map.entries()).map(([id, m]) => ({ id, ...m }));
  }, [queueItems]);

  const processed = stats.success + stats.already + stats.pendingApproval + stats.error;
  const progress = stats.total > 0 ? (processed / stats.total) * 100 : 0;
  const successRate = processed > 0 ? Math.round(((stats.success + stats.already) / processed) * 100) : 0;

  const cancelMut = useMutation({
    mutationFn: async () => {
      await supabase.from("group_join_campaigns" as any).update({ status: "cancelled", completed_at: new Date().toISOString() } as any).eq("id", id);
      await supabase.from("group_join_queue" as any).update({ status: "cancelled" } as any).eq("campaign_id", id).eq("status", "pending");
    },
    onSuccess: () => { toast.success("Campanha cancelada"); setConfirmCancel(false); queryClient.invalidateQueries({ queryKey: ["group-join-campaign", id] }); queryClient.invalidateQueries({ queryKey: ["group-join-queue", id] }); },
  });

  const pauseMut = useMutation({
    mutationFn: async () => {
      await supabase.from("group_join_campaigns" as any).update({ status: "paused" } as any).eq("id", id);
    },
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
      await supabase.from("group_join_queue" as any).update({ status: "pending", error_message: null, attempt: 0 } as any).eq("campaign_id", id).eq("status", "error");
      await supabase.from("group_join_campaigns" as any).update({ status: "running" } as any).eq("id", id);
      supabase.functions.invoke("process-group-join-campaign", { body: { campaign_id: id } }).catch(() => {});
    },
    onSuccess: () => { toast.success("Reprocessando falhas"); queryClient.invalidateQueries({ queryKey: ["group-join-campaign", id] }); queryClient.invalidateQueries({ queryKey: ["group-join-queue", id] }); },
  });

  const copyFailedLinks = () => {
    const failed = queueItems.filter((i: any) => i.status === "error").map((i: any) => i.group_link);
    if (failed.length === 0) return toast.info("Nenhum link com falha");
    navigator.clipboard.writeText(failed.join("\n"));
    setCopied(true);
    toast.success(`${failed.length} links copiados`);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportReport = () => {
    const rows = queueItems.map((item: any) => ({
      Link: item.group_link,
      Grupo: item.group_name || "",
      Instância: item.device_name || "",
      Status: queueStatusConfig[item.status]?.label || item.status,
      Motivo: item.error_message || "",
      Tentativas: item.attempt || 0,
      Processado_em: item.processed_at ? formatDate(item.processed_at) : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório");
    XLSX.writeFile(wb, `relatorio-${campaign?.name || "campanha"}.xlsx`);
    toast.success("Relatório exportado");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Campanha não encontrada</p>
        <Button variant="link" onClick={() => navigate("/dashboard/group-join")}>Voltar</Button>
      </div>
    );
  }

  const isRunning = campaign.status === "running";
  const isPaused = campaign.status === "paused";
  const isDraft = campaign.status === "draft";
  const isFinished = ["done", "cancelled", "error"].includes(campaign.status);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-10 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/group-join")} className="rounded-xl h-9 w-9">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground truncate">{campaign.name}</h1>
          {campaign.description && <p className="text-xs text-muted-foreground truncate">{campaign.description}</p>}
        </div>
      </div>

      {/* Progress + Stats */}
      <div className="rounded-2xl border border-border/20 bg-card/80 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-foreground">
            {processed} de {stats.total} processados ({Math.round(progress)}%)
          </div>
          <Badge variant="outline" className="text-xs">
            {isRunning ? "Em andamento" : isPaused ? "Pausada" : isDraft ? "Rascunho" :
             campaign.status === "done" ? "Concluída" : campaign.status === "cancelled" ? "Cancelada" : campaign.status}
          </Badge>
        </div>
        <Progress value={progress} className="h-2" />

        <div className="grid grid-cols-2 gap-2 text-center md:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "Sucesso", value: stats.success + stats.already, color: "text-emerald-500" },
            { label: "Aguardando", value: stats.pendingApproval, color: stats.pendingApproval > 0 ? "text-amber-500" : "text-muted-foreground" },
            { label: "Erro", value: stats.error, color: stats.error > 0 ? "text-destructive" : "text-muted-foreground" },
            { label: "Pendente", value: stats.pending, color: "text-muted-foreground" },
            { label: "Cancelado", value: stats.cancelled, color: "text-muted-foreground/50" },
            { label: "Taxa", value: `${successRate}%`, color: successRate >= 80 ? "text-emerald-500" : successRate >= 50 ? "text-amber-500" : "text-destructive" },
          ].map((s, i) => (
            <div key={i} className="rounded-xl border border-border/10 p-2">
              <div className="text-[10px] text-muted-foreground/60 mb-0.5">{s.label}</div>
              <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {isDraft && (
            <Button onClick={() => resumeMut.mutate()} size="sm" className="gap-1.5 rounded-xl">
              <Play className="w-3.5 h-3.5" /> Iniciar
            </Button>
          )}
          {isRunning && (
            <>
              <Button onClick={() => pauseMut.mutate()} variant="outline" size="sm" className="gap-1.5 rounded-xl">
                <Pause className="w-3.5 h-3.5" /> Pausar
              </Button>
              <Button onClick={() => setConfirmCancel(true)} variant="destructive" size="sm" className="gap-1.5 rounded-xl">
                <StopCircle className="w-3.5 h-3.5" /> Cancelar
              </Button>
            </>
          )}
          {isPaused && (
            <>
              <Button onClick={() => resumeMut.mutate()} size="sm" className="gap-1.5 rounded-xl">
                <Play className="w-3.5 h-3.5" /> Continuar
              </Button>
              <Button onClick={() => setConfirmCancel(true)} variant="destructive" size="sm" className="gap-1.5 rounded-xl">
                <StopCircle className="w-3.5 h-3.5" /> Cancelar
              </Button>
            </>
          )}
          {stats.error > 0 && isFinished && (
            <Button onClick={() => retryFailedMut.mutate()} variant="outline" size="sm" className="gap-1.5 rounded-xl">
              <RefreshCw className="w-3.5 h-3.5" /> Reprocessar falhas ({stats.error})
            </Button>
          )}
          {stats.error > 0 && (
            <Button onClick={copyFailedLinks} variant="ghost" size="sm" className="gap-1.5 rounded-xl text-xs">
              {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              Copiar falhas
            </Button>
          )}
          <Button onClick={exportReport} variant="ghost" size="sm" className="gap-1.5 rounded-xl text-xs ml-auto">
            <Download className="w-3.5 h-3.5" /> Exportar
          </Button>
        </div>
      </div>

      {/* Config info */}
      <div className="rounded-2xl border border-border/20 bg-card/80 p-4">
          <div className="grid grid-cols-2 gap-3 text-xs lg:grid-cols-4">
          <div>
            <span className="text-muted-foreground/50">Delay</span>
            <p className="font-semibold text-foreground">{campaign.min_delay}s – {campaign.max_delay}s</p>
          </div>
          <div>
            <span className="text-muted-foreground/50">Pausa a cada</span>
            <p className="font-semibold text-foreground">{campaign.pause_every || 5} grupos</p>
          </div>
          <div>
            <span className="text-muted-foreground/50">Duração pausa</span>
            <p className="font-semibold text-foreground">{Math.floor((campaign.pause_duration || 180) / 60)}min</p>
          </div>
          <div>
            <span className="text-muted-foreground/50">Instâncias</span>
            <p className="font-semibold text-foreground">{(campaign.device_ids as any[])?.length || 0}</p>
          </div>
        </div>
      </div>

      {/* Tabs: Links / Instances */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-auto flex-wrap justify-start bg-muted/10 border border-border/15 rounded-xl p-1">
          <TabsTrigger value="links" className="text-xs rounded-lg gap-1.5 px-4 py-2">
            <List className="w-3.5 h-3.5" /> Links ({stats.total})
          </TabsTrigger>
          <TabsTrigger value="instances" className="text-xs rounded-lg gap-1.5 px-4 py-2">
            <BarChart3 className="w-3.5 h-3.5" /> Por Instância ({instanceMetrics.length})
          </TabsTrigger>
        </TabsList>

        {/* Links Tab */}
        <TabsContent value="links" className="mt-3">
          <div className="rounded-2xl border border-border/20 bg-card/80 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/10">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <LogIn className="w-4 h-4 text-primary" /> Log de Entradas
              </h3>
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-muted-foreground/40" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-7 text-xs w-36 rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos ({stats.total})</SelectItem>
                    <SelectItem value="success">Sucesso ({stats.success})</SelectItem>
                    <SelectItem value="already_member">Já membro ({stats.already})</SelectItem>
                    <SelectItem value="pending_approval">Aguardando ({stats.pendingApproval})</SelectItem>
                    <SelectItem value="error">Erro ({stats.error})</SelectItem>
                    <SelectItem value="pending">Pendente ({stats.pending})</SelectItem>
                    <SelectItem value="cancelled">Cancelado ({stats.cancelled})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="max-h-[500px] overflow-y-auto divide-y divide-border/10">
              {filteredItems.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground/50">Nenhum item encontrado</div>
              ) : (
                filteredItems.map((item: any) => {
                  const st = queueStatusConfig[item.status] || queueStatusConfig.pending;
                  const Icon = st.icon;
                  return (
                    <div key={item.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/5 transition-colors">
                      <Icon className={`w-4 h-4 shrink-0 ${st.color}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-foreground/80 truncate">{item.group_link}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.device_name && (
                            <span className="text-[10px] text-muted-foreground/40">{item.device_name}</span>
                          )}
                          {item.error_message && (
                            <span className="text-[10px] text-destructive/70 truncate">{item.error_message}</span>
                          )}
                          {(item.attempt || 0) > 1 && (
                            <span className="text-[10px] text-muted-foreground/30">{item.attempt}x</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge variant="outline" className={`text-[10px] ${st.color} border-0`}>{st.label}</Badge>
                        {item.processed_at && (
                          <p className="text-[9px] text-muted-foreground/40 mt-0.5">{formatDate(item.processed_at)}</p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </TabsContent>

        {/* Per-Instance Tab */}
        <TabsContent value="instances" className="mt-3">
          <div className="space-y-3">
            {instanceMetrics.map(inst => {
              const instTotal = inst.success + inst.already + inst.error;
              const instRate = instTotal > 0 ? Math.round(((inst.success + inst.already) / instTotal) * 100) : 0;
              const instProgress = inst.assigned > 0 ? (instTotal / inst.assigned) * 100 : 0;

              return (
                <div key={inst.id} className="rounded-2xl border border-border/20 bg-card/80 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground">{inst.name}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{instRate}% sucesso</Badge>
                  </div>

                  <Progress value={instProgress} className="h-1.5" />

                  <div className="grid grid-cols-5 gap-2 text-center text-[11px]">
                    <div>
                      <span className="text-muted-foreground/50 block">Atribuído</span>
                      <span className="font-bold text-foreground">{inst.assigned}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground/50 block">Sucesso</span>
                      <span className="font-bold text-emerald-500">{inst.success + inst.already}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground/50 block">Erro</span>
                      <span className={`font-bold ${inst.error > 0 ? "text-destructive" : "text-foreground/60"}`}>{inst.error}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground/50 block">Pendente</span>
                      <span className="font-bold text-foreground/60">{inst.pending}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground/50 block">Último</span>
                      <span className="font-bold text-foreground/60 text-[9px]">
                        {inst.lastAt ? formatDate(inst.lastAt) : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            {instanceMetrics.length === 0 && (
              <div className="text-center py-12 text-sm text-muted-foreground/50">
                Nenhuma instância processou links ainda
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar campanha?</AlertDialogTitle>
            <AlertDialogDescription>Todos os itens pendentes serão marcados como cancelados. Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => cancelMut.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Confirmar Cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
