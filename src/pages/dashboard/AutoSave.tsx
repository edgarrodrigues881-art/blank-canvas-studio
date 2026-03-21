import { useState, useMemo, useRef, useCallback, memo, type CSSProperties, type ReactElement } from "react";
import { List as VirtualList } from "react-window";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  useAutosaveContacts, type WarmupAutosaveContact,
} from "@/hooks/useWarmupV2";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAutosaveMutations } from "@/hooks/useAutosaveMutations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Plus, Upload, Search, Zap, Trash2, Edit2, Power, PowerOff,
  CheckCircle2, XCircle, AlertTriangle, Loader2, Users, FileSpreadsheet,
} from "lucide-react";
// XLSX is dynamically imported when needed to reduce initial bundle

function parseToE164(raw: string): { valid: boolean; phone: string; original: string } {
  const original = raw.trim();
  const digits = original.replace(/\D/g, "");
  if (!digits || digits.length < 10 || digits.length > 15) {
    return { valid: false, phone: "", original };
  }
  if (digits.startsWith("55") && digits.length >= 12) {
    return { valid: true, phone: `+${digits}`, original };
  }
  if (digits.length === 10 || digits.length === 11) {
    return { valid: true, phone: `+55${digits}`, original };
  }
  return { valid: true, phone: `+${digits}`, original };
}

// ── Virtualized Row Component (stable reference) ──
function AutoSaveRowInner({ index, style, filtered, onEdit, onToggle, onDelete, ariaAttributes }: any): ReactElement | null {
  const c = filtered[index];
  if (!c) return null;
  return (
    <div style={{ ...style, paddingBottom: 6, paddingRight: 4 }}>
      <div className={cn(
        "h-[62px] rounded-xl border border-border/15 bg-card/60 backdrop-blur-sm transition-all duration-150 hover:border-border/30 hover:bg-card/80 group/row",
        !c.is_active && "opacity-40"
      )}>
        <div className="px-4 flex items-center gap-3.5 h-full">
          <div className={cn(
            "w-2 h-2 rounded-full shrink-0 ring-2",
            c.is_active ? "bg-emerald-400 ring-emerald-400/20" : "bg-muted-foreground/30 ring-muted-foreground/10"
          )} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-foreground truncate">
              {c.contact_name || "Sem nome"}
            </p>
            <p className="text-[11px] font-mono text-muted-foreground/60">{c.phone_e164}</p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0 opacity-60 group-hover/row:opacity-100 transition-opacity">
            <button className="inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-muted/40 transition-colors" onClick={() => onEdit(c)}>
              <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button className="inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-muted/40 transition-colors" onClick={() => onToggle(c)}>
              {c.is_active ? <PowerOff className="w-3.5 h-3.5 text-amber-400" /> : <Power className="w-3.5 h-3.5 text-emerald-400" />}
            </button>
            <button className="inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-destructive/10 transition-colors" onClick={() => onDelete(c.id)}>
              <Trash2 className="w-3.5 h-3.5 text-destructive/70" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const AutoSave = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: contacts = [], isLoading } = useAutosaveContacts();
  const { createContact, updateContact, deleteContact, bulkCreate } = useAutosaveMutations();
  const queryClient = useQueryClient();

  // Filters
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Add modal
  const [addOpen, setAddOpen] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addTags, setAddTags] = useState("");

  // Edit modal
  const [editContact, setEditContact] = useState<WarmupAutosaveContact | null>(null);
  const [editName, setEditName] = useState("");
  const [editTags, setEditTags] = useState("");

  // Import modal
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<{
    valid: { phone: string; original: string; name?: string }[];
    invalid: string[];
    duplicates: string[];
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<"text" | "file">("text");
  const [fileName, setFileName] = useState("");
  const [fileColumns, setFileColumns] = useState<string[]>([]);
  const [fileRows, setFileRows] = useState<Record<string, string>[]>([]);
  const [phoneCol, setPhoneCol] = useState("");
  const [nameCol, setNameCol] = useState("");

  // All unique tags
  const allTags = useMemo(() => {
    const s = new Set<string>();
    contacts.forEach(c => {
      if (c.tags) c.tags.split(",").map(t => t.trim()).filter(Boolean).forEach(t => s.add(t));
    });
    return Array.from(s).sort();
  }, [contacts]);

  // Filtered contacts
  const filtered = useMemo(() => {
    return contacts.filter(c => {
      if (statusFilter === "active" && !c.is_active) return false;
      if (statusFilter === "inactive" && c.is_active) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.contact_name.toLowerCase().includes(q) && !c.phone_e164.includes(q)) return false;
      }
      if (tagFilter && (!c.tags || !c.tags.toLowerCase().includes(tagFilter.toLowerCase()))) return false;
      return true;
    });
  }, [contacts, search, tagFilter, statusFilter]);

  const activeFiltered = useMemo(() => filtered.filter(c => c.is_active), [filtered]);
  const inactiveFiltered = useMemo(() => filtered.filter(c => !c.is_active), [filtered]);
  const activeCount = contacts.filter(c => c.is_active).length;
  const inactiveCount = contacts.filter(c => !c.is_active).length;
  const [showInactive, setShowInactive] = useState(false);

  const handleEditContact = useCallback((c: WarmupAutosaveContact) => {
    setEditContact(c); setEditName(c.contact_name); setEditTags(c.tags || "");
  }, []);


  // ── Handlers ──
  const handleAdd = () => {
    const parsed = parseToE164(addPhone);
    if (!parsed.valid) {
      toast({ title: "Número inválido", description: "Insira um número válido (ex: 62994192500)", variant: "destructive" });
      return;
    }
    createContact.mutate(
      { contact_name: addName || "Sem nome", phone_e164: parsed.phone, tags: addTags },
      {
        onSuccess: () => {
          toast({ title: "Contato adicionado" });
          setAddOpen(false);
          setAddName("");
          setAddPhone("");
          setAddTags("");
        },
        onError: (err: any) => {
          const msg = err.message?.includes("duplicate") ? "Número já cadastrado" : err.message;
          toast({ title: "Erro", description: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleEdit = () => {
    if (!editContact) return;
    updateContact.mutate(
      { id: editContact.id, contact_name: editName, tags: editTags },
      {
        onSuccess: () => {
          toast({ title: "Contato atualizado" });
          setEditContact(null);
        },
      }
    );
  };

  const handleToggleActive = (c: WarmupAutosaveContact) => {
    updateContact.mutate(
      { id: c.id, is_active: !c.is_active },
      { onSuccess: () => toast({ title: c.is_active ? "Contato desativado" : "Contato ativado" }) }
    );
  };

  const handleDelete = (id: string) => {
    deleteContact.mutate(id, { onSuccess: () => toast({ title: "Contato excluído" }) });
  };

  const activeRowProps = useMemo(() => ({
    filtered: activeFiltered,
    onEdit: handleEditContact,
    onToggle: handleToggleActive,
    onDelete: handleDelete,
  }), [activeFiltered, handleEditContact]);

  const inactiveRowProps = useMemo(() => ({
    filtered: inactiveFiltered,
    onEdit: handleEditContact,
    onToggle: handleToggleActive,
    onDelete: handleDelete,
  }), [inactiveFiltered, handleEditContact]);

  const handleDeleteAll = async () => {
    if (!contacts.length || !user) return;
    try {
      const { error } = await supabase
        .from("warmup_autosave_contacts" as any)
        .delete()
        .eq("user_id", user.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["warmup_autosave_contacts"] });
      toast({ title: `${contacts.length} contatos apagados` });
    } catch (err: any) {
      toast({ title: "Erro ao apagar contatos", description: err.message, variant: "destructive" });
    }
    setDeleteAllOpen(false);
  };

  // ── Import ──
  const handleValidateImport = (inputLines?: string[], nameMap?: Map<string, string>) => {
    const lines = inputLines || importText.split("\n").map(l => l.trim()).filter(Boolean);
    const existingPhones = new Set(contacts.map(c => c.phone_e164));
    const valid: { phone: string; original: string; name?: string }[] = [];
    const invalid: string[] = [];
    const duplicates: string[] = [];
    const seenInBatch = new Set<string>();

    lines.forEach(line => {
      const parsed = parseToE164(line);
      if (!parsed.valid) {
        invalid.push(line);
      } else if (existingPhones.has(parsed.phone) || seenInBatch.has(parsed.phone)) {
        duplicates.push(line);
      } else {
        valid.push({ ...parsed, name: nameMap?.get(line) || "" });
        seenInBatch.add(parsed.phone);
      }
    });

    setImportPreview({ valid, invalid, duplicates });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImportPreview(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await import("xlsx");
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        
        // Force all number cells to text to avoid scientific notation (e.g. 5.51E+12)
        const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
        for (let R = range.s.r; R <= range.e.r; R++) {
          for (let C = range.s.c; C <= range.e.c; C++) {
            const addr = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = sheet[addr];
            if (cell && cell.t === "n") {
              cell.t = "s";
              cell.v = String(cell.v);
              cell.w = String(cell.v);
            }
          }
        }
        
        const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
        
        if (rawRows.length < 2) {
          toast({ title: "Arquivo vazio ou sem dados", variant: "destructive" });
          return;
        }

        // First row = headers, rest = data
        const headers = rawRows[0].map((h: any) => String(h).trim() || `Col${Math.random().toString(36).slice(2, 6)}`);
        const dataRows = rawRows.slice(1).filter(r => r.some((c: any) => String(c).trim() !== ""));
        
        if (dataRows.length === 0) {
          toast({ title: "Arquivo sem dados", variant: "destructive" });
          return;
        }

        // Convert to Record<string, string> using headers
        const rows: Record<string, string>[] = dataRows.map(row => {
          const obj: Record<string, string> = {};
          headers.forEach((h: string, i: number) => {
            obj[h] = String(row[i] ?? "").trim();
          });
          return obj;
        });

        const cols = headers;
        setFileColumns(cols);
        setFileRows(rows);

        // Auto-detect phone/name columns
        const phoneLike = cols.find(c => /phone|telefone|numero|número|celular|whatsapp|fone/i.test(c));
        const nameLike = cols.find(c => /name|nome|contato/i.test(c));
        setPhoneCol(phoneLike || cols[0]);
        setNameCol(nameLike || "");
        setImportMode("file");
      } catch {
        toast({ title: "Erro ao ler arquivo", description: "Verifique se o arquivo é CSV ou XLSX válido", variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const handleValidateFile = () => {
    if (!phoneCol || fileRows.length === 0) return;
    const phones = fileRows.map(r => String(r[phoneCol] || "").trim()).filter(Boolean);
    const nameMap = new Map<string, string>();
    if (nameCol) {
      fileRows.forEach(r => {
        const phone = String(r[phoneCol] || "").trim();
        const name = String(r[nameCol] || "").trim();
        if (phone && name) nameMap.set(phone, name);
      });
    }
    handleValidateImport(phones, nameMap);
  };

  const [importProgress, setImportProgress] = useState(0);

  const handleImport = async () => {
    if (!importPreview || importPreview.valid.length === 0) return;
    setImporting(true);
    setImportProgress(0);

    // Simulate perceived processing with progress
    const totalSteps = 100;
    const progressInterval = setInterval(() => {
      setImportProgress(prev => {
        if (prev >= 90) { clearInterval(progressInterval); return 90; }
        return prev + Math.random() * 8 + 2;
      });
    }, 80);

    try {
      await bulkCreate.mutateAsync(
        importPreview.valid.map(v => ({ contact_name: v.name || "", phone_e164: v.phone, tags: "importado" }))
      );
      clearInterval(progressInterval);
      setImportProgress(100);

      // Small delay to show 100%
      await new Promise(r => setTimeout(r, 600));

      toast({
        title: "Importação concluída",
        description: `${importPreview.valid.length} contatos importados`,
      });
      resetImport();
    } catch (err: any) {
      clearInterval(progressInterval);
      toast({ title: "Erro na importação", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
      setImportProgress(0);
    }
  };

  const resetImport = () => {
    setImportOpen(false);
    setImportText("");
    setImportPreview(null);
    setImportMode("text");
    setFileName("");
    setFileColumns([]);
    setFileRows([]);
    setPhoneCol("");
    setNameCol("");
  };

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            Auto Save
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gerencie os contatos da camada Auto Save
          </p>
        </div>
        <div className="flex flex-col md:flex-col lg:flex-row items-stretch lg:items-center gap-1.5 w-full lg:w-auto">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-9 rounded-xl border-border/15 w-full lg:w-auto" onClick={() => setImportOpen(true)}>
            <Upload className="w-3.5 h-3.5" /> Importar
          </Button>
          {contacts.length > 0 && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-9 rounded-xl text-destructive border-destructive/20 hover:bg-destructive/10 w-full lg:w-auto" onClick={() => setDeleteAllOpen(true)}>
              <Trash2 className="w-3.5 h-3.5" /> Limpar
            </Button>
          )}
          <Button size="sm" className="gap-1.5 text-xs h-9 rounded-xl shadow-md w-full lg:w-auto" onClick={() => setAddOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> Adicionar
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total", value: contacts.length, color: "#a1a1aa", icon: Users },
          { label: "Ativos", value: activeCount, color: "#10b981", icon: CheckCircle2 },
          { label: "Inativos", value: contacts.length - activeCount, color: "#6b7280", icon: XCircle },
        ].map(s => (
          <div key={s.label} className="relative rounded-2xl border border-border/20 bg-card/80 backdrop-blur-xl p-4 overflow-hidden group hover:border-border/40 transition-colors">
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent to-transparent" style={{ backgroundImage: `linear-gradient(to right, transparent, ${s.color}40, transparent)` }} />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold tabular-nums leading-none" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-semibold mt-1.5">{s.label}</p>
              </div>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${s.color}15` }}>
                <s.icon className="w-4 h-4" style={{ color: s.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search & Tags */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
          <Input
            placeholder="Buscar nome ou número..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-10 text-xs rounded-xl bg-muted/10 border-border/15"
          />
        </div>
        {allTags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {tagFilter && (
              <button
                className="px-3 py-1.5 rounded-xl text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 shadow-sm"
                onClick={() => setTagFilter("")}
              >
                ✕ {tagFilter}
              </button>
            )}
            {allTags.filter(t => t !== tagFilter).slice(0, 5).map(tag => (
              <button
                key={tag}
                className="px-3 py-1.5 rounded-xl text-[10px] font-medium border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                onClick={() => setTagFilter(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Contact list */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/30" /></div>
      ) : filtered.length === 0 ? (
        <div className="relative rounded-2xl border border-border/20 bg-card/80 backdrop-blur-xl overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
          <div className="py-16 text-center">
            <Users className="w-10 h-10 text-muted-foreground/15 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground/50 font-medium">
              {contacts.length === 0 ? "Nenhum contato cadastrado" : "Nenhum contato encontrado"}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Active contacts */}
          {activeFiltered.length > 0 && (
            <div className="relative rounded-2xl border border-border/20 bg-card/80 backdrop-blur-xl overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/10">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  {activeFiltered.length} contato{activeFiltered.length !== 1 ? "s" : ""} ativo{activeFiltered.length !== 1 ? "s" : ""}
                </h3>
              </div>
              <div
                className="p-2"
                style={{
                  contain: "layout style",
                  height: Math.min(activeFiltered.length * 68, 520),
                }}
              >
                <VirtualList
                  rowCount={activeFiltered.length}
                  rowHeight={68}
                  overscanCount={10}
                  style={{ height: "100%", width: "100%", overscrollBehavior: "contain", willChange: "scroll-position" }}
                  rowProps={activeRowProps}
                  rowComponent={AutoSaveRowInner}
                />
              </div>
            </div>
          )}

          {/* Inactive contacts - collapsible */}
          {inactiveFiltered.length > 0 && (
            <Collapsible open={showInactive} onOpenChange={setShowInactive}>
              <div className="relative rounded-2xl border border-border/20 bg-card/60 backdrop-blur-xl overflow-hidden">
                <CollapsibleTrigger className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/10 transition-colors cursor-pointer">
                  <h3 className="text-sm font-bold text-muted-foreground flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                    {inactiveFiltered.length} contato{inactiveFiltered.length !== 1 ? "s" : ""} inválido{inactiveFiltered.length !== 1 ? "s" : ""}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground/40 font-medium">Números sem WhatsApp</span>
                    <svg className={cn("w-4 h-4 text-muted-foreground/40 transition-transform duration-200", showInactive && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t border-border/10">
                    <div
                      className="p-2"
                      style={{
                        contain: "layout style",
                        height: Math.min(inactiveFiltered.length * 68, 340),
                      }}
                    >
                      <VirtualList
                        rowCount={inactiveFiltered.length}
                        rowHeight={68}
                        overscanCount={10}
                        style={{ height: "100%", width: "100%", overscrollBehavior: "contain", willChange: "scroll-position" }}
                        rowProps={inactiveRowProps}
                        rowComponent={AutoSaveRowInner}
                      />
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}

          {activeFiltered.length === 0 && inactiveFiltered.length === 0 && (
            <div className="relative rounded-2xl border border-border/20 bg-card/80 backdrop-blur-xl overflow-hidden">
              <div className="py-16 text-center">
                <Users className="w-10 h-10 text-muted-foreground/15 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground/50 font-medium">Nenhum contato encontrado</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Add Modal ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[380px] p-0 bg-card/95 backdrop-blur-2xl border-border/10 overflow-hidden rounded-2xl shadow-2xl">
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          <div className="px-6 pt-6 pb-4">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Plus className="w-4 h-4 text-primary" />
                </div>
                Adicionar Contato
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="px-6 pb-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Número (E.164)</Label>
              <Input value={addPhone} onChange={e => setAddPhone(e.target.value)} placeholder="62994192500" className="font-mono text-xs h-10 rounded-xl bg-muted/10 border-border/15" />
              <p className="text-[10px] text-muted-foreground/40">Ex: 62994192500 ou +5562994192500</p>
            </div>
          </div>
          <div className="flex gap-2 px-6 py-4 border-t border-border/10 bg-muted/5">
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)} className="flex-1 h-9 rounded-xl text-xs font-semibold border-border/15">Cancelar</Button>
            <Button size="sm" onClick={handleAdd} disabled={!addPhone.trim() || createContact.isPending} className="flex-1 h-9 rounded-xl text-xs font-semibold shadow-md">
              {createContact.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Adicionar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Modal ── */}
      <Dialog open={!!editContact} onOpenChange={v => !v && setEditContact(null)}>
        <DialogContent className="sm:max-w-[380px] p-0 bg-card/95 backdrop-blur-2xl border-border/10 overflow-hidden rounded-2xl shadow-2xl">
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          <div className="px-6 pt-6 pb-4">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Edit2 className="w-4 h-4 text-primary" />
                </div>
                Editar Contato
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="px-6 pb-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Número</Label>
              <Input value={editContact?.phone_e164 || ""} disabled className="font-mono text-xs h-10 rounded-xl bg-muted/10 border-border/15 opacity-50" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Nome</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} className="text-xs h-10 rounded-xl bg-muted/10 border-border/15" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Tags</Label>
              <Input value={editTags} onChange={e => setEditTags(e.target.value)} className="text-xs h-10 rounded-xl bg-muted/10 border-border/15" />
            </div>
          </div>
          <div className="flex gap-2 px-6 py-4 border-t border-border/10 bg-muted/5">
            <Button variant="outline" size="sm" onClick={() => setEditContact(null)} className="flex-1 h-9 rounded-xl text-xs font-semibold border-border/15">Cancelar</Button>
            <Button size="sm" onClick={handleEdit} disabled={updateContact.isPending} className="flex-1 h-9 rounded-xl text-xs font-semibold shadow-md">
              {updateContact.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Import Modal ── */}
      <Dialog open={importOpen} onOpenChange={v => { if (!v) resetImport(); else setImportOpen(true); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar Contatos</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Mode tabs */}
            <Tabs value={importMode} onValueChange={v => { setImportMode(v as any); setImportPreview(null); }}>
              <TabsList className="h-8 w-full">
                <TabsTrigger value="text" className="text-xs h-6 flex-1">Colar números</TabsTrigger>
                <TabsTrigger value="file" className="text-xs h-6 flex-1 gap-1">
                  <FileSpreadsheet className="w-3 h-3" /> Arquivo (CSV/XLSX)
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {importMode === "text" ? (
              <div>
                <Label className="text-xs">Cole os números (um por linha)</Label>
                <Textarea
                  value={importText}
                  onChange={e => { setImportText(e.target.value); setImportPreview(null); }}
                  placeholder={"62994192500\n11987654321\n+5521999887766"}
                  className="mt-1 font-mono text-xs min-h-[120px]"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Button
                  variant="outline"
                  className="w-full gap-2 h-16 border-dashed"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileSpreadsheet className="w-5 h-5 text-muted-foreground" />
                  <div className="text-left">
                    <p className="text-xs font-medium">{fileName || "Selecionar arquivo"}</p>
                    <p className="text-[10px] text-muted-foreground">CSV, XLSX ou XLS</p>
                  </div>
                </Button>

                {fileColumns.length > 0 && (
                  <div className="space-y-2 p-3 rounded-lg border border-border/20 bg-muted/5">
                    <p className="text-[11px] font-medium text-foreground">Mapear colunas</p>
                    <p className="text-[10px] text-muted-foreground">{fileRows.length} linhas encontradas</p>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Coluna do Número *</Label>
                      <select
                        value={phoneCol}
                        onChange={e => { setPhoneCol(e.target.value); setImportPreview(null); }}
                        className="w-full h-8 rounded-md border border-border/30 bg-background px-2 text-xs"
                      >
                        {fileColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!importPreview ? (
              <Button
                variant="outline"
                className="w-full gap-1.5"
                onClick={() => importMode === "text" ? handleValidateImport() : handleValidateFile()}
                disabled={importMode === "text" ? !importText.trim() : fileRows.length === 0}
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Validar
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <Card><CardContent className="p-2 text-center">
                    <p className="text-lg font-bold text-emerald-400 tabular-nums">{importPreview.valid.length}</p>
                    <p className="text-[9px] text-muted-foreground uppercase">Válidos</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-2 text-center">
                    <p className="text-lg font-bold text-destructive tabular-nums">{importPreview.invalid.length}</p>
                    <p className="text-[9px] text-muted-foreground uppercase">Inválidos</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-2 text-center">
                    <p className="text-lg font-bold text-amber-400 tabular-nums">{importPreview.duplicates.length}</p>
                    <p className="text-[9px] text-muted-foreground uppercase">Duplicados</p>
                  </CardContent></Card>
                </div>

                {importPreview.invalid.length > 0 && (
                  <div className="bg-destructive/5 border border-destructive/10 rounded-md p-2">
                    <p className="text-[10px] text-destructive font-medium mb-1 flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> Inválidos:
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {importPreview.invalid.slice(0, 5).join(", ")}
                      {importPreview.invalid.length > 5 && ` +${importPreview.invalid.length - 5} mais`}
                    </p>
                  </div>
                )}

                {importPreview.duplicates.length > 0 && (
                  <div className="bg-amber-500/5 border border-amber-500/10 rounded-md p-2">
                    <p className="text-[10px] text-amber-400 font-medium mb-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Duplicados (serão ignorados):
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {importPreview.duplicates.slice(0, 5).join(", ")}
                      {importPreview.duplicates.length > 5 && ` +${importPreview.duplicates.length - 5} mais`}
                    </p>
                  </div>
                )}

                {importing ? (
                  <div className="space-y-3 py-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <p className="text-sm font-medium text-foreground">Importando contatos...</p>
                    </div>
                    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                      <div 
                        className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${Math.min(importProgress, 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground text-center">
                      {Math.round(Math.min(importProgress, 100))}% — {importPreview.valid.length} contatos
                    </p>
                  </div>
                ) : (
                  <Button
                    className="w-full gap-1.5"
                    onClick={handleImport}
                    disabled={importPreview.valid.length === 0}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Importar {importPreview.valid.length} contato{importPreview.valid.length !== 1 ? "s" : ""}
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete All Confirmation ── */}
      <Dialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
        <DialogContent className="sm:max-w-[340px] p-0 bg-card/95 backdrop-blur-2xl border-border/10 overflow-hidden rounded-2xl shadow-2xl">
          <div className="px-6 pt-6 pb-4">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                </div>
                Limpar todos os contatos?
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="px-6 pb-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Essa ação vai remover todos os <strong>{contacts.length}</strong> contatos Auto Save. Não é possível desfazer.
            </p>
          </div>
          <div className="flex gap-2 px-6 py-4 border-t border-border/10 bg-muted/5">
            <Button variant="outline" size="sm" onClick={() => setDeleteAllOpen(false)} className="flex-1 h-9 rounded-xl text-xs font-semibold border-border/15">Cancelar</Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteAll} className="flex-1 h-9 rounded-xl text-xs font-semibold shadow-md">Limpar todos</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AutoSave;
