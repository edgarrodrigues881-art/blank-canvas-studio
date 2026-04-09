import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Plus, Send, CalendarClock } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import ScheduleCalendarGrid from "@/components/schedules/ScheduleCalendarGrid";
import DayDetailSheet from "@/components/schedules/DayDetailSheet";
import SendNowDialog from "@/components/schedules/SendNowDialog";
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

  const [form, setForm] = useState({
    contact_name: "",
    contact_phone: "",
    message_content: "",
    date: "",
    time: "",
    device_id: "",
  });

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

  const connectedDevices = useMemo(() =>
    devices.filter(d => ["Ready", "Connected", "authenticated"].includes(d.status)),
    [devices]
  );

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
    setForm({ contact_name: "", contact_phone: "", message_content: "", date: "", time: "", device_id: "" });
    setEditDialogOpen(true);
  };

  const openNewForDay = (date: Date) => {
    setEditing(null);
    setForm({ contact_name: "", contact_phone: "", message_content: "", date: format(date, "yyyy-MM-dd"), time: "", device_id: "" });
    setEditDialogOpen(true);
  };

  const openEdit = (s: ScheduledMessage) => {
    setEditing(s);
    const dt = new Date(s.scheduled_at);
    setForm({
      contact_name: s.contact_name,
      contact_phone: s.contact_phone,
      message_content: s.message_content,
      date: format(dt, "yyyy-MM-dd"),
      time: format(dt, "HH:mm"),
      device_id: s.device_id || "",
    });
    setEditDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user || !form.contact_phone || !form.message_content || !form.date || !form.time) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    const scheduled_at = new Date(`${form.date}T${form.time}:00`).toISOString();
    const payload = {
      user_id: user.id,
      contact_name: form.contact_name,
      contact_phone: form.contact_phone,
      message_content: form.message_content,
      scheduled_at,
      device_id: form.device_id || null,
    };

    if (editing) {
      const { error } = await supabase.from("scheduled_messages").update(payload as any).eq("id", editing.id);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Agendamento atualizado");
    } else {
      const { error } = await supabase.from("scheduled_messages").insert(payload as any);
      if (error) { toast.error("Erro ao criar"); return; }
      toast.success("Agendamento criado");
    }
    setEditDialogOpen(false);
    fetchSchedules();
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
      const payload: any = { status: "sent", sent_at: new Date().toISOString() };
      if (deviceId) payload.device_id = deviceId;
      const { error } = await supabase.from("scheduled_messages").update(payload).eq("id", id);
      if (error) throw error;
      toast.success("Mensagem enviada com sucesso");
      setSendNowOpen(false);
      fetchSchedules();
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

      {/* Day detail sheet */}
      <DayDetailSheet
        open={daySheetOpen}
        onOpenChange={setDaySheetOpen}
        date={selectedDay}
        schedules={daySchedules}
        onEdit={(s) => { setDaySheetOpen(false); openEdit(s); }}
        onCancel={(id) => { setDaySheetOpen(false); setCancelTarget(id); }}
        onSendNow={(s) => { setDaySheetOpen(false); handleSendNow(s); }}
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

      {/* New/Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Agendamento" : "Novo Agendamento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Nome do contato</Label><Input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Nome" /></div>
            <div><Label>Telefone *</Label><Input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="5511999999999" /></div>
            <div><Label>Mensagem *</Label><Textarea value={form.message_content} onChange={e => setForm(f => ({ ...f, message_content: e.target.value }))} placeholder="Mensagem a enviar" rows={3} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Data *</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
              <div><Label>Hora *</Label><Input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} /></div>
            </div>
            <div>
              <Label>Instância (opcional)</Label>
              <Select value={form.device_id || "auto"} onValueChange={v => setForm(f => ({ ...f, device_id: v === "auto" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Automático" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automático (primeira disponível)</SelectItem>
                  {connectedDevices.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name} {d.number ? `(${d.number})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.contact_phone || !form.message_content || !form.date || !form.time}>
              <Send className="w-4 h-4 mr-1.5" />
              {editing ? "Salvar" : "Agendar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
