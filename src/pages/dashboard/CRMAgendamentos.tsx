import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CalendarClock, Plus, Search, Clock, MessageSquare, Users,
  Phone as PhoneIcon, Trash2, CheckCircle2, AlertTriangle,
  Send, ArrowRight, Flame, Snowflake, ThermometerSun,
  BarChart3, TrendingUp, CalendarCheck, Loader2, ChevronRight,
  Zap, UserCheck, StickyNote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/utils/formatters";
import { format, isBefore, isToday, isTomorrow, isAfter, addHours, differenceInMinutes, differenceInHours, differenceInDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

/* ── Configs ── */
const TYPE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  followup: { label: "Follow-up", icon: "📞", color: "bg-primary/10 text-primary border-primary/20" },
  reuniao: { label: "Reunião", icon: "🤝", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  retorno: { label: "Retorno", icon: "🔄", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  automatico: { label: "Automático", icon: "⚡", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
};

const STATUS_COLORS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  processing: { label: "Enviando...", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  sent: { label: "Enviado", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  failed: { label: "Erro", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  retry: { label: "Retentando", cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  overdue: { label: "Atrasado", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  done: { label: "Concluído", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  cancelled: { label: "Cancelado", cls: "bg-muted text-muted-foreground border-border" },
};

const TEMP_CONFIG: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  frio: { label: "Frio", icon: Snowflake, cls: "text-sky-400" },
  morno: { label: "Morno", icon: ThermometerSun, cls: "text-amber-400" },
  quente: { label: "Quente", icon: Flame, cls: "text-rose-400" },
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
  // Extended fields (stored in message_content as JSON or separate columns)
  temperature?: string;
  estimated_value?: number;
  notes?: string;
  objective?: string;
  assigned_to?: string;
}

interface LeadOption { id: string; name: string; phone: string; }
interface DeviceOption { id: string; name: string; status: string; }

/* ── Helpers ── */
function timeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const mins = differenceInMinutes(now, d);
  if (mins < 0) {
    const futMins = Math.abs(mins);
    if (futMins < 60) return `em ${futMins}m`;
    const futHrs = differenceInHours(d, now);
    if (futHrs < 24) return `em ${futHrs}h`;
    return `em ${differenceInDays(d, now)}d`;
  }
  if (mins < 60) return `${mins}m`;
  const hrs = differenceInHours(now, d);
  if (hrs < 24) return `${hrs}h`;
  return `${differenceInDays(now, d)}d`;
}

function currencyShort(v: number): string {
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(1).replace(".0", "")}k`;
  return `R$ ${v}`;
}

function isOverdue(item: ScheduleItem): boolean {
  return item.status === "pending" && isBefore(new Date(item.scheduled_at), new Date());
}

function getEffectiveStatus(item: ScheduleItem): string {
  if (isOverdue(item)) return "overdue";
  return item.status;
}

export default function CRMAgendamentos() {
  const { user } = useAuth();
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [leadSearch, setLeadSearch] = useState("");
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [activeTab, setActiveTab] = useState("followups");

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
    temperature: "",
    estimated_value: "",
    notes: "",
    objective: "",
  });

  /* ── Fetch ── */
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

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("service_contacts")
      .select("id, name, phone")
      .eq("user_id", user.id)
      .order("name");
    setLeads((data as any[]) || []);
  }, [user]);

  const fetchDevices = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("devices")
      .select("id, name, status")
      .eq("user_id", user.id)
      .in("status", ["Ready", "Connected", "authenticated"])
      .neq("login_type", "report_wa");
    setDevices((data as any[]) || []);
  }, [user]);

  useEffect(() => { fetchItems(); fetchLeads(); fetchDevices(); }, [fetchItems, fetchLeads, fetchDevices]);

  /* ── Derived data ── */
  const followups = useMemo(() =>
    items.filter(i => i.schedule_type !== "automatico"), [items]);

  const automatics = useMemo(() =>
    items.filter(i => i.schedule_type === "automatico"), [items]);

  const todayFollowups = useMemo(() =>
    followups.filter(i => isToday(new Date(i.scheduled_at))), [followups]);

  const overdueItems = useMemo(() =>
    followups.filter(i => isOverdue(i)), [followups]);

  const doneToday = useMemo(() =>
    followups.filter(i => i.status === "sent" && i.sent_at && isToday(new Date(i.sent_at))), [followups]);

  /* Grouped follow-ups */
  const grouped = useMemo(() => {
    const now = new Date();
    const todayEnd = endOfDay(now);
    const tomorrowEnd = endOfDay(new Date(now.getTime() + 86400000));

    const today: ScheduleItem[] = [];
    const tomorrow: ScheduleItem[] = [];
    const future: ScheduleItem[] = [];
    const past: ScheduleItem[] = [];

    followups.filter(i => {
      if (search) {
        const s = search.toLowerCase();
        return i.contact_name?.toLowerCase().includes(s) || i.contact_phone?.includes(search);
      }
      return true;
    }).forEach(i => {
      const d = new Date(i.scheduled_at);
      if (i.status === "sent" || i.status === "cancelled") return;
      if (isBefore(d, startOfDay(now)) || isOverdue(i)) past.push(i);
      else if (isToday(d)) today.push(i);
      else if (isTomorrow(d)) tomorrow.push(i);
      else future.push(i);
    });

    return { past, today, tomorrow, future };
  }, [followups, search]);

  /* Filtered automatics */
  const filteredAutomatics = useMemo(() => {
    if (!search) return automatics;
    const s = search.toLowerCase();
    return automatics.filter(i => i.contact_name?.toLowerCase().includes(s) || i.contact_phone?.includes(search));
  }, [automatics, search]);

  /* ── Lead selection ── */
  const selectLead = (lead: LeadOption) => {
    setForm(f => ({ ...f, lead_id: lead.id, contact_name: lead.name, contact_phone: lead.phone }));
    setLeadSearch("");
  };

  const filteredLeads = leadSearch
    ? leads.filter(l => l.name?.toLowerCase().includes(leadSearch.toLowerCase()) || l.phone?.includes(leadSearch)).slice(0, 8)
    : [];

  /* ── Create ── */
  const openNew = (type: string = "followup") => {
    setForm({
      lead_id: "", contact_name: "", contact_phone: "", message_content: "",
      schedule_type: type, device_id: devices[0]?.id || "",
      date: addHours(new Date(), 1), time: format(addHours(new Date(), 1), "HH:mm"),
      temperature: "", estimated_value: "", notes: "", objective: "",
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
    if (error) { toast.error("Erro ao criar agendamento"); return; }
    toast.success("Agendamento criado!");
    setDialogOpen(false);
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("scheduled_messages").delete().eq("id", id);
    toast.success("Agendamento removido");
    fetchItems();
  };

  const handleMarkDone = async (id: string) => {
    await supabase.from("scheduled_messages").update({ status: "sent", sent_at: new Date().toISOString() } as any).eq("id", id);
    toast.success("Marcado como concluído");
    fetchItems();
  };

  /* ── Stats for Produtividade ── */
  const weekStats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const weekItems = items.filter(i => new Date(i.created_at) >= weekAgo);
    const sent = weekItems.filter(i => i.status === "sent").length;
    const total = weekItems.length;
    return { sent, total, rate: total > 0 ? Math.round((sent / total) * 100) : 0 };
  }, [items]);

  /* ── Render helpers ── */
  const FollowupCard = ({ item }: { item: ScheduleItem }) => {
    const overdue = isOverdue(item);
    const effStatus = getEffectiveStatus(item);
    const statusCfg = STATUS_COLORS[effStatus] || STATUS_COLORS.pending;
    const tempCfg = item.temperature ? TEMP_CONFIG[item.temperature] : null;
    const TempIcon = tempCfg?.icon;

    return (
      <div
        className={cn(
          "group relative rounded-xl border bg-card p-4 transition-all duration-200 cursor-pointer hover:shadow-md hover:border-border/80",
          overdue && "border-red-500/30 bg-red-500/[0.03]",
        )}
        onClick={() => {}}
      >
        {/* Overdue indicator */}
        {overdue && (
          <div className="absolute -left-px top-3 bottom-3 w-[3px] rounded-r-full bg-red-500" />
        )}

        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold",
            overdue ? "bg-red-500/10 text-red-400" : "bg-primary/10 text-primary",
          )}>
            {(item.contact_name || "?")[0]?.toUpperCase()}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground truncate">{item.contact_name || "Sem nome"}</p>
              {tempCfg && TempIcon && (
                <TempIcon className={cn("w-3.5 h-3.5 shrink-0", tempCfg.cls)} />
              )}
            </div>
            <p className="text-xs text-muted-foreground">{formatPhone(item.contact_phone)}</p>

            {item.message_content && (
              <p className="text-xs text-muted-foreground/70 line-clamp-1">{item.message_content}</p>
            )}

            <div className="flex items-center gap-2 flex-wrap pt-0.5">
              <Badge className={cn("text-[10px] border", statusCfg.cls)}>{statusCfg.label}</Badge>

              {item.schedule_type && TYPE_CONFIG[item.schedule_type] && (
                <span className="text-[10px] text-muted-foreground">
                  {TYPE_CONFIG[item.schedule_type].icon} {TYPE_CONFIG[item.schedule_type].label}
                </span>
              )}

              {item.estimated_value && item.estimated_value > 0 && (
                <span className="text-[10px] font-medium text-emerald-400">
                  {currencyShort(item.estimated_value)}
                </span>
              )}
            </div>
          </div>

          {/* Right side */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={cn(
              "text-xs font-medium",
              overdue ? "text-red-400" : "text-muted-foreground",
            )}>
              {timeAgo(item.scheduled_at)}
            </span>

            {/* Hover actions */}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                onClick={(e) => { e.stopPropagation(); handleMarkDone(item.id); }}
                title="Concluir"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                title="Remover"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const FollowupGroup = ({ title, items, icon: Icon, accent }: { title: string; items: ScheduleItem[]; icon: React.ElementType; accent: string }) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Icon className={cn("w-4 h-4", accent)} />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
          <Badge variant="secondary" className="text-[10px] h-5">{items.length}</Badge>
        </div>
        <div className="space-y-2">
          {items.map(item => <FollowupCard key={item.id} item={item} />)}
        </div>
      </div>
    );
  };

  const AutomaticRow = ({ item }: { item: ScheduleItem }) => {
    const statusCfg = STATUS_COLORS[item.status] || STATUS_COLORS.pending;
    const device = devices.find(d => d.id === item.device_id);

    return (
      <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-card p-3 hover:bg-accent/30 transition-colors group">
        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-blue-400" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{item.contact_name || formatPhone(item.contact_phone)}</p>
          <p className="text-xs text-muted-foreground line-clamp-1">{item.message_content || "—"}</p>
        </div>

        {device && (
          <span className="text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-md shrink-0">
            {device.name}
          </span>
        )}

        <Badge className={cn("text-[10px] border shrink-0", statusCfg.cls)}>{statusCfg.label}</Badge>

        <span className="text-xs text-muted-foreground shrink-0 w-12 text-right">
          {timeAgo(item.scheduled_at)}
        </span>

        <Button
          variant="ghost" size="icon"
          className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          onClick={() => handleDelete(item.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CalendarClock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Agendamentos</h1>
            <p className="text-xs text-muted-foreground">Gerencie follow-ups e envios automáticos</p>
          </div>
        </div>
        <Button size="sm" onClick={() => openNew(activeTab === "automatics" ? "automatico" : "followup")} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Novo
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Follow-ups Hoje", value: todayFollowups.length, icon: CalendarCheck, color: "text-primary" },
          { label: "Atrasados", value: overdueItems.length, icon: AlertTriangle, color: overdueItems.length > 0 ? "text-red-400" : "text-muted-foreground" },
          { label: "Concluídos Hoje", value: doneToday.length, icon: CheckCircle2, color: "text-emerald-400" },
          { label: "Total Pendentes", value: items.filter(i => i.status === "pending").length, icon: Clock, color: "text-amber-400" },
        ].map(s => (
          <Card key={s.label} className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", s.color === "text-red-400" ? "bg-red-500/10" : s.color === "text-emerald-400" ? "bg-emerald-500/10" : s.color === "text-amber-400" ? "bg-amber-500/10" : "bg-primary/10")}>
                <s.icon className={cn("w-4.5 h-4.5", s.color)} />
              </div>
              <div>
                <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="followups" className="gap-1.5">
            <UserCheck className="w-3.5 h-3.5" />
            Follow-ups
            {overdueItems.length > 0 && (
              <span className="ml-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                {overdueItems.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="automatics" className="gap-1.5">
            <Zap className="w-3.5 h-3.5" />
            Envios Automáticos
          </TabsTrigger>
          <TabsTrigger value="productivity" className="gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            Produtividade
          </TabsTrigger>
        </TabsList>

        {/* Search (shared) */}
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou telefone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 max-w-md" />
        </div>

        {/* ── Tab: Follow-ups ── */}
        <TabsContent value="followups" className="space-y-6 mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : (
            <>
              <FollowupGroup title="Atrasados" items={grouped.past} icon={AlertTriangle} accent="text-red-400" />
              <FollowupGroup title="Hoje" items={grouped.today} icon={CalendarCheck} accent="text-primary" />
              <FollowupGroup title="Amanhã" items={grouped.tomorrow} icon={Clock} accent="text-amber-400" />
              <FollowupGroup title="Futuro" items={grouped.future} icon={ChevronRight} accent="text-muted-foreground" />

              {grouped.past.length === 0 && grouped.today.length === 0 && grouped.tomorrow.length === 0 && grouped.future.length === 0 && (
                <div className="text-center py-16">
                  <CalendarCheck className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhum follow-up pendente</p>
                  <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => openNew("followup")}>
                    <Plus className="w-3.5 h-3.5" /> Criar Follow-up
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ── Tab: Automatics ── */}
        <TabsContent value="automatics" className="space-y-3 mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : filteredAutomatics.length === 0 ? (
            <div className="text-center py-16">
              <Zap className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum envio automático</p>
              <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => openNew("automatico")}>
                <Plus className="w-3.5 h-3.5" /> Novo Envio
              </Button>
            </div>
          ) : (
            filteredAutomatics.map(item => <AutomaticRow key={item.id} item={item} />)
          )}
        </TabsContent>

        {/* ── Tab: Produtividade ── */}
        <TabsContent value="productivity" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Taxa de Conclusão (7d)</span>
                </div>
                <p className="text-3xl font-bold text-foreground">{weekStats.rate}%</p>
                <p className="text-xs text-muted-foreground">{weekStats.sent} de {weekStats.total} concluídos</p>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${weekStats.rate}%` }} />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CalendarCheck className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Follow-ups Hoje</span>
                </div>
                <p className="text-3xl font-bold text-foreground">{todayFollowups.length}</p>
                <p className="text-xs text-muted-foreground">{doneToday.length} já concluídos</p>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Atrasados</span>
                </div>
                <p className={cn("text-3xl font-bold", overdueItems.length > 0 ? "text-red-400" : "text-foreground")}>{overdueItems.length}</p>
                <p className="text-xs text-muted-foreground">Atenção necessária</p>
              </CardContent>
            </Card>
          </div>

          {/* Recent completed */}
          <div className="mt-6 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Últimos Concluídos</h3>
            {items.filter(i => i.status === "sent").slice(-5).reverse().map(item => (
              <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/50 p-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.contact_name}</p>
                  <p className="text-xs text-muted-foreground">{formatPhone(item.contact_phone)}</p>
                </div>
                <span className="text-xs text-muted-foreground">{item.sent_at ? timeAgo(item.sent_at) : "—"}</span>
              </div>
            ))}
            {items.filter(i => i.status === "sent").length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum agendamento concluído ainda</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Create Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Agendamento</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* Tipo */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tipo</Label>
                <Select value={form.schedule_type} onValueChange={v => setForm({ ...form, schedule_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="followup">📞 Follow-up</SelectItem>
                    <SelectItem value="reuniao">🤝 Reunião</SelectItem>
                    <SelectItem value="retorno">🔄 Retorno</SelectItem>
                    <SelectItem value="automatico">⚡ Automático</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Temperatura</Label>
                <Select value={form.temperature || "none"} onValueChange={v => setForm({ ...form, temperature: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem definir</SelectItem>
                    <SelectItem value="frio">❄️ Frio</SelectItem>
                    <SelectItem value="morno">🌤️ Morno</SelectItem>
                    <SelectItem value="quente">🔥 Quente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Lead search */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lead vinculado</Label>
              {form.lead_id ? (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 border border-border">
                  <Users className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">{form.contact_name}</span>
                  <span className="text-xs text-muted-foreground">{formatPhone(form.contact_phone)}</span>
                  <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" onClick={() => setForm(f => ({ ...f, lead_id: "", contact_name: "", contact_phone: "" }))}>×</Button>
                </div>
              ) : (
                <div className="relative">
                  <Input placeholder="Buscar lead por nome ou telefone..." value={leadSearch} onChange={e => setLeadSearch(e.target.value)} />
                  {filteredLeads.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredLeads.map(l => (
                        <button key={l.id} className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center gap-2 text-sm" onClick={() => selectLead(l)}>
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

            {/* Manual phone/name */}
            {!form.lead_id && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nome</Label>
                  <Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Telefone *</Label>
                  <Input value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} placeholder="5511999999999" />
                </div>
              </div>
            )}

            {/* Objective */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Objetivo do contato</Label>
              <Input value={form.objective} onChange={e => setForm({ ...form, objective: e.target.value })} placeholder="Ex: Apresentar proposta, Cobrar retorno..." />
            </div>

            {/* Value + Device */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor estimado (R$)</Label>
                <Input type="number" value={form.estimated_value} onChange={e => setForm({ ...form, estimated_value: e.target.value })} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Instância</Label>
                <Select value={form.device_id || "auto"} onValueChange={v => setForm({ ...form, device_id: v === "auto" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Automático" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automático</SelectItem>
                    {devices.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Date + Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data *</Label>
                <Input type="date" value={form.date ? format(form.date, "yyyy-MM-dd") : ""} onChange={e => setForm({ ...form, date: e.target.value ? new Date(e.target.value + "T12:00:00") : undefined })} />
              </div>
              <div className="space-y-1.5">
                <Label>Horário *</Label>
                <Input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} />
              </div>
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <Label>Mensagem</Label>
              <Textarea value={form.message_content} onChange={e => setForm({ ...form, message_content: e.target.value })} rows={3} placeholder="Mensagem que será enviada..." />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <StickyNote className="w-3.5 h-3.5 text-muted-foreground" />
                Notas internas
              </Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Anotações visíveis apenas para você..." className="bg-muted/20" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.contact_phone || !form.date} className="gap-1.5">
              <Send className="w-3.5 h-3.5" /> Criar Agendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
