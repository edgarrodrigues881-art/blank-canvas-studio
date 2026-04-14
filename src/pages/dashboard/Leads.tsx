import { useState, useEffect, useCallback, useRef } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, Plus, Upload, Trash2, Pencil, X, Phone, Mail, Building2, DollarSign, Calendar, MapPin, FileText, User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/utils/formatters";
import { format } from "date-fns";

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
  { value: "novo", label: "Novo Lead", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "respondeu", label: "Respondeu", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  { value: "interessado", label: "Interessado", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "negociacao", label: "Negociação", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "fechado", label: "Fechado", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "perdido", label: "Perdido", color: "bg-red-100 text-red-700 border-red-200" },
];

const PRIORITY_OPTIONS = [
  { value: "baixa", label: "Baixa", color: "bg-slate-100 text-slate-600 border-slate-200" },
  { value: "media", label: "Média", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { value: "alta", label: "Alta", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "urgente", label: "Urgente", color: "bg-red-100 text-red-700 border-red-200" },
];

const ORIGIN_OPTIONS = [
  { value: "site", label: "Site" },
  { value: "indicacao", label: "Indicação" },
  { value: "google", label: "Google" },
  { value: "redes_sociais", label: "Redes Sociais" },
  { value: "evento", label: "Evento" },
  { value: "campanha", label: "Campanha" },
  { value: "manual", label: "Manual" },
];

function getStatusConfig(status: string | null) {
  return STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];
}

function getPriorityConfig(priority: string | null) {
  return PRIORITY_OPTIONS.find((p) => p.value === (priority || "media")) || PRIORITY_OPTIONS[1];
}

function formatCurrency(value: number | null) {
  if (!value) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
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
  const [detailTab, setDetailTab] = useState("info");
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: "", phone: "", email: "", company: "", notes: "",
    origin: "manual", pipeline_stage: "contato_inicial",
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
  const statusCounts = STATUS_OPTIONS.reduce((acc, s) => {
    acc[s.value] = leads.filter((l) => (l.pipeline_stage || "contato_inicial") === s.value).length;
    return acc;
  }, {} as Record<string, number>);

  const filtered = leads.filter((l) => {
    const s = search.toLowerCase();
    const matchSearch = !search ||
      l.name?.toLowerCase().includes(s) ||
      l.phone?.includes(search) ||
      l.email?.toLowerCase().includes(s) ||
      l.company?.toLowerCase().includes(s);
    const stage = l.pipeline_stage || "contato_inicial";
    const matchStatus = statusFilter === "all" || stage === statusFilter;
    const matchPriority = priorityFilter === "all" || (l.priority || "media") === priorityFilter;
    const matchOrigin = originFilter === "all" || l.origin === originFilter;
    return matchSearch && matchStatus && matchPriority && matchOrigin;
  });

  /* ── CRUD ── */
  const openNew = () => {
    setEditing(null);
    setForm({
      name: "", phone: "", email: "", company: "", notes: "",
      origin: "manual", pipeline_stage: "contato_inicial",
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
      pipeline_stage: l.pipeline_stage || "contato_inicial",
      interest: l.interest || "", estimated_value: l.estimated_value?.toString() || "",
      priority: l.priority || "media", responsible: l.responsible || "",
      segment: l.segment || "", cpf_cnpj: l.cpf_cnpj || "",
      channel: l.channel || "WhatsApp", description: l.description || "",
    });
    setDialogOpen(true);
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
        pipeline_stage: "contato_inicial", tags: [] as string[], priority: "media",
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

      {/* Status Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter("all")}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
            statusFilter === "all"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-muted-foreground border-border hover:border-primary/40"
          )}
        >
          Todos ({leads.length})
        </button>
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(statusFilter === s.value ? "all" : s.value)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              statusFilter === s.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/40"
            )}
          >
            {s.label} ({statusCounts[s.value] || 0})
          </button>
        ))}
      </div>

      {/* Search & Filters */}
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
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[140px] h-10 rounded-xl bg-muted/30 border-border/50">
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
          <SelectTrigger className="w-[140px] h-10 rounded-xl bg-muted/30 border-border/50">
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
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20">
              <TableHead className="font-semibold text-[11px] uppercase tracking-wider">Lead / Empresa</TableHead>
              <TableHead className="font-semibold text-[11px] uppercase tracking-wider">Contato</TableHead>
              <TableHead className="font-semibold text-[11px] uppercase tracking-wider hidden lg:table-cell">Interesse</TableHead>
              <TableHead className="font-semibold text-[11px] uppercase tracking-wider hidden xl:table-cell">Valor Est.</TableHead>
              <TableHead className="font-semibold text-[11px] uppercase tracking-wider hidden md:table-cell">Prioridade</TableHead>
              <TableHead className="font-semibold text-[11px] uppercase tracking-wider">Status</TableHead>
              <TableHead className="font-semibold text-[11px] uppercase tracking-wider hidden lg:table-cell">Responsável</TableHead>
              <TableHead className="font-semibold text-[11px] uppercase tracking-wider hidden md:table-cell">Entrada</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Nenhum lead encontrado</TableCell></TableRow>
            ) : (
              filtered.map((lead) => {
                const statusCfg = getStatusConfig(lead.pipeline_stage);
                const priorityCfg = getPriorityConfig(lead.priority);
                const originLabel = ORIGIN_OPTIONS.find((o) => o.value === lead.origin)?.label || lead.origin;
                return (
                  <TableRow
                    key={lead.id}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => { setDetailLead(lead); setDetailTab("info"); }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {(lead.name || "?")[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{lead.name || "Sem nome"}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{lead.company || "—"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs text-foreground">{formatPhone(lead.phone)}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{lead.email || "—"}</p>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <p className="text-xs text-foreground">{lead.interest || "—"}</p>
                      <p className="text-[11px] text-muted-foreground">{originLabel}</p>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <span className="text-xs font-medium text-foreground">{formatCurrency(lead.estimated_value)}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="outline" className={cn("text-[10px] font-medium rounded-md", priorityCfg.color)}>
                        {priorityCfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-[10px] font-medium rounded-md", statusCfg.color)}>
                        {statusCfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-xs text-muted-foreground">{lead.responsible || "—"}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {lead.created_at ? format(new Date(lead.created_at), "dd/MM/yyyy") : "—"}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Detail Dialog ── */}
      <Dialog open={!!detailLead} onOpenChange={(open) => !open && setDetailLead(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0">
          {detailLead && (() => {
            const statusCfg = getStatusConfig(detailLead.pipeline_stage);
            const priorityCfg = getPriorityConfig(detailLead.priority);
            return (
              <div>
                {/* Header */}
                <div className="flex items-start justify-between p-6 pb-4 border-b border-border">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                      {(detailLead.name || "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-foreground">{detailLead.name}</h2>
                      <p className="text-sm text-muted-foreground">{detailLead.company || "—"}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline" className={cn("text-xs font-medium rounded-md", statusCfg.color)}>
                      {statusCfg.label}
                    </Badge>
                    <Badge variant="outline" className={cn("text-[10px] font-medium rounded-md", priorityCfg.color)}>
                      {priorityCfg.label}
                    </Badge>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 px-6 py-3 border-b border-border">
                  <Select
                    value={detailLead.pipeline_stage || "contato_inicial"}
                    onValueChange={(v) => handleStatusChange(detailLead, v)}
                  >
                    <SelectTrigger className="w-[180px] h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={() => { openEdit(detailLead); setDetailLead(null); }}>
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </Button>
                  <Button variant="destructive" size="sm" className="gap-1.5 h-9" onClick={() => handleDelete(detailLead.id)}>
                    <Trash2 className="w-3.5 h-3.5" /> Excluir
                  </Button>
                </div>

                {/* Tabs */}
                <div className="px-6 pt-4">
                  <div className="flex gap-6 border-b border-border mb-4">
                    {[
                      { key: "info", label: "Informações" },
                      { key: "timeline", label: "Timeline" },
                      { key: "register", label: "Registrar Contato" },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setDetailTab(tab.key)}
                        className={cn(
                          "pb-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                          detailTab === tab.key
                            ? "border-primary text-foreground"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tab content */}
                <div className="px-6 pb-6">
                  {detailTab === "info" && (
                    <div className="space-y-6">
                      {/* Contact & Company */}
                      <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                        <div>
                          <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mb-2">Contato</p>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">Telefone:</span>
                              <span className="font-medium">{formatPhone(detailLead.phone)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">WhatsApp:</span>
                              <span className="font-medium">{formatPhone(detailLead.phone)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">E-mail:</span>
                              <span className="font-medium">{detailLead.email || "—"}</span>
                            </div>
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mb-2">Empresa</p>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">Empresa:</span>
                              <span className="font-medium">{detailLead.company || "—"}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">CPF/CNPJ:</span>
                              <span className="font-medium">{detailLead.cpf_cnpj || "—"}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">Segmento:</span>
                              <span className="font-medium">{detailLead.segment || "—"}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Deal & History */}
                      <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                        <div>
                          <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mb-2">Negócio</p>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">Valor Estimado:</span>
                              <span className="font-medium">{formatCurrency(detailLead.estimated_value)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">Serviço:</span>
                              <span className="font-medium">{detailLead.interest || "—"}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">Origem:</span>
                              <span className="font-medium">
                                {ORIGIN_OPTIONS.find((o) => o.value === detailLead.origin)?.label || detailLead.origin}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">Canal:</span>
                              <span className="font-medium">{detailLead.channel || "WhatsApp"}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <User className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">Responsável:</span>
                              <span className="font-medium">{detailLead.responsible || "—"}</span>
                            </div>
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mb-2">Histórico</p>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">Cadastro:</span>
                              <span className="font-medium">
                                {detailLead.created_at ? format(new Date(detailLead.created_at), "dd/MM/yyyy, HH:mm:ss") : "—"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">Último contato:</span>
                              <span className="font-medium">
                                {detailLead.last_message_at ? format(new Date(detailLead.last_message_at), "dd/MM/yyyy") : "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      {detailLead.description && (
                        <div>
                          <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mb-2">Descrição da Necessidade</p>
                          <p className="text-sm text-primary">{detailLead.description}</p>
                        </div>
                      )}

                      {/* Notes */}
                      {detailLead.notes && (
                        <div>
                          <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mb-2">Observações</p>
                          <p className="text-sm text-muted-foreground">{detailLead.notes}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {detailTab === "timeline" && (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Calendar className="w-8 h-8 mb-2 opacity-30" />
                      <p className="text-sm">Timeline em breve</p>
                    </div>
                  )}

                  {detailTab === "register" && (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <FileText className="w-8 h-8 mb-2 opacity-30" />
                      <p className="text-sm">Registro de contatos em breve</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Create/Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Lead" : "Novo Lead"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
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
                <Label>Valor Estimado (R$)</Label>
                <Input value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} placeholder="15000" type="number" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.pipeline_stage} onValueChange={(v) => setForm({ ...form, pipeline_stage: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Origem</Label>
                <Select value={form.origin} onValueChange={(v) => setForm({ ...form, origin: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ORIGIN_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Responsável</Label>
                <Input value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} placeholder="João Vendas" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Segmento</Label>
                <Input value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} placeholder="Tecnologia" />
              </div>
              <div className="space-y-1.5">
                <Label>CPF/CNPJ</Label>
                <Input value={form.cpf_cnpj} onChange={(e) => setForm({ ...form, cpf_cnpj: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Canal</Label>
                <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                    <SelectItem value="Site">Site</SelectItem>
                    <SelectItem value="Telefone">Telefone</SelectItem>
                    <SelectItem value="Email">Email</SelectItem>
                    <SelectItem value="Presencial">Presencial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição da Necessidade</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Descreva a necessidade do lead..." />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.name || !form.phone}>{editing ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
