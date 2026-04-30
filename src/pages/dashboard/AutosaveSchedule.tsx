import { useState, useMemo } from "react";
import { Calendar as CalendarIcon, Plus, Play, Pause, Trash2, Smartphone, Activity, CheckCircle2, AlertCircle, Clock, Repeat, Rocket, ArrowRight, ArrowLeft, MessageSquare, TrendingUp, Users, Info, Pencil, Save, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  useAutosaveSchedules,
  useCreateAutosaveSchedule,
  useUpdateAutosaveSchedule,
  useDeleteAutosaveSchedule,
  useTriggerAutosaveSchedule,
  useAutosaveScheduleLogs,
  type AutosaveSchedule as AutosaveScheduleType,
} from "@/hooks/useAutosaveSchedules";

const WEEKDAYS = [
  { value: 1, short: "Seg", long: "Segunda" },
  { value: 2, short: "Ter", long: "Terça" },
  { value: 3, short: "Qua", long: "Quarta" },
  { value: 4, short: "Qui", long: "Quinta" },
  { value: 5, short: "Sex", long: "Sexta" },
  { value: 6, short: "Sáb", long: "Sábado" },
  { value: 0, short: "Dom", long: "Domingo" },
];

function weekdaysLabel(days: number[]): string {
  if (!days || days.length === 0) return "Nenhum dia";
  if (days.length === 7) return "Todos os dias";
  const weekdaysSet = [1, 2, 3, 4, 5];
  const sorted = [...days].sort();
  if (sorted.length === 5 && weekdaysSet.every((d) => sorted.includes(d))) return "Seg a Sex";
  return WEEKDAYS.filter((w) => days.includes(w.value)).map((w) => w.short).join(", ");
}

const STEPS = [
  { n: 1, title: "Identificação", desc: "Nome", icon: CalendarIcon },
  { n: 2, title: "Instâncias", desc: "Chips", icon: Smartphone },
  { n: 3, title: "Agenda", desc: "Dias e horário", icon: Clock },
  { n: 4, title: "Envio", desc: "Ritmo e crescimento", icon: Activity },
] as const;

export default function AutosaveSchedule() {
  const { user } = useAuth();
  const { data: schedules = [], isLoading } = useAutosaveSchedules();
  const createMut = useCreateAutosaveSchedule();
  const updateMut = useUpdateAutosaveSchedule();
  const deleteMut = useDeleteAutosaveSchedule();
  const triggerMut = useTriggerAutosaveSchedule();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: contactStats = { total: 0, valid: 0, invalid: 0 } } = useQuery({
    queryKey: ["autosave_contact_stats", user?.id],
    queryFn: async () => {
      if (!user) return { total: 0, valid: 0, invalid: 0 };
      const [{ count: total }, { count: valid }] = await Promise.all([
        supabase.from("warmup_autosave_contacts" as any).select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("warmup_autosave_contacts" as any).select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_active", true),
      ]);
      const t = total || 0;
      const v = valid || 0;
      return { total: t, valid: v, invalid: Math.max(0, t - v) };
    },
    enabled: !!user,
  });
  const autosaveCount = contactStats.total;

  const { data: devices = [] } = useQuery({
    queryKey: ["devices_for_autosave_schedule", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("devices")
        .select("id, name, number, status")
        .eq("user_id", user.id)
        .neq("login_type", "report_wa")
        .order("created_at");
      return data || [];
    },
    enabled: !!user,
  });

  // Form state
  const [name, setName] = useState("Agendamento Auto Save");
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [timeOfDay, setTimeOfDay] = useState("13:00");

  // Envio
  const [msgsPerInstance, setMsgsPerInstance] = useState<number | "">(1);
  const [minDelay, setMinDelay] = useState<number | "">(8);          // entre msgs do mesmo contato
  const [maxDelay, setMaxDelay] = useState<number | "">(20);
  const [betweenContactsMin, setBetweenContactsMin] = useState<number | "">(30); // entre contatos
  const [betweenContactsMax, setBetweenContactsMax] = useState<number | "">(90);
  const [pauseEnabled, setPauseEnabled] = useState<boolean>(true);
  const [pauseEveryMin, setPauseEveryMin] = useState<number | "">(10);   // pausa a cada X CONTATOS
  const [pauseEveryMax, setPauseEveryMax] = useState<number | "">(20);
  const [pauseDurationMin, setPauseDurationMin] = useState<number | "">(60);
  const [pauseDurationMax, setPauseDurationMax] = useState<number | "">(180);

  // Crescimento
  const [initialLimit, setInitialLimit] = useState<number | "">(20);
  const [dailyIncrement, setDailyIncrement] = useState<number | "">(5);
  const [maxLimit, setMaxLimit] = useState<number | "">(100);

  const resetForm = () => {
    setName("Agendamento Auto Save");
    setSelectedDevices([]);
    setSelectedWeekdays([1, 2, 3, 4, 5]);
    setTimeOfDay("13:00");
    setMsgsPerInstance(1);
    setMinDelay(8);
    setMaxDelay(20);
    setBetweenContactsMin(30);
    setBetweenContactsMax(90);
    setPauseEnabled(true);
    setPauseEveryMin(10);
    setPauseEveryMax(20);
    setPauseDurationMin(60);
    setPauseDurationMax(180);
    setInitialLimit(20);
    setDailyIncrement(5);
    setMaxLimit(100);
    setStep(1);
  };

  const openForEdit = (s: AutosaveScheduleType) => {
    setEditingId(s.id);
    setName(s.name || "");
    setSelectedDevices(Array.isArray(s.device_ids) ? s.device_ids : []);
    setSelectedWeekdays(Array.isArray(s.weekdays) ? s.weekdays : []);
    setTimeOfDay(s.time_of_day || "13:00");
    setMsgsPerInstance(s.messages_per_instance ?? 1);
    setMinDelay(s.min_delay_seconds ?? 8);
    setMaxDelay(s.max_delay_seconds ?? 20);
    setBetweenContactsMin(s.between_contacts_min_seconds ?? 30);
    setBetweenContactsMax(s.between_contacts_max_seconds ?? 90);
    const peMinSaved = s.pause_every_min ?? 10;
    const peMaxSaved = s.pause_every_max ?? 20;
    const pauseOff = peMinSaved >= 999999 || peMaxSaved >= 999999;
    setPauseEnabled(!pauseOff);
    setPauseEveryMin(pauseOff ? 10 : peMinSaved);
    setPauseEveryMax(pauseOff ? 20 : peMaxSaved);
    setPauseDurationMin(s.pause_duration_min ?? 60);
    setPauseDurationMax(s.pause_duration_max ?? 180);
    setInitialLimit(s.initial_limit_per_instance ?? 20);
    setDailyIncrement(s.daily_increment ?? 5);
    setMaxLimit(s.max_limit_per_instance ?? 100);
    setStep(1);
    setCreateOpen(true);
  };

  const toggleWeekday = (day: number) => {
    setSelectedWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  // Preview da progressão (primeiros 7 dias)
  const growthPreview = useMemo(() => {
    const ini = typeof initialLimit === "number" ? initialLimit : 0;
    const inc = typeof dailyIncrement === "number" ? dailyIncrement : 0;
    const mx = typeof maxLimit === "number" ? maxLimit : 0;
    if (!ini || !mx) return [];
    return Array.from({ length: 7 }, (_, i) => Math.min(mx, ini + i * inc));
  }, [initialLimit, dailyIncrement, maxLimit]);

  // Estimativa de envio (mensagens/dia, total até atingir o teto, semana, mês de execução)
  const sendEstimate = useMemo(() => {
    const ini = typeof initialLimit === "number" ? initialLimit : 0;
    const inc = typeof dailyIncrement === "number" ? dailyIncrement : 0;
    const mx = typeof maxLimit === "number" ? maxLimit : 0;
    const mpi = typeof msgsPerInstance === "number" ? Math.max(1, msgsPerInstance) : 1;
    const chips = Math.max(0, selectedDevices.length);
    const daysPerWeek = Math.max(0, selectedWeekdays.length);

    if (!ini || !mx || !chips) return null;

    // Dias necessários para atingir o teto (envios/chip/dia = contatos do dia)
    const daysToMax = inc > 0 ? Math.max(1, Math.ceil((mx - ini) / inc) + 1) : 1;

    // Soma cumulativa de contatos por chip ao longo de daysToMax (cada dia executado)
    let contactsPerChipUntilMax = 0;
    for (let i = 0; i < daysToMax; i++) {
      contactsPerChipUntilMax += Math.min(mx, ini + i * inc);
    }

    const day1Msgs = ini * mpi * chips;
    const dayMaxMsgs = mx * mpi * chips;
    const totalMsgsUntilMax = contactsPerChipUntilMax * mpi * chips;

    // Semanas/meses de calendário até completar daysToMax dias EXECUTADOS
    const weeksToMax = daysPerWeek > 0 ? daysToMax / daysPerWeek : 0;
    const calendarDaysToMax = daysPerWeek > 0 ? Math.ceil(weeksToMax * 7) : 0;

    // Após o teto: por semana de calendário e por mês (≈4.345 semanas)
    const weeklyAtMax = mx * mpi * chips * daysPerWeek;
    const monthlyAtMax = Math.round(weeklyAtMax * 4.345);

    return {
      chips, mpi, daysPerWeek,
      day1Msgs, dayMaxMsgs,
      daysToMax, calendarDaysToMax,
      totalMsgsUntilMax,
      weeklyAtMax, monthlyAtMax,
    };
  }, [initialLimit, dailyIncrement, maxLimit, msgsPerInstance, selectedDevices.length, selectedWeekdays.length]);


  const validateStep = (s: 1 | 2 | 3 | 4): string | null => {
    if (s === 1) {
      const trimmed = name.trim();
      if (!trimmed) return "Dê um nome para o agendamento";
      if (trimmed.length < 2) return "Nome deve ter pelo menos 2 caracteres";
      if (trimmed.length > 80) return "Nome deve ter no máximo 80 caracteres";
    }
    if (s === 2 && selectedDevices.length === 0) return "Selecione ao menos uma instância";
    if (s === 3) {
      if (selectedWeekdays.length === 0) return "Selecione ao menos um dia da semana";
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeOfDay)) return "Horário inválido — use HH:MM (00:00 a 23:59)";
    }
    if (s === 4) {
      const mpi = typeof msgsPerInstance === "number" ? msgsPerInstance : NaN;
      if (!Number.isFinite(mpi) || mpi < 1) return "Mensagens por contato deve ser ≥ 1";
      if (mpi > 50) return "Mensagens por contato deve ser ≤ 50";

      // Delay entre msgs do MESMO contato — só obrigatório se mpi > 1
      if (mpi > 1) {
        const minD = typeof minDelay === "number" ? minDelay : NaN;
        const maxD = typeof maxDelay === "number" ? maxDelay : NaN;
        if (!Number.isFinite(minD) || minD < 1) return "Delay mín entre mensagens do mesmo contato deve ser ≥ 1s";
        if (!Number.isFinite(maxD) || maxD < 1) return "Delay máx entre mensagens do mesmo contato deve ser ≥ 1s";
        if (minD > maxD) return "Delay mín entre mensagens não pode ser maior que o máx";
        if (maxD > 600) return "Delay máx entre mensagens deve ser ≤ 600s (10 min)";
      }

      // Delay entre CONTATOS
      const bcMin = typeof betweenContactsMin === "number" ? betweenContactsMin : NaN;
      const bcMax = typeof betweenContactsMax === "number" ? betweenContactsMax : NaN;
      if (!Number.isFinite(bcMin) || bcMin < 1) return "Delay mín entre contatos deve ser ≥ 1s";
      if (!Number.isFinite(bcMax) || bcMax < 1) return "Delay máx entre contatos deve ser ≥ 1s";
      if (bcMin > bcMax) return "Delay mín entre contatos não pode ser maior que o máx";
      if (bcMax > 3600) return "Delay máx entre contatos deve ser ≤ 3600s (1 hora)";

      // Coerência: delay entre contatos ≥ delay entre msgs do mesmo contato
      if (mpi > 1 && typeof minDelay === "number" && typeof maxDelay === "number") {
        if (bcMin < minDelay) return `Delay mín entre contatos (${bcMin}s) deve ser ≥ delay mín entre mensagens do mesmo contato (${minDelay}s)`;
        if (bcMax < maxDelay) return `Delay máx entre contatos (${bcMax}s) deve ser ≥ delay máx entre mensagens do mesmo contato (${maxDelay}s)`;
      }

      // Pausa entre lotes de contatos
      const peMin = typeof pauseEveryMin === "number" ? pauseEveryMin : NaN;
      const peMax = typeof pauseEveryMax === "number" ? pauseEveryMax : NaN;
      const pdMin = typeof pauseDurationMin === "number" ? pauseDurationMin : NaN;
      const pdMax = typeof pauseDurationMax === "number" ? pauseDurationMax : NaN;
      if (!Number.isFinite(peMin) || peMin < 1) return "'Pausar a cada (mín)' deve ser ≥ 1 contato";
      if (!Number.isFinite(peMax) || peMax < 1) return "'Pausar a cada (máx)' deve ser ≥ 1 contato";
      if (peMin > peMax) return "'Pausar a cada (mín)' não pode ser maior que o (máx)";
      if (peMax > 1000) return "'Pausar a cada (máx)' deve ser ≤ 1000 contatos";
      if (!Number.isFinite(pdMin) || pdMin < 1) return "Duração mín da pausa deve ser ≥ 1s";
      if (!Number.isFinite(pdMax) || pdMax < 1) return "Duração máx da pausa deve ser ≥ 1s";
      if (pdMin > pdMax) return "Duração mín da pausa não pode ser maior que a máx";
      if (pdMax > 7200) return "Duração máx da pausa deve ser ≤ 7200s (2 horas)";
      // A pausa entre lotes deve ser maior que o delay normal entre contatos — senão perde o sentido
      if (Number.isFinite(bcMax) && pdMin <= bcMax) return `Duração mín da pausa (${pdMin}s) deve ser maior que o delay máx entre contatos (${bcMax}s) — senão a pausa não tem efeito`;
      // Coerência: o limite inicial precisa ser pelo menos do tamanho do menor lote, senão a pausa nunca dispara
      if (Number.isFinite(peMin) && typeof initialLimit === "number" && initialLimit < peMin) {
        return `Limite inicial (${initialLimit}) é menor que o lote mín de pausa (${peMin}) — a pausa nunca seria acionada no 1º dia`;
      }

      // Crescimento
      const ini = typeof initialLimit === "number" ? initialLimit : NaN;
      const inc = typeof dailyIncrement === "number" ? dailyIncrement : NaN;
      const mx = typeof maxLimit === "number" ? maxLimit : NaN;
      if (!Number.isFinite(ini) || ini < 1) return "Limite inicial deve ser ≥ 1";
      if (ini > 5000) return "Limite inicial deve ser ≤ 5000";
      if (!Number.isFinite(inc) || inc < 0) return "Aumento por dia deve ser ≥ 0";
      if (inc > 1000) return "Aumento por dia deve ser ≤ 1000";
      if (!Number.isFinite(mx) || mx < ini) return "Limite máximo deve ser ≥ limite inicial";
      if (mx > 10000) return "Limite máximo deve ser ≤ 10000";
      if (inc > 0 && mx === ini) return "Se há 'aumento por dia', o limite máximo precisa ser maior que o inicial";
    }
    return null;
  };

  const next = () => {
    const err = validateStep(step);
    if (err) return toast.error(err);
    setStep((s) => (s < 4 ? ((s + 1) as 2 | 3 | 4) : s));
  };
  const back = () => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s));

  const handleCreate = async () => {
    for (const s of [1, 2, 3, 4] as const) {
      const err = validateStep(s);
      if (err) { setStep(s); return toast.error(err); }
    }
    if (autosaveCount === 0) return toast.error("Nenhum contato Auto Save cadastrado");

    const num = (v: number | "", fallback: number) => (typeof v === "number" && !isNaN(v) ? v : fallback);
    const minD = Math.max(1, num(minDelay, 8));
    const maxD = Math.max(minD, num(maxDelay, 20));
    const bcMin = Math.max(1, num(betweenContactsMin, 30));
    const bcMax = Math.max(bcMin, num(betweenContactsMax, 90));
    const peMin = Math.max(1, num(pauseEveryMin, 10));
    const peMax = Math.max(peMin, num(pauseEveryMax, 20));
    const pdMin = Math.max(1, num(pauseDurationMin, 60));
    const pdMax = Math.max(pdMin, num(pauseDurationMax, 180));
    const mpi = Math.max(1, num(msgsPerInstance, 1));

    const payload = {
      name: name.trim() || "Agendamento Auto Save",
      device_ids: selectedDevices,
      weekdays: selectedWeekdays,
      time_of_day: timeOfDay,
      min_delay_seconds: minD,
      max_delay_seconds: maxD,
      between_contacts_min_seconds: bcMin,
      between_contacts_max_seconds: bcMax,
      pause_every_min: peMin,
      pause_every_max: peMax,
      pause_duration_min: pdMin,
      pause_duration_max: pdMax,
      messages_per_instance: mpi,
      initial_limit_per_instance: typeof initialLimit === "number" ? initialLimit : 20,
      daily_increment: typeof dailyIncrement === "number" ? dailyIncrement : 5,
      max_limit_per_instance: typeof maxLimit === "number" ? maxLimit : 100,
    };

    try {
      if (editingId) {
        await updateMut.mutateAsync({ id: editingId, ...payload });
        toast.success("Agendamento atualizado");
      } else {
        await createMut.mutateAsync(payload);
        toast.success("Agendamento recorrente criado");
      }
      setCreateOpen(false);
      setEditingId(null);
      resetForm();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, { label: string; cls: string; icon: any }> = {
      scheduled: { label: "Agendado", cls: "bg-blue-500/10 text-blue-400 border-blue-500/30", icon: Clock },
      running: { label: "Em execução", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", icon: Activity },
      paused: { label: "Pausado", cls: "bg-amber-500/10 text-amber-400 border-amber-500/30", icon: Pause },
      completed: { label: "Concluído", cls: "bg-muted text-muted-foreground border-border", icon: CheckCircle2 },
      failed: { label: "Falhou", cls: "bg-destructive/10 text-destructive border-destructive/30", icon: AlertCircle },
    };
    const v = map[s] || map.scheduled;
    const Icon = v.icon;
    return (
      <Badge variant="outline" className={cn("gap-1.5 text-[11px]", v.cls)}>
        <Icon className="w-3 h-3" />{v.label}
      </Badge>
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <CalendarIcon className="w-5 h-5 text-primary" />
            </div>
            Agendamento Auto Save
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 ml-[52px]">
            Aquecimento recorrente entre seus chips usando contatos Auto Save — executa nos dias e horário definidos
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {schedules.some((s) => s.status === "scheduled" || s.status === "paused") && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
              onClick={() => {
                const targets = schedules.filter((s) => s.status === "scheduled" || s.status === "paused");
                if (!targets.length) return;
                if (!confirm(`Iniciar/retomar ${targets.length} agendamento(s)?`)) return;
                targets.forEach((s) =>
                  triggerMut.mutate({ id: s.id, action: s.status === "paused" ? "resume" : "start" })
                );
                toast.success(`${targets.length} agendamento(s) iniciados`);
              }}
            >
              <Play className="w-4 h-4" /> Iniciar todos
            </Button>
          )}
          {schedules.some((s) => s.status === "running") && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
              onClick={() => {
                const targets = schedules.filter((s) => s.status === "running");
                if (!targets.length) return;
                if (!confirm(`Pausar ${targets.length} agendamento(s) em execução?`)) return;
                targets.forEach((s) => triggerMut.mutate({ id: s.id, action: "pause" }));
                toast.success(`${targets.length} agendamento(s) pausados`);
              }}
            >
              <Pause className="w-4 h-4" /> Pausar todos
            </Button>
          )}
          <Button onClick={() => { setEditingId(null); resetForm(); setCreateOpen(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> Novo Agendamento
          </Button>
        </div>
      </div>

      {/* Status global + resumo do dia */}
      {(() => {
        const activeCount = schedules.filter((s) => s.status === "scheduled" || s.status === "running").length;
        const runningCount = schedules.filter((s) => s.status === "running").length;
        const todayStr = format(new Date(), "yyyy-MM-dd");

        const now = new Date();
        const todayDow = now.getDay();
        const upcoming = schedules
          .filter((s) => s.status === "scheduled" || s.status === "running")
          .map((s) => {
            const [h, m] = (s.time_of_day || "00:00").split(":").map(Number);
            const days: number[] = Array.isArray(s.weekdays) ? s.weekdays : [];
            for (let offset = 0; offset < 8; offset++) {
              const dow = (todayDow + offset) % 7;
              if (!days.includes(dow)) continue;
              const dt = new Date(now);
              dt.setDate(dt.getDate() + offset);
              dt.setHours(h, m, 0, 0);
              if (dt > now) return dt;
            }
            return null;
          })
          .filter(Boolean) as Date[];
        const nextRun = upcoming.sort((a, b) => a.getTime() - b.getTime())[0];

        const sentToday = schedules
          .filter((s) => s.last_run_date === todayStr)
          .reduce((sum, s) => sum + (s.total_sent || 0), 0);
        const activeInstancesToday = new Set(
          schedules
            .filter((s) => s.status === "running")
            .flatMap((s) => (Array.isArray(s.device_ids) ? s.device_ids : []))
        ).size;

        return (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <Repeat className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Agendamentos ativos</p>
                  <p className="text-xl font-bold">{activeCount}</p>
                </div>
              </Card>
              <Card className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Em execução agora</p>
                  <p className="text-xl font-bold">{runningCount}</p>
                </div>
              </Card>
              <Card className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Próxima execução</p>
                  <p className="text-base font-semibold truncate">
                    {nextRun
                      ? format(nextRun, "EEE dd/MM 'às' HH:mm", { locale: ptBR })
                      : activeCount === 0
                        ? <span className="text-muted-foreground font-normal text-sm">Nenhum agendamento ativo</span>
                        : "Sem horário válido"}
                  </p>
                </div>
              </Card>
            </div>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <CalendarIcon className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold">Resumo de hoje</h2>
                <span className="text-[11px] text-muted-foreground ml-auto">
                  {format(new Date(), "EEEE, dd/MM", { locale: ptBR })}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center py-2">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Mensagens enviadas</p>
                  <p className="text-3xl font-bold text-emerald-400 mt-1">{sentToday}</p>
                </div>
                <div className="text-center py-2 md:border-x border-border/40">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Instâncias ativas</p>
                  <p className="text-3xl font-bold text-blue-400 mt-1">{activeInstancesToday}</p>
                </div>
                <div className="text-center py-2">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Contatos válidos</p>
                  <p className="text-3xl font-bold text-violet-400 mt-1">{contactStats.valid}</p>
                </div>
              </div>
            </Card>
          </>
        );
      })()}

      {/* Schedules list */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border/40 flex items-center justify-between">
          <h2 className="font-semibold">Meus agendamentos</h2>
          <span className="text-xs text-muted-foreground">{schedules.length} total</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : schedules.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <CalendarIcon className="w-7 h-7 text-primary" />
            </div>
            <p className="text-sm text-foreground font-medium">
              Crie um agendamento para iniciar o aquecimento automático entre seus chips.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {schedules.map((s) => (
              <div key={s.id} className="p-4 hover:bg-muted/20 transition-colors">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h3 className="font-medium truncate">{s.name}</h3>
                      {statusBadge(s.status)}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Repeat className="w-3 h-3" />
                        {weekdaysLabel(s.weekdays)} às {s.time_of_day}
                      </span>
                      <span className="flex items-center gap-1">
                        <Smartphone className="w-3 h-3" />
                        {s.device_ids.length} chip{s.device_ids.length !== 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-1">
                        <Activity className="w-3 h-3" />
                        {s.total_sent} enviadas{s.total_failed > 0 && ` · ${s.total_failed} falhas`}
                      </span>
                      <span className="flex items-center gap-1 text-emerald-400/80">
                        <TrendingUp className="w-3 h-3" />
                        {(() => {
                          const cur = Math.min(
                            s.max_limit_per_instance,
                            s.initial_limit_per_instance + s.days_executed * s.daily_increment
                          );
                          return `${cur}/${s.max_limit_per_instance} envios/chip · ${s.messages_per_instance || 1} msg(s)/contato · dia ${s.days_executed + 1}`;
                        })()}
                      </span>
                    </div>
                    {s.last_error && (
                      <p className="text-[11px] text-destructive mt-1">⚠ {s.last_error}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setDetailId(s.id)}>Logs</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Editar agendamento"
                      onClick={() => {
                        if (s.status === "running") {
                          toast.error("Pause o agendamento antes de editar");
                          return;
                        }
                        openForEdit(s);
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {(s.status === "scheduled" || s.status === "paused" || s.status === "completed") && (
                      <Button size="sm" variant="ghost" onClick={() => triggerMut.mutate({ id: s.id, action: s.status === "paused" ? "resume" : "start" })}>
                        <Play className="w-4 h-4" />
                      </Button>
                    )}
                    {s.status === "running" && (
                      <Button size="sm" variant="ghost" onClick={() => triggerMut.mutate({ id: s.id, action: "pause" })}>
                        <Pause className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm("Deletar este agendamento?")) deleteMut.mutate(s.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Create Wizard */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditingId(null); } }}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-full max-w-2xl max-h-[92vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg pr-6">
              <CalendarIcon className="w-5 h-5 text-primary shrink-0" />
              <span className="truncate">{editingId ? "Editar Agendamento Auto Save" : "Novo Agendamento Auto Save"}</span>
            </DialogTitle>
          </DialogHeader>

          {/* Stepper */}
          <div className="flex items-center gap-1 mt-2 mb-4 w-full">
            {STEPS.map((st, i) => {
              const active = st.n === step;
              const done = st.n < step;
              const Icon = st.icon;
              return (
                <div key={st.n} className="flex-1 flex items-center gap-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => { if (done) setStep(st.n as any); }}
                    className={cn(
                      "flex-1 flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-1.5 sm:px-2 py-2 rounded-md border transition-colors min-w-0",
                      active && "bg-primary/10 border-primary/40 text-foreground",
                      done && "bg-emerald-500/5 border-emerald-500/30 text-emerald-400 cursor-pointer hover:bg-emerald-500/10",
                      !active && !done && "bg-muted/20 border-border/40 text-muted-foreground"
                    )}
                  >
                    <span className={cn(
                      "w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-[11px] font-bold shrink-0",
                      active && "bg-primary text-primary-foreground",
                      done && "bg-emerald-500/20 text-emerald-400",
                      !active && !done && "bg-muted text-muted-foreground"
                    )}>
                      {done ? <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : st.n}
                    </span>
                    <div className="min-w-0 hidden sm:block">
                      <p className="text-[11px] font-semibold leading-tight truncate">{st.title}</p>
                      <p className="text-[10px] opacity-70 leading-tight truncate">{st.desc}</p>
                    </div>
                    <Icon className={cn("w-3.5 h-3.5 shrink-0 sm:hidden", active ? "text-primary" : "")} />
                  </button>
                  {i < STEPS.length - 1 && <ArrowRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-muted-foreground/40 shrink-0" />}
                </div>
              );
            })}
          </div>

          {/* ============ STEP 1: IDENTIFICAÇÃO ============ */}
          {step === 1 && (() => {
            const trimmed = name.trim();
            const len = trimmed.length;
            const tooShort = len > 0 && len < 2;
            const tooLong = len > 80;
            const valid = len >= 2 && len <= 80;
            const duplicate = !editingId && schedules.some((s) => s.name?.trim().toLowerCase() === trimmed.toLowerCase());
            const counterColor = tooLong ? "text-destructive" : len > 70 ? "text-amber-400" : "text-muted-foreground/60";

            return (
              <section className="space-y-4">
                <div className="rounded-lg border border-border/60 bg-gradient-to-br from-primary/5 via-card/40 to-card/40 p-4 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                      <CalendarIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold">Identifique este agendamento</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        O nome só é usado <strong>internamente</strong> — para você localizar na lista, em logs e relatórios. Não aparece para os contatos.
                      </p>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground/70">Nome do agendamento</Label>
                      <span className={cn("text-[10px] tabular-nums", counterColor)}>{len}/80</span>
                    </div>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Aquecimento diário – chips novos"
                      maxLength={80}
                      autoFocus
                      className={cn(
                        "transition-colors",
                        tooLong || tooShort || duplicate ? "border-destructive/60 focus-visible:ring-destructive/30" :
                        valid ? "border-emerald-500/40 focus-visible:ring-emerald-500/30" : ""
                      )}
                    />
                    <div className="mt-1.5 min-h-[18px] text-[11px]">
                      {len === 0 && (
                        <span className="text-muted-foreground/70">Digite ao menos 2 caracteres.</span>
                      )}
                      {tooShort && (
                        <span className="text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Muito curto — mín. 2 caracteres.</span>
                      )}
                      {tooLong && (
                        <span className="text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Limite de 80 caracteres atingido.</span>
                      )}
                      {duplicate && (
                        <span className="text-amber-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Já existe um agendamento com esse nome.</span>
                      )}
                      {valid && !duplicate && (
                        <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Bom nome, segue!</span>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            );
          })()}


          {/* ============ STEP 2: INSTÂNCIAS ============ */}
          {step === 2 && (
            <section className="space-y-4">
              <div className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Smartphone className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Quais chips vão disparar?</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Cada chip selecionado fará envios de forma INDEPENDENTE — todos rodam em paralelo, cada um no seu próprio ritmo.</p>
                  </div>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground/70 mb-2 block">
                    Instâncias ({selectedDevices.length} selecionadas)
                  </Label>
                  <div className="flex gap-2 mb-2">
                    <button type="button" onClick={() => setSelectedDevices(devices.map((d: any) => d.id))} className="text-[11px] text-primary hover:underline">Selecionar todos</button>
                    <span className="text-[11px] text-muted-foreground/30">·</span>
                    <button type="button" onClick={() => setSelectedDevices([])} className="text-[11px] text-muted-foreground hover:text-primary">Limpar</button>
                  </div>
                  <Card className="p-2 max-h-72 overflow-y-auto">
                    {devices.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center p-3">Nenhuma instância encontrada</p>
                    ) : (
                      <div className="space-y-1">
                        {devices.map((d: any) => {
                          const isOnline = ["Ready", "Connected", "authenticated", "open"].includes(d.status);
                          const isSel = selectedDevices.includes(d.id);
                          return (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() =>
                                setSelectedDevices((prev) =>
                                  prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id]
                                )
                              }
                              className={cn(
                                "w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors",
                                isSel ? "bg-primary/10 text-foreground" : "hover:bg-muted/40 text-muted-foreground"
                              )}
                            >
                              <div className={cn("w-2 h-2 rounded-full", isOnline ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                              <span className="flex-1 truncate">{d.name || d.number || "—"}</span>
                              {isSel && <CheckCircle2 className="w-4 h-4 text-primary" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                </div>
              </div>
            </section>
          )}

          {/* ============ STEP 3: AGENDA ============ */}
          {step === 3 && (
            <section className="space-y-4">
              <div className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5 text-violet-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Quando deve executar?</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Marque os dias da semana e o horário. O agendamento será disparado UMA vez em cada dia marcado, no horário (BRT) escolhido.</p>
                  </div>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground/70 mb-2 block">
                    Dias da semana ({selectedWeekdays.length} selecionados)
                  </Label>
                  <div className="grid grid-cols-7 gap-1.5">
                    {WEEKDAYS.map((w) => {
                      const isSel = selectedWeekdays.includes(w.value);
                      return (
                        <button
                          key={w.value}
                          type="button"
                          onClick={() => toggleWeekday(w.value)}
                          className={cn(
                            "py-2.5 rounded-md text-xs font-medium transition-colors border",
                            isSel
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
                          )}
                          title={w.long}
                        >
                          {w.short}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button type="button" className="text-[11px] text-muted-foreground hover:text-primary" onClick={() => setSelectedWeekdays([1, 2, 3, 4, 5])}>Seg a Sex</button>
                    <span className="text-[11px] text-muted-foreground/30">·</span>
                    <button type="button" className="text-[11px] text-muted-foreground hover:text-primary" onClick={() => setSelectedWeekdays([0, 1, 2, 3, 4, 5, 6])}>Todos</button>
                    <span className="text-[11px] text-muted-foreground/30">·</span>
                    <button type="button" className="text-[11px] text-muted-foreground hover:text-primary" onClick={() => setSelectedWeekdays([])}>Limpar</button>
                  </div>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground/70 mb-2 block">Horário (BRT)</Label>
                  <Input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground/80 mt-1.5">{weekdaysLabel(selectedWeekdays)} às {timeOfDay}</p>
                </div>
              </div>
            </section>
          )}

          {/* ============ STEP 4: ENVIO + CRESCIMENTO ============ */}
          {step === 4 && (
            <section className="space-y-4">
              {/* Mensagens por contato + delays */}
              <div className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Como cada chip dispara</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Defina quantas mensagens cada contato recebe e o ritmo entre elas.</p>
                  </div>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground/70 mb-2 block">Mensagens por contato</Label>
                  <Input
                    type="number"
                    min={1}
                    value={msgsPerInstance}
                    placeholder="Ex: 3"
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") return setMsgsPerInstance("");
                      const n = parseInt(v, 10);
                      if (!isNaN(n) && n >= 0) setMsgsPerInstance(n);
                    }}
                  />
                  <p className="text-[11px] text-muted-foreground/80 mt-1.5">
                    Quantas mensagens serão enviadas para cada contato antes de pular para o próximo.
                  </p>
                </div>

                {/* Delay entre mensagens do MESMO contato */}
                <div className={cn(
                  "rounded-md border p-3 space-y-3",
                  (typeof msgsPerInstance === "number" && msgsPerInstance > 1)
                    ? "border-blue-500/30 bg-blue-500/5"
                    : "border-border/60 bg-muted/10 opacity-60"
                )}>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Delay entre mensagens (mesmo contato)</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/90">
                    Tempo de espera entre uma mensagem e outra <strong>dentro do mesmo contato</strong>. Só é usado quando "mensagens por contato" for maior que 1.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Mín (s)</Label>
                      <Input type="number" min={1} value={minDelay} placeholder="ex: 8"
                        onChange={(e) => { const v = e.target.value; if (v === "") return setMinDelay(""); const n = parseInt(v, 10); if (!isNaN(n) && n >= 0) setMinDelay(n); }} />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Máx (s)</Label>
                      <Input type="number" min={1} value={maxDelay} placeholder="ex: 20"
                        onChange={(e) => { const v = e.target.value; if (v === "") return setMaxDelay(""); const n = parseInt(v, 10); if (!isNaN(n) && n >= 0) setMaxDelay(n); }} />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground/80">
                    Aleatório entre <span className="text-foreground font-medium">{minDelay || "—"}–{maxDelay || "—"}s</span> entre cada mensagem do mesmo contato.
                  </p>
                </div>

                {/* Delay entre CONTATOS */}
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Delay entre contatos</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/90">
                    Tempo de espera <strong>após terminar de enviar para um contato</strong>, antes de começar o próximo. Contado da última mensagem do contato anterior até a primeira do próximo.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Mín (s)</Label>
                      <Input type="number" min={1} value={betweenContactsMin} placeholder="ex: 30"
                        onChange={(e) => { const v = e.target.value; if (v === "") return setBetweenContactsMin(""); const n = parseInt(v, 10); if (!isNaN(n) && n >= 0) setBetweenContactsMin(n); }} />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Máx (s)</Label>
                      <Input type="number" min={1} value={betweenContactsMax} placeholder="ex: 90"
                        onChange={(e) => { const v = e.target.value; if (v === "") return setBetweenContactsMax(""); const n = parseInt(v, 10); if (!isNaN(n) && n >= 0) setBetweenContactsMax(n); }} />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground/80">
                    Aleatório entre <span className="text-foreground font-medium">{betweenContactsMin || "—"}–{betweenContactsMax || "—"}s</span> entre o fim de um contato e o início do próximo.
                  </p>
                </div>

                {/* Pausa entre lotes de CONTATOS */}
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Pause className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Pausa entre lotes de contatos</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/90">
                    Após atender uma quantidade de <strong>contatos completos</strong>, o chip faz uma pausa maior antes de continuar — simula um descanso humano.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Pausar a cada (mín contatos)</Label>
                      <Input type="number" min={1} value={pauseEveryMin} placeholder="ex: 10"
                        onChange={(e) => { const v = e.target.value; if (v === "") return setPauseEveryMin(""); const n = parseInt(v, 10); if (!isNaN(n) && n >= 0) setPauseEveryMin(n); }} />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Pausar a cada (máx contatos)</Label>
                      <Input type="number" min={1} value={pauseEveryMax} placeholder="ex: 20"
                        onChange={(e) => { const v = e.target.value; if (v === "") return setPauseEveryMax(""); const n = parseInt(v, 10); if (!isNaN(n) && n >= 0) setPauseEveryMax(n); }} />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Duração mín (s)</Label>
                      <Input type="number" min={1} value={pauseDurationMin} placeholder="ex: 60"
                        onChange={(e) => { const v = e.target.value; if (v === "") return setPauseDurationMin(""); const n = parseInt(v, 10); if (!isNaN(n) && n >= 0) setPauseDurationMin(n); }} />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Duração máx (s)</Label>
                      <Input type="number" min={1} value={pauseDurationMax} placeholder="ex: 180"
                        onChange={(e) => { const v = e.target.value; if (v === "") return setPauseDurationMax(""); const n = parseInt(v, 10); if (!isNaN(n) && n >= 0) setPauseDurationMax(n); }} />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground/80">
                    A cada <span className="text-foreground font-medium">{pauseEveryMin || "—"}–{pauseEveryMax || "—"} contatos atendidos</span>, pausa por <span className="text-foreground font-medium">{pauseDurationMin || "—"}–{pauseDurationMax || "—"}s</span>.
                  </p>
                </div>
              </div>

              {/* Crescimento */}
              <div className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Crescimento automático diário</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      O limite de envios <strong>cresce a cada dia executado</strong> — começa baixo e vai aumentando até chegar no máximo. Isso protege chips novos.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Limite inicial</Label>
                    <Input type="number" min={1} value={initialLimit} placeholder="ex: 20"
                      onChange={(e) => { const v = e.target.value; if (v === "") return setInitialLimit(""); const n = parseInt(v, 10); if (!isNaN(n) && n >= 0) setInitialLimit(n); }} />
                    <p className="text-[10px] text-muted-foreground/70 mt-1">Quantos envios o chip faz no <strong>1º dia</strong>.</p>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Aumento por dia</Label>
                    <Input type="number" min={0} value={dailyIncrement} placeholder="ex: 5"
                      onChange={(e) => { const v = e.target.value; if (v === "") return setDailyIncrement(""); const n = parseInt(v, 10); if (!isNaN(n) && n >= 0) setDailyIncrement(n); }} />
                    <p className="text-[10px] text-muted-foreground/70 mt-1">Quanto <strong>soma</strong> a cada novo dia.</p>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Limite máximo</Label>
                    <Input
                      type="number"
                      min={1}
                      value={maxLimit}
                      placeholder="ex: 100"
                      onChange={(e) => { const v = e.target.value; if (v === "") return setMaxLimit(""); const n = parseInt(v, 10); if (!isNaN(n) && n >= 0) setMaxLimit(n); }}
                      className={typeof maxLimit === "number" && maxLimit >= 55 ? "text-red-500 border-red-500/60 focus-visible:ring-red-500/40" : ""}
                    />
                    {typeof maxLimit === "number" && maxLimit >= 55 ? (
                      <p className="text-[10px] text-red-500 mt-1 flex items-start gap-1">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span><strong>Risco de restrição ou banimento.</strong> Acima de 55 envios/dia o chip pode ser limitado pelo WhatsApp.</span>
                      </p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground/70 mt-1">Teto que o chip <strong>nunca</strong> passa.</p>
                    )}
                  </div>
                </div>

                {/* Preview da progressão */}
                {growthPreview.length > 0 && (
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Info className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">Como vai crescer (envios por chip)</span>
                    </div>
                    <div className="grid grid-cols-7 gap-1.5">
                      {growthPreview.map((v, i) => {
                        const reachedMax = typeof maxLimit === "number" && v >= maxLimit;
                        return (
                          <div key={i} className={cn(
                            "rounded p-2 text-center border",
                            reachedMax ? "border-amber-500/40 bg-amber-500/10" : "border-emerald-500/30 bg-emerald-500/10"
                          )}>
                            <p className="text-[9px] uppercase text-muted-foreground/70">Dia {i + 1}</p>
                            <p className="text-sm font-bold text-foreground">{v}</p>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-muted-foreground/90 mt-2 leading-relaxed">
                      Exemplo: começando em <strong>{initialLimit || "—"}</strong>, aumentando <strong>+{dailyIncrement || 0}</strong> por dia até o teto de <strong>{maxLimit || "—"}</strong>.
                      No 1º dia o chip envia <strong>{growthPreview[0]}</strong>, no 2º dia <strong>{growthPreview[1]}</strong>, no 3º dia <strong>{growthPreview[2]}</strong>… e assim por diante (não é sempre o mesmo número).
                    </p>
                  </div>
                )}
              </div>

              {/* Estimativa de envio */}
              {sendEstimate && (
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                      <Activity className="w-4.5 h-4.5 text-blue-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold">Estimativa de envio</h4>
                      <p className="text-[11px] text-muted-foreground/90 mt-0.5">
                        Baseada em {sendEstimate.chips} chip(s) × {sendEstimate.mpi} msg(s)/contato × {sendEstimate.daysPerWeek} dia(s)/semana.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="rounded-md border border-border/60 bg-card/40 p-2.5 text-center">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70">1º dia</p>
                      <p className="text-base font-bold text-foreground mt-0.5">{sendEstimate.day1Msgs.toLocaleString("pt-BR")}</p>
                      <p className="text-[10px] text-muted-foreground/70">mensagens</p>
                    </div>
                    <div className="rounded-md border border-border/60 bg-card/40 p-2.5 text-center">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70">No teto</p>
                      <p className="text-base font-bold text-foreground mt-0.5">{sendEstimate.dayMaxMsgs.toLocaleString("pt-BR")}</p>
                      <p className="text-[10px] text-muted-foreground/70">msgs/dia</p>
                    </div>
                    <div className="rounded-md border border-border/60 bg-card/40 p-2.5 text-center">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70">Semana (no teto)</p>
                      <p className="text-base font-bold text-emerald-400 mt-0.5">{sendEstimate.weeklyAtMax.toLocaleString("pt-BR")}</p>
                      <p className="text-[10px] text-muted-foreground/70">msgs</p>
                    </div>
                    <div className="rounded-md border border-border/60 bg-card/40 p-2.5 text-center">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70">Mês (no teto)</p>
                      <p className="text-base font-bold text-emerald-400 mt-0.5">≈ {sendEstimate.monthlyAtMax.toLocaleString("pt-BR")}</p>
                      <p className="text-[10px] text-muted-foreground/70">msgs</p>
                    </div>
                  </div>

                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-[11px] text-muted-foreground/90 leading-relaxed">
                    Até atingir o teto: <strong className="text-foreground">{sendEstimate.daysToMax} dia(s) executados</strong>
                    {sendEstimate.calendarDaysToMax > 0 && <> (≈ {sendEstimate.calendarDaysToMax} dias de calendário)</>}, somando
                    {" "}<strong className="text-emerald-400">{sendEstimate.totalMsgsUntilMax.toLocaleString("pt-BR")}</strong> mensagens enviadas no período de aquecimento.
                  </div>

                  <p className="text-[10px] text-muted-foreground/60 italic">
                    Estimativa teórica — o número real depende de contatos disponíveis, falhas de envio e disponibilidade dos chips.
                  </p>
                </div>
              )}

              {/* Resumo final */}
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Resumo</span>
                </div>
                <p className="text-[11px] text-muted-foreground/90">
                  <strong>{name}</strong> · {selectedDevices.length} chip(s) · {weekdaysLabel(selectedWeekdays)} às {timeOfDay} ·
                  {" "}{msgsPerInstance || 1} msg(s)/contato · delay {betweenContactsMin || "—"}–{betweenContactsMax || "—"}s entre contatos · pausa após {pauseEveryMin || "—"}–{pauseEveryMax || "—"} contatos.
                </p>
                <p className="text-[11px] text-muted-foreground/80">
                  {autosaveCount} contatos disponíveis · crescimento {initialLimit}→{maxLimit} (+{dailyIncrement}/dia).
                </p>
              </div>
            </section>
          )}

          {/* Footer / navigation */}
          <div className="flex gap-2 pt-3 mt-2 border-t border-border/40 w-full">
            {step > 1 ? (
              <Button variant="outline" onClick={back} className="gap-2 shrink-0">
                <ArrowLeft className="w-4 h-4" /> Voltar
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setCreateOpen(false)} className="shrink-0">Cancelar</Button>
            )}
            <div className="flex-1" />
            {step < 4 ? (
              <Button onClick={next} className="gap-2 shrink-0">
                Próximo <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={handleCreate}
                disabled={createMut.isPending || updateMut.isPending}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all gap-2 shrink-0"
              >
                {editingId ? <Save className="w-4 h-4" /> : <Rocket className="w-4 h-4" />}
                <span className="truncate">
                  {editingId
                    ? (updateMut.isPending ? "Salvando..." : "Salvar Alterações")
                    : (createMut.isPending ? "Criando..." : "Criar Agendamento")}
                </span>
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <LogsDialog scheduleId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

function LogsDialog({ scheduleId, onClose }: { scheduleId: string | null; onClose: () => void }) {
  const { data: logs = [] } = useAutosaveScheduleLogs(scheduleId);
  return (
    <Dialog open={!!scheduleId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Logs do agendamento</DialogTitle>
        </DialogHeader>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum envio registrado ainda</p>
        ) : (
          <div className="divide-y divide-border/40">
            {logs.map((l) => (
              <div key={l.id} className="py-2.5 text-sm">
                <div className="flex items-center gap-2 mb-1">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      l.status === "sent" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-destructive/10 text-destructive border-destructive/30"
                    )}
                  >
                    {l.status === "sent" ? "Enviado" : "Falha"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {l.device_name || "—"} → {l.contact_name || l.contact_phone}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 ml-auto">
                    {format(new Date(l.sent_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground/80 line-clamp-2">{l.message_content}</p>
                {l.error_message && <p className="text-[11px] text-destructive mt-1">⚠ {l.error_message}</p>}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
