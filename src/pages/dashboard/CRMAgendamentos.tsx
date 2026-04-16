import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { format, isToday, isTomorrow, isPast, isThisWeek, differenceInMinutes, differenceInHours, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import {
  CalendarClock, Plus, Search, Filter, Clock, Send, Pencil, Trash2,
  Play, AlertTriangle, CheckCircle2, Loader2, Phone, Smartphone,
  Link2, Calendar, User, X, UserPlus, ArrowLeft, Save, FileText,
  Download, Variable, ExternalLink, MessageSquare, Reply, GripVertical
} from "lucide-react";

/* ─── types ─── */
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
  attempts: number;
  max_attempts: number;
  next_retry_at: string | null;
  created_at: string;
  schedule_type: string;
}

interface Device {
  id: string;
  name: string;
  number: string | null;
  status: string;
}

interface ServiceContact {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
}

/* ─── helpers ─── */
const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:     { label: "Pendente",  color: "bg-blue-500/15 text-blue-400 border-blue-500/30",       icon: Clock },
  processing:  { label: "Enviando", color: "bg-blue-500/15 text-blue-400 border-blue-500/30",       icon: Loader2 },
  sent:        { label: "Enviado",  color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  failed:      { label: "Falhou",   color: "bg-red-500/15 text-red-400 border-red-500/30",          icon: AlertTriangle },
  cancelled:   { label: "Cancelado", color: "bg-muted text-muted-foreground border-muted",          icon: X },
  retry:       { label: "Retentando", color: "bg-orange-500/15 text-orange-400 border-orange-500/30", icon: Clock },
};

function timeUntil(dateStr: string): { text: string; overdue: boolean } {
  const target = new Date(dateStr);
  const now = new Date();
  if (isPast(target) && !isToday(target)) return { text: "Atrasado", overdue: true };
  const diffMin = differenceInMinutes(target, now);
  if (diffMin < 0) return { text: "Atrasado", overdue: true };
  if (diffMin < 60) return { text: `Em ${diffMin}min`, overdue: false };
  const diffH = differenceInHours(target, now);
  if (diffH < 24) return { text: `Em ${diffH}h`, overdue: false };
  const diffD = differenceInDays(target, now);
  return { text: diffD === 1 ? "Amanhã" : `Em ${diffD}d`, overdue: false };
}

function formatPhone(p: string) {
  const d = p.replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0,2)} ${d.slice(2,4)} ${d.slice(4,9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0,2)} ${d.slice(2,4)} ${d.slice(4,8)}-${d.slice(8)}`;
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  return p;
}

function hasLink(text: string) {
  return /https?:\/\/\S+/i.test(text);
}

function resolveVars(text: string, name: string): string {
  return text.replace(/\{nome\}/gi, name || "Cliente");
}

/* ─── main ─── */
export default function CRMAgendamentos() {
  const { user } = useAuth();
  const [items, setItems] = useState<ScheduledMessage[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<ScheduledMessage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const [formView, setFormView] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduledMessage | null>(null);

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

  const fetchDevices = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("devices")
      .select("id, name, number, status")
      .eq("user_id", user.id)
      .neq("login_type", "report_wa");
    setDevices((data as Device[]) || []);
  }, [user]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("scheduled-dispatches-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "scheduled_messages", filter: `user_id=eq.${user.id}` },
        () => fetchItems()
      ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, fetchItems]);

  const stats = useMemo(() => {
    const today = items.filter(i => isToday(new Date(i.scheduled_at)) && i.status === "pending").length;
    const pending = items.filter(i => i.status === "pending").length;
    const sent = items.filter(i => i.status === "sent").length;
    const failed = items.filter(i => i.status === "failed").length;
    return { today, pending, sent, failed };
  }, [items]);

  const filtered = useMemo(() => {
    let list = [...items];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i => i.contact_name?.toLowerCase().includes(q) || i.contact_phone?.includes(q));
    }
    if (statusFilter !== "all") list = list.filter(i => i.status === statusFilter);
    if (dateFilter === "today") list = list.filter(i => isToday(new Date(i.scheduled_at)));
    else if (dateFilter === "tomorrow") list = list.filter(i => isTomorrow(new Date(i.scheduled_at)));
    else if (dateFilter === "week") list = list.filter(i => isThisWeek(new Date(i.scheduled_at)));
    return list;
  }, [items, search, statusFilter, dateFilter]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from("scheduled_messages").delete().eq("id", deleteTarget);
    toast.success("Disparo removido");
    setDeleteTarget(null);
    fetchItems();
  };

  const handleSendNow = async (item: ScheduledMessage) => {
    const payload: any = { scheduled_at: new Date().toISOString(), status: "pending", attempts: 0, next_retry_at: null, error_message: null };
    const { error } = await supabase.from("scheduled_messages").update(payload).eq("id", item.id);
    if (error) { toast.error("Erro ao disparar"); return; }
    toast.success("Disparo adicionado à fila de envio");
    fetchItems();
  };

  const openDetail = (item: ScheduledMessage) => { setDetailItem(item); setDetailOpen(true); };
  const openNew = () => { setEditingItem(null); setFormView(true); };
  const openEdit = (item: ScheduledMessage) => { setEditingItem(item); setFormView(true); setDetailOpen(false); };

  const deviceName = (id: string | null) => {
    if (!id) return "Auto";
    const d = devices.find(x => x.id === id);
    return d ? d.name : "—";
  };

  const STAT_CARDS = [
    { label: "Hoje", value: stats.today, icon: Calendar, accent: "text-primary" },
    { label: "Pendentes", value: stats.pending, icon: Clock, accent: "text-blue-400" },
    { label: "Enviados", value: stats.sent, icon: CheckCircle2, accent: "text-emerald-400" },
    { label: "Falhados", value: stats.failed, icon: AlertTriangle, accent: "text-red-400" },
  ];

  if (formView) {
    return (
      <ScheduleFormView
        editing={editingItem}
        devices={devices}
        onBack={() => setFormView(false)}
        onSaved={() => { setFormView(false); fetchItems(); }}
      />
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CalendarClock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Disparos Agendados</h1>
            <p className="text-xs text-muted-foreground">Central de envios programados</p>
          </div>
        </div>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={openNew}>
          <Plus className="w-4 h-4" /> Novo Disparo
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {STAT_CARDS.map(s => (
          <div key={s.label} className="rounded-xl border border-border/40 bg-card p-3.5 flex items-center gap-3">
            <div className={cn("w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center", s.accent)}>
              <s.icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground leading-none">{s.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou telefone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="sent">Enviados</SelectItem>
            <SelectItem value="failed">Falhados</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-[140px] h-9">
            <Calendar className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as datas</SelectItem>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="tomorrow">Amanhã</SelectItem>
            <SelectItem value="week">Esta semana</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <CalendarClock className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">Nenhum disparo encontrado</p>
          <p className="text-xs mt-1">Crie um novo disparo agendado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => {
            const st = STATUS_MAP[item.status] || STATUS_MAP.pending;
            const StIcon = st.icon;
            const scheduledDate = new Date(item.scheduled_at);
            const isTodayItem = isToday(scheduledDate);
            const { text: countdownText, overdue } = item.status === "pending" ? timeUntil(item.scheduled_at) : { text: "", overdue: false };
            const showGlow = isTodayItem && item.status === "pending";

            return (
              <div
                key={item.id}
                onClick={() => openDetail(item)}
                className={cn(
                  "group relative rounded-xl border bg-card p-4 cursor-pointer transition-all duration-200",
                  "hover:border-emerald-500/30 hover:shadow-[0_0_20px_-6px_hsl(var(--primary)/0.15)]",
                  showGlow && "border-primary/20 shadow-[0_0_24px_-8px_hsl(var(--primary)/0.2)]",
                  overdue && item.status === "pending" && "border-red-500/30",
                  "border-border/40"
                )}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground truncate">{item.contact_name || "Sem nome"}</span>
                      <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5 gap-1 border", st.color)}>
                        <StIcon className={cn("w-3 h-3", item.status === "processing" && "animate-spin")} />
                        {st.label}
                      </Badge>
                      {overdue && item.status === "pending" && (
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-1 border bg-red-500/15 text-red-400 border-red-500/30">
                          <AlertTriangle className="w-3 h-3" /> Atrasado
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {formatPhone(item.contact_phone)}
                    </p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-xs text-muted-foreground/70 truncate max-w-md">{item.message_content}</p>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-sm whitespace-pre-wrap text-xs">{item.message_content}</TooltipContent>
                    </Tooltip>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(scheduledDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Smartphone className="w-3 h-3" /> {deviceName(item.device_id)}
                      </span>
                      {hasLink(item.message_content) && (
                        <span className="flex items-center gap-1 text-primary"><Link2 className="w-3 h-3" /> Link</span>
                      )}
                      {countdownText && (
                        <span className={cn("font-medium", overdue ? "text-red-400" : "text-primary")}>{countdownText}</span>
                      )}
                    </div>
                  </div>
                  <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                    {item.status === "pending" && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={e => { e.stopPropagation(); openEdit(item); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-emerald-400" onClick={e => { e.stopPropagation(); handleSendNow(item); }}>
                          <Play className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-400" onClick={e => { e.stopPropagation(); setDeleteTarget(item.id); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <DetailModal open={detailOpen} onOpenChange={setDetailOpen} item={detailItem} deviceName={deviceName} onEdit={openEdit} onSendNow={handleSendNow} onDelete={id => { setDetailOpen(false); setDeleteTarget(id); }} />

      <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir disparo</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir este disparo agendado?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ */
function DetailModal({ open, onOpenChange, item, deviceName, onEdit, onSendNow, onDelete }: {
  open: boolean; onOpenChange: (o: boolean) => void; item: ScheduledMessage | null;
  deviceName: (id: string | null) => string; onEdit: (s: ScheduledMessage) => void;
  onSendNow: (s: ScheduledMessage) => void; onDelete: (id: string) => void;
}) {
  if (!item) return null;
  const st = STATUS_MAP[item.status] || STATUS_MAP.pending;
  const StIcon = st.icon;
  const scheduledDate = new Date(item.scheduled_at);
  const { text: countdownText, overdue } = item.status === "pending" ? timeUntil(item.scheduled_at) : { text: "", overdue: false };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Detalhes do Disparo
            <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5 gap-1 border ml-2", st.color)}>
              <StIcon className={cn("w-3 h-3", item.status === "processing" && "animate-spin")} /> {st.label}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><User className="w-4 h-4 text-primary" /></div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{item.contact_name || "Sem nome"}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{formatPhone(item.contact_phone)}</p>
            </div>
            {countdownText && <Badge variant="outline" className={cn("ml-auto text-xs", overdue ? "border-red-500/30 text-red-400" : "border-primary/30 text-primary")}>{countdownText}</Badge>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mensagem</Label>
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-foreground whitespace-pre-wrap max-h-40 overflow-y-auto">{item.message_content}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <Label className="text-xs text-muted-foreground">Data / Hora</Label>
              <p className="text-foreground font-medium">{format(scheduledDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Instância</Label>
              <p className="text-foreground font-medium flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5 text-muted-foreground" />{deviceName(item.device_id)}</p>
            </div>
          </div>
          {item.error_message && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <p className="text-xs text-red-400 font-medium">Erro: {item.error_message}</p>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          {item.status === "pending" && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onEdit(item)}><Pencil className="w-3.5 h-3.5" /> Editar</Button>
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { onOpenChange(false); onSendNow(item); }}><Play className="w-3.5 h-3.5" /> Disparar Agora</Button>
            </>
          )}
          <Button variant="ghost" size="sm" className="gap-1.5 text-red-400 hover:text-red-300" onClick={() => onDelete(item.id)}><Trash2 className="w-3.5 h-3.5" /> Excluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════
   FULL-SCREEN 2-COLUMN FORM VIEW
   ═══════════════════════════════════════════════════════ */
function ScheduleFormView({ editing, devices, onBack, onSaved }: {
  editing: ScheduledMessage | null; devices: Device[]; onBack: () => void; onSaved: () => void;
}) {
  const { user } = useAuth();

  const [recipientMode, setRecipientMode] = useState<"base" | "manual">("base");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ServiceContact[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ServiceContact | null>(null);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");

  const [messageContent, setMessageContent] = useState("");
  const [buttons, setButtons] = useState<Array<{ type: "url" | "reply"; text: string; value: string }>>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [deviceId, setDeviceId] = useState("");

  const [templateName, setTemplateName] = useState("");
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showLoadTemplate, setShowLoadTemplate] = useState(false);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      const dt = new Date(editing.scheduled_at);
      setSelectedContact({ id: "", name: editing.contact_name, phone: editing.contact_phone, email: null, company: null });
      setMessageContent(editing.message_content);
      setDate(format(dt, "yyyy-MM-dd"));
      setTime(format(dt, "HH:mm"));
      setDeviceId(editing.device_id || "");
    }
  }, [editing]);

  const searchContacts = useCallback(async (q: string) => {
    if (!user || q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const cleanQ = q.replace(/[^\w\s+]/g, "");
    const { data } = await supabase.from("service_contacts").select("id, name, phone, email, company").eq("user_id", user.id).or(`name.ilike.%${cleanQ}%,phone.ilike.%${cleanQ}%`).limit(5);
    setSearchResults((data as ServiceContact[]) || []);
    setSearching(false);
  }, [user]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchQuery.length >= 2) { searchContacts(searchQuery); setShowResults(true); }
      else { setSearchResults([]); setShowResults(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, searchContacts]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectContact = (c: ServiceContact) => { setSelectedContact(c); setShowResults(false); setSearchQuery(""); };
  const clearContact = () => { setSelectedContact(null); setSearchQuery(""); setManualName(""); setManualPhone(""); };

  const applyManualContact = () => {
    const phone = manualPhone.replace(/\D/g, "");
    if (phone.length < 10) { toast.error("Telefone inválido"); return; }
    const normalized = phone.startsWith("55") ? phone : `55${phone}`;
    setSelectedContact({ id: "", name: manualName.trim() || normalized, phone: normalized, email: null, company: null });
  };

  const formatManualPhone = (raw: string) => {
    let d = raw.replace(/\D/g, "");
    if (d.length > 13) d = d.slice(0, 13);
    if (!d.startsWith("55") && d.length > 0) d = "55" + d;
    if (d.length <= 2) return `+${d}`;
    if (d.length <= 4) return `+${d.slice(0,2)} ${d.slice(2)}`;
    if (d.length <= 9) return `+${d.slice(0,2)} ${d.slice(2,4)} ${d.slice(4)}`;
    if (d.length <= 12) return `+${d.slice(0,2)} ${d.slice(2,4)} ${d.slice(4,8)}-${d.slice(8)}`;
    return `+${d.slice(0,2)} ${d.slice(2,4)} ${d.slice(4,9)}-${d.slice(9)}`;
  };

  const insertVariable = (v: string) => {
    setMessageContent(prev => prev + `{${v}}`);
  };

  const countdown = useMemo(() => {
    if (!date || !time) return null;
    const target = new Date(`${date}T${time}:00`);
    const now = new Date();
    if (isPast(target)) return { text: "Data no passado", isToday: false, overdue: true };
    const diffMin = differenceInMinutes(target, now);
    if (diffMin < 60) return { text: `Dispara em ${diffMin} minutos`, isToday: true, overdue: false };
    const diffH = differenceInHours(target, now);
    if (isToday(target)) return { text: `Dispara em ${diffH}h`, isToday: true, overdue: false };
    if (isTomorrow(target)) return { text: `Dispara amanhã às ${time}`, isToday: false, overdue: false };
    const diffD = differenceInDays(target, now);
    return { text: `Dispara em ${diffD} dias`, isToday: false, overdue: false };
  }, [date, time]);

  const canSave = selectedContact && messageContent.trim() && date && time;

  const handleSave = async () => {
    if (!user || !selectedContact || !canSave) return;
    setSaving(true);
    const scheduled_at = new Date(`${date}T${time}:00`).toISOString();
    let fullMessage = messageContent.trim();
    if (hasButton && buttonText && buttonLink) {
      fullMessage += `\n\n${buttonLink}`;
    }
    const payload = { user_id: user.id, contact_name: selectedContact.name, contact_phone: selectedContact.phone, message_content: fullMessage, scheduled_at, device_id: deviceId || null };
    let error;
    if (editing) { ({ error } = await supabase.from("scheduled_messages").update(payload as any).eq("id", editing.id)); }
    else { ({ error } = await supabase.from("scheduled_messages").insert(payload as any)); }
    setSaving(false);
    if (error) { toast.error(editing ? "Erro ao atualizar" : "Erro ao criar"); return; }
    toast.success(editing ? "Disparo atualizado" : "Disparo agendado com sucesso");
    onSaved();
  };

  const previewMessage = resolveVars(messageContent, selectedContact?.name || "Cliente");

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">{editing ? "Editar Disparo" : "Novo Disparo Agendado"}</h1>
          <p className="text-xs text-muted-foreground">Envio individual inteligente</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onBack}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave || saving} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {editing ? "Salvar" : "Agendar Disparo"}
          </Button>
        </div>
      </div>

      {/* 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* LEFT — 3 cols */}
        <div className="lg:col-span-3 space-y-5">

          {/* Destinatário */}
          <div className="rounded-xl border border-border/40 bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Destinatário</h2>
            </div>

            {selectedContact ? (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{selectedContact.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> {formatPhone(selectedContact.phone)}</p>
                </div>
                {!editing && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={clearContact}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Mode tabs */}
                <div className="flex rounded-lg border border-border/50 p-0.5 bg-muted/30 w-fit">
                  <button
                    className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all", recipientMode === "base" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                    onClick={() => setRecipientMode("base")}
                  >
                    <Search className="w-3 h-3 inline mr-1.5" />Selecionar da base
                  </button>
                  <button
                    className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all", recipientMode === "manual" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                    onClick={() => setRecipientMode("manual")}
                  >
                    <UserPlus className="w-3 h-3 inline mr-1.5" />Digitar manualmente
                  </button>
                </div>

                {recipientMode === "base" ? (
                  <div ref={searchRef} className="relative">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input placeholder="Buscar por nome ou telefone..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 h-10" autoFocus />
                      {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">Digite ao menos 2 caracteres para buscar</p>
                    {showResults && (
                      <div className="absolute z-50 top-[calc(100%-16px)] mt-1 left-0 right-0 bg-popover border border-border rounded-xl shadow-lg max-h-64 overflow-y-auto">
                        {searchResults.length > 0 ? searchResults.map(c => (
                          <button key={c.id} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left" onClick={() => selectContact(c)}>
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><User className="w-3.5 h-3.5 text-primary" /></div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                              <p className="text-xs text-muted-foreground">{formatPhone(c.phone)}</p>
                            </div>
                          </button>
                        )) : searchQuery.length >= 2 && !searching ? (
                          <div className="p-4 text-center">
                            <p className="text-xs text-muted-foreground mb-2">Nenhum contato encontrado</p>
                            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => { setShowResults(false); setRecipientMode("manual"); setManualPhone(searchQuery.replace(/[^\d+]/g, "")); }}>
                              <UserPlus className="w-3.5 h-3.5" /> Digitar manualmente
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Nome <span className="text-muted-foreground">(opcional)</span></Label>
                      <Input value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Nome do contato" className="h-9 text-sm mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">Telefone *</Label>
                      <Input
                        value={manualPhone}
                        onChange={e => setManualPhone(formatManualPhone(e.target.value))}
                        placeholder="+55 11 99999-9999"
                        className="h-9 text-sm mt-1 font-mono"
                        autoFocus
                      />
                      <p className="text-[10px] text-muted-foreground/60 mt-1">Formato automático +55</p>
                    </div>
                    <Button size="sm" className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white w-full" onClick={applyManualContact} disabled={manualPhone.replace(/\D/g, "").length < 12}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Confirmar destinatário
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Mensagem */}
          <div className="rounded-xl border border-border/40 bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Mensagem</h2>
            </div>

            <Textarea
              value={messageContent}
              onChange={e => setMessageContent(e.target.value)}
              placeholder="Digite sua mensagem... Use {nome} para personalizar."
              rows={5}
              className="resize-y min-h-[120px] text-sm"
            />

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-muted-foreground">Variáveis:</span>
              {["nome"].map(v => (
                <Button key={v} variant="outline" size="sm" className="h-6 text-[11px] px-2 gap-1" onClick={() => insertVariable(v)}>
                  <Variable className="w-3 h-3" /> {`{${v}}`}
                </Button>
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-foreground font-medium">Botão interativo</span>
                </div>
                <Switch checked={hasButton} onCheckedChange={setHasButton} />
              </div>

              {hasButton && (
                <div className="grid grid-cols-2 gap-3 pl-6">
                  <div>
                    <Label className="text-xs">Texto do botão</Label>
                    <Input value={buttonText} onChange={e => setButtonText(e.target.value)} placeholder="Saiba mais" className="h-9 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Link (URL)</Label>
                    <Input value={buttonLink} onChange={e => setButtonLink(e.target.value)} placeholder="https://..." className="h-9 text-sm" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Agendamento */}
          <div className="rounded-xl border border-border/40 bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Agendamento</h2>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Data *</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Hora *</Label>
                <Input type="time" value={time} onChange={e => setTime(e.target.value)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Instância</Label>
                <Select value={deviceId || "auto"} onValueChange={v => setDeviceId(v === "auto" ? "" : v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Automático" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automático</SelectItem>
                    {devices.map(d => {
                      const online = ["Ready", "Connected", "authenticated"].includes(d.status);
                      return (
                        <SelectItem key={d.id} value={d.id}>
                          <span className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-muted-foreground"}`} />
                            {d.name}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {countdown && (
              <div className={cn(
                "rounded-lg px-4 py-2.5 text-xs font-medium flex items-center gap-2",
                countdown.overdue ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                countdown.isToday ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                "bg-primary/5 text-primary border border-primary/10"
              )}>
                <Clock className="w-3.5 h-3.5" />
                {countdown.text}
              </div>
            )}
          </div>

          {/* Modelos */}
          <div className="rounded-xl border border-border/40 bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Modelos</h2>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setShowSaveTemplate(!showSaveTemplate)}>
                <Save className="w-3.5 h-3.5" /> Salvar como modelo
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setShowLoadTemplate(!showLoadTemplate)}>
                <Download className="w-3.5 h-3.5" /> Carregar modelo
              </Button>
            </div>

            {showSaveTemplate && (
              <div className="flex items-center gap-2 pt-1">
                <Input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Nome do modelo" className="h-8 text-xs flex-1" />
                <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" disabled={!templateName.trim() || !messageContent.trim()} onClick={async () => {
                  if (!user) return;
                  await supabase.from("templates").insert({ user_id: user.id, name: templateName.trim(), content: messageContent, message_type: "text" } as any);
                  toast.success("Modelo salvo");
                  setTemplateName("");
                  setShowSaveTemplate(false);
                }}>
                  Salvar
                </Button>
              </div>
            )}

            {showLoadTemplate && (
              <TemplateLoader userId={user?.id} onSelect={(content) => { setMessageContent(content); setShowLoadTemplate(false); }} />
            )}
          </div>
        </div>

        {/* RIGHT — WhatsApp Preview */}
        <div className="lg:col-span-2">
          <div className="sticky top-6">
            <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
              <div className="bg-emerald-600 px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{selectedContact?.name || "Contato"}</p>
                  <p className="text-[10px] text-white/70">online</p>
                </div>
              </div>

              <div className="bg-[hsl(var(--background))] min-h-[350px] p-4 space-y-3" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5 L35 10 L30 15 L25 10 Z' fill='%23ffffff' opacity='0.03'/%3E%3C/svg%3E\")" }}>
                {previewMessage.trim() ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%]">
                      <div className="bg-emerald-600/20 border border-emerald-500/20 rounded-xl rounded-tr-sm px-3.5 py-2.5 space-y-1.5">
                        <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">{previewMessage}</p>

                        {hasButton && buttonText && (
                          <div className="pt-1.5 border-t border-emerald-500/10">
                            <div className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-primary cursor-pointer hover:underline">
                              <ExternalLink className="w-3 h-3" />
                              {buttonText}
                            </div>
                          </div>
                        )}

                        <p className="text-[10px] text-muted-foreground/60 text-right">
                          {time || "00:00"} <CheckCircle2 className="w-3 h-3 inline ml-0.5 text-primary/50" />
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full py-16">
                    <div className="text-center space-y-2">
                      <MessageSquare className="w-8 h-8 text-muted-foreground/20 mx-auto" />
                      <p className="text-xs text-muted-foreground/40">Digite uma mensagem para ver o preview</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-border/30 px-4 py-2.5 bg-muted/10">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Smartphone className="w-3 h-3" />
                    {deviceId ? devices.find(d => d.id === deviceId)?.name || "—" : "Automático"}
                  </span>
                  {date && time && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(`${date}T${time}:00`), "dd/MM 'às' HH:mm")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Template Loader ─── */
function TemplateLoader({ userId, onSelect }: { userId?: string; onSelect: (content: string) => void }) {
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; content: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    supabase.from("templates").select("id, name, content").eq("user_id", userId).eq("type", "text").order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => { setTemplates((data as any[]) || []); setLoading(false); });
  }, [userId]);

  if (loading) return <div className="py-3 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Carregando...</div>;
  if (!templates.length) return <p className="text-xs text-muted-foreground py-2">Nenhum modelo salvo</p>;

  return (
    <div className="space-y-1 max-h-40 overflow-y-auto">
      {templates.map(t => (
        <button key={t.id} className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/50 transition-colors" onClick={() => onSelect(t.content)}>
          <p className="text-xs font-medium text-foreground">{t.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">{t.content.slice(0, 60)}...</p>
        </button>
      ))}
    </div>
  );
}