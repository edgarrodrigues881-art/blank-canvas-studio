import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, Plus, Upload, Trash2, Pencil, Phone, Mail, Building2, DollarSign, Calendar, MapPin, FileText, User,
  MessageSquare, Globe, Megaphone, Users, UserPlus, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/utils/formatters";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

/* ── types ── */
interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
  notes: string | null;
  tags: string[];
  status: string;
  origin: string;
  lead_temperature: string | null;
  pipeline_stage: string | null;
  conversation_id: string | null;
  last_message_at: string | null;
  last_message_content: string | null;
  created_at: string;
  interest: string | null;
  estimated_value: number | null;
  priority: string | null;
  responsible: string | null;
  segment: string | null;
  cpf_cnpj: string | null;
  channel: string | null;
  description: string | null;
}

const STATUS_OPTIONS = [
  { value: "novo", label: "Novo Lead", dot: "bg-blue-500", badge: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  { value: "respondeu", label: "Respondeu", dot: "bg-cyan-500", badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20" },
  { value: "interessado", label: "Interessado", dot: "bg-amber-500", badge: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  { value: "negociacao", label: "Negociação", dot: "bg-purple-500", badge: "bg-purple-500/15 text-purple-400 border-purple-500/20" },
  { value: "fechado", label: "Fechado", dot: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  { value: "perdido", label: "Perdido", dot: "bg-red-500", badge: "bg-red-500/15 text-red-400 border-red-500/20" },
];

const PRIORITY_OPTIONS = [
  { value: "baixa", label: "Baixa", color: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/15 dark:text-slate-400 dark:border-slate-500/20" },
  { value: "media", label: "Média", color: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-500/15 dark:text-yellow-400 dark:border-yellow-500/20" },
  { value: "alta", label: "Alta", color: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-400 dark:border-orange-500/20" },
  { value: "urgente", label: "Urgente", color: "bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20" },
];

const ORIGIN_OPTIONS = [
  { value: "site", label: "Site", icon: Globe },
  { value: "indicacao", label: "Indicação", icon: UserPlus },
  { value: "google", label: "Google", icon: Search },
  { value: "redes_sociais", label: "Redes Sociais", icon: Users },
  { value: "evento", label: "Evento", icon: Calendar },
  { value: "campanha", label: "Campanha", icon: Megaphone },
  { value: "manual", label: "Manual", icon: User },
];

/* ── avatar colors based on name hash ── */
const AVATAR_COLORS = [
  "from-blue-500 to-blue-600",
  "from-emerald-500 to-emerald-600",
  "from-purple-500 to-purple-600",
  "from-amber-500 to-amber-600",
  "from-cyan-500 to-cyan-600",
  "from-rose-500 to-rose-600",
  "from-indigo-500 to-indigo-600",
  "from-teal-500 to-teal-600",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name[0] || "?").toUpperCase();
}

function getStatusConfig(status: string | null) {
  return STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];
}

function getPriorityConfig(priority: string | null) {
  return PRIORITY_OPTIONS.find((p) => p.value === (priority || "media")) || PRIORITY_OPTIONS[1];
}

function getOriginConfig(origin: string | null) {
  return ORIGIN_OPTIONS.find((o) => o.value === origin) || ORIGIN_OPTIONS[6];
}

/* ── Detail Row helper ── */
function DetailRow({ icon: Icon, label, value, muted }: { icon: React.ElementType; label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <Icon className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
      <span className="text-muted-foreground/70 min-w-[100px]">{label}</span>
      <span className={cn("font-medium", muted ? "text-muted-foreground/40 italic text-xs" : "text-foreground")}>{value}</span>
    </div>
  );
}

/* ── Timeline Event helper ── */
function TimelineEvent({ label, time, preview, dot }: { label: string; time: string; preview?: string | null; dot: string }) {
  return (
    <div className="relative">
      <div className={cn("absolute -left-[25px] top-1 w-3 h-3 rounded-full border-2 border-background", dot)} />
      <p className="text-sm text-foreground font-medium">{label}</p>
      {preview && <p className="text-xs text-muted-foreground/60 mt-0.5 line-clamp-2">"{preview}"</p>}
      <p className="text-[10px] text-muted-foreground/40 mt-0.5">{time}</p>
    </div>
  );
}

function formatCurrency(value: number | null) {
  if (!value) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function timeAgo(date: string | null) {
  if (!date) return "—";
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
  } catch {
    return "—";
  }
}

export default function Leads() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [editingInline, setEditingInline] = useState(false);
  const [detailTab, setDetailTab] = useState("info");
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: "", phone: "", email: "", company: "", notes: "",
    origin: "manual", pipeline_stage: "novo",
    interest: "", estimated_value: "", priority: "media",
    responsible: "", segment: "", cpf_cnpj: "", channel: "WhatsApp", description: "",
  });

  /* ── fetch ── */
  const fetchLeads = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("service_contacts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setLeads((data as any[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  /* ── derived ── */
  const statusCounts = useMemo(() => STATUS_OPTIONS.reduce((acc, s) => {
    acc[s.value] = leads.filter((l) => (l.pipeline_stage || "novo") === s.value).length;
    return acc;
  }, {} as Record<string, number>), [leads]);

  const filtered = useMemo(() => leads.filter((l) => {
    const s = search.toLowerCase();
    const matchSearch = !search ||
      l.name?.toLowerCase().includes(s) ||
      l.phone?.includes(search) ||
      l.email?.toLowerCase().includes(s) ||
      l.company?.toLowerCase().includes(s);
    const stage = l.pipeline_stage || "novo";
    const matchStatus = statusFilter === "all" || stage === statusFilter;
    const matchPriority = priorityFilter === "all" || (l.priority || "media") === priorityFilter;
    const matchOrigin = originFilter === "all" || l.origin === originFilter;
    return matchSearch && matchStatus && matchPriority && matchOrigin;
  }), [leads, search, statusFilter, priorityFilter, originFilter]);

  /* ── CRUD ── */
  const openNew = () => {
    setEditing(null);
    setForm({
      name: "", phone: "", email: "", company: "", notes: "",
      origin: "manual", pipeline_stage: "novo",
      interest: "", estimated_value: "", priority: "media",
      responsible: "", segment: "", cpf_cnpj: "", channel: "WhatsApp", description: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (l: Lead) => {
    setEditing(l);
    setForm({
      name: l.name, phone: l.phone, email: l.email || "", company: l.company || "",
      notes: l.notes || "", origin: l.origin || "manual",
      pipeline_stage: l.pipeline_stage || "novo",
      interest: l.interest || "", estimated_value: l.estimated_value?.toString() || "",
      priority: l.priority || "media", responsible: l.responsible || "",
      segment: l.segment || "", cpf_cnpj: l.cpf_cnpj || "",
      channel: l.channel || "WhatsApp", description: l.description || "",
    });
    setEditingInline(true);
  };

  const handleSave = async () => {
    if (!user) return;
    const payload: any = {
      name: form.name, phone: form.phone, email: form.email || null,
      company: form.company || null, notes: form.notes || null,
      origin: form.origin, pipeline_stage: form.pipeline_stage,
      interest: form.interest || null,
      estimated_value: form.estimated_value ? parseFloat(form.estimated_value) : 0,
      priority: form.priority, responsible: form.responsible || null,
      segment: form.segment || null, cpf_cnpj: form.cpf_cnpj || null,
      channel: form.channel || "WhatsApp", description: form.description || null,
      user_id: user.id,
    };

    if (editing) {
      const { error } = await supabase.from("service_contacts").update(payload).eq("id", editing.id);
      if (error) { toast.error("Erro ao atualizar lead"); return; }
      toast.success("Lead atualizado!");
    } else {
      payload.status = "active";
      payload.tags = [];
      const { error } = await supabase.from("service_contacts").insert(payload);
      if (error) { toast.error("Erro ao criar lead"); return; }
      toast.success("Lead criado!");
    }
    setDialogOpen(false);
    fetchLeads();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("service_contacts").delete().eq("id", id);
    toast.success("Lead removido");
    setDetailLead(null);
    fetchLeads();
  };

  const handleStatusChange = async (lead: Lead, newStage: string) => {
    await supabase.from("service_contacts").update({ pipeline_stage: newStage } as any).eq("id", lead.id);
    toast.success("Status atualizado!");
    if (detailLead?.id === lead.id) setDetailLead({ ...lead, pipeline_stage: newStage });
    fetchLeads();
  };

  /* ── CSV import ── */
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const text = await file.text();
    const lines = text.split("\n").filter(Boolean);
    if (lines.length < 2) return toast.error("CSV vazio ou inválido");
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const nameIdx = headers.findIndex((h) => h.includes("nome") || h === "name");
    const phoneIdx = headers.findIndex((h) => h.includes("telefone") || h.includes("phone"));
    if (phoneIdx < 0) return toast.error("Coluna de telefone não encontrada");

    const rows = lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim());
      return {
        user_id: user.id, name: nameIdx >= 0 ? cols[nameIdx] || "" : "",
        phone: cols[phoneIdx] || "", origin: "manual", status: "active",
        pipeline_stage: "novo", tags: [] as string[], priority: "media",
      };
    });
    const { error } = await supabase.from("service_contacts").insert(rows as any);
    if (error) toast.error("Erro ao importar");
    else toast.success(`${rows.length} leads importados!`);
    fetchLeads();
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-sm text-muted-foreground">{leads.length} leads cadastrados</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-1.5">
            <Upload className="w-3.5 h-3.5" /> Importar
          </Button>
          <Button size="sm" onClick={openNew} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Novo Lead
          </Button>
        </div>
      </div>

      {/* Search & Filters row */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <Input
            placeholder="Buscar por nome, empresa, e-mail ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl bg-muted/30 border-border/50"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] h-10 rounded-xl bg-muted/30 border-border/50 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Status</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                <span className="flex items-center gap-2">
                  <span className={cn("w-2 h-2 rounded-full", s.dot)} />
                  {s.label} ({statusCounts[s.value] || 0})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[140px] h-10 rounded-xl bg-muted/30 border-border/50 text-xs">
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Prioridade</SelectItem>
            {PRIORITY_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={originFilter} onValueChange={setOriginFilter}>
          <SelectTrigger className="w-[140px] h-10 rounded-xl bg-muted/30 border-border/50 text-xs">
            <SelectValue placeholder="Origem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Origem</SelectItem>
            {ORIGIN_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground/70 py-3">Lead</TableHead>
              <TableHead className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground/70 py-3">Contato</TableHead>
              <TableHead className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground/70 py-3">Status</TableHead>
              <TableHead className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground/70 py-3 hidden md:table-cell">Origem</TableHead>
              <TableHead className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground/70 py-3 hidden lg:table-cell">Última Interação</TableHead>
              <TableHead className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground/70 py-3 hidden xl:table-cell">Responsável</TableHead>
              <TableHead className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground/70 py-3 hidden xl:table-cell">Valor Est.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-16 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-16 text-muted-foreground">Nenhum lead encontrado</TableCell></TableRow>
            ) : (
              filtered.map((lead) => {
                const statusCfg = getStatusConfig(lead.pipeline_stage);
                const originCfg = getOriginConfig(lead.origin);
                const OriginIcon = originCfg.icon;
                return (
                  <TableRow
                    key={lead.id}
                    className="cursor-pointer transition-all duration-150 hover:bg-muted/40 group border-b border-border/30"
                    onClick={() => { setDetailLead(lead); setDetailTab("info"); }}
                  >
                    {/* Lead + Avatar */}
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-9 h-9 rounded-full bg-gradient-to-br flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm",
                          getAvatarColor(lead.name || "?")
                        )}>
                          {getInitials(lead.name || "?")}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                            {lead.name || "Sem nome"}
                          </p>
                          {lead.company && (
                            <p className="text-[11px] text-muted-foreground/60 truncate flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              {lead.company}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Contato */}
                    <TableCell className="py-3">
                      <div className="space-y-0.5">
                        <p className="text-xs text-foreground/80 flex items-center gap-1.5">
                          <Phone className="w-3 h-3 text-muted-foreground/50" />
                          {formatPhone(lead.phone)}
                        </p>
                        {lead.email && (
                          <p className="text-[11px] text-muted-foreground/50 truncate max-w-[180px]">{lead.email}</p>
                        )}
                      </div>
                    </TableCell>

                    {/* Status */}
                    <TableCell className="py-3">
                      <Badge variant="outline" className={cn("text-[10px] font-medium rounded-full border px-2.5 py-0.5", statusCfg.badge)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full mr-1.5 inline-block", statusCfg.dot)} />
                        {statusCfg.label}
                      </Badge>
                    </TableCell>

                    {/* Origem */}
                    <TableCell className="py-3 hidden md:table-cell">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <OriginIcon className="w-3.5 h-3.5 text-muted-foreground/50" />
                        {originCfg.label}
                      </span>
                    </TableCell>

                    {/* Última Interação */}
                    <TableCell className="py-3 hidden lg:table-cell">
                      <span className="text-xs text-muted-foreground/70 flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        {timeAgo(lead.last_message_at || lead.created_at)}
                      </span>
                    </TableCell>

                    {/* Responsável */}
                    <TableCell className="py-3 hidden xl:table-cell">
                      {lead.responsible ? (
                        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <User className="w-3 h-3 text-muted-foreground/50" />
                          {lead.responsible}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/30">—</span>
                      )}
                    </TableCell>

                    {/* Valor */}
                    <TableCell className="py-3 hidden xl:table-cell">
                      <span className="text-xs font-medium text-foreground/70">{formatCurrency(lead.estimated_value)}</span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Detail Dialog (view + inline edit) ── */}
      <Dialog open={!!detailLead} onOpenChange={(open) => { if (!open) { setDetailLead(null); setEditingInline(false); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0">
          {detailLead && (() => {
            const statusCfg = getStatusConfig(detailLead.pipeline_stage);
            const priorityCfg = getPriorityConfig(detailLead.priority);
            const originCfg = getOriginConfig(detailLead.origin);
            const na = "Não informado";
            const channelLabel = detailLead.channel || "WhatsApp";

            /* ── EDIT MODE ── */
            if (editingInline) {
              const SectionTitle = ({ children }: { children: React.ReactNode }) => (
                <p className="text-[10px] uppercase font-semibold text-muted-foreground/60 tracking-wider mb-3 flex items-center gap-1.5">{children}</p>
              );
              const FieldLabel = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
                <Label className="text-xs text-muted-foreground/70 font-medium">
                  {children}{required && <span className="text-red-400 ml-0.5">*</span>}
                </Label>
              );

              const handleInlineSave = async () => {
                if (!user) return;
                const payload: any = {
                  name: form.name, phone: form.phone, email: form.email || null,
                  company: form.company || null, notes: form.notes || null,
                  origin: form.origin, pipeline_stage: form.pipeline_stage,
                  interest: form.interest || null,
                  estimated_value: form.estimated_value ? parseFloat(form.estimated_value) : 0,
                  priority: form.priority, responsible: form.responsible || null,
                  segment: form.segment || null, cpf_cnpj: form.cpf_cnpj || null,
                  channel: form.channel || "WhatsApp", description: form.description || null,
                  user_id: user.id,
                };
                const { error } = await supabase.from("service_contacts").update(payload).eq("id", detailLead.id);
                if (error) { toast.error("Erro ao atualizar lead"); return; }
                toast.success("Lead atualizado!");
                setEditingInline(false);
                fetchLeads();
                const updated = { ...detailLead, ...payload };
                setDetailLead(updated);
              };

              const cancelEdit = () => setEditingInline(false);

              const ActionButtons = () => (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={cancelEdit} className="h-8 rounded-lg text-xs">Cancelar</Button>
                  <Button size="sm" onClick={handleInlineSave} disabled={!form.name || !form.phone} className="h-8 rounded-lg text-xs gap-1.5">Salvar</Button>
                </div>
              );

              return (
                <div>
                  {/* Header */}
                  <div className="p-6 pb-4 border-b border-border/60">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Pencil className="w-4 h-4 text-primary" />
                        <h2 className="text-base font-bold text-foreground">Editando Lead</h2>
                      </div>
                      <ActionButtons />
                    </div>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* 📌 Dados principais */}
                    <div className="rounded-xl bg-muted/15 border border-border/30 p-4 space-y-3">
                      <SectionTitle>📌 Dados principais</SectionTitle>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <FieldLabel required>Nome</FieldLabel>
                          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome completo do lead" className="h-11 rounded-xl bg-background/60 border-border/40 text-sm" />
                        </div>
                        <div className="space-y-1.5">
                          <FieldLabel required>Telefone</FieldLabel>
                          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="5511999999999" className="h-11 rounded-xl bg-background/60 border-border/40 text-sm" />
                        </div>
                      </div>
                    </div>

                    {/* 📬 Contato */}
                    <div className="rounded-xl bg-muted/15 border border-border/30 p-4 space-y-3">
                      <SectionTitle>📬 Contato</SectionTitle>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <FieldLabel>Email</FieldLabel>
                          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@empresa.com" className="h-11 rounded-xl bg-background/60 border-border/40 text-sm" />
                        </div>
                        <div className="space-y-1.5">
                          <FieldLabel>Empresa</FieldLabel>
                          <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Nome da empresa" className="h-11 rounded-xl bg-background/60 border-border/40 text-sm" />
                        </div>
                      </div>
                    </div>

                    {/* 💰 Negócio */}
                    <div className="rounded-xl bg-muted/15 border border-border/30 p-4 space-y-3">
                      <SectionTitle>💰 Negócio</SectionTitle>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <FieldLabel>Interesse / Serviço</FieldLabel>
                          <Input value={form.interest} onChange={(e) => setForm({ ...form, interest: e.target.value })} placeholder="Ex: Automação para WhatsApp" className="h-11 rounded-xl bg-background/60 border-border/40 text-sm" />
                        </div>
                        <div className="space-y-1.5">
                          <FieldLabel>Valor potencial (R$)</FieldLabel>
                          <Input value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} placeholder="15000" type="number" className="h-11 rounded-xl bg-background/60 border-border/40 text-sm" />
                        </div>
                      </div>
                    </div>

                    {/* ⚙️ Gestão */}
                    <div className="rounded-xl bg-muted/15 border border-border/30 p-4 space-y-3">
                      <SectionTitle>⚙️ Gestão</SectionTitle>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <FieldLabel>Status</FieldLabel>
                          <Select value={form.pipeline_stage} onValueChange={(v) => setForm({ ...form, pipeline_stage: v })}>
                            <SelectTrigger className="h-11 rounded-xl bg-background/60 border-border/40 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((s) => (<SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <FieldLabel>Prioridade</FieldLabel>
                          <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                            <SelectTrigger className="h-11 rounded-xl bg-background/60 border-border/40 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PRIORITY_OPTIONS.map((p) => (<SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <FieldLabel>Responsável</FieldLabel>
                          <Input value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} placeholder="João Vendas" className="h-11 rounded-xl bg-background/60 border-border/40 text-sm" />
                        </div>
                      </div>
                    </div>

                    {/* 📊 Origem */}
                    <div className="rounded-xl bg-muted/15 border border-border/30 p-4 space-y-3">
                      <SectionTitle>📊 Origem</SectionTitle>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <FieldLabel>Origem</FieldLabel>
                          <Select value={form.origin} onValueChange={(v) => setForm({ ...form, origin: v })}>
                            <SelectTrigger className="h-11 rounded-xl bg-background/60 border-border/40 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ORIGIN_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <FieldLabel>Canal</FieldLabel>
                          <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
                            <SelectTrigger className="h-11 rounded-xl bg-background/60 border-border/40 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                              <SelectItem value="Site">Site</SelectItem>
                              <SelectItem value="Telefone">Telefone</SelectItem>
                              <SelectItem value="Email">Email</SelectItem>
                              <SelectItem value="Presencial">Presencial</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <FieldLabel>Segmento</FieldLabel>
                          <Input value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} placeholder="Ex: Tecnologia" className="h-11 rounded-xl bg-background/60 border-border/40 text-sm" />
                        </div>
                      </div>
                    </div>

                    {/* 📄 Documentos */}
                    <div className="rounded-xl bg-muted/15 border border-border/30 p-4 space-y-3">
                      <SectionTitle>📄 Documentos</SectionTitle>
                      <div className="space-y-1.5 max-w-xs">
                        <FieldLabel>CPF/CNPJ</FieldLabel>
                        <Input value={form.cpf_cnpj} onChange={(e) => setForm({ ...form, cpf_cnpj: e.target.value })} placeholder="000.000.000-00" className="h-11 rounded-xl bg-background/60 border-border/40 text-sm" />
                      </div>
                    </div>

                    {/* 📝 Contexto */}
                    <div className="rounded-xl bg-muted/15 border border-border/30 p-4 space-y-3">
                      <SectionTitle>📝 Contexto</SectionTitle>
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <FieldLabel>Necessidade do cliente</FieldLabel>
                          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Ex: Precisa de automação para WhatsApp com 50 instâncias" className="rounded-xl bg-background/60 border-border/40 text-sm" />
                        </div>
                        <div className="space-y-1.5">
                          <FieldLabel>Notas internas</FieldLabel>
                          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Ex: Cliente pediu retorno na sexta-feira" className="rounded-xl bg-background/60 border-border/40 text-sm" />
                        </div>
                      </div>
                    </div>

                    {/* Footer buttons */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/30">
                      <Button variant="ghost" size="sm" onClick={cancelEdit} className="h-9 rounded-lg">Cancelar</Button>
                      <Button size="sm" onClick={handleInlineSave} disabled={!form.name || !form.phone} className="h-9 rounded-lg gap-1.5">Salvar</Button>
                    </div>
                  </div>
                </div>
              );
            }

            /* ── VIEW MODE ── */
            return (
              <div>
                <div className="p-6 pb-5 border-b border-border/60">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-14 h-14 rounded-full bg-gradient-to-br flex items-center justify-center text-xl font-bold text-white shadow-md ring-2 ring-background",
                        getAvatarColor(detailLead.name || "?")
                      )}>
                        {getInitials(detailLead.name || "?")}
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-foreground">{detailLead.name || formatPhone(detailLead.phone)}</h2>
                        <p className="text-xs text-muted-foreground/60 mt-0.5">Lead capturado via {channelLabel} • {timeAgo(detailLead.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Badge variant="outline" className={cn("text-xs font-medium rounded-full px-3 py-1", statusCfg.badge)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full mr-1.5 inline-block", statusCfg.dot)} />
                        {statusCfg.label}
                      </Badge>
                      <Badge variant="outline" className={cn("text-[10px] font-medium rounded-full px-2.5", priorityCfg.color)}>
                        {priorityCfg.label}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <Select value={detailLead.pipeline_stage || "novo"} onValueChange={(v) => handleStatusChange(detailLead, v)}>
                      <SelectTrigger className="w-[170px] h-9 text-xs rounded-lg bg-muted/30 border-border/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            <span className="flex items-center gap-2"><span className={cn("w-2 h-2 rounded-full", s.dot)} />{s.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" className="gap-1.5 h-9 rounded-lg" onClick={() => openEdit(detailLead)}>
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </Button>
                    <Button variant="destructive" size="sm" className="gap-1.5 h-9 rounded-lg" onClick={() => handleDelete(detailLead.id)}>
                      <Trash2 className="w-3.5 h-3.5" /> Excluir
                    </Button>
                  </div>
                </div>

                <div className="px-6 pt-4">
                  <div className="flex gap-6 border-b border-border/50 mb-0">
                    {[
                      { key: "info", label: "Informações" },
                      { key: "timeline", label: "Timeline" },
                      { key: "register", label: "Registrar Interação" },
                    ].map((tab) => (
                      <button key={tab.key} onClick={() => setDetailTab(tab.key)} className={cn(
                        "pb-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                        detailTab === tab.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                      )}>{tab.label}</button>
                    ))}
                  </div>
                </div>

                <div className="px-6 py-5 pb-6">
                  {detailTab === "info" && (
                    <div className="space-y-5">
                      <div className="rounded-xl bg-muted/20 border border-border/30 p-4">
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground/70 tracking-wider mb-3 flex items-center gap-1.5">📌 Contato</p>
                        <div className="space-y-2.5">
                          <DetailRow icon={Phone} label="Telefone" value={formatPhone(detailLead.phone)} />
                          <DetailRow icon={MessageSquare} label="WhatsApp" value={formatPhone(detailLead.phone)} />
                          <DetailRow icon={Mail} label="E-mail" value={detailLead.email || na} muted={!detailLead.email} />
                        </div>
                      </div>
                      <div className="rounded-xl bg-muted/20 border border-border/30 p-4">
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground/70 tracking-wider mb-3 flex items-center gap-1.5">🏢 Empresa</p>
                        <div className="space-y-2.5">
                          <DetailRow icon={Building2} label="Empresa" value={detailLead.company || na} muted={!detailLead.company} />
                          <DetailRow icon={FileText} label="CPF/CNPJ" value={detailLead.cpf_cnpj || na} muted={!detailLead.cpf_cnpj} />
                          <DetailRow icon={MapPin} label="Segmento" value={detailLead.segment || na} muted={!detailLead.segment} />
                        </div>
                      </div>
                      <div className="rounded-xl bg-muted/20 border border-border/30 p-4">
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground/70 tracking-wider mb-3 flex items-center gap-1.5">💰 Negócio</p>
                        <div className="space-y-2.5">
                          <DetailRow icon={DollarSign} label="Valor potencial" value={detailLead.estimated_value ? formatCurrency(detailLead.estimated_value) : na} muted={!detailLead.estimated_value} />
                          <DetailRow icon={FileText} label="Serviço" value={detailLead.interest || na} muted={!detailLead.interest} />
                          <DetailRow icon={originCfg.icon} label="Origem do lead" value={originCfg.label} />
                          <DetailRow icon={Phone} label="Canal" value={channelLabel} />
                          <DetailRow icon={User} label="Responsável" value={detailLead.responsible || na} muted={!detailLead.responsible} />
                        </div>
                      </div>
                      <div className="rounded-xl bg-muted/20 border border-border/30 p-4">
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground/70 tracking-wider mb-3 flex items-center gap-1.5">📊 Histórico</p>
                        <div className="space-y-2.5">
                          <DetailRow icon={Calendar} label="Criado em" value={detailLead.created_at ? format(new Date(detailLead.created_at), "dd/MM/yyyy 'às' HH:mm") : na} />
                          <DetailRow icon={Clock} label="Última interação" value={detailLead.last_message_at ? timeAgo(detailLead.last_message_at) : na} muted={!detailLead.last_message_at} />
                        </div>
                      </div>
                      {detailLead.description && (
                        <div className="rounded-xl bg-muted/20 border border-border/30 p-4">
                          <p className="text-[10px] uppercase font-semibold text-muted-foreground/70 tracking-wider mb-2">Necessidade do cliente</p>
                          <p className="text-sm text-primary">{detailLead.description}</p>
                        </div>
                      )}
                      {detailLead.notes && (
                        <div className="rounded-xl bg-muted/20 border border-border/30 p-4">
                          <p className="text-[10px] uppercase font-semibold text-muted-foreground/70 tracking-wider mb-2">Notas internas</p>
                          <p className="text-sm text-muted-foreground">{detailLead.notes}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {detailTab === "timeline" && (
                    <div className="space-y-4">
                      <div className="relative pl-6 border-l-2 border-border/30 space-y-5">
                        {detailLead.last_message_at && (
                          <TimelineEvent label="Última mensagem recebida" time={timeAgo(detailLead.last_message_at)} preview={detailLead.last_message_content} dot="bg-emerald-500" />
                        )}
                        <TimelineEvent label={`Status definido como "${statusCfg.label}"`} time={timeAgo(detailLead.created_at)} dot={statusCfg.dot} />
                        <TimelineEvent label="Lead criado" time={detailLead.created_at ? format(new Date(detailLead.created_at), "dd/MM/yyyy 'às' HH:mm") : ""} dot="bg-blue-500" />
                      </div>
                      {!detailLead.last_message_at && (
                        <p className="text-xs text-muted-foreground/50 text-center pt-2">Nenhuma interação registrada ainda</p>
                      )}
                    </div>
                  )}

                  {detailTab === "register" && (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">Registre uma interação com este lead para manter o histórico atualizado.</p>
                      <Textarea placeholder="Ex: Cliente pediu orçamento de marketing digital para loja virtual" rows={4} className="rounded-xl bg-muted/20 border-border/40" />
                      <Button size="sm" className="gap-1.5 rounded-lg"><FileText className="w-3.5 h-3.5" /> Salvar interação</Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Create New Lead Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Lead</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome completo" />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone *</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="5511999999999" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Empresa</Label>
                <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Interesse / Serviço</Label>
                <Input value={form.interest} onChange={(e) => setForm({ ...form, interest: e.target.value })} placeholder="Ex: Branding Completo" />
              </div>
              <div className="space-y-1.5">
                <Label>Valor potencial (R$)</Label>
                <Input value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} placeholder="15000" type="number" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.pipeline_stage} onValueChange={(v) => setForm({ ...form, pipeline_stage: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (<SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => (<SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Necessidade do cliente</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Ex: Precisa de automação para WhatsApp" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.name || !form.phone}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
