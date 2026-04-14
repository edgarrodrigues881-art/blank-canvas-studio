import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  CalendarClock,
  Plus,
  Search,
  CalendarIcon,
  Clock,
  MessageSquare,
  Users,
  Phone as PhoneIcon,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/utils/formatters";
import { format, isBefore, isToday, isTomorrow, addHours } from "date-fns";
import { ptBR } from "date-fns/locale";

/* ── Config ── */
const TYPE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  followup: { label: "Follow-up", icon: "📞", color: "bg-primary/10 text-primary border-primary/20" },
  reuniao: { label: "Reunião", icon: "🤝", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  retorno: { label: "Retorno", icon: "🔄", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-400",
  processing: "bg-blue-500/15 text-blue-400",
  sent: "bg-emerald-500/15 text-emerald-400",
  failed: "bg-red-500/15 text-red-400",
  retry: "bg-orange-500/15 text-orange-400",
};

interface ScheduleItem {
  id: string;
  contact_name: string;
  contact_phone: string;
  message_content: string;
  scheduled_at: string;
  status: string;
  schedule_type: string;
  lead_id: string | null;
  sent_at: string | null;
  error_message: string | null;
  device_id: string | null;
  created_at: string;
}

interface LeadOption {
  id: string;
  name: string;
  phone: string;
}

export default function CRMAgendamentos() {
  const { user } = useAuth();
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [leadSearch, setLeadSearch] = useState("");
  const [devices, setDevices] = useState<{ id: string; name: string }[]>([]);

  /* Form state */
  const [form, setForm] = useState({
    lead_id: "",
    contact_name: "",
    contact_phone: "",
    message_content: "",
    schedule_type: "followup",
    device_id: "",
    date: undefined as Date | undefined,
    time: "09:00",
  });

  /* ── Fetch schedules ── */
  const fetchItems = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("scheduled_messages")
      .select("*")
      .eq("user_id", user.id)
      .order("scheduled_at", { ascending: true });
    setItems((data as any[]) || []);
    setLoading(false);
  }, [user]);

  /* ── Fetch leads for autocomplete ── */
  const fetchLeads = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("service_contacts")
      .select("id, name, phone")
      .eq("user_id", user.id)
      .order("name");
    setLeads((data as any[]) || []);
  }, [user]);

  /* ── Fetch devices ── */
  const fetchDevices = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("devices")
      .select("id, name")
      .eq("user_id", user.id)
      .in("status", ["Ready", "Connected", "authenticated"])
      .neq("login_type", "report_wa");
    setDevices((data as any[]) || []);
  }, [user]);

  useEffect(() => {
    fetchItems();
    fetchLeads();
    fetchDevices();
  }, [fetchItems, fetchLeads, fetchDevices]);

  /* ── Derived ── */
  const filtered = items.filter((i) => {
    const s = search.toLowerCase();
    const matchSearch = !search || i.contact_name?.toLowerCase().includes(s) || i.contact_phone?.includes(search);
    const matchType = filterType === "all" || i.schedule_type === filterType;
    const matchStatus = filterStatus === "all" || i.status === filterStatus;
    return matchSearch && matchType && matchStatus;
  });

  const pending = items.filter((i) => i.status === "pending");
  const todayCount = items.filter((i) => i.scheduled_at && isToday(new Date(i.scheduled_at))).length;
  const sentCount = items.filter((i) => i.status === "sent").length;

  /* ── Lead selection ── */
  const selectLead = (lead: LeadOption) => {
    setForm((f) => ({
      ...f,
      lead_id: lead.id,
      contact_name: lead.name,
      contact_phone: lead.phone,
    }));
    setLeadSearch("");
  };

  const filteredLeads = leadSearch
    ? leads.filter(
        (l) =>
          l.name?.toLowerCase().includes(leadSearch.toLowerCase()) ||
          l.phone?.includes(leadSearch)
      ).slice(0, 8)
    : [];

  /* ── Create ── */
  const openNew = () => {
    setForm({
      lead_id: "",
      contact_name: "",
      contact_phone: "",
      message_content: "",
      schedule_type: "followup",
      device_id: devices[0]?.id || "",
      date: addHours(new Date(), 1),
      time: format(addHours(new Date(), 1), "HH:mm"),
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user || !form.date || !form.contact_phone) return;

    const [hours, minutes] = form.time.split(":").map(Number);
    const scheduledAt = new Date(form.date);
    scheduledAt.setHours(hours, minutes, 0, 0);

    const payload: any = {
      user_id: user.id,
      contact_name: form.contact_name || form.contact_phone,
      contact_phone: form.contact_phone,
      message_content: form.message_content,
      scheduled_at: scheduledAt.toISOString(),
      schedule_type: form.schedule_type,
      lead_id: form.lead_id || null,
      device_id: form.device_id || null,
      status: "pending",
    };

    const { error } = await supabase.from("scheduled_messages").insert(payload);
    if (error) {
      toast.error("Erro ao criar agendamento");
      return;
    }
    toast.success("Agendamento criado!");
    setDialogOpen(false);
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("scheduled_messages").delete().eq("id", id);
    toast.success("Agendamento removido");
    fetchItems();
  };

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isToday(d)) return `Hoje, ${format(d, "HH:mm")}`;
    if (isTomorrow(d)) return `Amanhã, ${format(d, "HH:mm")}`;
    return format(d, "dd/MM/yyyy HH:mm");
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarClock className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Agendamentos</h1>
          <Badge variant="secondary" className="text-xs">{items.length}</Badge>
        </div>
        <Button size="sm" onClick={openNew} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Novo Agendamento
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Pendentes", value: pending.length, icon: Clock, color: "text-amber-400" },
          { label: "Hoje", value: todayCount, icon: CalendarIcon, color: "text-primary" },
          { label: "Enviados", value: sentCount, icon: CheckCircle2, color: "text-emerald-400" },
          { label: "Total", value: items.length, icon: MessageSquare, color: "text-foreground" },
        ].map((s) => (
          <Card key={s.label} className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={cn("w-5 h-5", s.color)} />
              <div>
                <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="followup">📞 Follow-up</SelectItem>
            <SelectItem value="reuniao">🤝 Reunião</SelectItem>
            <SelectItem value="retorno">🔄 Retorno</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="sent">Enviado</SelectItem>
            <SelectItem value="failed">Erro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="bg-card border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Mensagem</TableHead>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Nenhum agendamento</TableCell></TableRow>
            ) : (
              filtered.map((item) => {
                const typeCfg = TYPE_CONFIG[item.schedule_type] || TYPE_CONFIG.followup;
                const isPast = isBefore(new Date(item.scheduled_at), new Date()) && item.status === "pending";
                return (
                  <TableRow key={item.id} className={isPast ? "opacity-60" : ""}>
                    <TableCell>
                      <span className={cn("text-[11px] px-2 py-1 rounded-md font-semibold border", typeCfg.color)}>
                        {typeCfg.icon} {typeCfg.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.contact_name}</p>
                        <p className="text-[11px] text-muted-foreground">{formatPhone(item.contact_phone)}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs text-muted-foreground line-clamp-2 max-w-[200px]">{item.message_content || "—"}</p>
                    </TableCell>
                    <TableCell>
                      <span className={cn("text-xs font-medium", isPast ? "text-red-400" : "text-foreground")}>
                        {formatDateLabel(item.scheduled_at)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("text-[10px]", STATUS_COLORS[item.status] || "bg-muted text-muted-foreground")}>
                        {item.status === "pending" ? "Pendente" : item.status === "sent" ? "Enviado" : item.status === "failed" ? "Erro" : item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* ── Create dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Agendamento</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* Lead search */}
            <div className="space-y-1.5">
              <Label>Lead vinculado</Label>
              {form.lead_id ? (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border">
                  <Users className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">{form.contact_name}</span>
                  <span className="text-xs text-muted-foreground">{formatPhone(form.contact_phone)}</span>
                  <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" onClick={() => setForm((f) => ({ ...f, lead_id: "", contact_name: "", contact_phone: "" }))}>
                    ×
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    placeholder="Buscar lead por nome ou telefone..."
                    value={leadSearch}
                    onChange={(e) => setLeadSearch(e.target.value)}
                  />
                  {filteredLeads.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredLeads.map((l) => (
                        <button
                          key={l.id}
                          className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center gap-2 text-sm"
                          onClick={() => selectLead(l)}
                        >
                          <Users className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="font-medium">{l.name}</span>
                          <span className="text-xs text-muted-foreground ml-auto">{formatPhone(l.phone)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Manual phone/name if no lead selected */}
            {!form.lead_id && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nome</Label>
                  <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Telefone *</Label>
                  <Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} placeholder="5511999999999" />
                </div>
              </div>
            )}

            {/* Type + Device */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.schedule_type} onValueChange={(v) => setForm({ ...form, schedule_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="followup">📞 Follow-up</SelectItem>
                    <SelectItem value="reuniao">🤝 Reunião</SelectItem>
                    <SelectItem value="retorno">🔄 Retorno</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Instância</Label>
                <Select value={form.device_id} onValueChange={(v) => setForm({ ...form, device_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {devices.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Date + Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.date ? format(form.date, "dd/MM/yyyy") : "Selecionar data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.date}
                      onSelect={(d) => setForm({ ...form, date: d || undefined })}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>Horário</Label>
                <Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
              </div>
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <Label>Mensagem</Label>
              <Textarea
                value={form.message_content}
                onChange={(e) => setForm({ ...form, message_content: e.target.value })}
                rows={3}
                placeholder="Mensagem que será enviada automaticamente..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.contact_phone || !form.date}>Criar Agendamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
