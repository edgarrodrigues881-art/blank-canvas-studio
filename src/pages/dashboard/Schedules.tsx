import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, CalendarClock } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import ScheduleCalendarGrid from "@/components/schedules/ScheduleCalendarGrid";
import DayDetailSheet from "@/components/schedules/DayDetailSheet";
import SendNowDialog from "@/components/schedules/SendNowDialog";
import NewScheduleDialog from "@/components/schedules/NewScheduleDialog";
import { ScheduledMessage, Device } from "@/components/schedules/types";

export default function Schedules() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<ScheduledMessage[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Dialogs
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledMessage | null>(null);
  const [daySheetOpen, setDaySheetOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [sendNowOpen, setSendNowOpen] = useState(false);
  const [sendNowTarget, setSendNowTarget] = useState<ScheduledMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<{ id: string; newDate: Date; schedule: ScheduledMessage } | null>(null);

  const [editInitialDate, setEditInitialDate] = useState("");
  const [editInitialTime, setEditInitialTime] = useState("");

  const fetchSchedules = useCallback(async () => {
    if (!user) return;
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const { data } = await supabase
      .from("scheduled_messages")
      .select("*")
      .eq("user_id", user.id)
      .gte("scheduled_at", start.toISOString())
      .lte("scheduled_at", end.toISOString())
      .order("scheduled_at", { ascending: true });
    setSchedules((data as any[]) || []);
    setLoading(false);
  }, [user, currentMonth]);

  const fetchDevices = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("devices")
      .select("id, name, number, status")
      .eq("user_id", user.id)
      .neq("login_type", "report_wa");
    setDevices((data as Device[]) || []);
  }, [user]);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);
  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  // Realtime subscription for status updates
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("scheduled-messages-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "scheduled_messages", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const updated = payload.new as any;
          setSchedules(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);


  const pendingCount = useMemo(() => schedules.filter(s => s.status === "pending").length, [schedules]);
  const sentCount = useMemo(() => schedules.filter(s => s.status === "sent").length, [schedules]);

  const daySchedules = useMemo(() => {
    if (!selectedDay) return [];
    return schedules.filter(s => isSameDay(new Date(s.scheduled_at), selectedDay));
  }, [schedules, selectedDay]);

  // Navigation
  const prevMonth = () => { setCurrentMonth(m => subMonths(m, 1)); setLoading(true); };
  const nextMonth = () => { setCurrentMonth(m => addMonths(m, 1)); setLoading(true); };

  // Day click
  const handleDayClick = (date: Date) => {
    setSelectedDay(date);
    setDaySheetOpen(true);
  };

  // New / Edit
  const openNew = () => {
    setEditing(null);
    setEditInitialDate("");
    setEditInitialTime("");
    setEditDialogOpen(true);
  };

  const openNewForDay = (date: Date) => {
    setEditing(null);
    setEditInitialDate(format(date, "yyyy-MM-dd"));
    setEditInitialTime("");
    setEditDialogOpen(true);
  };

  const openNewAtTime = (date: Date, time: string) => {
    setEditing(null);
    setEditInitialDate(format(date, "yyyy-MM-dd"));
    setEditInitialTime(time);
    setDaySheetOpen(false);
    setEditDialogOpen(true);
  };

  const handleRescheduleTime = async (id: string, newHour: number, newMinute: number) => {
    const s = schedules.find(x => x.id === id);
    if (!s || !selectedDay) return;
    const newScheduled = new Date(s.scheduled_at);
    newScheduled.setHours(newHour, newMinute, 0, 0);

    // Optimistic
    setSchedules(prev => prev.map(x => x.id === id ? { ...x, scheduled_at: newScheduled.toISOString() } : x));

    const { error } = await supabase
      .from("scheduled_messages")
      .update({ scheduled_at: newScheduled.toISOString() } as any)
      .eq("id", id);

    if (error) {
      toast.error("Erro ao reagendar horário");
      fetchSchedules();
    } else {
      toast.success(`Reagendado para ${String(newHour).padStart(2, "0")}:${String(newMinute).padStart(2, "0")}`);
    }
  };

  const openEdit = (s: ScheduledMessage) => {
    setEditing(s);
    const dt = new Date(s.scheduled_at);
    setEditInitialDate(format(dt, "yyyy-MM-dd"));
    setEditInitialTime(format(dt, "HH:mm"));
    setEditDialogOpen(true);
  };

  // Cancel (delete)
  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    await supabase.from("scheduled_messages").update({ status: "cancelled" } as any).eq("id", cancelTarget);
    toast.success("Agendamento cancelado");
    setCancelTarget(null);
    fetchSchedules();
  };

  // Reschedule (drag & drop)
  const handleReschedule = (scheduleId: string, newDate: Date) => {
    const s = schedules.find(x => x.id === scheduleId);
    if (!s) return;
    setRescheduleTarget({ id: scheduleId, newDate, schedule: s });
  };

  const handleConfirmReschedule = async () => {
    if (!rescheduleTarget) return;
    const { id, newDate, schedule } = rescheduleTarget;
    // Keep the original time, change only the date
    const original = new Date(schedule.scheduled_at);
    const newScheduled = new Date(newDate);
    newScheduled.setHours(original.getHours(), original.getMinutes(), original.getSeconds());

    // Optimistic update
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, scheduled_at: newScheduled.toISOString() } : s));
    setRescheduleTarget(null);

    const { error } = await supabase
      .from("scheduled_messages")
      .update({ scheduled_at: newScheduled.toISOString() } as any)
      .eq("id", id);

    if (error) {
      toast.error("Erro ao reagendar");
      fetchSchedules(); // revert
    } else {
      toast.success("Agendamento reagendado com sucesso");
    }
  };

  // Send now
  const handleSendNow = (s: ScheduledMessage) => {
    setSendNowTarget(s);
    setSendNowOpen(true);
  };

  const handleConfirmSend = async (id: string, deviceId: string | null) => {
    setSending(true);
    try {
      // Set scheduled_at to now + assign device so the worker picks it up immediately
      const payload: any = {
        scheduled_at: new Date().toISOString(),
        status: "pending",
        attempts: 0,
        next_retry_at: null,
        error_message: null,
      };
      if (deviceId) payload.device_id = deviceId;
      const { error } = await supabase.from("scheduled_messages").update(payload).eq("id", id);
      if (error) throw error;
      toast.success("Mensagem adicionada à fila de envio");
      setSendNowOpen(false);
      // Optimistic update
      setSchedules(prev => prev.map(s => s.id === id ? { ...s, ...payload } : s));
    } catch {
      toast.error("Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CalendarClock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Agendamentos</h1>
            <p className="text-xs text-muted-foreground">
              {pendingCount} pendentes · {sentCount} enviados
            </p>
          </div>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4 mr-1.5" /> Novo Agendamento
        </Button>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={prevMonth} className="gap-1">
          <ChevronLeft className="w-4 h-4" /> Anterior
        </Button>
        <h2 className="text-sm font-semibold text-foreground capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
        </h2>
        <Button variant="ghost" size="sm" onClick={nextMonth} className="gap-1">
          Próximo <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div className="rounded-xl border border-border bg-card flex items-center justify-center py-24 text-muted-foreground text-sm">
          Carregando...
        </div>
      ) : (
        <ScheduleCalendarGrid
          currentMonth={currentMonth}
          schedules={schedules}
          onDayClick={handleDayClick}
          onSendNow={handleSendNow}
          onEdit={openEdit}
          onCancel={(id) => setCancelTarget(id)}
          onNewForDay={openNewForDay}
          onReschedule={handleReschedule}
        />
      )}

      {/* Day detail sheet (timeline) */}
      <DayDetailSheet
        open={daySheetOpen}
        onOpenChange={setDaySheetOpen}
        date={selectedDay}
        schedules={daySchedules}
        onEdit={(s) => { setDaySheetOpen(false); openEdit(s); }}
        onCancel={(id) => { setDaySheetOpen(false); setCancelTarget(id); }}
        onSendNow={(s) => { setDaySheetOpen(false); handleSendNow(s); }}
        onNewAtTime={openNewAtTime}
        onRescheduleTime={handleRescheduleTime}
      />

      {/* Send now dialog */}
      <SendNowDialog
        open={sendNowOpen}
        onOpenChange={setSendNowOpen}
        schedule={sendNowTarget}
        devices={devices}
        onConfirm={handleConfirmSend}
        sending={sending}
      />

      {/* Cancel confirmation */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) setCancelTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar agendamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar este agendamento? A ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Cancelar agendamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reschedule confirmation */}
      <AlertDialog open={!!rescheduleTarget} onOpenChange={(o) => { if (!o) setRescheduleTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reagendar mensagem</AlertDialogTitle>
            <AlertDialogDescription>
              {rescheduleTarget && (
                <>
                  Mover agendamento de <strong>{rescheduleTarget.schedule.contact_name || rescheduleTarget.schedule.contact_phone}</strong> para{" "}
                  <strong>{format(rescheduleTarget.newDate, "dd/MM/yyyy")}</strong> mantendo o horário original ({format(new Date(rescheduleTarget.schedule.scheduled_at), "HH:mm")})?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Desfazer</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReschedule}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New/Edit Dialog */}
      <NewScheduleDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        devices={devices}
        editing={editing}
        initialDate={editInitialDate}
        initialTime={editInitialTime}
        onSaved={fetchSchedules}
      />
    </div>
  );
}
