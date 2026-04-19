import { useState } from "react";
import { Calendar as CalendarIcon, Plus, Play, Pause, Trash2, Save, Smartphone, Activity, CheckCircle2, AlertCircle, Clock, Repeat } from "lucide-react";
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
  useDeleteAutosaveSchedule,
  useTriggerAutosaveSchedule,
  useAutosaveScheduleLogs,
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

export default function AutosaveSchedule() {
  const { user } = useAuth();
  const { data: schedules = [], isLoading } = useAutosaveSchedules();
  const createMut = useCreateAutosaveSchedule();
  const deleteMut = useDeleteAutosaveSchedule();
  const triggerMut = useTriggerAutosaveSchedule();

  const [createOpen, setCreateOpen] = useState(false);
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

  // Resumo do dia: agregados a partir dos logs
  const todayISO = format(new Date(), "yyyy-MM-dd");
  const { data: todayLogStats = { invalid: 0, failed: 0, limit_reached: 0 } } = useQuery({
    queryKey: ["autosave_today_log_stats", user?.id, todayISO],
    queryFn: async () => {
      if (!user) return { invalid: 0, failed: 0, limit_reached: 0 };
      const startISO = `${todayISO}T00:00:00.000Z`;
      const [inv, fail, lim] = await Promise.all([
        supabase.from("autosave_schedule_logs" as any).select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "invalid_number").gte("sent_at", startISO),
        supabase.from("autosave_schedule_logs" as any).select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "failed").gte("sent_at", startISO),
        supabase.from("autosave_schedule_logs" as any).select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "limit_reached").gte("sent_at", startISO),
      ]);
      return { invalid: inv.count || 0, failed: fail.count || 0, limit_reached: lim.count || 0 };
    },
    enabled: !!user,
    refetchInterval: 10_000,
  });

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
  const [minDelay, setMinDelay] = useState(15);
  const [maxDelay, setMaxDelay] = useState(60);
  const [pauseEveryMin, setPauseEveryMin] = useState(10);
  const [pauseEveryMax, setPauseEveryMax] = useState(20);
  const [pauseDurationMin, setPauseDurationMin] = useState(30);
  const [pauseDurationMax, setPauseDurationMax] = useState(120);
  const [msgsPerInstance, setMsgsPerInstance] = useState(1);
  const [initialLimit, setInitialLimit] = useState<number | "">(20);
  const [dailyIncrement, setDailyIncrement] = useState<number | "">(5);
  const [maxLimit, setMaxLimit] = useState<number | "">(100);

  const resetForm = () => {
    setName("Agendamento Auto Save");
    setSelectedDevices([]);
    setSelectedWeekdays([1, 2, 3, 4, 5]);
    setTimeOfDay("13:00");
    setMinDelay(15);
    setMaxDelay(60);
    setMsgsPerInstance(1);
    setInitialLimit(20);
    setDailyIncrement(5);
    setMaxLimit(100);
  };

  const toggleWeekday = (day: number) => {
    setSelectedWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleCreate = async () => {
    if (selectedDevices.length === 0) {
      toast.error("Selecione ao menos uma instância");
      return;
    }
    if (selectedWeekdays.length === 0) {
      toast.error("Selecione ao menos um dia da semana");
      return;
    }
    if (autosaveCount === 0) {
      toast.error("Nenhum contato Auto Save cadastrado");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(timeOfDay)) {
      toast.error("Horário inválido");
      return;
    }
    // Progressão é sempre obrigatória
    const ini = typeof initialLimit === "number" ? initialLimit : NaN;
    const inc = typeof dailyIncrement === "number" ? dailyIncrement : NaN;
    const mx = typeof maxLimit === "number" ? maxLimit : NaN;
    if (!Number.isFinite(ini) || ini < 1) return toast.error("Limite inicial deve ser ≥ 1");
    if (!Number.isFinite(inc) || inc < 0) return toast.error("Aumento por dia deve ser ≥ 0");
    if (!Number.isFinite(mx) || mx < ini) return toast.error("Limite máximo deve ser ≥ limite inicial");
    const payloadProgression = { initial_limit_per_instance: ini, daily_increment: inc, max_limit_per_instance: mx };

    try {
      await createMut.mutateAsync({
        name: name.trim() || "Agendamento Auto Save",
        device_ids: selectedDevices,
        weekdays: selectedWeekdays,
        time_of_day: timeOfDay,
        min_delay_seconds: minDelay,
        max_delay_seconds: maxDelay,
        pause_every_min: pauseEveryMin,
        pause_every_max: pauseEveryMax,
        pause_duration_min: pauseDurationMin,
        pause_duration_max: pauseDurationMax,
        messages_per_instance: msgsPerInstance,
        ...payloadProgression,
      });
      toast.success("Agendamento recorrente criado");
      setCreateOpen(false);
      resetForm();
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar");
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
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
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
            <div className="mt-5 max-w-md mx-auto grid grid-cols-3 gap-3 text-left">
              {[
                { n: 1, t: "Escolha instâncias", icon: Smartphone },
                { n: 2, t: "Defina dias e horário", icon: Clock },
                { n: 3, t: "Configure envio", icon: Activity },
              ].map((step) => (
                <div key={step.n} className="rounded-lg border border-border/50 bg-muted/20 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center">
                      {step.n}
                    </span>
                    <step.icon className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-foreground/80">{step.t}</p>
                </div>
              ))}
            </div>
            <Button variant="default" size="sm" className="mt-6 gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> Criar agendamento automático
            </Button>
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
                        <Activity className="w-3 h-3" />
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

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-primary" /> Novo Agendamento Auto Save
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground/70 mb-2 block">Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground/70 mb-2 block">
                Instâncias ({selectedDevices.length} selecionadas)
              </Label>
              <Card className="p-2 max-h-44 overflow-y-auto">
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

            {/* Weekly recurring config */}
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
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground hover:text-primary"
                  onClick={() => setSelectedWeekdays([1, 2, 3, 4, 5])}
                >
                  Seg a Sex
                </button>
                <span className="text-[11px] text-muted-foreground/30">·</span>
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground hover:text-primary"
                  onClick={() => setSelectedWeekdays([0, 1, 2, 3, 4, 5, 6])}
                >
                  Todos
                </button>
                <span className="text-[11px] text-muted-foreground/30">·</span>
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground hover:text-primary"
                  onClick={() => setSelectedWeekdays([])}
                >
                  Limpar
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground/70 mb-2 block">Horário</Label>
                <Input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground/70 mb-2 block">Mensagens por contato</Label>
                <Input
                  type="number"
                  min={1}
                  value={msgsPerInstance || ""}
                  placeholder="ex: 3"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") return setMsgsPerInstance(1);
                    const n = parseInt(v, 10);
                    if (!isNaN(n)) setMsgsPerInstance(Math.max(1, n));
                  }}
                />
              </div>
            </div>

            {/* Pausa entre lotes (por instância) */}
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-semibold uppercase tracking-wider">Intervalo e pausa (por instância)</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Intervalo entre msgs mín (s)</Label>
                  <Input
                    type="number"
                    min={5}
                    value={minDelay}
                    onChange={(e) => setMinDelay(Math.max(5, parseInt(e.target.value) || 5))}
                    onBlur={() => { if (maxDelay < minDelay) setMaxDelay(minDelay); }}
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Intervalo entre msgs máx (s)</Label>
                  <Input
                    type="number"
                    min={minDelay}
                    value={maxDelay}
                    onChange={(e) => setMaxDelay(Math.max(minDelay, parseInt(e.target.value) || minDelay))}
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Pausar a cada (mín)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={pauseEveryMin || ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      const n = v === "" ? 1 : parseInt(v, 10);
                      if (!isNaN(n)) setPauseEveryMin(Math.max(1, n));
                    }}
                    onBlur={() => { if (pauseEveryMax < pauseEveryMin) setPauseEveryMax(pauseEveryMin); }}
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Pausar a cada (máx)</Label>
                  <Input
                    type="number"
                    min={pauseEveryMin}
                    value={pauseEveryMax || ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      const n = v === "" ? pauseEveryMin : parseInt(v, 10);
                      if (!isNaN(n)) setPauseEveryMax(Math.max(pauseEveryMin, n));
                    }}
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Duração da pausa mín (s)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={pauseDurationMin || ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      const n = v === "" ? 1 : parseInt(v, 10);
                      if (!isNaN(n)) setPauseDurationMin(Math.max(1, n));
                    }}
                    onBlur={() => { if (pauseDurationMax < pauseDurationMin) setPauseDurationMax(pauseDurationMin); }}
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Duração da pausa máx (s)</Label>
                  <Input
                    type="number"
                    min={pauseDurationMin}
                    value={pauseDurationMax || ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      const n = v === "" ? pauseDurationMin : parseInt(v, 10);
                      if (!isNaN(n)) setPauseDurationMax(Math.max(pauseDurationMin, n));
                    }}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground/80">
                Intervalo entre cada msg: <span className="text-foreground font-medium">{minDelay}–{maxDelay}s</span> aleatório.
                Cada chip envia entre <span className="text-foreground font-medium">{pauseEveryMin}–{pauseEveryMax}</span> mensagens
                e então pausa por <span className="text-foreground font-medium">{pauseDurationMin}–{pauseDurationMax}s</span>.
              </p>
            </div>

            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold uppercase tracking-wider">Progressão automática</span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Limite inicial</Label>
                  <Input
                    type="number"
                    min={1}
                    value={initialLimit}
                    placeholder="ex: 20"
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") return setInitialLimit("");
                      const n = parseInt(v, 10);
                      if (!isNaN(n) && n >= 0) setInitialLimit(n);
                    }}
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Aumento por dia</Label>
                  <Input
                    type="number"
                    min={0}
                    value={dailyIncrement}
                    placeholder="ex: 5"
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") return setDailyIncrement("");
                      const n = parseInt(v, 10);
                      if (!isNaN(n) && n >= 0) setDailyIncrement(n);
                    }}
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Limite máximo</Label>
                  <Input
                    type="number"
                    min={1}
                    value={maxLimit}
                    placeholder="ex: 100"
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") return setMaxLimit("");
                      const n = parseInt(v, 10);
                      if (!isNaN(n) && n >= 0) setMaxLimit(n);
                    }}
                  />
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground/80">
                Cada chip começa enviando <span className="text-foreground font-medium">{typeof initialLimit === "number" ? initialLimit : "—"}</span> mensagens por dia
                e aumenta automaticamente <span className="text-foreground font-medium">+{typeof dailyIncrement === "number" ? dailyIncrement : "—"}</span> por dia
                até o limite máximo de <span className="text-foreground font-medium">{typeof maxLimit === "number" ? maxLimit : "—"}</span>.
              </p>
            </div>

            <div className="rounded-md bg-primary/5 border border-primary/20 p-3">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <Repeat className="w-3 h-3 inline mr-1 text-primary" />
                <span className="text-foreground font-medium">Execução recorrente:</span>{" "}
                {selectedWeekdays.length > 0
                  ? `${weekdaysLabel(selectedWeekdays)} às ${timeOfDay}`
                  : "selecione os dias"}
                . Base Auto Save com {autosaveCount} contatos. Cada instância envia <span className="text-foreground font-medium">{msgsPerInstance}</span> mensagem{msgsPerInstance !== 1 ? "s" : ""} por contato (respeitando intervalo e pausas). O limite diário por instância é definido pela progressão automática.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleCreate} disabled={createMut.isPending}>
                {createMut.isPending ? "Criando..." : "Criar Agendamento"}
              </Button>
            </div>
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
