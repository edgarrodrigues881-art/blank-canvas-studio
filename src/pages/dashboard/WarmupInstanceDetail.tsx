import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  useDeviceCycle,
  useInstanceGroups, useAutosaveContacts, useCommunityMembership,
  useWarmupAuditLogs, useWarmupPlans, useToggleCommunity, useToggleAutosave,
  type WarmupCycle,
} from "@/hooks/useWarmupV2";
import { useWarmupEngine } from "@/hooks/useWarmupEngine";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Flame, Play, Pause, Square,
  Clock, Users, MessageSquare, Shield, Globe, ScrollText,
  AlertTriangle, CheckCircle2, Zap, Timer, Loader2,
  CalendarDays, Target, UserPlus, Send, RotateCcw,
  FastForward, SkipForward, ChevronDown, ImageIcon,
} from "lucide-react";

const EVENT_TYPE_LABELS: Record<string, string> = {
  cycle_started: "Ciclo iniciado",
  cycle_paused: "Ciclo pausado",
  cycle_resumed: "Ciclo retomado",
  cycle_stopped: "Ciclo encerrado",
  group_joined: "Entrou no grupo",
  group_msg_sent: "Msg/foto/figurinha em grupo",
  group_interaction: "Msg/foto/figurinha em grupo",
  autosave_interaction: "Auto Save",
  community_interaction: "Comunidade",
  daily_reset: "Reset diário",
  phase_transition: "Mudança de fase",
  health_check: "Verificação",
  enable_autosave: "Ativou Auto Save",
  enable_community: "Ativou Comunidade",
  join_group: "Entrada em grupo",
  error: "Erro",
};
function translateEventType(type: string) {
  return EVENT_TYPE_LABELS[type] || type.replace(/_/g, " ");
}
import { formatDistanceToNow, differenceInCalendarDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";

/* ── phase config ── */
const phaseConfig: Record<string, { label: string; color: string; icon: typeof Clock; step: number }> = {
  pre_24h:              { label: "Primeiras 24h",       color: "text-amber-400",           icon: Timer,        step: 1 },
  groups_only:          { label: "Grupos",              color: "text-teal-400",            icon: Users,        step: 2 },
  autosave_enabled:     { label: "Auto Save",           color: "text-emerald-400",         icon: MessageSquare, step: 3 },
  community_ramp_up:    { label: "Comunitário Ramp-Up", color: "text-violet-400",          icon: Globe,        step: 4 },
  community_stable:     { label: "Comunitário Estável", color: "text-purple-400",          icon: Globe,        step: 5 },
  community_enabled:    { label: "Comunitário",         color: "text-purple-400",          icon: Globe,        step: 4 },
  community_light:      { label: "Comunitário Light",   color: "text-purple-400",          icon: Globe,        step: 4 },
  completed:            { label: "Concluído",           color: "text-muted-foreground",    icon: CheckCircle2, step: 6 },
  paused:               { label: "Pausado",             color: "text-amber-400",           icon: Pause,        step: 0 },
  error:                { label: "Erro",                color: "text-destructive",         icon: AlertTriangle, step: 0 },
};

const phaseSteps = ["pre_24h", "groups_only", "autosave_enabled", "community_ramp_up", "community_stable", "completed"] as const;

/* ── Progressive volume helper (mirrors server logic) ── */
function getExpectedDailyVolume(dayIndex: number, chipState: string): { min: number; max: number; phase: string } {
  const day = Math.max(1, Math.min(dayIndex, 30));
  let min: number, max: number, phase: string;

  if (chipState === "recovered") {
    if (day <= 7)       { min = 130; max = 150; phase = "Fase 1 — Conservadora"; }
    else if (day <= 15) { min = 150; max = 175; phase = "Fase 2 — Intermediária"; }
    else if (day <= 23) { min = 175; max = 195; phase = "Fase 3 — Forte"; }
    else                { min = 190; max = 200; phase = "Fase 4 — Estabilizada"; }
  } else if (chipState === "unstable") {
    if (day <= 7)       { min = 120; max = 130; phase = "Fase 1 — Reativação"; }
    else if (day <= 15) { min = 130; max = 155; phase = "Fase 2 — Crescimento"; }
    else if (day <= 23) { min = 155; max = 180; phase = "Fase 3 — Consolidação"; }
    else                { min = 175; max = 195; phase = "Fase 4 — Estabilidade"; }
  } else {
    // "new"
    if (day <= 7)       { min = 120; max = 135; phase = "Fase 1 — Cautelosa"; }
    else if (day <= 15) { min = 135; max = 160; phase = "Fase 2 — Gradual"; }
    else if (day <= 23) { min = 160; max = 185; phase = "Fase 3 — Acelerada"; }
    else                { min = 185; max = 200; phase = "Fase 4 — Máxima"; }
  }

  return { min, max, phase };
}

/* ── Auto Save contacts helper (mirrors server logic) ── */
function getAutosaveInfoForDay(dayIndex: number, chipState: string): { contacts: number; msgsPerContact: number; totalMsgs: number } {
  const autosaveStartDay = (chipState === "unstable" ? 6 : chipState === "recovered" ? 5 : 4) + 1;
  if (dayIndex < autosaveStartDay) return { contacts: 0, msgsPerContact: 0, totalMsgs: 0 };

  let contacts: number;
  if (chipState === "new") {
    const daysSince = dayIndex - autosaveStartDay;
    if (daysSince === 0) contacts = 3;
    else if (daysSince === 1) contacts = 4;
    else contacts = 5;
  } else if (chipState === "recovered") {
    const daysSince = dayIndex - autosaveStartDay;
    if (daysSince === 0) contacts = 2;
    else if (daysSince === 1) contacts = 3;
    else if (daysSince === 2) contacts = 4;
    else contacts = 5;
  } else if (chipState === "unstable") {
    const daysSince = dayIndex - autosaveStartDay;
    if (daysSince === 0) contacts = 1;
    else if (daysSince === 1) contacts = 3;
    else if (daysSince === 2) contacts = 4;
    else contacts = 5;
  } else {
    contacts = 5;
  }
  const msgsPerContact = chipState === "unstable" ? 5 : 3;
  return { contacts, msgsPerContact, totalMsgs: contacts * msgsPerContact };
}

const chipStateLabels: Record<string, string> = {
  new: "Chip Novo",
  recovered: "Chip Recuperado",
  unstable: "Chip Fraco",
};

/* ── Helper: autosave / community start day based on chip_state ── */
function getAutosaveStartDay(chipState: string): number {
  const groupsEnd = chipState === "unstable" ? 6 : chipState === "recovered" ? 5 : 4;
  return groupsEnd + 1;
}
function getCommunityStartDay(chipState: string): number {
  const groupsEnd = chipState === "unstable" ? 6 : chipState === "recovered" ? 5 : 4;
  return groupsEnd + 2;
}

/* ── component ── */
const WarmupInstanceDetail = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromFolder = searchParams.get("folder");
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: device } = useQuery({
    queryKey: ["device-detail-warmup", deviceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("id, name, number, status, login_type, proxy_id, profile_picture, profile_name, created_at, updated_at, instance_type")
        .eq("id", deviceId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!deviceId,
  });

  const { data: cycle, isLoading: cycleLoading } = useDeviceCycle(deviceId!);
  const engine = useWarmupEngine();
  const toggleCommunity = useToggleCommunity();
  const toggleAutosave = useToggleAutosave();

  const { data: instanceGroups = [] } = useInstanceGroups(deviceId!);
  const { data: autosaveContacts = [] } = useAutosaveContacts();

  // Autosave contact rotation stats
  const autosaveStats = useMemo(() => {
    const total = autosaveContacts.length;
    const valid = autosaveContacts.filter((c: any) => c.is_active && c.contact_status !== "invalid" && c.contact_status !== "discarded").length;
    const newContacts = autosaveContacts.filter((c: any) => c.is_active && (c.contact_status === "new" || !c.contact_status)).length;
    const used = autosaveContacts.filter((c: any) => c.is_active && c.contact_status === "used").length;
    const invalid = autosaveContacts.filter((c: any) => c.contact_status === "invalid").length;
    const discarded = autosaveContacts.filter((c: any) => c.contact_status === "discarded").length;
    const exhausted = valid > 0 && newContacts === 0;
    return { total, valid, newContacts, used, invalid, discarded, exhausted };
  }, [autosaveContacts]);
  const { data: community } = useCommunityMembership(deviceId!);
  const { data: auditLogs = [] } = useWarmupAuditLogs(cycle?.id);
  const { data: plans = [] } = useWarmupPlans();

  // Fetch scheduled jobs for this cycle
  const { data: scheduledJobs = [] } = useQuery({
    queryKey: ["warmup_jobs_scheduled", cycle?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warmup_jobs")
        .select("id, job_type, status, run_at, payload, last_error")
        .eq("cycle_id", cycle!.id)
        .order("run_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!cycle?.id,
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  // statusToday removed — UAZAPI v2 does not support status posting

  // Group audit logs by warmup day
  const cycleStartedAt = cycle?.started_at ? new Date(cycle.started_at) : null;
  const dayGroups = useMemo(() => {
    if (!cycleStartedAt || auditLogs.length === 0) return [];
    const groups: Record<number, typeof auditLogs> = {};
    auditLogs.forEach(log => {
      const dayIdx = differenceInCalendarDays(new Date(log.created_at), cycleStartedAt) + 1;
      const day = Math.max(1, dayIdx);
      if (!groups[day]) groups[day] = [];
      groups[day].push(log);
    });
    return Object.entries(groups)
      .map(([day, logs]) => ({ day: Number(day), logs }))
      .sort((a, b) => b.day - a.day);
  }, [auditLogs, cycleStartedAt?.getTime()]);

  const [chipState, setChipState] = useState<"new" | "recovered" | "unstable">("new");
  const [daysTotal, setDaysTotal] = useState("7");
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showShortDaysWarning, setShowShortDaysWarning] = useState(false);
  const [showAdvanceConfirm, setShowAdvanceConfirm] = useState(false);
  const [showAccelerateConfirm, setShowAccelerateConfirm] = useState(false);
  const [accelerating, setAccelerating] = useState(false);
  const [advancingPhase, setAdvancingPhase] = useState(false);
  const [repairingSchedule, setRepairingSchedule] = useState(false);
  const [testingAutosave, setTestingAutosave] = useState(false);
  const [testingCommunity, setTestingCommunity] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());
  const [showAllDays, setShowAllDays] = useState(false);

  // Auto-enable community when community day is reached
  useEffect(() => {
    if (!cycle || !deviceId || !user) return;
    const communityDay = getCommunityStartDay(cycle.chip_state || "new");
    if (cycle.day_index >= communityDay && community === null) {
      // No membership record yet — auto-enable
      toggleCommunity.mutate({ deviceId, cycleId: cycle.id, enable: true });
    }
  }, [cycle?.day_index, cycle?.chip_state, community, deviceId, user]);

  type ScheduledJobLite = {
    id: string;
    job_type: string;
    status: string;
    run_at: string;
    payload: any;
  };

  const pickNextForcedJob = (jobs: ScheduledJobLite[]) => {
    const pendingSorted = jobs
      .filter((j) => j.status === "pending")
      .sort((a, b) => new Date(a.run_at).getTime() - new Date(b.run_at).getTime());

    const isDay1 = (cycle?.day_index ?? 1) <= 1;
    if (isDay1) return pendingSorted[0] ?? null;

    return (
      pendingSorted.find((j) =>
        j.job_type === "group_interaction" ||
        j.job_type === "autosave_interaction" ||
        j.job_type === "community_interaction"
      ) ||
      pendingSorted.find((j) => j.job_type !== "join_group") ||
      null
    );
  };

  /* accelerate: forces only the NEXT pending job to run NOW */
  const handleAccelerate = async () => {
    if (!cycle?.id) return;
    setAccelerating(true);
    try {
      const isDay2Plus = (cycle.day_index ?? 1) > 1;

      // Day 2+: never force group join anymore
      if (isDay2Plus) {
        await supabase
          .from("warmup_jobs")
          .update({ status: "cancelled", last_error: "Cancelado automaticamente: entrada em grupo só no dia 1" })
          .eq("cycle_id", cycle.id)
          .eq("status", "pending")
          .eq("job_type", "join_group");
      }

      // Fetch pending jobs and choose the correct next one by day/phase
      const { data: pendingJobs, error: fetchErr } = await supabase
        .from("warmup_jobs")
        .select("id, job_type, status, run_at, payload")
        .eq("cycle_id", cycle.id)
        .eq("status", "pending")
        .order("run_at", { ascending: true });
      if (fetchErr) throw fetchErr;

      const nextJob = pickNextForcedJob((pendingJobs || []) as ScheduledJobLite[]);

      if (!nextJob) {
        // No pending jobs → ask backend to create new ones for current phase
        toast({ title: "⏳ Gerando tarefas...", description: "Criando novas tarefas para a fase atual." });
        try {
          await supabase.functions.invoke("warmup-tick", {
            body: { action: "schedule_day", cycle_id: cycle.id, device_id: deviceId, forced: true },
          });
          await queryClient.invalidateQueries({ queryKey: ["warmup_jobs_scheduled", cycle.id] });
          // Retry: fetch new pending jobs
          const { data: newJobs } = await supabase
            .from("warmup_jobs")
            .select("id, job_type, status, run_at, payload")
            .eq("cycle_id", cycle.id)
            .eq("status", "pending")
            .order("run_at", { ascending: true });
          const retryJob = pickNextForcedJob((newJobs || []) as ScheduledJobLite[]);
          if (!retryJob) {
            toast({ title: "Sem tarefas", description: "Não foi possível gerar tarefas para esta fase.", variant: "destructive" });
            return;
          }
          // Force the newly created job
          const retryPayload = { ...(retryJob.payload as Record<string, unknown> || {}), forced: true };
          await supabase.from("warmup_jobs").update({
            run_at: new Date().toISOString(), attempts: 0, last_error: null, payload: retryPayload as any,
          }).eq("id", retryJob.id).eq("status", "pending");
          await supabase.functions.invoke("warmup-tick", { body: {} });
          await queryClient.invalidateQueries({ queryKey: ["warmup_jobs_scheduled", cycle.id] });
          const jobLabel2 = {
            join_group: "Entrada em grupo", group_interaction: "Mensagem em grupo",
            autosave_interaction: "Mensagem privada", community_interaction: "Interação comunitária",
          }[retryJob.job_type] || retryJob.job_type;
          toast({ title: "⚡ Forçado!", description: `Tarefa (${jobLabel2}) executando agora.` });
        } catch (schedErr: any) {
          toast({ title: "Erro ao gerar tarefas", description: schedErr.message, variant: "destructive" });
        }
        return;
      }

      // For join_group on day 1: skip if group already joined
      if (nextJob.job_type === "join_group") {
        const groupId = (nextJob.payload as any)?.group_id;
        if (groupId) {
          const joinedGroupIds = new Set(
            instanceGroups
              .filter((g) => g.join_status === "joined")
              .map((g) => g.group_id)
          );
          for (const g of instanceGroups) {
            if (g.join_status !== "joined") {
              const poolName = g.warmup_groups_pool?.name;
              const normalizedName = poolName ? normalizeGroupName(poolName) : "";
              const liveMatch = normalizedName && liveDeviceGroups.some(
                (lg) => normalizeGroupName(lg.name) === normalizedName
              );
              if (liveMatch || (g.group_jid && liveDeviceGroups.some((lg) => lg.id === g.group_jid))) {
                joinedGroupIds.add(g.group_id);
              }
            }
          }
          if (joinedGroupIds.has(groupId)) {
            await supabase
              .from("warmup_jobs")
              .update({ status: "cancelled", last_error: "Grupo já ingressado — cancelado" })
              .eq("id", nextJob.id);
            toast({ title: "Grupo já ingressado", description: "Job cancelado. Clique novamente para forçar o próximo." });
            await queryClient.invalidateQueries({ queryKey: ["warmup_jobs_scheduled", cycle.id] });
            return;
          }
        }
      }

      // Set run_at to NOW and mark as forced
      const forcedPayload = { ...(nextJob.payload as Record<string, unknown> || {}), forced: true };
      const { error: updateErr } = await supabase
        .from("warmup_jobs")
        .update({
          run_at: new Date().toISOString(),
          attempts: 0,
          last_error: null,
          payload: forcedPayload as any,
        })
        .eq("id", nextJob.id)
        .eq("status", "pending");
      if (updateErr) throw updateErr;

      // Trigger warmup-tick immediately
      try {
        await supabase.functions.invoke("warmup-tick", { body: {} });
      } catch (_e) {}

      await queryClient.invalidateQueries({ queryKey: ["warmup_jobs_scheduled", cycle.id] });

      const jobLabelMap: Record<string, string> = {
        join_group: "Entrada em grupo",
        group_interaction: "Mensagem/foto/figurinha em grupo",
        autosave_interaction: "Mensagem privada",
        community_interaction: "Interação comunitária",
        phase_transition: "Avançar fase",
        enable_autosave: "Ativar Auto Save",
        enable_community: "Ativar Comunidade",
      };
      const jobLabel = jobLabelMap[nextJob.job_type] || nextJob.job_type.replace(/_/g, " ");
      toast({ title: "⚡ Forçado!", description: `Próxima tarefa (${jobLabel}) executando agora.` });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setAccelerating(false);
    }
  };

  const handleRestoreSchedule = async () => {
    if (!deviceId || !cycle) return;
    setRepairingSchedule(true);
    try {
      const normalizedPhase = cycle.phase === "pre_24h" && (cycle.day_index ?? 1) > 1
        ? "groups_only"
        : cycle.phase;

      const { error: engineErr } = await supabase.functions.invoke("warmup-engine", {
        body: {
          action: "schedule_day",
          device_id: deviceId,
          cycle_id: cycle.id,
          day_index: cycle.day_index,
          phase: normalizedPhase,
          chip_state: cycle.chip_state,
        },
      });

      if (engineErr) {
        const { error: tickErr } = await supabase.functions.invoke("warmup-tick", {
          body: {
            action: "schedule_day",
            cycle_id: cycle.id,
            device_id: deviceId,
            forced: true,
          },
        });
        if (tickErr) throw tickErr;
      }

      await queryClient.invalidateQueries({ queryKey: ["warmup_jobs_scheduled", cycle.id] });

      const { count } = await supabase
        .from("warmup_jobs")
        .select("id", { count: "exact", head: true })
        .eq("cycle_id", cycle.id)
        .neq("status", "cancelled");

      toast({
        title: "✅ Tarefas restauradas",
        description: `Fila reconstruída com ${count ?? 0} tarefa(s).`,
      });
    } catch (err: any) {
      toast({
        title: "Erro ao restaurar",
        description: err.message || "Não foi possível recriar as tarefas agora.",
        variant: "destructive",
      });
    } finally {
      setRepairingSchedule(false);
    }
  };

  /* ── TEMPORARY: Test Auto Save — creates 25 jobs (5 contacts × 5 msgs) with 4-7min gaps ── */
  const handleTestAutosave = async () => {
    if (!cycle?.id || !deviceId || !user) return;
    setTestingAutosave(true);
    try {
      // If there are pending autosave jobs, force only the NEXT one (don't recreate/reset queue)
      const { data: pendingAutosave, error: pendingErr } = await supabase
        .from("warmup_jobs")
        .select("id, payload, run_at")
        .eq("cycle_id", cycle.id)
        .eq("status", "pending")
        .eq("job_type", "autosave_interaction")
        .order("run_at", { ascending: true })
        .limit(1);
      if (pendingErr) throw pendingErr;

      if (pendingAutosave && pendingAutosave.length > 0) {
        const next = pendingAutosave[0];
        const basePayload = (next.payload && typeof next.payload === "object"
          ? (next.payload as Record<string, unknown>)
          : {});
        const forcedPayload = { ...basePayload, forced: true };
        const { error: upErr } = await supabase
          .from("warmup_jobs")
          .update({ run_at: new Date().toISOString(), attempts: 0, last_error: null, payload: forcedPayload as any })
          .eq("id", next.id)
          .eq("status", "pending");
        if (upErr) throw upErr;

        await supabase.functions.invoke("warmup-tick", { body: {} });
        await queryClient.invalidateQueries({ queryKey: ["warmup_jobs_scheduled", cycle.id] });
        await queryClient.invalidateQueries({ queryKey: ["warmup_audit_logs", cycle.id] });

        const ri = Number(basePayload?.recipient_index ?? 0) + 1;
        const mi = Number(basePayload?.msg_index ?? 0) + 1;
        toast({ title: "⚡ Próximo Auto Save forçado", description: `Executando contato ${ri}/5, msg ${mi}/5 agora.` });
        return;
      }

      // No pending autosave jobs: create a fresh batch (5 contacts × 5 msgs)
      const jobs: any[] = [];
      let cursor = Date.now() + 5000; // start in 5s

      for (let c = 0; c < 5; c++) {
        for (let m = 0; m < 5; m++) {
          jobs.push({
            user_id: user.id,
            device_id: deviceId,
            cycle_id: cycle.id,
            job_type: "autosave_interaction" as any,
            payload: { recipient_index: c, msg_index: m, forced: true },
            run_at: new Date(cursor).toISOString(),
            status: "pending" as any,
          });
          cursor += (4 + Math.floor(Math.random() * 4)) * 60 * 1000; // 4-7 min
        }
        cursor += (5 + Math.floor(Math.random() * 6)) * 60 * 1000; // 5-10 min between contacts
      }

      const { error: insertErr } = await supabase.from("warmup_jobs").insert(jobs);
      if (insertErr) throw insertErr;

      await supabase.functions.invoke("warmup-tick", { body: {} });
      await queryClient.invalidateQueries({ queryKey: ["warmup_jobs_scheduled", cycle.id] });
      await queryClient.invalidateQueries({ queryKey: ["warmup_audit_logs", cycle.id] });

      toast({ title: "🧪 Auto Save completo agendado!", description: "25 mensagens (5 contatos × 5 msgs) agendadas com intervalos de 4-7 min." });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setTestingAutosave(false);
    }
  };

  /* ── Test Community — forces next community_interaction job or creates a burst ── */
  const handleTestCommunity = async () => {
    if (!cycle?.id || !deviceId || !user) return;
    setTestingCommunity(true);
    try {
      // Check for pending community jobs first
      const { data: pendingComm, error: pendingErr } = await supabase
        .from("warmup_jobs")
        .select("id, payload, run_at")
        .eq("cycle_id", cycle.id)
        .eq("status", "pending")
        .eq("job_type", "community_interaction")
        .order("run_at", { ascending: true })
        .limit(1);
      if (pendingErr) throw pendingErr;

      if (pendingComm && pendingComm.length > 0) {
        const next = pendingComm[0];
        const basePayload = (next.payload && typeof next.payload === "object"
          ? (next.payload as Record<string, unknown>)
          : {});
        const forcedPayload = { ...basePayload, forced: true };
        const { error: upErr } = await supabase
          .from("warmup_jobs")
          .update({ run_at: new Date().toISOString(), attempts: 0, last_error: null, payload: forcedPayload as any })
          .eq("id", next.id)
          .eq("status", "pending");
        if (upErr) throw upErr;

        await supabase.functions.invoke("warmup-tick", { body: {} });
        await queryClient.invalidateQueries({ queryKey: ["warmup_jobs_scheduled", cycle.id] });
        await queryClient.invalidateQueries({ queryKey: ["warmup_audit_logs", cycle.id] });

        toast({ title: "⚡ Comunitário forçado", description: "Executando próximo burst comunitário agora." });
        return;
      }

      // No pending community jobs: create a single burst job
      const { error: insertErr } = await supabase.from("warmup_jobs").insert({
        user_id: user.id,
        device_id: deviceId,
        cycle_id: cycle.id,
        job_type: "community_interaction" as any,
        payload: { forced: true, burst_index: 0 },
        run_at: new Date().toISOString(),
        status: "pending" as any,
      });
      if (insertErr) throw insertErr;

      await supabase.functions.invoke("warmup-tick", { body: {} });
      await queryClient.invalidateQueries({ queryKey: ["warmup_jobs_scheduled", cycle.id] });
      await queryClient.invalidateQueries({ queryKey: ["warmup_audit_logs", cycle.id] });

      toast({ title: "🧪 Burst comunitário agendado!", description: "Um burst de mensagens comunitárias foi disparado." });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setTestingCommunity(false);
    }
  };

  /* advance day: skip current day's jobs, move to next day (or complete if last day) */
  const handleAdvancePhase = async () => {
    if (!deviceId || !cycle) return;
    setAdvancingPhase(true);
    try {
      // Always read latest cycle from DB to avoid stale UI/cache
      const { data: latestCycle, error: latestErr } = await supabase
        .from("warmup_cycles")
        .select("id, phase, day_index, days_total, chip_state")
        .eq("id", cycle.id)
        .single();
      if (latestErr) throw latestErr;

      // If already completed, nothing to do
      if (latestCycle.phase === "completed") {
        toast({ title: "Ciclo já concluído", description: "Este ciclo já foi finalizado." });
        return;
      }

      const newDayIndex = (latestCycle.day_index || 1) + 1;
      const isLastDay = newDayIndex > (latestCycle.days_total || 30);
      const finalDayIndex = isLastDay ? latestCycle.days_total : newDayIndex;
      
      // Phase progression matching engine logic:
      // Day 1 = pre_24h, Days 2-4(new/recovered) or 2-7(unstable) = groups_only,
      // Next day = autosave_enabled, Then = community_enabled
      const chip = latestCycle.chip_state || "new";
      const groupsEndDay = chip === "unstable" ? 7 : 4;
      const getPhaseForDay = (day: number) => {
        if (day <= 1) return "pre_24h";
        if (day <= groupsEndDay) return "groups_only";
        if (day === groupsEndDay + 1) return "autosave_enabled";
        return "community_enabled";
      };
      const nextPhase = isLastDay ? "completed" : getPhaseForDay(finalDayIndex);

      // 1) Cancel ALL still-open jobs (incl. running/pending) to avoid double-advance
      await supabase
        .from("warmup_jobs")
        .update({ status: "cancelled", last_error: "Dia pulado manualmente" })
        .eq("cycle_id", cycle.id)
        .in("status", ["pending", "running"]);

      // 2) Persist new day + phase and mark reset timestamp to keep reset idempotent
      const resetAt = new Date().toISOString();
      const { error } = await supabase
        .from("warmup_cycles")
        .update({
          phase: nextPhase,
          previous_phase: latestCycle.phase,
          day_index: finalDayIndex,
          daily_interaction_budget_used: 0,
          daily_unique_recipients_used: 0,
          last_daily_reset_at: resetAt,
          is_running: !isLastDay,
          updated_at: resetAt,
        })
        .eq("id", cycle.id);
      if (error) throw error;

      // 3) Schedule jobs for new day + ensure only one daily_reset for tomorrow
      if (!isLastDay) {
        const { error: fnErr } = await supabase.functions.invoke("warmup-engine", {
          body: {
            action: "schedule_day",
            device_id: deviceId,
            cycle_id: cycle.id,
            day_index: finalDayIndex,
            phase: nextPhase,
            chip_state: latestCycle.chip_state || "new",
          },
        });
        if (fnErr) console.warn("schedule_day invoke error:", fnErr);

        const tomorrow = new Date();
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        tomorrow.setUTCHours(3, 5, 0, 0);

        const { data: existingReset } = await supabase
          .from("warmup_jobs")
          .select("id")
          .eq("cycle_id", cycle.id)
          .eq("job_type", "daily_reset")
          .eq("status", "pending")
          .gte("run_at", new Date().toISOString())
          .limit(1);

        if (!existingReset || existingReset.length === 0) {
          await supabase.from("warmup_jobs").insert({
            user_id: user!.id,
            device_id: deviceId,
            cycle_id: cycle.id,
            job_type: "daily_reset",
            payload: {},
            run_at: tomorrow.toISOString(),
            status: "pending",
          });
        }
      }

      // 4) Audit log
      await supabase.from("warmup_audit_logs").insert({
        user_id: user!.id,
        device_id: deviceId,
        cycle_id: cycle.id,
        event_type: "manual_day_advance",
        level: "info",
        message: isLastDay
          ? `Ciclo concluído manualmente no dia ${latestCycle.day_index}`
          : `Dia pulado: ${latestCycle.day_index} → ${finalDayIndex} (fase: ${nextPhase})`,
        meta: { from_day: latestCycle.day_index, to_day: finalDayIndex, phase: nextPhase },
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["warmup_cycle_device", deviceId] }),
        queryClient.invalidateQueries({ queryKey: ["warmup_cycles"] }),
        queryClient.invalidateQueries({ queryKey: ["warmup_jobs_scheduled", cycle.id] }),
        queryClient.invalidateQueries({ queryKey: ["warmup_audit_logs", cycle.id] }),
      ]);

      toast({
        title: isLastDay ? "✅ Ciclo concluído!" : "🚀 Dia pulado!",
        description: isLastDay
          ? "O aquecimento foi finalizado."
          : `Avançou para dia ${finalDayIndex}/${latestCycle.days_total}`,
      });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setAdvancingPhase(false);
    }
  };

  /* countdown */
  const [countdown, setCountdown] = useState("");
  useEffect(() => {
    if (!cycle || cycle.phase !== "pre_24h") return;
    const tick = () => {
      const end = new Date(cycle.first_24h_ends_at).getTime();
      const start = end - 24 * 3600000;
      const now = Date.now();
      const elapsed = now - start;
      if (elapsed >= 24 * 3600000) { setCountdown("24:00:00"); return; }
      if (elapsed < 0) { setCountdown("00:00:00"); return; }
      const h = Math.floor(elapsed / 3600000);
      const m = Math.floor((elapsed % 3600000) / 60000);
      const s = Math.floor((elapsed % 60000) / 1000);
      setCountdown(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [cycle]);

  const isConnected = device && ["Connected", "Ready", "authenticated"].includes(device.status);

  const normalizeGroupName = (value?: string | null) =>
    (value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

  const normalizeInviteLink = (value?: string | null) =>
    (value || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^chat\.whatsapp\.com\//, "")
      .split("?")[0]
      .replace(/\/$/, "");

  // Only consider truly actionable pending states (not "left")
  const hasPendingGroupJobs =
    instanceGroups.some((g) => g.join_status === "pending" || g.join_status === "failed") ||
    (scheduledJobs || []).some((job) => job.job_type === "join_group" && job.status === "pending");

  // Determine if we need live group data at all
  const hasActiveGroupTracking = instanceGroups.length > 0 && cycle?.is_running;

  const { data: liveGroupsResult = { groups: [], syncOk: false } } = useQuery<{ groups: { id: string; name: string }[]; syncOk: boolean }>({
    queryKey: ["warmup_live_groups", deviceId, hasPendingGroupJobs],
    queryFn: async () => {
      if (!deviceId) return { groups: [], syncOk: false };
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        if (!token) return { groups: [], syncOk: false };

        const refreshParam = hasPendingGroupJobs ? "&refresh=true" : "";
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whapi-chats?action=list_chats&device_id=${deviceId}&count=200${refreshParam}`,
          { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
        );
        if (!res.ok) return { groups: [], syncOk: false };

        const json = await res.json();
        const chats = Array.isArray(json?.chats) ? json.chats : [];
        const dedup = new Map<string, { id: string; name: string }>();

        for (const c of chats) {
          const id = c.id || c.jid || c.chatId || c.JID || "";
          const name = c.name || c.subject || c.title || c.id || "Grupo sem nome";
          if (!id || !String(id).includes("@g.us")) continue;
          if (!dedup.has(id)) dedup.set(id, { id, name });
        }

        return {
          groups: Array.from(dedup.values()),
          syncOk: json?.sync_ok === true,
        };
      } catch {
        return { groups: [], syncOk: false };
      }
    },
    // Only poll when connected AND we have groups to track
    enabled: !!user && !!deviceId && !!isConnected && !!hasActiveGroupTracking,
    // Fast polling only when there are actually pending joins; otherwise slow (3 min)
    refetchInterval: hasPendingGroupJobs ? 20_000 : 180_000,
    staleTime: hasPendingGroupJobs ? 10_000 : 60_000,
  });

  const liveDeviceGroups = liveGroupsResult.groups;
  const liveGroupsSyncOk = liveGroupsResult.syncOk;

  const { data: poolGroups = [] } = useQuery<{ id: string; name: string; external_group_ref: string | null }[]>({
    queryKey: ["warmup_pool_groups_for_counter"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warmup_groups_pool")
        .select("id, name, external_group_ref")
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) return [];
      return data || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // Removido backfill legado do pool global para não criar grupos pendentes sem nome/link no ciclo atual.

  // Auto-reconhece grupos já ingressados e sincroniza status local
  useEffect(() => {
    if (!deviceId || instanceGroups.length === 0) return;

    const liveJids = new Set(liveDeviceGroups.map((g) => g.id));
    const liveNameToJid = new Map<string, string>();
    for (const g of liveDeviceGroups) {
      const normalized = normalizeGroupName(g.name);
      if (normalized && !liveNameToJid.has(normalized)) liveNameToJid.set(normalized, g.id);
    }

    if (!liveGroupsSyncOk) return;

    const toPromote = instanceGroups
      .filter((g) => g.join_status !== "joined")
      .map((g) => {
        const poolName = g.warmup_groups_pool?.name;

        const byJid = g.group_jid && liveJids.has(g.group_jid) ? g.group_jid : null;
        const byName = poolName ? liveNameToJid.get(normalizeGroupName(poolName)) || null : null;

        const matchedJid = byJid || byName;
        if (!matchedJid) return null;
        return { id: g.id, matchedJid };
      })
      .filter((g): g is { id: string; matchedJid: string | null } => !!g);

    if (toPromote.length === 0) return;

    const syncRecognizedGroups = async () => {
      const now = new Date().toISOString();
      await Promise.all(
        toPromote.map((row) => {
          const payload: Record<string, string | null> = {
            join_status: "joined",
            joined_at: now,
            last_error: null,
          };
          if (row.matchedJid) payload.group_jid = row.matchedJid;

          return supabase
            .from("warmup_instance_groups")
            .update(payload)
            .eq("id", row.id)
            .neq("join_status", "joined");
        })
      );
      queryClient.invalidateQueries({ queryKey: ["warmup_instance_groups", deviceId] });
    };

    void syncRecognizedGroups();
  }, [deviceId, instanceGroups, liveDeviceGroups, liveGroupsSyncOk, queryClient]);

  // Reverse sync: demote groups marked 'joined' that are no longer on the device
  useEffect(() => {
    if (!deviceId || instanceGroups.length === 0) return;
    // Only run reverse sync when live synchronization is confirmed
    if (!liveGroupsSyncOk) return;

    const currentlyJoined = instanceGroups.filter((g) => g.join_status === "joined").length;
    // Safety guard: do not demote on clearly partial/empty snapshots
    if (currentlyJoined > 0 && liveDeviceGroups.length === 0) return;

    const liveJids = new Set(liveDeviceGroups.map((g) => g.id));
    const liveNames = new Set(liveDeviceGroups.map((g) => normalizeGroupName(g.name)));

    const toDemote = instanceGroups
      .filter((g) => {
        if (g.join_status !== "joined") return false;
        // Check if group is still present by JID
        if (g.group_jid && liveJids.has(g.group_jid)) return false;
        // Check by name (fuzzy)
        const poolName = g.warmup_groups_pool?.name;
        if (poolName) {
          const norm = normalizeGroupName(poolName);
          if (liveNames.has(norm)) return false;
        }
        return true; // Not found in live groups — demote
      })
      .map((g) => g.id);

    if (toDemote.length === 0) return;

    const demoteGroups = async () => {
      await supabase
        .from("warmup_instance_groups")
        .update({ join_status: "left", last_error: "Grupo não encontrado no dispositivo" })
        .in("id", toDemote)
        .eq("join_status", "joined");
      queryClient.invalidateQueries({ queryKey: ["warmup_instance_groups", deviceId] });
    };

    void demoteGroups();
  }, [deviceId, instanceGroups, liveDeviceGroups, liveGroupsSyncOk, queryClient]);

  // Importante: a tela NÃO altera status/run_at de jobs automaticamente.
  // Isso evita “re-joins” inesperados ao sair e voltar para a página.

  /* handlers */
  const handleStartWarmup = () => {
    if (!deviceId) return;
    const plan = plans.find(p => p.days_total === Number(daysTotal));
    engine.mutate(
      { action: "start", device_id: deviceId, chip_state: chipState, days_total: Number(daysTotal), plan_id: plan?.id },
      {
        onSuccess: () => toast({ title: "🔥 Aquecimento iniciado!", description: "Seu chip está sendo aquecido. Acompanhe o progresso aqui." }),
        onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
      }
    );
  };

  const handlePause = () => {
    if (!deviceId) return;
    engine.mutate({ action: "pause", device_id: deviceId }, { onSuccess: () => toast({ title: "Aquecimento pausado" }) });
  };

  const handleResume = () => {
    if (!deviceId) return;
    engine.mutate({ action: "resume", device_id: deviceId }, { onSuccess: () => toast({ title: "Aquecimento retomado" }) });
  };

  const handleFinish = () => {
    if (!deviceId) return;
    engine.mutate(
      { action: "stop", device_id: deviceId },
      { onSuccess: () => { setShowFinishConfirm(false); toast({ title: "✅ Ciclo encerrado", description: "O aquecimento foi finalizado com sucesso." }); } }
    );
  };

  if (!device) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Count real joined groups: somente grupos confirmados na lista ao vivo do dispositivo
  const byGroupId = new Map<string, {
    group_id: string;
    join_status: string;
    group_jid?: string | null;
    warmup_groups_pool?: { name: string; external_group_ref?: string | null } | null;
  }>();

  for (const g of instanceGroups) {
    byGroupId.set(g.group_id, {
      group_id: g.group_id,
      join_status: g.join_status,
      group_jid: g.group_jid,
      warmup_groups_pool: g.warmup_groups_pool,
    });
  }

  for (const g of poolGroups) {
    if (!byGroupId.has(g.id)) {
      byGroupId.set(g.id, {
        group_id: g.id,
        join_status: "pending",
        group_jid: null,
        warmup_groups_pool: {
          name: g.name,
          external_group_ref: g.external_group_ref,
        },
      });
    }
  }

  const counterGroups = Array.from(byGroupId.values());

  const trackedGroupIds = new Set(counterGroups.map(g => g.group_id));
  const liveGroupJids = new Set(liveDeviceGroups.map(g => g.id));
  const liveGroupNames = new Set(liveDeviceGroups.map(g => normalizeGroupName(g.name)));

  // Strict mode: only count groups confirmed by live sync
  const recognizedGroupIds = new Set(
    !liveGroupsSyncOk
      ? []
      : counterGroups
          .filter((g) => {
            if (g.join_status === "left") return false;
            if (g.group_jid && liveGroupJids.has(g.group_jid)) return true;

            const groupName = g.warmup_groups_pool?.name;
            if (!groupName) return false;

            const normalizedName = normalizeGroupName(groupName);
            return liveGroupNames.has(normalizedName);
          })
          .map((g) => g.group_id)
  );

  const totalTrackedGroups = trackedGroupIds.size > 0 ? trackedGroupIds.size : 8;
  const joinedGroups = Math.min(recognizedGroupIds.size, totalTrackedGroups);
  const pendingGroups = Math.max(0, totalTrackedGroups - joinedGroups);

  const pc = cycle ? phaseConfig[cycle.phase] || phaseConfig.pre_24h : null;
  const isTerminalCycle = cycle ? ["completed", "error"].includes(cycle.phase) : false;

  return (
    <div className="w-full space-y-6 pb-8">

      {/* ═══════════ HERO HEADER ═══════════ */}
      <div className="relative rounded-2xl border border-primary/20 bg-card/60 backdrop-blur-xl overflow-hidden shadow-[0_0_40px_-12px_hsl(var(--primary)/0.15)]">
        {/* ambient glow */}
        <div className={cn(
          "absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full blur-[120px] opacity-25 pointer-events-none",
          isConnected ? "bg-primary" : "bg-muted-foreground"
        )} />
        <div className="absolute -bottom-16 -right-16 w-48 h-48 rounded-full blur-[80px] opacity-10 pointer-events-none bg-primary" />

        <div className="relative z-10">
          {/* Navigation + Status badges */}
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/30" onClick={() => navigate(fromFolder ? `/dashboard/warmup-v2?folder=${fromFolder}` : "/dashboard/warmup-v2")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "text-[9px] font-extrabold uppercase tracking-[0.15em] px-3 py-1 gap-1.5 rounded-full border backdrop-blur-sm",
                  isConnected
                    ? "text-primary border-primary/25 bg-primary/8"
                    : "text-muted-foreground border-border/50 bg-muted/10"
                )}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full inline-block", isConnected ? "bg-primary animate-pulse" : "bg-muted-foreground")} />
                {isConnected ? "Online" : "Offline"}
              </Badge>
              {cycle && (() => {
                const chipLabel = cycle.chip_state === "new" ? "Novo" : cycle.chip_state === "recovered" ? "Recuperado" : "Fraco";
                const chipColor = cycle.chip_state === "new"
                  ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/8"
                  : cycle.chip_state === "recovered"
                  ? "text-amber-400 border-amber-500/20 bg-amber-500/8"
                  : "text-red-400 border-red-500/20 bg-red-500/8";
                return (
                  <Badge variant="outline" className={cn("text-[9px] font-bold uppercase tracking-[0.1em] px-3 py-1 rounded-full border backdrop-blur-sm", chipColor)}>
                    {chipLabel}
                  </Badge>
                );
              })()}
            </div>
          </div>

          {/* Identity card */}
          <div className="px-5 pb-4">
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border",
                isConnected ? "bg-primary/10 border-primary/20" : "bg-muted/15 border-border/20"
              )}>
                {device.profile_picture ? (
                  <img src={device.profile_picture} className="w-14 h-14 rounded-2xl object-cover" alt="" />
                ) : (
                  <Flame className={cn("w-6 h-6", isConnected ? "text-primary" : "text-muted-foreground")} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-extrabold text-foreground truncate leading-tight tracking-tight">
                  {device.profile_name || device.name}
                </h1>
                {device.number && (
                  <p className="text-xs font-mono text-muted-foreground/50 mt-0.5">{device.number}</p>
                )}
              </div>
            </div>

            {/* Cycle progress inline */}
            {cycle && pc && (
              <div className="mt-4 rounded-xl bg-muted/8 border border-border/10 p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <pc.icon className={cn("w-3.5 h-3.5", pc.color)} />
                    <span className={cn("text-[11px] font-bold", pc.color)}>{pc.label}</span>
                  </div>
                  <span className="text-[11px] font-extrabold text-foreground tabular-nums">
                    Dia {cycle.day_index}<span className="text-muted-foreground font-medium">/{cycle.days_total}</span>
                  </span>
                </div>
                <div className="h-1.5 bg-muted/15 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-700"
                    style={{ width: `${Math.round((cycle.day_index / cycle.days_total) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          {cycle && !isTerminalCycle && (
            <div className="px-5 pb-5">
              {/* Primary toggle */}
              {cycle.is_running ? (
                <Button
                  className="w-full gap-2 h-9 rounded-xl bg-muted/30 text-muted-foreground border border-border/30 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 text-[11px] font-medium transition-all"
                  variant="ghost"
                  onClick={handlePause}
                >
                  <Pause className="w-3.5 h-3.5" /> Pausar
                </Button>
              ) : cycle.phase === "paused" ? (
                <Button
                  className="w-full gap-2 h-9 rounded-xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 text-[11px] font-medium transition-all"
                  variant="ghost"
                  onClick={handleResume}
                >
                  <Play className="w-3.5 h-3.5" /> Retomar
                </Button>
              ) : null}

              {/* Quick actions */}
              {cycle.is_running && (
                <div className="grid grid-cols-4 gap-2 mt-3">
                  <button
                    className="group flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 hover:border-amber-400/40 hover:shadow-[0_0_12px_rgba(245,158,11,0.15)] transition-all duration-200 disabled:opacity-40 disabled:hover:shadow-none"
                    onClick={() => setShowAccelerateConfirm(true)}
                    disabled={accelerating}
                  >
                    {accelerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FastForward className="w-4 h-4 group-hover:scale-110 transition-transform" />}
                    <span className="text-[9px] font-bold leading-none tracking-wide">Forçar</span>
                  </button>
                  <button
                    className="group flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 hover:border-purple-400/40 hover:shadow-[0_0_12px_rgba(168,85,247,0.15)] transition-all duration-200 disabled:opacity-40 disabled:hover:shadow-none"
                    onClick={() => setShowAdvanceConfirm(true)}
                    disabled={advancingPhase || cycle.phase === "completed"}
                  >
                    {advancingPhase ? <Loader2 className="w-4 h-4 animate-spin" /> : <SkipForward className="w-4 h-4 group-hover:scale-110 transition-transform" />}
                    <span className="text-[9px] font-bold leading-none tracking-wide">Pular</span>
                  </button>
                  <button
                    className="group flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 hover:bg-sky-500/20 hover:border-sky-400/40 hover:shadow-[0_0_12px_rgba(14,165,233,0.15)] transition-all duration-200 disabled:opacity-40 disabled:hover:shadow-none"
                    onClick={handleTestAutosave}
                    disabled={testingAutosave}
                  >
                    {testingAutosave ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 group-hover:scale-110 transition-transform" />}
                    <span className="text-[9px] font-bold leading-none tracking-wide">Auto Save</span>
                  </button>
                  <button
                    className="group flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 hover:border-violet-400/40 hover:shadow-[0_0_12px_rgba(139,92,246,0.15)] transition-all duration-200 disabled:opacity-40 disabled:hover:shadow-none"
                    onClick={handleTestCommunity}
                    disabled={testingCommunity}
                  >
                    {testingCommunity ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 group-hover:scale-110 transition-transform" />}
                    <span className="text-[9px] font-bold leading-none tracking-wide">Comunitário</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════ WIZARD (no cycle) ═══════════ */}
      {(!cycle || isTerminalCycle) && !cycleLoading && (
        <div className="space-y-6">
          {/* chip state selector */}
          <div className="space-y-3">
            <p className="text-xs font-extrabold text-foreground uppercase tracking-[0.15em]">Estado do chip</p>
            <div className="grid grid-cols-3 gap-3">
              {([
                { value: "new" as const, label: "Chip Novo", desc: "Progressão conservadora", emoji: "🟢" },
                { value: "recovered" as const, label: "Chip Recuperado", desc: "Extra cauteloso, já sofreu ban", emoji: "🔴" },
                { value: "unstable" as const, label: "Chip Fraco", desc: "Sofre restrição facilmente", emoji: "🟡" },
              ]).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setChipState(opt.value)}
                  className={cn(
                    "text-left p-4 rounded-2xl border-2 transition-all duration-200 backdrop-blur-xl",
                    chipState === opt.value
                      ? "border-primary bg-primary/8 shadow-[0_0_30px_-6px_hsl(var(--primary)/0.3)]"
                      : "border-border/30 hover:border-primary/25 bg-card/50 hover:bg-card/70"
                  )}
                >
                  <span className="text-lg">{opt.emoji}</span>
                  <p className="text-sm font-extrabold text-foreground mt-2">{opt.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-tight font-medium">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* duration */}
          <div className="space-y-2">
            <p className="text-xs font-extrabold text-foreground uppercase tracking-[0.15em]">Duração do ciclo</p>
            <Select value={daysTotal} onValueChange={setDaysTotal}>
              <SelectTrigger className="rounded-xl h-11 bg-card/50 backdrop-blur-xl border-border/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[7, 14, 21, 30].map(d => (
                  <SelectItem key={d} value={String(d)}>{d} dias</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* protections */}
          <div className="rounded-2xl border border-primary/15 bg-card/50 backdrop-blur-xl p-6 space-y-3 shadow-[0_0_20px_-8px_hsl(var(--primary)/0.1)]">
            <p className="text-xs font-extrabold text-foreground flex items-center gap-2.5">
              <Shield className="w-4.5 h-4.5 text-primary" />
              Proteções automáticas
            </p>
            <ul className="grid gap-2 list-disc list-inside">
              {[
                "Limites diários automáticos",
                "Delays aleatórios entre ações",
                "Evolução progressiva de fases",
                "Proteção contínua do chip",
              ].map((item, i) => (
                <li key={i} className="text-xs text-muted-foreground leading-relaxed font-medium">{item}</li>
              ))}
            </ul>
          </div>

          {/* CTA */}
          <Button
            className="w-full gap-2.5 h-13 rounded-xl text-sm font-black bg-amber-600 hover:bg-amber-700 text-white shadow-[0_8px_30px_-6px_hsl(38_92%_50%/0.4)] transition-all hover:shadow-[0_8px_40px_-4px_hsl(38_92%_50%/0.5)]"
            onClick={() => {
              if (Number(daysTotal) <= 7) {
                setShowShortDaysWarning(true);
              } else {
                handleStartWarmup();
              }
            }}
            disabled={!isConnected || engine.isPending}
          >
            {engine.isPending ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Flame className="w-5 h-5" />
            )}
            {isTerminalCycle ? "Começar Novo Aquecimento" : "Começar Aquecimento"}
          </Button>
          {!isConnected && (
            <p className="text-xs text-amber-400 text-center -mt-2 font-semibold">⚠ Conecte a instância primeiro para iniciar</p>
          )}
        </div>
      )}

      {/* Short days warning dialog */}
      <Dialog open={showShortDaysWarning} onOpenChange={setShowShortDaysWarning}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Duração curta
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
            <p><strong className="text-foreground">7 dias não é o ideal para aquecimento.</strong></p>
            <p>Recomendamos no mínimo <strong className="text-foreground">14 dias</strong> para que o chip passe por todas as fases de forma segura e eficiente.</p>
            <p className="text-xs text-muted-foreground/60">Com apenas 7 dias, o chip pode não atingir maturidade suficiente para envios em massa.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowShortDaysWarning(false); setDaysTotal("14"); }}>
              Alterar para 14 dias
            </Button>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => { setShowShortDaysWarning(false); handleStartWarmup(); }}>
              Iniciar com {daysTotal} dias
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ ACTIVE CYCLE ═══════════ */}
      {cycle && !isTerminalCycle && (
        <div className="space-y-5">

          {/* Countdown, Cycle progress, and daily activity are all rendered inside the IIFE below */}

          {(() => {
            // Use São Paulo timezone day buckets to avoid client timezone drift
            const nowUtc = new Date();
            const toBrtDayKey = (date: Date) =>
              new Intl.DateTimeFormat("en-CA", {
                timeZone: "America/Sao_Paulo",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(date);
            const formatBrtTime = (date: Date) =>
              new Intl.DateTimeFormat("pt-BR", {
                timeZone: "America/Sao_Paulo",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }).format(date);

            const isDay2Plus = (cycle?.day_index ?? 1) > 1;
            const actionableTypes = new Set([
              ...(isDay2Plus ? [] : ["join_group"]),
              "group_interaction",
              "autosave_interaction",
              "community_interaction",
            ]);

            const sortedJobs = [...scheduledJobs]
              .filter((j) => j.status !== "cancelled")
              .filter((j) => !(isDay2Plus && j.job_type === "join_group" && j.status === "pending"))
              .sort((a, b) => new Date(a.run_at).getTime() - new Date(b.run_at).getTime());

            const todayKey = toBrtDayKey(nowUtc);
            const todayJobs = sortedJobs.filter((j) => toBrtDayKey(new Date(j.run_at)) === todayKey);
            const futureJobs = sortedJobs.filter((j) => new Date(j.run_at) >= nowUtc);

            // If there is no job for "today" in BRT, show the next planned day
            let displayJobs = todayJobs;
            if (displayJobs.length === 0) {
              const nextPlannedJob = futureJobs.find((j) => actionableTypes.has(j.job_type)) ?? futureJobs[0];
              if (nextPlannedJob) {
                const nextDayKey = toBrtDayKey(new Date(nextPlannedJob.run_at));
                displayJobs = sortedJobs.filter((j) => toBrtDayKey(new Date(j.run_at)) === nextDayKey);
              }
            }

            const jobTypeLabels: Record<string, { label: string; icon: typeof Target; color: string }> = {
              join_group: { label: "Entrar no grupo", icon: UserPlus, color: "text-teal-400" },
              group_interaction: { label: "Msg/foto/figurinha em grupo", icon: Send, color: "text-primary" },
              autosave_interaction: { label: "Mensagem privada", icon: MessageSquare, color: "text-emerald-400" },
              community_interaction: { label: "Interação comunitária", icon: Globe, color: "text-purple-400" },
              // post_status removed — UAZAPI v2 doesn't support
              phase_transition: { label: "Avançar fase", icon: Zap, color: "text-amber-400" },
              daily_reset: { label: "Reset diário", icon: RotateCcw, color: "text-muted-foreground" },
              health_check: { label: "Verificação de saúde", icon: Shield, color: "text-emerald-400" },
              enable_autosave: { label: "Ativar Auto Save", icon: Zap, color: "text-emerald-400" },
              enable_community: { label: "Ativar Comunidade", icon: Globe, color: "text-purple-400" },
            };

            const statusIcon = (status: string) => {
              if (status === "succeeded") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
              if (status === "running") return <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />;
              if (status === "failed") return <AlertTriangle className="w-3.5 h-3.5 text-destructive" />;
              if (status === "cancelled") return <Square className="w-3.5 h-3.5 text-muted-foreground/40" />;
              return <Clock className="w-3.5 h-3.5 text-muted-foreground/50" />;
            };

            if (displayJobs.length === 0 && futureJobs.length === 0 && !advancingPhase) {
              return (
                <div className="rounded-2xl border border-border/15 bg-card/50 backdrop-blur-xl p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-foreground">Sem tarefas visíveis no ciclo</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Isso acontece quando todos os jobs foram cancelados. Clique abaixo para reconstruir a fila automaticamente.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={handleRestoreSchedule}
                      disabled={repairingSchedule}
                    >
                      {repairingSchedule ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                      Restaurar tarefas
                    </Button>
                  </div>
                </div>
              );
            }

            if (displayJobs.length === 0 && futureJobs.length === 0 && advancingPhase) {
              return (
                <div className="rounded-2xl border border-border/15 bg-card/50 backdrop-blur-xl p-6 flex items-center justify-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Gerando tarefas do novo dia…</p>
                </div>
              );
            }

            // Summarize displayed jobs by type
            const typeSummary: Record<string, { total: number; done: number; failed: number; next: Date | null }> = {};
            for (const job of displayJobs) {
              const key = job.job_type;
              if (!typeSummary[key]) typeSummary[key] = { total: 0, done: 0, failed: 0, next: null };
              if (job.status === "succeeded") {
                typeSummary[key].total++;
                typeSummary[key].done++;
              } else if (job.status === "failed") {
                typeSummary[key].total++;
                typeSummary[key].failed++;
              } else if (job.status === "pending") {
                const runAt = new Date(job.run_at);
                typeSummary[key].total++;
                if (!typeSummary[key].next || runAt < typeSummary[key].next!) {
                  typeSummary[key].next = runAt;
                }
              } else if (job.status === "running") {
                typeSummary[key].total++;
              }
            }

            // Cap group_interaction total to the daily budget target for consistency with "Msgs Hoje"
            if (cycle && typeSummary["group_interaction"]) {
              const budget = cycle.daily_interaction_budget_target;
              if (typeSummary["group_interaction"].total > budget) {
                typeSummary["group_interaction"].total = budget;
              }
            }

            const doneToday = cycle?.daily_interaction_budget_used ?? displayJobs.filter((j) => j.status === "succeeded").length;
            const failedToday = displayJobs.filter((j) => j.status === "failed").length;
            const budgetTarget = cycle?.daily_interaction_budget_target || 1;
            // totalDisplay = the daily target (budget). This is the denominator.
            // doneToday comes from daily_interaction_budget_used which resets at 00:05 BRT (daily_reset job).
            // During the operating window (07:00-19:00 BRT), progress grows from 0→100% as messages are sent.
            // After all messages are sent, it stays at 100% until the next daily_reset zeros the counter.
            const totalDisplay = budgetTarget;
            // Prioritize actionable jobs (phase_transition > interaction) over daily_reset for display
            const pendingJobs = displayJobs.filter((j) => j.status === "pending");
            const nextPendingJob =
              pendingJobs.find((j) => j.job_type === "phase_transition") ||
              pendingJobs.find((j) => actionableTypes.has(j.job_type) && new Date(j.run_at) >= nowUtc) ||
              pendingJobs.find((j) => j.job_type !== "daily_reset" && new Date(j.run_at) >= nowUtc) ||
              pendingJobs.find((j) => new Date(j.run_at) >= nowUtc) ||
              pendingJobs[0] ||
              null;

            const isPre24h = cycle?.phase === "pre_24h";

            const cyclePercent = Math.round((cycle!.day_index / cycle!.days_total) * 100);
            // After 19:00 BRT the warmup window is closed — show 100%
            const nowBrtHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(nowUtc));
            const windowClosed = nowBrtHour >= 19;
            const todayPercent = windowClosed ? 100 : Math.min(100, totalDisplay > 0 ? Math.round(((doneToday + failedToday) / totalDisplay) * 100) : 0);

            return (
              <>
              {/* ── Painel Unificado: Ciclo + Dia ── */}
              <div className="rounded-2xl border border-border/10 bg-card/50 backdrop-blur-xl overflow-hidden shadow-[0_4px_24px_-8px_hsl(var(--foreground)/0.05)]">

                {/* Header */}
                <div className="px-6 pt-5 pb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-9 h-9 rounded-lg flex items-center justify-center",
                      cycle!.is_running ? "bg-primary/12" : "bg-muted/20"
                    )}>
                      <Flame className={cn("w-4.5 h-4.5", cycle!.is_running ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground leading-tight">Aquecimento</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {pc?.label} — Dia {cycle!.day_index} de {cycle!.days_total}
                      </p>
                    </div>
                  </div>
                {/* Volume and mode info */}
                {(() => {
                  const vol = getExpectedDailyVolume(cycle!.day_index, cycle!.chip_state || "new");
                  const modeLabel = chipStateLabels[cycle!.chip_state || "new"] || "Chip Novo";
                  return (
                    <div className="flex flex-col items-end gap-0.5">
                      <Badge className="text-[10px] h-6 rounded-lg font-extrabold bg-primary/12 text-primary border border-primary/20 hover:bg-primary/12">
                        {pc?.label}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{modeLabel}</span>
                    </div>
                  );
                })()}
                </div>

                {/* Volume progression info */}
                {!isPre24h && (() => {
                  const vol = getExpectedDailyVolume(cycle!.day_index, cycle!.chip_state || "new");
                  return (
                    <div className="px-6 pb-2 flex items-center gap-3 text-[10px]">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/5 border border-primary/10">
                        <Target className="w-3 h-3 text-primary" />
                        <span className="text-muted-foreground">Volume:</span>
                        <span className="font-bold text-foreground">{vol.min}–{vol.max} msgs</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/10 border border-border/15">
                        <CalendarDays className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">{vol.phase}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Auto Save info card */}
                {!isPre24h && (() => {
                  const asInfo = getAutosaveInfoForDay(cycle!.day_index, cycle!.chip_state || "new");
                  if (asInfo.contacts === 0) return null;
                  return (
                    <div className="px-6 pb-2 space-y-1.5">
                      <div className="flex items-center gap-3 text-[10px]">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/5 border border-sky-500/10">
                          <UserPlus className="w-3 h-3 text-sky-400" />
                          <span className="text-muted-foreground">Auto Save:</span>
                          <span className="font-bold text-foreground">{asInfo.contacts} contatos × {asInfo.msgsPerContact} msgs = {asInfo.totalMsgs}</span>
                        </div>
                      </div>
                      {autosaveStats.total > 0 && (
                        <div className="flex flex-wrap items-center gap-2 text-[9px]">
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-semibold">
                            🆕 {autosaveStats.newContacts} novos
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 font-semibold">
                            ✅ {autosaveStats.used} usados
                          </span>
                          {autosaveStats.invalid > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-destructive/10 text-destructive font-semibold">
                              ❌ {autosaveStats.invalid} inválidos
                            </span>
                          )}
                          {autosaveStats.discarded > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 font-semibold">
                              🚫 {autosaveStats.discarded} descartados
                            </span>
                          )}
                          {autosaveStats.exhausted && (
                            <span className="px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-400 font-semibold">
                              🔄 Lista esgotada
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Today's activity */}
                <div className="px-6 py-4">
                  {isPre24h ? (
                    <div className="flex flex-col items-center text-center py-4">
                      <div className="w-10 h-10 rounded-full bg-amber-500/12 flex items-center justify-center mb-3">
                        <Timer className="w-5 h-5 text-amber-400" />
                      </div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] font-bold">Tempo decorrido</p>
                      <p className="text-3xl font-black text-foreground font-mono tabular-nums mt-1">{countdown}</p>
                      <p className="text-[11px] text-muted-foreground/70 mt-3 max-w-xs leading-relaxed">
                        Fase de proteção. Entrada nos grupos começa em 4-6 horas.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Header row */}
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-[0.12em]">Progresso do dia</span>
                        <div className="flex items-center gap-2">
                          {nextPendingJob && (
                            <span className="text-[10px] text-muted-foreground">
                              Próxima às <span className="font-mono font-bold text-foreground">{formatBrtTime(new Date(nextPendingJob.run_at))}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Combined progress bar */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-semibold text-foreground">Total</span>
                          <span className="text-sm font-extrabold text-foreground tabular-nums">{doneToday}<span className="text-muted-foreground font-medium">/{totalDisplay}</span></span>
                        </div>
                        <div className="h-2.5 bg-muted/15 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-primary to-emerald-400 transition-all duration-500 shadow-[0_0_12px_hsl(142_71%_45%/0.35)]" style={{ width: `${todayPercent}%` }} />
                        </div>
                      </div>

                      {/* Category breakdown cards */}
                      <div className="grid grid-cols-3 gap-2">
                        {(() => {
                          const groupDone = typeSummary["group_interaction"]?.done ?? 0;
                          const groupTotal = typeSummary["group_interaction"]?.total ?? 0;
                          const autosaveDone = typeSummary["autosave_interaction"]?.done ?? 0;
                          const autosaveTotal = typeSummary["autosave_interaction"]?.total ?? 0;
                          const communityDone = typeSummary["community_interaction"]?.done ?? 0;
                          const communityTotal = typeSummary["community_interaction"]?.total ?? 0;

                          const categories = [
                            { label: "Grupos", icon: "👥", done: groupDone, total: groupTotal, barColor: "bg-emerald-500", dotColor: "bg-emerald-400", bgTint: "bg-emerald-500/5 border-emerald-500/10" },
                            { label: "Auto Save", icon: "💾", done: autosaveDone, total: autosaveTotal, barColor: "bg-sky-500", dotColor: "bg-sky-400", bgTint: "bg-sky-500/5 border-sky-500/10" },
                            { label: "Comunitário", icon: "🤝", done: communityDone, total: communityTotal, barColor: "bg-violet-500", dotColor: "bg-violet-400", bgTint: "bg-violet-500/5 border-violet-500/10" },
                          ];

                          return categories.map((cat) => {
                            const pct = cat.total > 0 ? Math.min(100, Math.round((cat.done / cat.total) * 100)) : 0;
                            return (
                              <div key={cat.label} className={cn("rounded-xl border p-3 flex flex-col items-center gap-1.5 transition-colors", cat.bgTint)}>
                                <span className="text-base leading-none">{cat.icon}</span>
                                <span className="text-[10px] text-muted-foreground font-medium leading-none">{cat.label}</span>
                                <span className="text-sm font-extrabold text-foreground tabular-nums leading-none">{cat.done}</span>
                                <div className="w-full h-1 bg-muted/15 rounded-full overflow-hidden mt-0.5">
                                  <div className={cn("h-full rounded-full transition-all duration-500", cat.barColor)} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>

                      {failedToday > 0 && (
                        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-destructive font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                          {failedToday} tarefa(s) com falha
                        </div>
                      )}
                    </>
                  )}
                </div>

              </div>

              {/* ── Timeline Completa: Atividades Feitas + Agendadas ── */}
              <div className="rounded-2xl border border-border/15 bg-card/50 backdrop-blur-xl overflow-hidden shadow-[0_4px_24px_-8px_hsl(var(--foreground)/0.06)]">
                <div className="px-6 py-5 border-b border-border/10 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/12 flex items-center justify-center shadow-[0_0_12px_-2px_hsl(38_92%_50%/0.2)]">
                    <ScrollText className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <span className="text-base font-extrabold text-foreground tracking-tight">Histórico de Atividades</span>
                    <p className="text-[11px] text-muted-foreground font-medium">
                      Ações realizadas e próximas tarefas agendadas
                    </p>
                  </div>
                </div>

                {(() => {
                  // Build unified timeline from audit logs (past) + scheduled jobs (future)
                  type GroupScheduleItem = { index: number; name: string; time: string; status: "pending" | "done" | "failed" };
                  type TimelineItem = {
                    id: string;
                    time: Date;
                    type: "done" | "running" | "pending" | "failed";
                    label: string;
                    detail?: string;
                    detailGroups?: GroupScheduleItem[];
                    icon: string;
                    color: string;
                  };

                  const items: TimelineItem[] = [];

                  const formatBrtHour = (date: Date) => new Intl.DateTimeFormat("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  }).format(date);

                  const formatOffsetFromStart = (date: Date) => {
                    if (!cycleStartedAt) return "após a janela de 4-6h";
                    const diffMinutes = Math.max(0, Math.round((date.getTime() - cycleStartedAt.getTime()) / 60000));
                    const hours = Math.floor(diffMinutes / 60);
                    const minutes = diffMinutes % 60;
                    if (hours > 0 && minutes > 0) return `após ${hours}h ${minutes}min`;
                    if (hours > 0) return `após ${hours}h`;
                    return `após ${minutes}min`;
                  };

                  const joinGroupJobs = (() => {
                    const allJoinJobs = (scheduledJobs || []).filter((job) => job.job_type === "join_group");
                    const statusWeight = (status: string) => {
                      if (status === "succeeded") return 4;
                      if (status === "running") return 3;
                      if (status === "pending") return 2;
                      if (status === "failed") return 1;
                      return 0; // cancelled
                    };

                    const normalizeJoinJob = (job: typeof allJoinJobs[number]) => {
                      const payload = (job.payload && typeof job.payload === "object")
                        ? (job.payload as { group_id?: string; group_name?: string })
                        : {};

                      const recoveredStatus =
                        job.status === "succeeded" && String(job.last_error || "").startsWith("Auto-reconciliado")
                          ? "pending"
                          : job.status;

                      return {
                        ...job,
                        status: recoveredStatus,
                        payload,
                      };
                    };

                    const byGroup = new Map<string, ReturnType<typeof normalizeJoinJob>>();

                    for (const rawJob of allJoinJobs) {
                      const job = normalizeJoinJob(rawJob);
                      const key = job.payload.group_id || job.payload.group_name || job.id;
                      const prev = byGroup.get(key);

                      if (!prev) {
                        byGroup.set(key, job);
                        continue;
                      }

                      const currWeight = statusWeight(job.status);
                      const prevWeight = statusWeight(prev.status);
                      const currRunAt = new Date(job.run_at).getTime();
                      const prevRunAt = new Date(prev.run_at).getTime();

                      if (currWeight > prevWeight || (currWeight === prevWeight && currRunAt > prevRunAt)) {
                        byGroup.set(key, job);
                      }
                    }

                    return Array.from(byGroup.values())
                      .filter((job) => job.status !== "cancelled")
                      .sort((a, b) => new Date(a.run_at).getTime() - new Date(b.run_at).getTime());
                  })();

                  const buildGroupScheduleItems = (): GroupScheduleItem[] => {
                    if (joinGroupJobs.length > 0) {
                      return joinGroupJobs.map((job, index) => {
                        const payload = (job.payload || {}) as { group_name?: string };
                        return {
                          index: index + 1,
                          name: payload.group_name || `Grupo ${index + 1}`,
                          time: formatBrtHour(new Date(job.run_at)),
                          status: job.status === "succeeded" ? "done" as const
                            : job.status === "failed" ? "failed" as const
                            : "pending" as const,
                        };
                      });
                    }
                    return [];
                  };

                  const groupScheduleItems = buildGroupScheduleItems();

                  // Past items from audit logs (only current + past warmup days)
                  const HIDDEN_EVENT_TYPES = new Set(["auto_sync_joined", "group_live_discovery_empty"]);
                  for (const log of auditLogs) {
                    if (HIDDEN_EVENT_TYPES.has(log.event_type)) continue;
                    // Filter out logs from future warmup days
                    if (cycleStartedAt) {
                      const logTime = new Date(log.created_at);
                      const toBrtDateStr = (d: Date) => new Intl.DateTimeFormat("en-CA", {
                        timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
                      }).format(d);
                      const startBrt = toBrtDateStr(cycleStartedAt);
                      const logBrt = toBrtDateStr(logTime);
                      const sp = startBrt.split("-").map(Number);
                      const lp = logBrt.split("-").map(Number);
                      const diffMs = new Date(lp[0], lp[1]-1, lp[2]).getTime() - new Date(sp[0], sp[1]-1, sp[2]).getTime();
                      const logWarmupDay = Math.max(1, Math.round(diffMs / 86400000) + 1);
                      if (logWarmupDay > (cycle?.day_index ?? 1)) continue;
                    }

                    const iconMap: Record<string, string> = {
                      cycle_started: "🚀", cycle_paused: "⏸️", cycle_resumed: "▶️",
                      group_joined: "✅", group_msg_sent: "💬", autosave_msg_sent: "📱",
                      community_msg_sent: "🌐", community_burst_sent: "🌐",
                      community_enabled: "🌐", community_pairs_rotated: "🔄",
                      community_no_peers: "⚠️", community_peer_offline: "⚠️",
                      daily_reset: "🔄", phase_changed: "⚡",
                      auto_paused_disconnected: "⚠️", autosave_enabled: "📱",
                      health_check: "🩺",
                      group_no_jid: "⚠️", autosave_no_contacts: "⚠️",
                      manual_day_advance: "⏭️", daily_reset_deferred: "⏳",
                      auto_sync_joined: "🔗", auto_transition_post_groups: "⚡",
                      groups_complete_waiting: "⏳", cycle_completed: "🎉",
                    };
                    const colorMap: Record<string, string> = {
                      info: "text-emerald-400", warn: "text-amber-400", error: "text-destructive",
                    };

                    const isCycleStarted = log.event_type === "cycle_started";

                    items.push({
                      id: `log-${log.id}`,
                      time: new Date(log.created_at),
                      type: log.level === "error" ? "failed" : "done",
                      label: translateEventType(log.event_type),
                      detail: isCycleStarted
                        ? "Entre 4 e 6 horas começa a entrar nos grupos."
                        : (log.message.length > 80 ? log.message.substring(0, 77) + "..." : log.message),
                      detailGroups: undefined,
                      icon: iconMap[log.event_type] || "📋",
                      color: colorMap[log.level] || "text-muted-foreground",
                    });
                  }

                  // Future items from scheduled jobs
                  const jobIconMap: Record<string, string> = {
                    join_group: "📥", group_interaction: "💬", autosave_interaction: "📱",
                    community_interaction: "🌐", phase_transition: "⚡", daily_reset: "🔄",
                    enable_autosave: "📱", enable_community: "🌐", health_check: "🩺",
                    
                  };
                  const jobLabelMap: Record<string, string> = {
                    join_group: "Entrar no grupo", group_interaction: "Msg/foto/figurinha",
                    autosave_interaction: "Auto Save", community_interaction: "Comunitário",
                    phase_transition: "Avançar fase", daily_reset: "Reset diário",
                    enable_autosave: "Ativar Auto Save", enable_community: "Ativar Comunidade",
                    health_check: "Verificação",
                  };

                  // Only show jobs for current day or past days (not future days)
                  const currentDayIdx = cycle?.day_index ?? 1;
                  const toBrtDate = (d: Date) => new Intl.DateTimeFormat("en-CA", {
                    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
                  }).format(d);
                  const cycleStartBrt = cycleStartedAt ? toBrtDate(cycleStartedAt) : null;

                  const getWarmupDayBrt = (d: Date) => {
                    if (!cycleStartBrt || !cycleStartedAt) return 1;

                    // Day 1 is the full first 24h window, even if it crosses midnight in BRT.
                    if (cycle?.first_24h_ends_at) {
                      const first24hEnds = new Date(cycle.first_24h_ends_at);
                      if (d.getTime() <= first24hEnds.getTime()) {
                        return 1;
                      }
                    }

                    // After the first 24h, use BRT calendar day buckets.
                    const dBrt = toBrtDate(d);
                    const startParts = cycleStartBrt.split("-").map(Number);
                    const dParts = dBrt.split("-").map(Number);
                    const startDate = new Date(startParts[0], startParts[1] - 1, startParts[2]);
                    const curDate = new Date(dParts[0], dParts[1] - 1, dParts[2]);
                    const diffDays = Math.round((curDate.getTime() - startDate.getTime()) / 86400000);
                    return Math.max(1, diffDays + 1);
                  };

                  for (const job of scheduledJobs) {
                    // Skip join_group jobs — already shown in "Ciclo iniciado" detail
                    if (job.job_type === "join_group") continue;
                    if (job.status === "cancelled") continue;

                    // Skip jobs scheduled for future warmup days
                    const jobWarmupDay = getWarmupDayBrt(new Date(job.run_at));
                    if (jobWarmupDay > currentDayIdx) continue;

                    const groupName = job.payload && typeof job.payload === "object" && "group_name" in (job.payload as any)
                      ? (job.payload as any).group_name : null;

                    items.push({
                      id: `job-${job.id}`,
                      time: new Date(job.run_at),
                      type: job.status === "succeeded" ? "done"
                        : job.status === "running" ? "running"
                        : job.status === "failed" ? "failed"
                        : "pending",
                      label: jobLabelMap[job.job_type] || job.job_type,
                      detail: groupName ? `Grupo: ${groupName}` : undefined,
                      icon: job.status === "succeeded" ? "✅" : (jobIconMap[job.job_type] || "⏳"),
                      color: job.status === "succeeded" ? "text-emerald-400"
                        : job.status === "failed" ? "text-destructive"
                        : job.status === "running" ? "text-primary"
                        : "text-muted-foreground",
                    });
                  }

                  // Sort items by time ascending
                  items.sort((a, b) => a.time.getTime() - b.time.getTime());

                  // Group items by warmup day number, respecting manual day advances
                  // First, build a timeline of day advances from audit logs
                  const dayAdvances: { time: Date; toDay: number }[] = [];
                  for (const log of auditLogs) {
                    if (log.event_type === "manual_day_advance" || log.event_type === "daily_reset") {
                      const meta = log.meta as any;
                      if (meta?.to_day) {
                        dayAdvances.push({ time: new Date(log.created_at), toDay: meta.to_day });
                      }
                    }
                  }
                  dayAdvances.sort((a, b) => a.time.getTime() - b.time.getTime());

                  const getItemWarmupDay = (itemTime: Date): number => {
                    // Check if this item falls after a day advance on the same calendar day
                    let assignedDay = getWarmupDayBrt(itemTime);
                    for (const adv of dayAdvances) {
                      if (itemTime >= adv.time) {
                        assignedDay = Math.max(assignedDay, adv.toDay);
                      }
                    }
                    return assignedDay;
                  };

                  const dayItemsMap: Record<number, TimelineItem[]> = {};
                  for (const item of items) {
                    const warmupDay = getItemWarmupDay(item.time);
                    if (!dayItemsMap[warmupDay]) dayItemsMap[warmupDay] = [];
                    dayItemsMap[warmupDay].push(item);
                  }

                  const totalDays = cycle?.days_total ?? 7;
                  const currentWarmupDay = cycle?.day_index ?? 1;

                  const formatTime = (d: Date) => new Intl.DateTimeFormat("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                    hour: "2-digit", minute: "2-digit", hour12: false,
                  }).format(d);

                  // Phase descriptions for each day
                  const chipState = cycle?.chip_state || "new";
                  const groupsEndDay = chipState === "unstable" ? 6 : 4;
                  const getDayPhaseLabel = (day: number) => {
                    if (day === 1) return "Proteção + entrada nos grupos";
                    if (day <= groupsEndDay) return "Msgs, fotos e figurinhas em grupos";
                    if (day === groupsEndDay + 1) return "Auto Save ativado";
                    return "Comunidade + Auto Save";
                  };

                  const getDayStatus = (day: number) => {
                    if (day > currentWarmupDay) return "agendado";
                    if (day === currentWarmupDay) return "ativo";
                    // Check if skipped
                    const dayItems = dayItemsMap[day] || [];
                    const wasSkipped = dayItems.some(
                      i => i.label.includes("pulado") || i.label.includes("manual_day_advance")
                    );
                    return wasSkipped ? "pulado" : "concluído";
                  };

                   return (
                    <div className="md:max-h-[500px] md:overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
                      {/* Current day summary - always visible */}
                      {!showAllDays && (
                        <button
                          onClick={() => setShowAllDays(true)}
                          className="w-full px-6 py-4 flex items-center gap-3 hover:bg-muted/15 transition-all bg-primary/5 border-l-2 border-l-primary"
                        >
                          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 text-left min-w-0">
                            <span className="text-sm font-extrabold text-primary">Dia {currentWarmupDay}</span>
                            <span className="text-[11px] text-muted-foreground/50 ml-2.5 font-medium">{getDayPhaseLabel(currentWarmupDay)}</span>
                          </div>
                          <Badge className="text-[10px] h-5 px-2 bg-primary/12 text-primary border border-primary/20 hover:bg-primary/12 font-bold shadow-[0_0_8px_-2px_hsl(var(--primary)/0.3)]">em andamento</Badge>
                        </button>
                      )}

                      {/* Full day list - shown after clicking current day */}
                      {showAllDays && (
                        <>
                          <button
                            onClick={() => setShowAllDays(false)}
                            className="w-full px-6 py-2.5 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground font-medium hover:bg-muted/10 transition-colors border-b border-border/8"
                          >
                            <ChevronDown className="w-3 h-3 rotate-180" />
                            Recolher dias
                          </button>
                          {Array.from({ length: totalDays }, (_, i) => i + 1).filter((day) => {
                            const s = getDayStatus(day);
                            return s === "concluído" || s === "ativo" || s === "pulado";
                          }).reverse().map((day) => {
                        const dayItems = dayItemsMap[day] || [];
                        const isExpanded = expandedDays.has(day);
                        const status = getDayStatus(day);
                        const doneCount = dayItems.filter(i => i.type === "done").length;
                        const pendingCount = dayItems.filter(i => i.type === "pending").length;
                        const failedCount = dayItems.filter(i => i.type === "failed").length;
                        const isFuture = status === "agendado";
                        const isActive = status === "ativo";

                        const statusBadge = status === "concluído"
                          ? <Badge className="text-[10px] h-5 px-2 bg-emerald-500/12 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/12 font-bold">concluído</Badge>
                          : status === "pulado"
                          ? <Badge className="text-[10px] h-5 px-2 bg-amber-500/12 text-amber-400 border border-amber-500/20 hover:bg-amber-500/12 font-bold">pulado</Badge>
                          : status === "ativo"
                          ? <Badge className="text-[10px] h-5 px-2 bg-primary/12 text-primary border border-primary/20 hover:bg-primary/12 font-bold shadow-[0_0_8px_-2px_hsl(var(--primary)/0.3)]">em andamento</Badge>
                          : null;

                        return (
                          <div key={day} className={cn("border-b border-border/8 last:border-0", isFuture && "opacity-35")}>
                            <button
                              onClick={() => {
                                setExpandedDays(prev => {
                                  const next = new Set(prev);
                                  if (next.has(day)) next.delete(day); else next.add(day);
                                  return next;
                                });
                              }}
                              className={cn(
                                "w-full px-6 py-4 flex items-center gap-3 hover:bg-muted/15 transition-all",
                                isActive && "bg-primary/5 border-l-2 border-l-primary"
                              )}
                            >
                              <ChevronDown className={cn(
                                "w-4 h-4 text-muted-foreground transition-transform shrink-0",
                                isExpanded && "rotate-180"
                              )} />
                              <div className="flex-1 text-left min-w-0">
                                <span className={cn("text-sm font-extrabold", isActive ? "text-primary" : isFuture ? "text-muted-foreground" : "text-foreground")}>
                                  Dia {day}
                                </span>
                                <span className="text-[11px] text-muted-foreground/50 ml-2.5 font-medium">{getDayPhaseLabel(day)}</span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {statusBadge}
                              </div>
                            </button>

                            {isExpanded && dayItems.length > 0 && (
                              <div className="px-6 pb-4 space-y-1">
                                {dayItems.map((item) => (
                                  <div key={item.id} className="flex items-start gap-3 py-2 px-3 rounded-xl hover:bg-muted/10 transition-colors">
                                    <span className="text-xs mt-0.5 shrink-0">{item.icon}</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className={cn("text-[11px] font-semibold", item.color)}>
                                          {item.label}
                                        </span>
                                        {item.type === "pending" && (
                                          <Badge className="text-[8px] h-3.5 px-1 bg-muted/30 text-muted-foreground border-0 hover:bg-muted/30">
                                            agendado
                                          </Badge>
                                        )}
                                        {item.type === "running" && (
                                          <Loader2 className="w-3 h-3 text-primary animate-spin" />
                                        )}
                                      </div>
                                      {item.detail && !item.detailGroups && (
                                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">{item.detail}</p>
                                      )}
                                      {item.detail && item.detailGroups && (
                                        <p className="text-[10px] text-muted-foreground/70 mt-1">{item.detail}</p>
                                      )}
                                      {item.detailGroups && item.detailGroups.length > 0 && (
                                        <div className="mt-2 grid gap-1">
                                          {item.detailGroups.map((g) => (
                                            <div
                                              key={g.index}
                                              className={cn(
                                                "flex items-center gap-2 px-2.5 py-1.5 rounded-lg border",
                                                g.status === "done"
                                                  ? "bg-emerald-500/5 border-emerald-500/15"
                                                  : g.status === "failed"
                                                  ? "bg-destructive/5 border-destructive/15"
                                                  : "bg-muted/20 border-border/15"
                                              )}
                                            >
                                              <span className="text-[10px]">
                                                {g.status === "done" ? "✅" : g.status === "failed" ? "❌" : "📥"}
                                              </span>
                                              <span className={cn(
                                                "text-[10px] font-medium flex-1 truncate",
                                                g.status === "done" ? "text-emerald-400" : g.status === "failed" ? "text-destructive" : "text-foreground/80"
                                              )}>
                                                {g.name}
                                              </span>
                                              <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
                                                {g.time}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-muted-foreground/60 font-mono shrink-0 mt-0.5">
                                      {formatTime(item.time)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {isExpanded && dayItems.length === 0 && !isFuture && (
                              <div className="px-5 pb-3">
                                <p className="text-[10px] text-muted-foreground/50 italic">
                                  Nenhum log detalhado para este dia
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
              </>
            );
          })()}


          {/* ── Erro do ciclo ── */}
          {cycle.last_error && (
            <div className="rounded-xl border border-destructive/15 bg-gradient-to-r from-destructive/5 to-transparent p-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-destructive" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-foreground">Último erro</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{cycle.last_error}</p>
              </div>
            </div>
          )}

          {/* ── Encerrar ciclo ── */}
          {cycle.phase !== "completed" && (
            <div className="flex justify-end pt-1">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs rounded-lg h-9 px-4 font-medium border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setShowFinishConfirm(true)}
              >
                Encerrar Ciclo
              </Button>
            </div>
          )}

          {/* Confirm dialog */}
          <Dialog open={showFinishConfirm} onOpenChange={setShowFinishConfirm}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-foreground">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                  Encerrar ciclo?
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Essa ação <strong className="text-foreground">não pode ser revertida</strong>.</p>
                <p>Todo o progresso será perdido.</p>
              </div>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowFinishConfirm(false)}>Cancelar</Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={handleFinish}
                  disabled={engine.isPending}
                >
                  {engine.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Encerrar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Confirm advance day dialog */}
          <Dialog open={showAdvanceConfirm} onOpenChange={setShowAdvanceConfirm}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-foreground">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  Pular dia?
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Avançar o dia manualmente <strong className="text-foreground">cancela as tarefas pendentes do dia atual</strong> e agenda novas para o próximo dia.</p>
                <p>O aquecimento gradual existe para proteger seu número contra restrições e banimentos do WhatsApp.</p>
                {cycle && (
                  <p className="text-xs bg-muted/30 rounded-lg p-2.5 border border-border/30">
                    <span className="font-semibold text-foreground">Dia {cycle.day_index}</span>
                    <span className="mx-1.5">→</span>
                    <span className="font-semibold text-foreground">
                      {cycle.day_index + 1 > cycle.days_total ? "Concluído" : `Dia ${cycle.day_index + 1}`}
                    </span>
                    <span className="text-muted-foreground/60 ml-1">/ {cycle.days_total}</span>
                  </p>
                )}
              </div>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowAdvanceConfirm(false)}>Cancelar</Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                  onClick={() => { setShowAdvanceConfirm(false); handleAdvancePhase(); }}
                  disabled={advancingPhase}
                >
                  {advancingPhase && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <SkipForward className="w-3.5 h-3.5" />
                  Confirmar avanço
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Confirm accelerate dialog */}
          <Dialog open={showAccelerateConfirm} onOpenChange={setShowAccelerateConfirm}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-foreground">
                  <Zap className="w-5 h-5 text-amber-400" />
                  Forçar próxima tarefa?
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>A <strong className="text-foreground">próxima tarefa pendente será executada agora</strong>. As demais continuam no cronograma original.</p>
                <p className="text-xs bg-muted/30 rounded-lg p-2.5 border border-border/30">
                  {(() => {
                    const isDay2Plus = (cycle?.day_index ?? 1) > 1;
                    const pending = scheduledJobs.filter(j => j.status === "pending");
                    const next = pickNextForcedJob(pending as ScheduledJobLite[]);
                    const rawCount = isDay2Plus
                      ? pending.filter(j => j.job_type !== "join_group").length
                      : pending.length;
                    // Use budget target as ceiling to stay consistent with the progress bar
                    const budgetTarget = cycle?.daily_interaction_budget_target ?? 0;
                    const visiblePendingCount = budgetTarget > 0 && isDay2Plus
                      ? Math.min(rawCount, budgetTarget - (cycle?.daily_interaction_budget_used ?? 0))
                      : rawCount;

                    const jobLabelMap: Record<string, string> = {
                      join_group: "Entrada em grupo",
                      group_interaction: "Mensagem/foto/figurinha em grupo",
                      autosave_interaction: "Mensagem privada",
                      community_interaction: "Interação comunitária",
                      phase_transition: "Avançar fase",
                      enable_autosave: "Ativar Auto Save",
                      enable_community: "Ativar Comunidade",
                    };

                    return (
                      <>
                        <strong className="text-foreground">{visiblePendingCount}</strong> tarefa(s) pendente(s) no total.
                        {next ? <> Próxima: <strong className="text-foreground">{jobLabelMap[next.job_type] || next.job_type.replace(/_/g, " ")}</strong></> : null}
                      </>
                    );
                  })()}
                </p>
              </div>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowAccelerateConfirm(false)}>Cancelar</Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                  onClick={() => { setShowAccelerateConfirm(false); handleAccelerate(); }}
                  disabled={accelerating}
                >
                  {accelerating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <FastForward className="w-3.5 h-3.5" />
                  Confirmar execução
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

        </div>
      )}
    </div>
  );
};

export default WarmupInstanceDetail;
