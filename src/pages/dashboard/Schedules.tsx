import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, Plus, Pencil, XCircle, Send, CalendarClock } from "lucide-react";

interface ScheduledMessage {
  id: string;
  contact_name: string;
  contact_phone: string;
  message_content: string;
  scheduled_at: string;
  status: string;
  device_id: string | null;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

interface Device {
  id: string;
  name: string;
  number: string | null;
  status: string;
}

export default function Schedules() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<ScheduledMessage[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledMessage | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");

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
    const { data } = await supabase
      .from("scheduled_messages")
      .select("*")
      .eq("user_id", user.id)
      .order("scheduled_at", { ascending: true });
    setSchedules((data as any[]) || []);
    setLoading(false);
  }, [user]);

  const fetchDevices = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("devices")
      .select("id, name, number, status")
      .eq("user_id", user.id)
      .neq("login_type", "report_wa");
    setDevices((data as Device[]) || []);
  }, [user]);

  useEffect(() => {
    fetchSchedules();
    fetchDevices();
  }, [fetchSchedules, fetchDevices]);

  const filtered = schedules.filter(s => filterStatus === "all" || s.status === filterStatus);

  const openNew = () => {
    setEditing(null);
    setForm({ contact_name: "", contact_phone: "", message_content: "", date: "", time: "", device_id: "" });
    setDialogOpen(true);
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
    setDialogOpen(true);
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
      toast.success("Agendamento atualizado com sucesso");
    } else {
      const { error } = await supabase.from("scheduled_messages").insert(payload as any);
      if (error) { toast.error("Erro ao criar"); return; }
      toast.success("Agendamento criado com sucesso");
    }
    setDialogOpen(false);
    fetchSchedules();
  };

  const handleCancel = async (id: string) => {
    await supabase.from("scheduled_messages").update({ status: "cancelled" } as any).eq("id", id);
    toast.success("Agendamento cancelado");
    fetchSchedules();
  };

  const statusConfig: Record<string, { label: string; className: string }> = {
    pending: { label: "Pendente", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    sent: { label: "Enviado", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    cancelled: { label: "Cancelado", className: "bg-muted text-muted-foreground border-muted" },
    failed: { label: "Falhou", className: "bg-destructive/15 text-destructive border-destructive/30" },
  };

  const connectedDevices = devices.filter(d => ["Ready", "Connected", "authenticated"].includes(d.status));

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CalendarClock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Agendamentos</h1>
            <p className="text-xs text-muted-foreground">
              {schedules.filter(s => s.status === "pending").length} pendentes · {schedules.filter(s => s.status === "sent").length} enviados
            </p>
          </div>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4 mr-1.5" /> Novo Agendamento
        </Button>
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="sent">Enviado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
            <SelectItem value="failed">Falhou</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="font-semibold">Contato</TableHead>
              <TableHead className="font-semibold">Telefone</TableHead>
              <TableHead className="font-semibold hidden md:table-cell">Mensagem</TableHead>
              <TableHead className="font-semibold">Data/Hora</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Nenhum agendamento encontrado</TableCell></TableRow>
            ) : filtered.map(s => {
              const sc = statusConfig[s.status] || statusConfig.pending;
              return (
                <TableRow key={s.id} className="hover:bg-muted/20 transition-colors">
                  <TableCell className="font-medium">{s.contact_name || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{s.contact_phone}</TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[200px] truncate">{s.message_content}</TableCell>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-muted-foreground" />
                      {format(new Date(s.scheduled_at), "dd/MM/yyyy")}
                      <Clock className="w-3 h-3 text-muted-foreground ml-1" />
                      {format(new Date(s.scheduled_at), "HH:mm")}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${sc.className}`}>{sc.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {s.status === "pending" && (
                        <>
                          <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleCancel(s.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive">
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* New/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
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
