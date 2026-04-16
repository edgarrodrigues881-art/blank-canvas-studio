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
import {
  CalendarClock, Plus, Search, Filter, Clock, Send, Pencil, Trash2,
  Play, AlertTriangle, CheckCircle2, Loader2, Phone, Smartphone,
  Link2, Calendar, User, X, UserPlus
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

  const [formOpen, setFormOpen] = useState(false);
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
  const openNew = () => { setEditingItem(null); setFormOpen(true); };
  const openEdit = (item: ScheduledMessage) => { setEditingItem(item); setFormOpen(true); setDetailOpen(false); };

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

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
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

      {/* Stats */}
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

      {/* Filters */}
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

      {/* List */}
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

      {/* Detail Modal */}
      <DetailModal open={detailOpen} onOpenChange={setDetailOpen} item={detailItem} deviceName={deviceName} onEdit={openEdit} onSendNow={handleSendNow} onDelete={id => { setDetailOpen(false); setDeleteTarget(id); }} />

      {/* Form Modal */}
      <FormModal open={formOpen} onOpenChange={setFormOpen} editing={editingItem} devices={devices} onSaved={fetchItems} />

      {/* Delete Confirmation */}
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

/* ═══════════════════════════════════════════════════════ */
function FormModal({ open, onOpenChange, editing, devices, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; editing: ScheduledMessage | null; devices: Device[]; onSaved: () => void;
}) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ServiceContact[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ServiceContact | null>(null);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [creatingContact, setCreatingContact] = useState(false);
  const [messageContent, setMessageContent] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const dt = new Date(editing.scheduled_at);
      setSelectedContact({ id: "", name: editing.contact_name, phone: editing.contact_phone, email: null, company: null });
      setMessageContent(editing.message_content);
      setDate(format(dt, "yyyy-MM-dd"));
      setTime(format(dt, "HH:mm"));
      setDeviceId(editing.device_id || "");
    } else {
      setSelectedContact(null); setMessageContent(""); setDate(""); setTime(""); setDeviceId("");
    }
    setSearchQuery(""); setSearchResults([]); setShowResults(false); setShowInlineCreate(false);
  }, [open, editing]);

  const searchContacts = useCallback(async (q: string) => {
    if (!user || q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const cleanQ = q.replace(/[^\w\s+]/g, "");
    const { data } = await supabase.from("service_contacts").select("id, name, phone, email, company").eq("user_id", user.id).or(`name.ilike.%${cleanQ}%,phone.ilike.%${cleanQ}%`).limit(10);
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

  const selectContact = (c: ServiceContact) => { setSelectedContact(c); setShowResults(false); setSearchQuery(""); setShowInlineCreate(false); };
  const clearContact = () => { setSelectedContact(null); setSearchQuery(""); };

  const handleCreateContact = async () => {
    if (!user || !newPhone.trim()) return;
    setCreatingContact(true);
    const { data, error } = await supabase.from("service_contacts").insert({ user_id: user.id, name: newName.trim() || newPhone.trim(), phone: newPhone.trim(), origin: "manual", status: "active" } as any).select("id, name, phone, email, company").single();
    setCreatingContact(false);
    if (error) { toast.error(error.code === "23505" ? "Contato já existe" : "Erro ao criar contato"); return; }
    toast.success("Contato criado");
    selectContact(data as ServiceContact);
    setNewName(""); setNewPhone("");
  };

  const canSave = selectedContact && messageContent.trim() && date && time;

  const handleSave = async () => {
    if (!user || !selectedContact || !canSave) return;
    setSaving(true);
    const scheduled_at = new Date(`${date}T${time}:00`).toISOString();
    const payload = { user_id: user.id, contact_name: selectedContact.name, contact_phone: selectedContact.phone, message_content: messageContent.trim(), scheduled_at, device_id: deviceId || null };
    let error;
    if (editing) { ({ error } = await supabase.from("scheduled_messages").update(payload as any).eq("id", editing.id)); }
    else { ({ error } = await supabase.from("scheduled_messages").insert(payload as any)); }
    setSaving(false);
    if (error) { toast.error(editing ? "Erro ao atualizar" : "Erro ao criar"); return; }
    toast.success(editing ? "Disparo atualizado" : "Disparo agendado");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Editar Disparo" : "Novo Disparo Agendado"}</DialogTitle></DialogHeader>
        <div className="space-y-5 py-2">
          {/* Contact */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contato</Label>
            {selectedContact ? (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><User className="w-4 h-4 text-primary" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{selectedContact.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> {formatPhone(selectedContact.phone)}</p>
                </div>
                {!editing && <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={clearContact}><X className="w-3.5 h-3.5" /></Button>}
              </div>
            ) : (
              <div ref={searchRef} className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Buscar por nome ou telefone..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" autoFocus />
                  {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
                </div>
                {showResults && (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {searchResults.length > 0 ? searchResults.map(c => (
                      <button key={c.id} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 transition-colors text-left" onClick={() => selectContact(c)}>
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><User className="w-3.5 h-3.5 text-primary" /></div>
                        <div className="min-w-0"><p className="text-sm font-medium text-foreground truncate">{c.name}</p><p className="text-xs text-muted-foreground">{formatPhone(c.phone)}</p></div>
                      </button>
                    )) : searchQuery.length >= 2 && !searching ? (
                      <div className="p-3 text-center">
                        <p className="text-xs text-muted-foreground mb-2">Nenhum contato encontrado</p>
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setShowResults(false); setShowInlineCreate(true); setNewPhone(searchQuery.replace(/[^\d+]/g, "")); }}><UserPlus className="w-3.5 h-3.5" /> Criar novo contato</Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}
            {showInlineCreate && !selectedContact && (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><UserPlus className="w-3.5 h-3.5" /> Criar novo contato</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Nome</Label><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome" className="h-8 text-sm" /></div>
                  <div><Label className="text-xs">Telefone *</Label><Input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="5511999999999" className="h-8 text-sm" /></div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowInlineCreate(false)}>Cancelar</Button>
                  <Button size="sm" className="h-7 text-xs" onClick={handleCreateContact} disabled={!newPhone.trim() || creatingContact}>{creatingContact && <Loader2 className="w-3 h-3 animate-spin mr-1" />} Salvar</Button>
                </div>
              </div>
            )}
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mensagem</Label>
            <Textarea value={messageContent} onChange={e => setMessageContent(e.target.value)} placeholder="Digite a mensagem que será enviada..." rows={4} className="resize-y min-h-[100px]" />
            {messageContent && (
              <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Preview</p>
                <p className="text-xs text-foreground whitespace-pre-wrap">{messageContent}</p>
              </div>
            )}
          </div>

          {/* Schedule */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Agendamento</Label>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Data *</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
              <div><Label className="text-xs">Hora *</Label><Input type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
            </div>
            <div>
              <Label className="text-xs">Instância</Label>
              <Select value={deviceId || "auto"} onValueChange={v => setDeviceId(v === "auto" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Automático" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automático (primeira disponível)</SelectItem>
                  {devices.map(d => {
                    const online = ["Ready", "Connected", "authenticated"].includes(d.status);
                    return (
                      <SelectItem key={d.id} value={d.id}>
                        <span className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-muted-foreground"}`} />
                          {d.name} {d.number ? `(${d.number})` : ""}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!canSave || saving} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {editing ? "Salvar Alterações" : "Agendar Disparo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
