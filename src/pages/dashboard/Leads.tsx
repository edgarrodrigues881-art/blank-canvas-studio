import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Plus,
  Upload,
  Trash2,
  Pencil,
  UserPlus,
  Tag,
  GitBranch,
  CalendarClock,
  MoreHorizontal,
  Thermometer,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/utils/formatters";
import { format } from "date-fns";

/* ── types ── */
type LeadStatus = "frio" | "morno" | "quente" | "cliente" | "perdido";
type LeadOrigin = "campanha" | "prospeccao" | "crm" | "manual";

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
}

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; icon: string }> = {
  frio: { label: "Frio", color: "bg-blue-500/15 text-blue-400 border-blue-500/30", icon: "❄️" },
  morno: { label: "Morno", color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: "☀️" },
  quente: { label: "Quente", color: "bg-red-500/15 text-red-400 border-red-500/30", icon: "🔥" },
  cliente: { label: "Cliente", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: "✅" },
  perdido: { label: "Perdido", color: "bg-muted text-muted-foreground border-border", icon: "💀" },
};

const ORIGIN_LABELS: Record<string, string> = {
  campanha: "Campanha",
  prospeccao: "Prospecção",
  crm: "CRM",
  manual: "Manual",
  WhatsApp: "WhatsApp",
};

export default function Leads() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTag, setFilterTag] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [tagTarget, setTagTarget] = useState<Lead | null>(null);
  const [newTag, setNewTag] = useState("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    company: "",
    notes: "",
    tags: "",
    origin: "manual" as string,
    lead_temperature: "frio" as string,
  });
  const fileRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  /* ── derived ── */
  const allTags = [...new Set(leads.flatMap((l) => l.tags || []))].sort();

  const filtered = leads.filter((l) => {
    const s = search.toLowerCase();
    const matchSearch =
      !search ||
      l.name?.toLowerCase().includes(s) ||
      l.phone?.includes(search) ||
      l.email?.toLowerCase().includes(s);
    const temp = l.lead_temperature || "frio";
    const matchStatus = filterStatus === "all" || temp === filterStatus;
    const matchTag = !filterTag || (l.tags || []).includes(filterTag);
    return matchSearch && matchStatus && matchTag;
  });

  /* ── CRUD ── */
  const openNew = () => {
    setEditing(null);
    setForm({ name: "", phone: "", email: "", company: "", notes: "", tags: "", origin: "manual", lead_temperature: "frio" });
    setDialogOpen(true);
  };

  const openEdit = (l: Lead) => {
    setEditing(l);
    setForm({
      name: l.name,
      phone: l.phone,
      email: l.email || "",
      company: l.company || "",
      notes: l.notes || "",
      tags: (l.tags || []).join(", "),
      origin: l.origin || "manual",
      lead_temperature: l.lead_temperature || "frio",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const payload: any = {
      name: form.name,
      phone: form.phone,
      email: form.email || null,
      company: form.company || null,
      notes: form.notes || null,
      tags,
      origin: form.origin,
      lead_temperature: form.lead_temperature,
      user_id: user.id,
    };

    if (editing) {
      const { error } = await supabase.from("service_contacts").update(payload).eq("id", editing.id);
      if (error) {
        toast.error("Erro ao atualizar lead");
        return;
      }
      toast.success("Lead atualizado!");
    } else {
      payload.status = "active";
      const { error } = await supabase.from("service_contacts").insert(payload);
      if (error) {
        toast.error("Erro ao criar lead");
        return;
      }
      toast.success("Lead criado!");
    }
    setDialogOpen(false);
    fetchLeads();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("service_contacts").delete().eq("id", id);
    toast.success("Lead removido");
    fetchLeads();
  };

  /* ── Tag management ── */
  const openTagDialog = (l: Lead) => {
    setTagTarget(l);
    setNewTag("");
    setTagDialogOpen(true);
  };

  const addTag = async () => {
    if (!tagTarget || !newTag.trim()) return;
    const updated = [...new Set([...(tagTarget.tags || []), newTag.trim()])];
    await supabase.from("service_contacts").update({ tags: updated } as any).eq("id", tagTarget.id);
    toast.success("Tag adicionada!");
    setTagDialogOpen(false);
    fetchLeads();
  };

  const removeTag = async (lead: Lead, tag: string) => {
    const updated = (lead.tags || []).filter((t) => t !== tag);
    await supabase.from("service_contacts").update({ tags: updated } as any).eq("id", lead.id);
    fetchLeads();
  };

  /* ── Pipeline ── */
  const moveToPipeline = async (lead: Lead, stage: string) => {
    await supabase.from("service_contacts").update({ pipeline_stage: stage } as any).eq("id", lead.id);
    toast.success(`Lead movido para "${stage}"`);
    fetchLeads();
  };

  /* ── Temperature ── */
  const setTemperature = async (lead: Lead, temp: LeadStatus) => {
    await supabase.from("service_contacts").update({ lead_temperature: temp } as any).eq("id", lead.id);
    toast.success(`Temperatura alterada para ${STATUS_CONFIG[temp].label}`);
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
    const phoneIdx = headers.findIndex((h) => h.includes("telefone") || h.includes("phone") || h.includes("fone"));
    if (phoneIdx < 0) return toast.error("Coluna de telefone não encontrada");

    const rows = lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim());
      return {
        user_id: user.id,
        name: nameIdx >= 0 ? cols[nameIdx] || "" : "",
        phone: cols[phoneIdx] || "",
        origin: "manual",
        status: "active",
        lead_temperature: "frio",
        tags: [] as string[],
      };
    });
    const { error } = await supabase.from("service_contacts").insert(rows as any);
    if (error) toast.error("Erro ao importar");
    else toast.success(`${rows.length} leads importados!`);
    fetchLeads();
    if (fileRef.current) fileRef.current.value = "";
  };

  /* ── stats ── */
  const statCounts = {
    total: leads.length,
    frio: leads.filter((l) => (l.lead_temperature || "frio") === "frio").length,
    morno: leads.filter((l) => l.lead_temperature === "morno").length,
    quente: leads.filter((l) => l.lead_temperature === "quente").length,
    cliente: leads.filter((l) => l.lead_temperature === "cliente").length,
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UserPlus className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <Badge variant="secondary" className="text-xs">{leads.length}</Badge>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-1.5">
            <Upload className="w-3.5 h-3.5" /> Importar CSV
          </Button>
          <Button size="sm" onClick={openNew} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Novo Lead
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {([
          { label: "Total", value: statCounts.total, color: "text-foreground" },
          { label: "❄️ Frios", value: statCounts.frio, color: "text-blue-400" },
          { label: "☀️ Mornos", value: statCounts.morno, color: "text-amber-400" },
          { label: "🔥 Quentes", value: statCounts.quente, color: "text-red-400" },
          { label: "✅ Clientes", value: statCounts.cliente, color: "text-emerald-400" },
        ]).map((s) => (
          <Card key={s.label} className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, telefone ou email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="frio">❄️ Frio</SelectItem>
            <SelectItem value="morno">☀️ Morno</SelectItem>
            <SelectItem value="quente">🔥 Quente</SelectItem>
            <SelectItem value="cliente">✅ Cliente</SelectItem>
            <SelectItem value="perdido">💀 Perdido</SelectItem>
          </SelectContent>
        </Select>
        {allTags.length > 0 && (
          <Select value={filterTag} onValueChange={setFilterTag}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Tag" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todas</SelectItem>
              {allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Table */}
      <Card className="bg-card border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Entrada</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Nenhum lead encontrado</TableCell></TableRow>
            ) : (
              filtered.map((lead) => {
                const temp = (lead.lead_temperature || "frio") as LeadStatus;
                const cfg = STATUS_CONFIG[temp] || STATUS_CONFIG.frio;
                return (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">
                      <div>
                        <p className="text-foreground">{lead.name}</p>
                        {lead.email && <p className="text-xs text-muted-foreground">{lead.email}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatPhone(lead.phone)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {ORIGIN_LABELS[lead.origin] || lead.origin}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={cn("text-[11px] px-2 py-1 rounded-md font-semibold border", cfg.color)}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(lead.tags || []).slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[10px] gap-1">
                            {tag}
                            <button onClick={() => removeTag(lead, tag)} className="hover:text-destructive">
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </Badge>
                        ))}
                        {(lead.tags || []).length > 3 && (
                          <Badge variant="secondary" className="text-[10px]">+{lead.tags.length - 3}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {lead.created_at ? format(new Date(lead.created_at), "dd/MM/yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => openEdit(lead)}>
                            <Pencil className="w-3.5 h-3.5 mr-2" /> Editar lead
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openTagDialog(lead)}>
                            <Tag className="w-3.5 h-3.5 mr-2" /> Adicionar tag
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => moveToPipeline(lead, "novo")}>
                            <GitBranch className="w-3.5 h-3.5 mr-2" /> Mover p/ Pipeline
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            toast.info("Redirecione para Agendamentos para criar follow-up");
                          }}>
                            <CalendarClock className="w-3.5 h-3.5 mr-2" /> Agendar follow-up
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(lead.id)}>
                            <Trash2 className="w-3.5 h-3.5 mr-2" /> Remover
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* ── Create/Edit dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
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
                <Label>Origem</Label>
                <Select value={form.origin} onValueChange={(v) => setForm({ ...form, origin: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="campanha">Campanha</SelectItem>
                    <SelectItem value="prospeccao">Prospecção</SelectItem>
                    <SelectItem value="crm">CRM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Temperatura</Label>
                <Select value={form.lead_temperature} onValueChange={(v) => setForm({ ...form, lead_temperature: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="frio">❄️ Frio</SelectItem>
                    <SelectItem value="morno">☀️ Morno</SelectItem>
                    <SelectItem value="quente">🔥 Quente</SelectItem>
                    <SelectItem value="cliente">✅ Cliente</SelectItem>
                    <SelectItem value="perdido">💀 Perdido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tags (separadas por vírgula)</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="vip, interessado, produto-x" />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.name || !form.phone}>{editing ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Tag dialog ── */}
      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Gerenciar Tags</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Lead: <strong>{tagTarget?.name}</strong></p>
            
            {/* Current tags */}
            {(tagTarget?.tags || []).length > 0 && (
              <div>
                <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-1.5">Tags atuais</p>
                <div className="flex flex-wrap gap-1.5">
                  {(tagTarget?.tags || []).map((t) => (
                    <Badge key={t} variant="secondary" className="text-xs gap-1.5">
                      {t}
                      <button onClick={async () => {
                        if (!tagTarget) return;
                        const updated = (tagTarget.tags || []).filter((x) => x !== t);
                        await supabase.from("service_contacts").update({ tags: updated } as any).eq("id", tagTarget.id);
                        setTagTarget({ ...tagTarget, tags: updated });
                        fetchLeads();
                      }} className="hover:text-destructive">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Suggested tags */}
            <div>
              <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-1.5">Sugestões rápidas</p>
              <div className="flex flex-wrap gap-1.5">
                {["Interessado", "Sem resposta", "Follow-up", "Cliente", "VIP", "Urgente", "Negociação", "Retorno"].filter(
                  (s) => !(tagTarget?.tags || []).includes(s)
                ).map((suggested) => (
                  <button
                    key={suggested}
                    onClick={async () => {
                      if (!tagTarget) return;
                      const updated = [...new Set([...(tagTarget.tags || []), suggested])];
                      await supabase.from("service_contacts").update({ tags: updated } as any).eq("id", tagTarget.id);
                      setTagTarget({ ...tagTarget, tags: updated });
                      toast.success(`Tag "${suggested}" adicionada!`);
                      fetchLeads();
                    }}
                    className="text-[11px] px-2 py-1 rounded-md border border-dashed border-border/60 text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all"
                  >
                    + {suggested}
                  </button>
                ))}
              </div>
            </div>

            {/* Existing tags from other leads */}
            {allTags.filter((t) => !(tagTarget?.tags || []).includes(t) && !["Interessado", "Sem resposta", "Follow-up", "Cliente", "VIP", "Urgente", "Negociação", "Retorno"].includes(t)).length > 0 && (
              <div>
                <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-1.5">Tags existentes</p>
                <div className="flex flex-wrap gap-1.5">
                  {allTags.filter((t) => !(tagTarget?.tags || []).includes(t) && !["Interessado", "Sem resposta", "Follow-up", "Cliente", "VIP", "Urgente", "Negociação", "Retorno"].includes(t)).map((existing) => (
                    <button
                      key={existing}
                      onClick={async () => {
                        if (!tagTarget) return;
                        const updated = [...new Set([...(tagTarget.tags || []), existing])];
                        await supabase.from("service_contacts").update({ tags: updated } as any).eq("id", tagTarget.id);
                        setTagTarget({ ...tagTarget, tags: updated });
                        toast.success(`Tag "${existing}" adicionada!`);
                        fetchLeads();
                      }}
                      className="text-[11px] px-2 py-1 rounded-md border border-border/40 text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all"
                    >
                      + {existing}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Custom tag input */}
            <div>
              <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-1.5">Tag personalizada</p>
              <div className="flex gap-2">
                <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Nova tag..." onKeyDown={(e) => e.key === "Enter" && addTag()} className="flex-1" />
                <Button size="sm" onClick={addTag} disabled={!newTag.trim()}>Adicionar</Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagDialogOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
