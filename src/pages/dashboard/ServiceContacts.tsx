import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Upload, Trash2, Pencil, X, Users } from "lucide-react";

interface ServiceContact {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
  notes: string | null;
  tags: string[];
  status: string;
  origin: string;
  conversation_id: string | null;
  last_message_at: string | null;
  last_message_content: string | null;
  created_at: string;
}

export default function ServiceContacts() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<ServiceContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceContact | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "", tags: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchContacts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("service_contacts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setContacts((data as any[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const allTags = [...new Set(contacts.flatMap(c => c.tags || []))].sort();

  const filtered = contacts.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search);
    const matchTag = !filterTag || (c.tags || []).includes(filterTag);
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    return matchSearch && matchTag && matchStatus;
  });

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", phone: "", email: "", notes: "", tags: "" });
    setDialogOpen(true);
  };

  const openEdit = (c: ServiceContact) => {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone, email: c.email || "", notes: c.notes || "", tags: (c.tags || []).join(", ") });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    const tags = form.tags.split(",").map(t => t.trim()).filter(Boolean);
    const payload = { name: form.name, phone: form.phone, email: form.email || null, notes: form.notes || null, tags, user_id: user.id };

    if (editing) {
      const { error } = await supabase.from("service_contacts").update(payload as any).eq("id", editing.id);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Contato atualizado");
    } else {
      const { error } = await supabase.from("service_contacts").insert(payload as any);
      if (error) { toast.error("Erro ao criar"); return; }
      toast.success("Contato adicionado");
    }
    setDialogOpen(false);
    fetchContacts();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("service_contacts").delete().eq("id", id);
    toast.success("Contato removido");
    fetchContacts();
  };

  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const text = await file.text();
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) { toast.error("CSV vazio"); return; }

    const header = lines[0].toLowerCase().split(/[;,]/).map(h => h.trim());
    const nameIdx = header.findIndex(h => h === "nome" || h === "name");
    const phoneIdx = header.findIndex(h => h === "telefone" || h === "phone");
    const emailIdx = header.findIndex(h => h === "email");
    const notesIdx = header.findIndex(h => h === "observação" || h === "observacao" || h === "notes");

    if (phoneIdx === -1) { toast.error("Coluna 'telefone' não encontrada no CSV"); return; }

    const rows = lines.slice(1).map(line => {
      const cols = line.split(/[;,]/).map(c => c.trim().replace(/^["']|["']$/g, ""));
      return {
        user_id: user.id,
        name: nameIdx >= 0 ? cols[nameIdx] || "" : "",
        phone: cols[phoneIdx] || "",
        email: emailIdx >= 0 ? cols[emailIdx] || null : null,
        notes: notesIdx >= 0 ? cols[notesIdx] || null : null,
        origin: "csv",
      };
    }).filter(r => r.phone);

    if (!rows.length) { toast.error("Nenhum contato válido"); return; }

    const { error } = await supabase.from("service_contacts").insert(rows as any);
    if (error) { toast.error("Erro ao importar: " + error.message); return; }
    toast.success(`${rows.length} contatos importados`);
    fetchContacts();
    if (fileRef.current) fileRef.current.value = "";
  };

  const statusColors: Record<string, string> = {
    ativo: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    inativo: "bg-muted text-muted-foreground border-muted",
    lead: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    cliente: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Base de Atendimento</h1>
            <p className="text-xs text-muted-foreground">{contacts.length} contatos cadastrados</p>
          </div>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4 mr-1.5" /> Importar CSV
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4 mr-1.5" /> Adicionar contato
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou telefone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterTag || "all"} onValueChange={v => setFilterTag(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Tag" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as tags</SelectItem>
            {allTags.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
            <SelectItem value="lead">Lead</SelectItem>
            <SelectItem value="cliente">Cliente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="font-semibold">Nome</TableHead>
              <TableHead className="font-semibold">Telefone</TableHead>
              <TableHead className="font-semibold hidden md:table-cell">Email</TableHead>
              <TableHead className="font-semibold hidden lg:table-cell">Tags</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold hidden md:table-cell">Origem</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Nenhum contato encontrado</TableCell></TableRow>
            ) : filtered.map(c => (
              <TableRow key={c.id} className="hover:bg-muted/20 transition-colors">
                <TableCell className="font-medium">{c.name || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{c.phone}</TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{c.email || "—"}</TableCell>
                <TableCell className="hidden lg:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {(c.tags || []).map(t => (
                      <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0">{t}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${statusColors[c.status] || ""}`}>
                    {c.status}
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground capitalize">{c.origin}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar contato" : "Adicionar contato"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Nome</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome do contato" /></div>
            <div><Label>Telefone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="5511999999999" /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" /></div>
            <div><Label>Observação</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Anotações sobre o contato" rows={3} /></div>
            <div><Label>Tags (separadas por vírgula)</Label><Input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="vip, lead, suporte" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.phone}>{editing ? "Salvar" : "Adicionar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
