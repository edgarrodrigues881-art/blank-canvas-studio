import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, Play, Pause, StopCircle, RefreshCw, Copy, CheckCircle2,
  XCircle, Clock, AlertTriangle, Loader2, LogIn, Download, Filter
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

const queueStatusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending:         { label: "Pendente",       color: "text-muted-foreground",  icon: Clock },
  success:         { label: "Entrou",         color: "text-emerald-500",       icon: CheckCircle2 },
  already_member:  { label: "Já era membro",  color: "text-blue-500",          icon: CheckCircle2 },
  error:           { label: "Falhou",         color: "text-destructive",       icon: XCircle },
  cancelled:       { label: "Cancelado",      color: "text-muted-foreground",  icon: XCircle },
  pending_approval:{ label: "Aguardando aprovação", color: "text-amber-500", icon: Clock },
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
    refetchInterval: 60_000,
  });

  const { data: queueItems = [] } = useQuery({
    queryKey: ["group-join-queue", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("group_join_queue" as any)
        .select("*")
        .eq("campaign_id", id)
        .order("created_at", { ascending: true });
      return (data || []) as any[];
    },
    enabled: !!id && !!user,
    refetchInterval: 60_000,
  });

  const filteredItems = useMemo(() => {
    if (statusFilter === "all") return queueItems;
    return queueItems.filter((i: any) => i.status === statusFilter);
  }, [queueItems, statusFilter]);

  const stats = useMemo(() => {
    const s = { success: 0, already: 0, error: 0, pending: 0, cancelled: 0 };
    for (const item of queueItems) {
      if (item.status === "success") s.success++;
      else if (item.status === "already_member") s.already++;
      else if (item.status === "error") s.error++;
      else if (item.status === "cancelled") s.cancelled++;
      else s.pending++;
    }
    return s;
  }, [queueItems]);

  const total = queueItems.length;
  const processed = stats.success + stats.already + stats.error;
  const progress = total > 0 ? (processed / total) * 100 : 0;

  const cancelMut = useMutation({
    mutationFn: async () => {
      await supabase.from("group_join_campaigns" as any).update({ status: "cancelled", completed_at: new Date().toISOString() } as any).eq("id", id);
      await supabase.from("group_join_queue" as any).update({ status: "cancelled" } as any).eq("campaign_id", id).eq("status", "pending");
    },
    onSuccess: () => { toast.success("Campanha cancelada"); setConfirmCancel(false); queryClient.invalidateQueries({ queryKey: ["group-join-campaign", id] }); },
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
    onSuccess: () => { toast.success("Reprocessando falhas"); queryClient.invalidateQueries({ queryKey: ["group-join-campaign", id] }); },
  });

  const copyFailedLinks = () => {
    const failed = queueItems.filter((i: any) => i.status === "error").map((i: any) => i.group_link);
    if (failed.length === 0) return toast.info("Nenhum link com falha");
    navigator.clipboard.writeText(failed.join("\n"));
    setCopied(true);
    toast.success(`${failed.length} links copiados`);
    setTimeout(() => setCopied(false), 2000);
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
    <div className="space-y-6 max-w-3xl mx-auto">
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

      {/* Progress + Actions */}
      <div className="rounded-2xl border border-border/20 bg-card/80 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-foreground">
            {processed} de {total} processados ({Math.round(progress)}%)
          </div>
          <Badge variant="outline" className="text-xs">{campaign.status === "running" ? "Em andamento" : campaign.status === "paused" ? "Pausada" : campaign.status === "done" ? "Concluída" : campaign.status === "draft" ? "Rascunho" : campaign.status}</Badge>
        </div>
        <Progress value={progress} className="h-2" />

        <div className="grid grid-cols-4 gap-3 text-center">
          {[
            { label: "Sucesso", value: stats.success + stats.already, color: "text-emerald-500" },
            { label: "Erro", value: stats.error, color: stats.error > 0 ? "text-destructive" : "text-muted-foreground" },
            { label: "Pendente", value: stats.pending, color: "text-muted-foreground" },
            { label: "Cancelado", value: stats.cancelled, color: "text-muted-foreground/50" },
          ].map((s, i) => (
            <div key={i} className="rounded-xl border border-border/10 p-2.5">
              <div className="text-[10px] text-muted-foreground/60 mb-0.5">{s.label}</div>
              <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

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
              Copiar links com falha
            </Button>
          )}
        </div>
      </div>

      {/* Config info */}
      <div className="rounded-2xl border border-border/20 bg-card/80 p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
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

      {/* Queue items */}
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
                <SelectItem value="all">Todos ({total})</SelectItem>
                <SelectItem value="success">Sucesso ({stats.success})</SelectItem>
                <SelectItem value="already_member">Já membro ({stats.already})</SelectItem>
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
                    {item.error_message && (
                      <p className="text-[10px] text-destructive/70 mt-0.5 truncate">{item.error_message}</p>
                    )}
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
