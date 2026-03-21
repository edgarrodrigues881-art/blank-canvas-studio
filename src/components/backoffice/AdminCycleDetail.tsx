import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, RefreshCw, CheckCircle, Loader2, RotateCcw, FastForward, ChevronRight } from "lucide-react";

const PHASE_ORDER = ["pre_24h", "groups_only", "autosave_enabled", "community_light", "community_enabled", "completed"] as const;
const PHASE_LABELS: Record<string, string> = {
  pre_24h: "Pré-24h",
  groups_only: "Grupos",
  autosave_enabled: "AutoSave",
  community_light: "Comunidade Light",
  community_enabled: "Comunidade Full",
  completed: "Concluído",
};

const levelColors: Record<string, string> = {
  info: "text-teal-400",
  warn: "text-yellow-400",
  error: "text-destructive",
};

const jobStatusColors: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  running: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  succeeded: "bg-green-500/15 text-green-400 border-green-500/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const AdminCycleDetail = ({ cycleId, onBack }: { cycleId: string; onBack: () => void }) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirmPhase, setConfirmPhase] = useState<string | null>(null);

  const { data: cycle, isLoading: loadingCycle } = useQuery({
    queryKey: ["admin-cycle-detail", cycleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warmup_cycles")
        .select("*, devices(name, number)")
        .eq("id", cycleId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["admin-cycle-logs", cycleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warmup_audit_logs")
        .select("id, device_id, cycle_id, level, event_type, message, meta, created_at")
        .eq("cycle_id", cycleId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!cycleId,
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ["admin-cycle-jobs", cycleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warmup_jobs")
        .select("id, cycle_id, device_id, job_type, status, run_at, attempts, max_attempts, last_error, payload, created_at")
        .eq("cycle_id", cycleId)
        .order("run_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!cycleId,
  });

  const { data: instanceGroups = [] } = useQuery({
    queryKey: ["admin-cycle-groups", cycleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warmup_instance_groups")
        .select("*, warmup_groups_pool:group_id(name)")
        .eq("cycle_id", cycleId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!cycleId,
  });

  const clearError = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("warmup_cycles")
        .update({ last_error: null })
        .eq("id", cycleId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-cycle-detail", cycleId] });
      toast({ title: "Erro limpo" });
    },
  });

  const rescheduleJobs = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("warmup_jobs")
        .update({ status: "pending" as any, run_at: now, attempts: 0 })
        .eq("cycle_id", cycleId)
        .eq("status", "failed" as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-cycle-jobs", cycleId] });
      toast({ title: "Jobs falhados reagendados" });
    },
  });

  const advancePhase = useMutation({
    mutationFn: async (targetPhase: string) => {
      const updates: any = { phase: targetPhase, updated_at: new Date().toISOString() };
      if (targetPhase === "completed") {
        updates.is_running = false;
      }
      const { error } = await supabase
        .from("warmup_cycles")
        .update(updates)
        .eq("id", cycleId);
      if (error) throw error;

      // If advancing to autosave_enabled, auto-enroll in community
      if (targetPhase === "autosave_enabled" && cycle) {
        const { data: existing } = await supabase
          .from("warmup_community_membership")
          .select("id, is_enabled")
          .eq("device_id", cycle.device_id)
          .maybeSingle();
        if (!existing) {
          await supabase.from("warmup_community_membership").insert({
            device_id: cycle.device_id,
            user_id: cycle.user_id,
            cycle_id: cycleId,
            is_enabled: true,
            is_eligible: true,
            enabled_at: new Date().toISOString(),
          });
        } else if (!existing.is_enabled) {
          await supabase.from("warmup_community_membership")
            .update({ is_enabled: true, is_eligible: true, enabled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", existing.id);
        }
      }

      // Log the manual advance
      await supabase.from("warmup_audit_logs").insert({
        user_id: cycle!.user_id,
        device_id: cycle!.device_id,
        cycle_id: cycleId,
        level: "info" as any,
        event_type: "manual_phase_advance",
        message: `Fase avançada manualmente: ${cycle!.phase} → ${targetPhase}`,
        meta: { from: cycle!.phase, to: targetPhase, advanced_by: "admin" },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-cycle-detail", cycleId] });
      qc.invalidateQueries({ queryKey: ["admin-cycle-logs", cycleId] });
      qc.invalidateQueries({ queryKey: ["admin-warmup-cycles"] });
      toast({ title: "Fase avançada com sucesso" });
    },
    onError: (e: any) => {
      toast({ title: "Erro ao avançar fase", description: e.message, variant: "destructive" });
    },
  });

  if (loadingCycle) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!cycle) {
    return <div className="text-center py-12 text-muted-foreground">Ciclo não encontrado</div>;
  }

  const userName = cycle.user_id.slice(0, 8);
  const deviceName = (cycle as any).devices?.name || "—";
  const pendingJobs = jobs.filter(j => j.status === "pending").length;
  const failedJobs = jobs.filter(j => j.status === "failed").length;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground">
        <ArrowLeft size={14} className="mr-1" /> Voltar aos ciclos
      </Button>

      {/* Header */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground">{deviceName}</h3>
            <p className="text-sm text-muted-foreground">{userName} · {(cycle as any).devices?.number || ""}</p>
          </div>
          <Badge className={`text-xs ${cycle.phase === "error" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"}`}>
            {cycle.phase}
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Dia</p>
            <p className="text-lg font-bold text-foreground">{cycle.day_index}/{cycle.days_total}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Chip</p>
            <p className="text-lg font-bold text-foreground">{cycle.chip_state}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Budget</p>
            <p className="text-lg font-bold text-foreground">{cycle.daily_interaction_budget_used}/{cycle.daily_interaction_budget_target}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Únicos</p>
            <p className="text-lg font-bold text-foreground">{cycle.daily_unique_recipients_used}/{cycle.daily_unique_recipients_cap}</p>
          </div>
        </div>

        {cycle.last_error && (
          <div className="mt-3 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive flex items-center justify-between">
            <span>{cycle.last_error}</span>
            <Button variant="ghost" size="sm" onClick={() => clearError.mutate()} className="h-6 px-2 text-[10px]">
              <CheckCircle size={12} className="mr-1" /> Marcar resolvido
            </Button>
          </div>
        )}

        <div className="flex gap-2 mt-3 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => rescheduleJobs.mutate()} disabled={failedJobs === 0}>
            <RotateCcw size={12} className="mr-1" /> Reagendar falhados ({failedJobs})
          </Button>
        </div>

        {/* Phase Advance Controls */}
        {cycle.phase !== "completed" && cycle.phase !== "error" && (
          <div className="mt-4 p-3 bg-muted/20 border border-border rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <FastForward size={14} className="text-primary" />
              <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Avanço Manual de Fase (Teste)</p>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {PHASE_ORDER.map((phase, idx) => {
                const currentIdx = PHASE_ORDER.indexOf(cycle.phase as any);
                const isCurrent = phase === cycle.phase;
                const isPast = idx < currentIdx;
                const isNext = idx === currentIdx + 1;

                return (
                  <div key={phase} className="flex items-center gap-1">
                    {idx > 0 && <ChevronRight size={10} className="text-muted-foreground/40" />}
                    <Button
                      variant={isCurrent ? "default" : isNext ? "outline" : "ghost"}
                      size="sm"
                      className={`h-7 px-2.5 text-[11px] ${isPast ? "opacity-40" : ""} ${isNext ? "border-primary/50 text-primary" : ""}`}
                      disabled={isPast || isCurrent || advancePhase.isPending}
                      onClick={() => setConfirmPhase(phase)}
                    >
                      {advancePhase.isPending ? <Loader2 size={10} className="animate-spin" /> : PHASE_LABELS[phase]}
                    </Button>
                  </div>
                );
              })}
            </div>

            {/* Inline confirmation */}
            {confirmPhase && (
              <div className="mt-3 p-3 bg-primary/10 border border-primary/30 rounded-lg flex items-center justify-between gap-3">
                <p className="text-xs text-foreground">
                  Avançar para <strong>{PHASE_LABELS[confirmPhase]}</strong>? Isso pula as verificações automáticas.
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setConfirmPhase(null)}>
                    Cancelar
                  </Button>
                  <Button size="sm" className="h-7 text-xs" onClick={() => {
                    advancePhase.mutate(confirmPhase);
                    setConfirmPhase(null);
                  }}>
                    Confirmar
                  </Button>
                </div>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground mt-2">
              ⚠️ Somente para testes. Avançar manualmente pula as verificações automáticas.
            </p>
          </div>
        )}
      </div>

      {/* Instance Groups */}
      <div className="bg-card border border-border rounded-lg p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Grupos ({instanceGroups.length})</p>
        {instanceGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum grupo associado</p>
        ) : (
          <div className="space-y-1.5">
            {instanceGroups.map((ig: any) => (
              <div key={ig.id} className="flex items-center gap-3 bg-muted/20 rounded px-3 py-2">
                <span className="text-sm text-foreground flex-1">{ig.warmup_groups_pool?.name || ig.group_id.slice(0, 8)}</span>
                <Badge variant="outline" className="text-[10px]">{ig.join_status}</Badge>
                {ig.joined_at && (
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(ig.joined_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Jobs */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Jobs ({jobs.length}) · {pendingJobs} pendentes · {failedJobs} falhados
          </p>
          <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["admin-cycle-jobs", cycleId] })}>
            <RefreshCw size={12} />
          </Button>
        </div>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {jobs.map((j: any) => (
            <div key={j.id} className="flex items-center gap-2 px-3 py-1.5 rounded bg-muted/10 text-xs">
              <Badge className={`text-[9px] border ${jobStatusColors[j.status] || ""}`}>{j.status}</Badge>
              <span className="font-medium text-foreground">{j.job_type}</span>
              <span className="text-muted-foreground ml-auto">
                {new Date(j.run_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="text-muted-foreground/50">{j.attempts}/{j.max_attempts}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Logs Timeline */}
      <div className="bg-card border border-border rounded-lg p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Logs ({logs.length})</p>
        <div className="max-h-80 overflow-y-auto space-y-1">
          {logs.map((l: any) => (
            <div key={l.id} className="flex items-start gap-2 px-3 py-1.5 rounded bg-muted/10 text-xs">
              <span className={`font-bold uppercase text-[9px] mt-0.5 ${levelColors[l.level] || "text-muted-foreground"}`}>{l.level}</span>
              <span className="text-foreground flex-1">[{l.event_type}] {l.message}</span>
              <span className="text-muted-foreground/50 whitespace-nowrap">
                {new Date(l.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminCycleDetail;
