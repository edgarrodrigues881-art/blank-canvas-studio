import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Plus, LogIn, CheckCircle2, XCircle, AlertTriangle,
  Loader2, Trash2, StopCircle, Play, Pause, MoreVertical,
  Users, Link2, ArrowRight, Clock, Zap
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

const statusConfig: Record<string, { label: string; dotColor: string; icon: any }> = {
  draft:     { label: "Rascunho",     dotColor: "bg-muted-foreground", icon: Clock },
  running:   { label: "Em execução",  dotColor: "bg-emerald-500",      icon: Play },
  paused:    { label: "Pausada",      dotColor: "bg-amber-500",        icon: Pause },
  done:      { label: "Concluída",    dotColor: "bg-primary",          icon: CheckCircle2 },
  error:     { label: "Erro",         dotColor: "bg-destructive",      icon: AlertTriangle },
  cancelled: { label: "Cancelada",    dotColor: "bg-muted-foreground", icon: XCircle },
};

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function GroupJoinCampaignList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["group-join-campaigns-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("group_join_campaigns" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!user,
    refetchInterval: () => document.hidden ? false : 20_000,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`group-join-campaigns-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_join_campaigns", filter: `user_id=eq.${user.id}` },
        () => queryClient.invalidateQueries({ queryKey: ["group-join-campaigns-list"] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, user?.id]);

  const cancelMut = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("group_join_campaigns" as any).update({ status: "cancelled", completed_at: new Date().toISOString() } as any).eq("id", id);
      await supabase.from("group_join_queue" as any).update({ status: "cancelled" } as any).eq("campaign_id", id).eq("status", "pending");
    },
    onSuccess: () => { toast.success("Campanha cancelada"); queryClient.invalidateQueries({ queryKey: ["group-join-campaigns-list"] }); },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("group_join_queue" as any).delete().eq("campaign_id", id);
      await supabase.from("group_join_campaigns" as any).delete().eq("id", id);
    },
    onSuccess: () => { toast.success("Campanha removida"); queryClient.invalidateQueries({ queryKey: ["group-join-campaigns-list"] }); setConfirmDelete(null); },
  });

  const pauseMut = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("group_join_campaigns" as any).update({ status: "paused" } as any).eq("id", id);
    },
    onSuccess: () => { toast.success("Campanha pausada"); queryClient.invalidateQueries({ queryKey: ["group-join-campaigns-list"] }); },
  });

  const resumeMut = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("group_join_campaigns" as any).update({ status: "running" } as any).eq("id", id);
      supabase.functions.invoke("process-group-join-campaign", { body: { campaign_id: id } }).catch(() => {});
    },
    onSuccess: () => { toast.success("Campanha retomada"); queryClient.invalidateQueries({ queryKey: ["group-join-campaigns-list"] }); },
  });

  const totalSuccess = campaigns.reduce((s: number, c: any) => s + (c.success_count || 0) + (c.already_member_count || 0), 0);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 sm:px-6 lg:px-10 pb-10">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center">
              <LogIn className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Entrada em Grupos</h1>
              <p className="text-sm text-muted-foreground">Campanhas automáticas de entrada em grupos WhatsApp</p>
            </div>
          </div>
        </div>
        <Button onClick={() => navigate("/dashboard/group-join/new")} className="gap-2 rounded-xl h-11 px-6 shadow-lg">
          <Plus className="w-4 h-4" /> Nova Campanha
        </Button>
      </div>

      {/* Stats Row */}
      {campaigns.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Campanhas", value: campaigns.length, icon: Link2, accent: false },
            { label: "Em execução", value: campaigns.filter((c: any) => c.status === "running").length, icon: Zap, accent: true },
            { label: "Concluídas", value: campaigns.filter((c: any) => c.status === "done").length, icon: CheckCircle2, accent: false },
            { label: "Grupos com sucesso", value: totalSuccess, icon: Users, accent: false },
          ].map((stat, i) => (
            <div key={i} className="rounded-2xl border border-border/30 bg-card p-4 transition-colors hover:border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${stat.accent ? 'bg-primary/15' : 'bg-muted/50'}`}>
                  <stat.icon className={`w-4 h-4 ${stat.accent ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Campaign Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-2xl border border-border/30 bg-card p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-5">
            <LogIn className="w-8 h-8 text-muted-foreground/20" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1.5">Nenhuma campanha criada</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">Crie sua primeira campanha para começar a entrar em grupos automaticamente</p>
          <Button onClick={() => navigate("/dashboard/group-join/new")} className="gap-2 rounded-xl h-11 px-6 shadow-lg">
            <Plus className="w-4 h-4" /> Criar Campanha
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {campaigns.map((camp: any) => {
            const st = statusConfig[camp.status] || statusConfig.draft;
            const total = camp.total_items || 0;
            const success = (camp.success_count || 0) + (camp.already_member_count || 0);
            const errors = camp.error_count || 0;
            const processed = success + errors;
            const pending = Math.max(0, total - processed);
            const progress = total > 0 ? (processed / total) * 100 : 0;

            return (
              <div
                key={camp.id}
                className="rounded-2xl border border-border/30 bg-card p-5 hover:border-border/50 hover:shadow-lg transition-all cursor-pointer group"
                onClick={() => navigate(`/dashboard/group-join/${camp.id}`)}
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-foreground truncate mb-1">{camp.name || "Campanha sem nome"}</h3>
                    <p className="text-[11px] text-muted-foreground">{formatDate(camp.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5 rounded-full border border-border/30 px-2.5 py-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${st.dotColor} ${camp.status === 'running' ? 'animate-pulse' : ''}`} />
                      <span className="text-[10px] font-medium text-foreground">{st.label}</span>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical className="w-3.5 h-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => navigate(`/dashboard/group-join/${camp.id}`)} className="gap-2 text-xs">
                          <ArrowRight className="w-3.5 h-3.5" /> Ver detalhes
                        </DropdownMenuItem>
                        {camp.status === "running" && (
                          <>
                            <DropdownMenuItem onClick={() => pauseMut.mutate(camp.id)} className="gap-2 text-xs">
                              <Pause className="w-3.5 h-3.5" /> Pausar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => cancelMut.mutate(camp.id)} className="gap-2 text-xs text-destructive">
                              <StopCircle className="w-3.5 h-3.5" /> Cancelar
                            </DropdownMenuItem>
                          </>
                        )}
                        {camp.status === "paused" && (
                          <DropdownMenuItem onClick={() => resumeMut.mutate(camp.id)} className="gap-2 text-xs">
                            <Play className="w-3.5 h-3.5" /> Continuar
                          </DropdownMenuItem>
                        )}
                        {["done", "cancelled", "error", "draft"].includes(camp.status) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setConfirmDelete(camp.id)} className="gap-2 text-xs text-destructive">
                              <Trash2 className="w-3.5 h-3.5" /> Excluir
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Progress */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-muted-foreground">Progresso</span>
                    <span className="text-[10px] font-semibold text-foreground">{processed}/{total}</span>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </div>

                {/* Metrics row */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "Sucesso", value: success, color: "text-primary" },
                    { label: "Erro", value: errors, color: errors > 0 ? "text-destructive" : "text-muted-foreground" },
                    { label: "Pendente", value: pending, color: "text-muted-foreground" },
                    { label: "Total", value: total, color: "text-foreground" },
                  ].map((m, i) => (
                    <div key={i} className="text-center">
                      <p className={`text-base font-bold ${m.color}`}>{m.value}</p>
                      <p className="text-[10px] text-muted-foreground">{m.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. Todos os dados e logs serão removidos permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && deleteMut.mutate(confirmDelete)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
