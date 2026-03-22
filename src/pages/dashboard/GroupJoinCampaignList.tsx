import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Plus, LogIn, Clock, CheckCircle2, XCircle, AlertTriangle,
  Loader2, Trash2, StopCircle, Play, Pause, MoreHorizontal,
  Users, Link2, ArrowRight
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  draft:     { label: "Rascunho",      color: "bg-muted text-muted-foreground",       icon: Clock },
  running:   { label: "Em andamento",  color: "bg-emerald-500/15 text-emerald-500",   icon: Play },
  paused:    { label: "Pausada",       color: "bg-amber-500/15 text-amber-500",       icon: Pause },
  done:      { label: "Concluída",     color: "bg-blue-500/15 text-blue-500",         icon: CheckCircle2 },
  error:     { label: "Erro",          color: "bg-destructive/15 text-destructive",   icon: AlertTriangle },
  cancelled: { label: "Cancelada",     color: "bg-muted text-muted-foreground",       icon: XCircle },
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
    refetchInterval: 60_000,
  });

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

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <LogIn className="w-5 h-5 text-primary" />
            </div>
            Entrada em Grupos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Campanhas de entrada automática em grupos do WhatsApp</p>
        </div>
        <Button onClick={() => navigate("/dashboard/group-join/new")} className="gap-2 rounded-xl h-10 px-5 shadow-md">
          <Plus className="w-4 h-4" /> Nova Campanha
        </Button>
      </div>

      {/* Stats */}
      {campaigns.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", value: campaigns.length, icon: Link2 },
            { label: "Ativas", value: campaigns.filter((c: any) => c.status === "running").length, icon: Play },
            { label: "Concluídas", value: campaigns.filter((c: any) => c.status === "done").length, icon: CheckCircle2 },
            { label: "Grupos processados", value: campaigns.reduce((s: number, c: any) => s + (c.success_count || 0) + (c.already_member_count || 0), 0), icon: Users },
          ].map((stat, i) => (
            <div key={i} className="rounded-xl border border-border/20 bg-card/80 p-3.5">
              <div className="flex items-center gap-2 text-muted-foreground/60 mb-1">
                <stat.icon className="w-3.5 h-3.5" />
                <span className="text-[11px] font-medium">{stat.label}</span>
              </div>
              <span className="text-xl font-bold text-foreground">{stat.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Campaign List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="border-border/20 bg-card/80">
          <CardContent className="py-16 text-center">
            <LogIn className="w-12 h-12 text-muted-foreground/15 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-1">Nenhuma campanha criada</h3>
            <p className="text-sm text-muted-foreground/60 mb-6">Crie sua primeira campanha para entrar em grupos automaticamente</p>
            <Button onClick={() => navigate("/dashboard/group-join/new")} className="gap-2 rounded-xl">
              <Plus className="w-4 h-4" /> Criar Campanha
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((camp: any) => {
            const st = statusConfig[camp.status] || statusConfig.draft;
            const total = camp.total_items || 0;
            const processed = (camp.success_count || 0) + (camp.already_member_count || 0) + (camp.error_count || 0);
            const progress = total > 0 ? (processed / total) * 100 : 0;
            const Icon = st.icon;

            return (
              <div
                key={camp.id}
                className="rounded-2xl border border-border/20 bg-card/80 p-4 hover:border-border/30 transition-colors cursor-pointer group"
                onClick={() => navigate(`/dashboard/group-join/${camp.id}`)}
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${st.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-foreground truncate">{camp.name || "Campanha sem nome"}</h3>
                      <p className="text-[11px] text-muted-foreground/50">{formatDate(camp.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Badge variant="outline" className={`text-[10px] ${st.color} border-0`}>{st.label}</Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/dashboard/group-join/${camp.id}`)} className="gap-2">
                          <ArrowRight className="w-3.5 h-3.5" /> Ver detalhes
                        </DropdownMenuItem>
                        {camp.status === "running" && (
                          <>
                            <DropdownMenuItem onClick={() => pauseMut.mutate(camp.id)} className="gap-2">
                              <Pause className="w-3.5 h-3.5" /> Pausar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => cancelMut.mutate(camp.id)} className="gap-2 text-destructive">
                              <StopCircle className="w-3.5 h-3.5" /> Cancelar
                            </DropdownMenuItem>
                          </>
                        )}
                        {camp.status === "paused" && (
                          <DropdownMenuItem onClick={() => resumeMut.mutate(camp.id)} className="gap-2">
                            <Play className="w-3.5 h-3.5" /> Continuar
                          </DropdownMenuItem>
                        )}
                        {["done", "cancelled", "error", "draft"].includes(camp.status) && (
                          <DropdownMenuItem onClick={() => setConfirmDelete(camp.id)} className="gap-2 text-destructive">
                            <Trash2 className="w-3.5 h-3.5" /> Excluir
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <Progress value={progress} className="h-1.5 mb-2" />

                <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
                  <div>
                    <span className="text-muted-foreground/50">Sucesso</span>
                    <span className="font-bold text-primary ml-1">{(camp.success_count || 0) + (camp.already_member_count || 0)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground/50">Erro</span>
                    <span className={`font-bold ml-1 ${camp.error_count > 0 ? "text-destructive" : "text-foreground/60"}`}>{camp.error_count || 0}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground/50">Pendente</span>
                    <span className="font-bold ml-1 text-foreground/60">{Math.max(0, total - processed)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground/50">Total</span>
                    <span className="font-bold ml-1 text-foreground/60">{total}</span>
                  </div>
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
            <AlertDialogDescription>Esta ação não pode ser desfeita. Todos os logs da campanha serão removidos.</AlertDialogDescription>
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
