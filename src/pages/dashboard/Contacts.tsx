import { useState, useRef, useEffect, useCallback, useMemo, memo, type ReactElement } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, Download, Search, Plus, Trash2, Tag, Copy, Users, MoreVertical, X, Send, UserPlus, ChevronDown, Pencil, Variable, ArrowRight, Loader2, CheckSquare, FileSpreadsheet, Database, UserRoundPlus, AlertTriangle, Ban, Phone, CheckCircle2,
} from "lucide-react";
import { useContacts, useCreateContact, useCreateContacts, useUpdateContact, useDeleteContacts, type Contact } from "@/hooks/useContacts";
import { cn } from "@/lib/utils";

const DEFAULT_TAGS = ["cliente", "lead", "vip", "novo"];
const VAR_KEYS = ["var1","var2","var3","var4","var5","var6","var7","var8","var9","var10"] as const;
const TAG_HEX_COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
  "#14b8a6", "#eab308", "#6366f1", "#a855f7",
  "#d946ef", "#0ea5e9", "#84cc16", "#f43f5e",
];
const DEFAULT_TAG_COLORS: Record<string, number> = { cliente: 0, lead: 1, vip: 3, novo: 5 };
// Fixed min-width ensures scrollbar on small screens, fits on large screens
const TABLE_MIN_WIDTH = 500;
const TABLE_GRID_COLS = "40px minmax(120px,1.5fr) minmax(120px,1.3fr) minmax(100px,1fr) 40px";

const VarFields = ({ values, onChange }: { values: { [key: string]: any }; onChange: (key: string, val: string) => void }) => (
  <div className="grid grid-cols-2 gap-2">
    {VAR_KEYS.map((k, i) => (
      <div key={k} className="space-y-1">
        <Label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Var {i + 1}</Label>
        <Input
          value={values[k] || ""}
          onChange={(e) => onChange(k, e.target.value)}
          placeholder={`Variável ${i + 1}`}
          className="h-8 text-xs"
        />
      </div>
    ))}
  </div>
);
type ContactColumnMapping = "nome" | "numero" | "tags" | "var1" | "var2" | "var3" | "var4" | "var5" | "var6" | "var7" | "var8" | "var9" | "var10" | "ignorar";
interface RawContactImport { headers: string[]; rows: any[][]; columnMappings: ContactColumnMapping[]; }
const MAPPING_OPTIONS: { value: ContactColumnMapping; label: string }[] = [
  { value: "ignorar", label: "Ignorar" },
  { value: "nome", label: "Nome" },
  { value: "numero", label: "Número" },
  ...VAR_KEYS.map((k, i) => ({ value: k as ContactColumnMapping, label: `Variável ${i + 1}` })),
];

// Linha da tabela de contatos (memoizada)
interface ContactRowProps {
  contact: Contact;
  index: number;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onRemoveTag: (contactId: string, tag: string) => void;
  onDelete: (ids: string[]) => void;
  onEdit: (contact: Contact) => void;
  getTagColor: (tag: string) => string;
}

const ContactRow = memo(function ContactRow({ contact, index, selectMode, isSelected, onToggleSelect, onRemoveTag, onDelete, onEdit, getTagColor }: ContactRowProps): ReactElement {
  return (
    <div className="grid items-center border-b border-primary/5 hover:bg-primary/[0.02] text-sm transition-colors" style={{ minWidth: TABLE_MIN_WIDTH, gridTemplateColumns: TABLE_GRID_COLS }}>
      <div className="p-2 flex items-center justify-center">
        {selectMode ? (
          <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect(contact.id)} />
        ) : (
          <span className="text-xs text-muted-foreground tabular-nums">{index}</span>
        )}
      </div>
      <div className="p-2 font-medium text-foreground truncate">{contact.name}</div>
      <div className="p-2 text-muted-foreground font-mono text-xs truncate">{contact.phone}</div>
      <div className="p-2 flex gap-1.5 flex-wrap overflow-hidden">
        {(contact.tags || []).length > 0 ? (contact.tags || []).slice(0, 3).map((tag: string) => {
          const color = getTagColor(tag);
          return (
            <span
              key={tag}
              className="group inline-flex items-center gap-1 pl-2 pr-1.5 py-0.5 rounded-md text-[10px] font-semibold text-white shadow-sm cursor-pointer transition-all hover:shadow-md hover:scale-[1.02]"
              style={{ backgroundColor: color }}
              onClick={() => onRemoveTag(contact.id, tag)}
            >
              {tag}
              <X className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </span>
          );
        }) : <span className="text-[11px] text-muted-foreground">—</span>}
      </div>
      <div className="p-2 overflow-hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent"><MoreVertical className="w-3.5 h-3.5" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="text-xs gap-2" onClick={() => onEdit(contact)}>
              <Pencil className="w-3 h-3" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs gap-2 text-destructive focus:text-destructive" onClick={() => onDelete([contact.id])}>
              <Trash2 className="w-3 h-3" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
});

const Contacts = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: contacts = [], isLoading } = useContacts();
  const createContact = useCreateContact();
  const createContacts = useCreateContacts();
  const updateContact = useUpdateContact();
  const deleteContacts = useDeleteContacts();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [addTagDialogOpen, setAddTagDialogOpen] = useState(false);
  const [removeTagDialogOpen, setRemoveTagDialogOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportTagFilter, setExportTagFilter] = useState<string>("all");
  const [exportIncludeVars, setExportIncludeVars] = useState(true);
  const [exportLimit, setExportLimit] = useState<string>("");
  const [exportSelectedIds, setExportSelectedIds] = useState<Set<string>>(new Set());
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [showAddVars, setShowAddVars] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", phone: "", var1: "", var2: "", var3: "", var4: "", var5: "", var6: "", var7: "", var8: "", var9: "", var10: "" });
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [tagColors, setTagColors] = useState<Record<string, number>>({});
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [createTagInput, setCreateTagInput] = useState("");
  const [newTagColorIdx, setNewTagColorIdx] = useState(0);

  const getTagColor = useCallback((tag: string): string => {
    const idx = tagColors[tag] ?? 0;
    return TAG_HEX_COLORS[idx % TAG_HEX_COLORS.length];
  }, [tagColors]);

  // Edit contact state
  const [editContactOpen, setEditContactOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [showEditVars, setShowEditVars] = useState(false);

  // Import mapping state
  const [rawImport, setRawImport] = useState<RawContactImport | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  // Load tags from localStorage on mount (safe parse)
  useEffect(() => {
    const stored = localStorage.getItem("contactCustomTags");
    const storedColors = localStorage.getItem("contactTagColors");

    let loadedColors: Record<string, number> = { ...DEFAULT_TAG_COLORS };
    if (storedColors) {
      try { loadedColors = { ...DEFAULT_TAG_COLORS, ...JSON.parse(storedColors) }; } catch { /* ignore */ }
    }
    setTagColors(loadedColors);
    localStorage.setItem("contactTagColors", JSON.stringify(loadedColors));

    if (!stored) {
      setCustomTags(DEFAULT_TAGS);
      localStorage.setItem("contactCustomTags", JSON.stringify(DEFAULT_TAGS));
      return;
    }

    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.every((tag) => typeof tag === "string")) {
        setCustomTags(parsed);
      } else {
        setCustomTags(DEFAULT_TAGS);
        localStorage.setItem("contactCustomTags", JSON.stringify(DEFAULT_TAGS));
      }
    } catch {
      setCustomTags(DEFAULT_TAGS);
      localStorage.setItem("contactCustomTags", JSON.stringify(DEFAULT_TAGS));
    }
  }, []);

  const handleCreateTag = () => {
    const tag = createTagInput.trim().toLowerCase();
    if (!tag) return;
    if (customTags.includes(tag)) {
      toast({ title: "Tag já existe", variant: "destructive" });
      return;
    }
    const newList = [...customTags, tag];
    setCustomTags(newList);
    localStorage.setItem("contactCustomTags", JSON.stringify(newList));
    const newColors = { ...tagColors, [tag]: newTagColorIdx };
    setTagColors(newColors);
    localStorage.setItem("contactTagColors", JSON.stringify(newColors));
    setNewTagColorIdx((newTagColorIdx + 1) % TAG_HEX_COLORS.length);
    setCreateTagInput("");
    toast({ title: `Tag "${tag}" criada` });
  };

  const changeTagColor = (tag: string, colorIdx: number) => {
    const newColors = { ...tagColors, [tag]: colorIdx };
    setTagColors(newColors);
    localStorage.setItem("contactTagColors", JSON.stringify(newColors));
  };

  const handleDeleteTag = (tag: string) => {
    const newList = customTags.filter(t => t !== tag);
    setCustomTags(newList);
    localStorage.setItem("contactCustomTags", JSON.stringify(newList));
    if (tagFilter === tag) setTagFilter("all");
    toast({ title: `Tag "${tag}" removida` });
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return contacts.filter((c) => {
      const matchesSearch = (c.name || "").toLowerCase().includes(query) || c.phone.includes(query);
      const matchesTag = tagFilter === "all" || (c.tags || []).includes(tagFilter);
      return matchesSearch && matchesTag;
    });
  }, [contacts, search, tagFilter]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((c) => c.id)));
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    const ext = file.name.split(".").pop()?.toLowerCase();

    const processRows = (rawRows: any[][]) => {
      if (rawRows.length < 2) { setImportLoading(false); return; }
      const headers = rawRows[0].map((h: any) => String(h || "").trim());
      const dataRows = rawRows.slice(1).filter(r => r.some((c: any) => c != null && String(c).trim()));
      const mappings: ContactColumnMapping[] = headers.map(() => "ignorar" as ContactColumnMapping);
      setRawImport({ headers, rows: dataRows, columnMappings: mappings });
      setImportLoading(false);
    };

    if (ext === "xlsx" || ext === "xls") {
      import("xlsx").then(XLSX => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const wb = XLSX.read(ev.target?.result, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          processRows(XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]);
        };
        reader.readAsArrayBuffer(file);
      });
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const lines = text.split("\n").filter(Boolean);
        processRows(lines.map(l => l.split(/[,;]/)));
      };
      reader.readAsText(file);
    }
    e.target.value = "";
  };

  const updateImportMapping = (colIndex: number, value: ContactColumnMapping) => {
    if (!rawImport) return;
    const newMappings = [...rawImport.columnMappings];
    if (value !== "ignorar" && value !== "tags") {
      newMappings.forEach((m, i) => { if (i !== colIndex && m === value) newMappings[i] = "ignorar"; });
    }
    newMappings[colIndex] = value;
    setRawImport({ ...rawImport, columnMappings: newMappings });
  };

  const confirmImportMapping = () => {
    if (!rawImport) return;
    const { rows, columnMappings } = rawImport;
    const numIdx = columnMappings.indexOf("numero");
    const nameIdx = columnMappings.indexOf("nome");
    const tagIdx = columnMappings.indexOf("tags");
    const varIndices: Record<string, number> = {};
    columnMappings.forEach((m, i) => { if (m.startsWith("var")) varIndices[m] = i; });

    if (numIdx < 0) { toast({ title: "Mapeie a coluna de número", variant: "destructive" }); return; }

    const newContacts: any[] = [];
    for (const row of rows) {
      const phone = String(row[numIdx] || "").trim();
      if (!phone) continue;
      const contact: any = {
        name: nameIdx >= 0 ? String(row[nameIdx] || "Sem nome").trim() : "Sem nome",
        phone: phone.replace(/\D/g, "").replace(/^(\d{2})(\d+)/, "+$1$2"),
      };
      if (tagIdx >= 0 && row[tagIdx]) contact.tags = String(row[tagIdx]).split("|").map((t: string) => t.trim()).filter(Boolean);
      Object.entries(varIndices).forEach(([k, idx]) => { if (row[idx]) contact[k] = String(row[idx]).trim(); });
      newContacts.push(contact);
    }

    createContacts.mutate(newContacts, {
      onSuccess: () => {
        toast({ title: "Importação concluída", description: `${newContacts.length} contatos importados.` });
        setRawImport(null);
      },
    });
  };

  const exportFilteredContacts = useMemo(() => {
    let list = contacts;
    if (exportTagFilter !== "all") {
      list = list.filter(c => (c.tags || []).includes(exportTagFilter));
    }
    const limit = parseInt(exportLimit);
    if (limit > 0) list = list.slice(0, limit);
    return list;
  }, [contacts, exportTagFilter, exportLimit]);

  const exportContacts = useMemo(() => {
    if (exportSelectedIds.size > 0) {
      return exportFilteredContacts.filter(c => exportSelectedIds.has(c.id));
    }
    return exportFilteredContacts;
  }, [exportFilteredContacts, exportSelectedIds]);

  const buildExportRows = () => {
    // Detect which var columns actually have data
    const usedVarKeys = exportIncludeVars
      ? VAR_KEYS.filter(k => exportContacts.some(c => c[k]?.trim()))
      : [];
    const headers = ["Nome", "Telefone", "Tags"];
    if (usedVarKeys.length > 0) headers.push(...usedVarKeys.map(k => `Var ${k.replace("var", "")}`));
    const rows = [headers];
    exportContacts.forEach((c) => {
      const row: string[] = [c.name, c.phone, (c.tags || []).join("|")];
      if (usedVarKeys.length > 0) row.push(...usedVarKeys.map(k => c[k] || ""));
      rows.push(row);
    });
    return rows;
  };

  const handleExportCSV = () => {
    const rows = buildExportRows();
    const csv = rows.map((r) => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contatos${exportTagFilter !== "all" ? `-${exportTagFilter}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exportação concluída", description: `${exportContacts.length} contatos exportados em CSV.` });
    setExportDialogOpen(false);
  };

  const handleExportXLSX = async () => {
    const rows = buildExportRows();
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet(rows);
    // Auto-fit column widths
    ws["!cols"] = rows[0].map((_, i) => ({
      wch: Math.max(...rows.map(r => String(r[i] || "").length), 8)
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contatos");
    XLSX.writeFile(wb, `contatos${exportTagFilter !== "all" ? `-${exportTagFilter}` : ""}.xlsx`);
    toast({ title: "Exportação concluída", description: `${exportContacts.length} contatos exportados em XLSX.` });
    setExportDialogOpen(false);
  };

  const handleDeleteSelected = () => {
    const ids = Array.from(selected);
    deleteContacts.mutate(ids, {
      onSuccess: () => {
        toast({ title: "Contatos removidos", description: `${ids.length} contatos excluídos.` });
        setSelected(new Set());
      },
    });
  };

  const addTagToSelected = () => {
    if (selectedTags.length === 0) return;
    const tags = selectedTags.map(t => t.trim().toLowerCase());
    const toUpdate = contacts.filter(c => selected.has(c.id));
    toUpdate.forEach(c => {
      const existing = c.tags || [];
      const newTags = [...new Set([...existing, ...tags])];
      if (newTags.length !== existing.length) {
        updateContact.mutate({ id: c.id, tags: newTags });
      }
    });
    toast({ title: "Tags adicionadas", description: `${tags.length} tag(s) adicionada(s) a ${selected.size} contatos.` });
    setSelectedTags([]);
    setAddTagDialogOpen(false);
  };

  const removeTagFromSelected = () => {
    const toUpdate = contacts.filter(c => selected.has(c.id) && (c.tags || []).length > 0);
    toUpdate.forEach(c => {
      updateContact.mutate({ id: c.id, tags: [] });
    });
    toast({ title: "Tags removidas", description: `Tags removidas de ${toUpdate.length} contatos.` });
    setRemoveTagDialogOpen(false);
  };

  const handleAddContact = () => {
    if (!newContact.phone.trim()) return;
    createContact.mutate({
      name: newContact.name || "Sem nome",
      phone: newContact.phone,
      ...(showAddVars ? {
        var1: newContact.var1, var2: newContact.var2, var3: newContact.var3, var4: newContact.var4, var5: newContact.var5,
        var6: newContact.var6, var7: newContact.var7, var8: newContact.var8, var9: newContact.var9, var10: newContact.var10,
      } : {}),
    }, {
      onSuccess: () => {
        setNewContact({ name: "", phone: "", var1: "", var2: "", var3: "", var4: "", var5: "", var6: "", var7: "", var8: "", var9: "", var10: "" });
        setAddContactOpen(false);
        setShowAddVars(false);
        toast({ title: "Contato adicionado" });
      },
    });
  };

  const handleEditContact = () => {
    if (!editContact) return;
    updateContact.mutate({
      id: editContact.id,
      name: editContact.name,
      phone: editContact.phone,
      tags: editContact.tags || [],
      var1: editContact.var1, var2: editContact.var2, var3: editContact.var3, var4: editContact.var4, var5: editContact.var5,
      var6: editContact.var6, var7: editContact.var7, var8: editContact.var8, var9: editContact.var9, var10: editContact.var10,
    }, {
      onSuccess: () => {
        setEditContactOpen(false);
        setEditContact(null);
        setShowEditVars(false);
        toast({ title: "Contato atualizado" });
      },
    });
  };

  const openEditDialog = useCallback((contact: Contact) => {
    setEditContact({ ...contact });
    setShowEditVars(VAR_KEYS.some(k => contact[k]?.trim()));
    setEditContactOpen(true);
  }, []);

  const removeTag = useCallback((contactId: string, tag: string) => {
    const contact = contacts.find(c => c.id === contactId);
    if (contact) {
      updateContact.mutate({ id: contactId, tags: (contact.tags || []).filter(t => t !== tag) });
    }
  }, [contacts, updateContact]);

  const handleDeleteIds = useCallback((ids: string[]) => {
    deleteContacts.mutate(ids, { onSuccess: () => toast({ title: "Contato removido" }) });
  }, [deleteContacts, toast]);


  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contatos</h1>
          <p className="text-sm text-muted-foreground">Importe, organize e filtre seus contatos</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImportFile} />
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => fileInputRef.current?.click()}>
            <FileSpreadsheet className="w-3.5 h-3.5" /> Planilha
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setExportDialogOpen(true)}>
            <Download className="w-3.5 h-3.5" /> Exportar
          </Button>
          <Button size="sm" className="gap-1.5 text-xs" onClick={() => setAddContactOpen(true)}>
            <UserRoundPlus className="w-3.5 h-3.5" /> Manual
          </Button>
          {selectMode ? (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => { setSelectMode(false); setSelected(new Set()); }}>
              <X className="w-3.5 h-3.5" /> Cancelar
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setSelectMode(true)}>
              <CheckSquare className="w-3.5 h-3.5" /> Selecionar
            </Button>
          )}
        </div>
      </div>

      {/* Filters — premium search bar */}
      <div className="relative rounded-2xl border border-border/30 bg-gradient-to-r from-card via-card to-card p-[1px] shadow-lg dark:shadow-[0_4px_32px_rgba(0,0,0,0.4)] overflow-hidden max-w-5xl mx-auto">
        {/* Subtle top gradient accent line */}
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 rounded-2xl bg-card/80 backdrop-blur-xl px-4 py-3">
          <div className="relative flex-[3] min-w-0">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 w-full border-border/20 bg-background/50 focus-visible:bg-background/80 h-10 rounded-xl text-sm"
            />
          </div>
          <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full md:w-44 justify-between h-9 text-xs gap-2">
                  {tagFilter === "all" ? (
                    "Todas as tags"
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-md shrink-0" style={{ backgroundColor: getTagColor(tagFilter) }} />
                      {tagFilter}
                    </span>
                  )}
                  <ChevronDown className="w-3.5 h-3.5 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-0" sideOffset={8}>
                <div className="p-2 border-b border-border/50">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">Filtrar por tag</p>
                </div>
                <div className="p-1.5 space-y-0.5 max-h-52 overflow-y-auto">
                  <button
                    onClick={() => { setTagFilter("all"); setTagPopoverOpen(false); }}
                    className={cn("w-full text-left px-2.5 py-2 text-xs rounded-lg hover:bg-muted/50 transition-colors flex items-center gap-2", tagFilter === "all" && "bg-muted font-medium")}
                  >
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                    Todas as tags
                  </button>
                  {customTags.map(tag => {
                    const color = getTagColor(tag);
                    return (
                      <div key={tag} className="flex items-center group">
                        <button
                          onClick={() => { setTagFilter(tag); setTagPopoverOpen(false); }}
                          className={cn("flex-1 text-left px-2.5 py-2 text-xs rounded-lg hover:bg-muted/50 transition-colors flex items-center gap-2", tagFilter === tag && "bg-muted font-medium")}
                        >
                          <span className="w-2.5 h-2.5 rounded-md shrink-0" style={{ backgroundColor: color }} />
                          {tag}
                        </button>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="h-6 w-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted" onClick={e => e.stopPropagation()}>
                              <span className="w-3 h-3 rounded-md border-2 border-background" style={{ backgroundColor: color }} />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-2" side="left" align="center">
                            <div className="grid grid-cols-8 gap-1.5">
                              {TAG_HEX_COLORS.map((c, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => changeTagColor(tag, idx)}
                                  className={cn(
                                    "w-5 h-5 rounded-full transition-all duration-200",
                                    tagColors[tag] === idx
                                      ? "ring-2 ring-offset-2 ring-offset-card ring-foreground/70 scale-110"
                                      : "opacity-50 hover:opacity-80"
                                  )}
                                  style={{ backgroundColor: c }}
                                />
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                        <button
                          className="h-6 w-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 text-destructive"
                          onClick={(e) => { e.stopPropagation(); handleDeleteTag(tag); }}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="p-2.5 border-t border-border/50 space-y-2.5">
                  <label className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Nova tag</label>
                  <div className="flex gap-1.5">
                    <div className="flex items-center gap-1.5 flex-1 rounded-lg border border-border/50 bg-background px-2">
                      <span className="w-2.5 h-2.5 rounded-md shrink-0" style={{ backgroundColor: TAG_HEX_COLORS[newTagColorIdx] }} />
                      <input
                        placeholder="Nome da tag..."
                        value={createTagInput}
                        onChange={e => setCreateTagInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleCreateTag()}
                        className="h-7 text-xs bg-transparent outline-none flex-1 text-foreground placeholder:text-muted-foreground"
                      />
                    </div>
                    <Button size="sm" onClick={handleCreateTag} className="h-7 px-2.5 rounded-lg">
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Cor</label>
                    <div className="grid grid-cols-8 gap-1.5">
                      {TAG_HEX_COLORS.map((c, idx) => (
                        <button
                          key={idx}
                          onClick={() => setNewTagColorIdx(idx)}
                          className={cn(
                            "w-5 h-5 rounded-full transition-all duration-200",
                            newTagColorIdx === idx
                              ? "ring-2 ring-offset-2 ring-offset-card ring-foreground/70 scale-110"
                              : "opacity-50 hover:opacity-80"
                          )}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border flex-wrap">
              <span className="text-xs text-muted-foreground">{selected.size} selecionado(s)</span>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setAddTagDialogOpen(true)}>
                <Tag className="w-3 h-3" /> Adicionar Tag
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setRemoveTagDialogOpen(true)}>
                <X className="w-3 h-3" /> Remover Tag
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs text-destructive hover:text-destructive" onClick={handleDeleteSelected}>
                <Trash2 className="w-3 h-3" /> Excluir
              </Button>
            </div>
          )}
      </div>

      {/* Contact Table */}
      <Card className="glass-card overflow-x-auto border border-primary/10" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Header row */}
        <div className="grid items-center border-b border-primary/10 bg-primary/[0.03] text-xs font-semibold text-muted-foreground uppercase tracking-wider" style={{ minWidth: TABLE_MIN_WIDTH, gridTemplateColumns: TABLE_GRID_COLS }}>
          <div className="p-2 flex items-center justify-center">
            {selectMode ? (
              <Checkbox checked={selected.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
            ) : (
              <span>#</span>
            )}
          </div>
          <div className="p-2 truncate">Nome</div>
          <div className="p-2 truncate">Telefone</div>
          <div className="p-2 truncate">Tags</div>
          <div className="p-2"></div>
        </div>
        {isLoading ? (
          <div className="text-center py-8 text-sm text-muted-foreground">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">Nenhum contato encontrado</div>
        ) : (
          <div style={{ maxHeight: filtered.length > 10 ? 480 : undefined, overflowY: filtered.length > 10 ? 'auto' : undefined }}>
            {filtered.map((contact, i) => (
              <ContactRow key={contact.id} contact={contact} index={i + 1} selectMode={selectMode} isSelected={selected.has(contact.id)} onToggleSelect={toggleSelect} onRemoveTag={removeTag} onDelete={handleDeleteIds} onEdit={openEditDialog} getTagColor={getTagColor} />
            ))}
          </div>
        )}
      </Card>

      {/* Add Contact Dialog */}
      <Dialog open={addContactOpen} onOpenChange={(open) => { setAddContactOpen(open); if (!open) setShowAddVars(false); }}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>Adicionar contato</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome</Label>
              <Input value={newContact.name} onChange={(e) => setNewContact(p => ({ ...p, name: e.target.value }))} placeholder="Nome do contato" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Telefone</Label>
              <Input value={newContact.phone} onChange={(e) => setNewContact(p => ({ ...p, phone: e.target.value }))} placeholder="+5511999999999" />
            </div>

            <VarFields
              values={newContact}
              onChange={(key, val) => setNewContact(p => ({ ...p, [key]: val }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddContactOpen(false); setShowAddVars(false); }}>Cancelar</Button>
            <Button onClick={handleAddContact} disabled={createContact.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Contact Dialog — Premium */}
      <Dialog open={editContactOpen} onOpenChange={(open) => { setEditContactOpen(open); if (!open) { setEditContact(null); setShowEditVars(false); } }}>
        <DialogContent className="sm:max-w-[420px] p-0 bg-card/95 backdrop-blur-2xl border-border/10 overflow-hidden rounded-2xl shadow-2xl max-h-[85vh]" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
          {/* Header */}
          <div className="relative px-6 pt-6 pb-4">
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Pencil className="w-4 h-4 text-primary" />
                </div>
                Editar contato
              </DialogTitle>
            </DialogHeader>
          </div>

          {editContact && (
            <div className="px-6 pb-2 space-y-5 overflow-y-auto max-h-[55vh]">
              {/* Name & Phone */}
              <div className="space-y-3">
                <label className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Informações</label>
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Nome</Label>
                    <Input value={editContact.name} onChange={(e) => setEditContact(p => p ? { ...p, name: e.target.value } : p)} placeholder="Nome do contato" className="h-10 rounded-xl bg-muted/10 border-border/15 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Telefone</Label>
                    <Input value={editContact.phone} onChange={(e) => setEditContact(p => p ? { ...p, phone: e.target.value } : p)} placeholder="+5511999999999" className="h-10 rounded-xl bg-muted/10 border-border/15 text-sm font-mono" />
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-3">
                <label className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Tags</label>
                <div className="min-h-[44px] rounded-xl border border-border/10 bg-muted/5 p-3">
                  {(editContact.tags || []).length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {(editContact.tags || []).map((tag: string) => {
                        const color = getTagColor(tag);
                        return (
                          <span
                            key={tag}
                            className="group inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg text-[11px] font-semibold text-white shadow-sm transition-all hover:shadow-md hover:scale-[1.02] cursor-pointer"
                            style={{ backgroundColor: color }}
                            onClick={() => setEditContact(p => p ? { ...p, tags: (p.tags || []).filter(t => t !== tag) } : p)}
                          >
                            {tag}
                            <button className="opacity-60 group-hover:opacity-100 hover:bg-white/20 rounded-md p-0.5 transition-all">
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/40 font-medium text-center py-1">Nenhuma tag selecionada</p>
                  )}
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full h-9 rounded-xl text-xs border-border/15 gap-2 hover:border-primary/30">
                      <Tag className="w-3.5 h-3.5" />
                      Selecionar tags
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-1.5" align="start">
                    <div className="space-y-0.5 max-h-48 overflow-y-auto">
                      {customTags.map(tag => {
                        const isSelected = (editContact.tags || []).includes(tag);
                        const color = getTagColor(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => setEditContact(p => {
                              if (!p) return p;
                              const tags = p.tags || [];
                              return { ...p, tags: isSelected ? tags.filter(t => t !== tag) : [...tags, tag] };
                            })}
                            className={cn("w-full text-left px-2.5 py-2 text-xs rounded-lg flex items-center gap-2 hover:bg-muted/50 transition-colors", isSelected && "bg-muted font-medium")}
                          >
                            <span className="w-2.5 h-2.5 rounded-md shrink-0" style={{ backgroundColor: color }} />
                            {tag}
                            {isSelected && <CheckCircle2 className="w-3 h-3 text-primary ml-auto" />}
                          </button>
                        );
                      })}
                      {customTags.length === 0 && <p className="text-xs text-muted-foreground p-2">Nenhuma tag criada</p>}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Variables */}
              <div className="space-y-3">
                <label className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Variáveis personalizadas</label>
                <div className="grid grid-cols-2 gap-2">
                  {VAR_KEYS.map((k, i) => (
                    <div key={k} className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground/50 uppercase">Var {i + 1}</Label>
                      <Input
                        value={(editContact as any)[k] || ""}
                        onChange={(e) => setEditContact(p => p ? { ...p, [k]: e.target.value } : p)}
                        placeholder={`Variável ${i + 1}`}
                        className="h-8 text-xs rounded-lg bg-muted/10 border-border/15"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex gap-2 px-6 py-4 border-t border-border/10 bg-muted/5">
            <Button variant="outline" onClick={() => { setEditContactOpen(false); setEditContact(null); setShowEditVars(false); }} className="flex-1 h-10 rounded-xl text-xs font-semibold border-border/15">
              Cancelar
            </Button>
            <Button onClick={handleEditContact} disabled={updateContact.isPending} className="flex-1 h-10 rounded-xl text-xs font-semibold shadow-md">
              {updateContact.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Tag Dialog */}
      <Dialog open={addTagDialogOpen} onOpenChange={(open) => { setAddTagDialogOpen(open); if (!open) setSelectedTags([]); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Adicionar tags</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Selecione até 2 tags</Label>
            <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
              {[...customTags].sort((a, b) => a.localeCompare(b)).map(tag => {
                const isSelected = selectedTags.includes(tag);
                const color = getTagColor(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      if (isSelected) setSelectedTags(selectedTags.filter(t => t !== tag));
                      else if (selectedTags.length < 2) setSelectedTags([...selectedTags, tag]);
                    }}
                    disabled={!isSelected && selectedTags.length >= 2}
                    className={cn("flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors", isSelected ? "bg-muted font-medium" : "hover:bg-muted/50", !isSelected && selectedTags.length >= 2 && "opacity-40")}
                  >
                    <span className="w-3 h-3 rounded-md shrink-0" style={{ backgroundColor: color }} />
                    {tag}
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-primary ml-auto" />}
                  </button>
                );
              })}
            </div>
            {customTags.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma tag criada.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTagDialogOpen(false)}>Cancelar</Button>
            <Button onClick={addTagToSelected} disabled={selectedTags.length === 0}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Tag Dialog */}
      <Dialog open={removeTagDialogOpen} onOpenChange={setRemoveTagDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Remover tags</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja remover todas as tags dos {selected.size} contatos selecionados?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTagDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={removeTagFromSelected}>Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Mapping Dialog */}
      <Dialog open={!!rawImport} onOpenChange={(open) => { if (!open) setRawImport(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>Mapear colunas do arquivo</DialogTitle></DialogHeader>
          {rawImport && (
            <div className="space-y-4">
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>{rawImport.rows.length} linhas</span>
                <span>{rawImport.headers.length} colunas</span>
                <span className={rawImport.columnMappings.filter(m => m !== "ignorar").length > 0 ? "text-primary font-medium" : ""}>
                  {rawImport.columnMappings.filter(m => m !== "ignorar").length} mapeadas
                </span>
              </div>

              <div className="space-y-2">
                {rawImport.headers.map((header, i) => {
                  const mapping = rawImport.columnMappings[i];
                  const sample = rawImport.rows.slice(0, 3).map(r => String(r[i] || "")).filter(Boolean).join(", ");
                  const mappingColors: Record<string, string> = {
                    nome: "ring-emerald-500/30 bg-emerald-500/5",
                    numero: "ring-blue-500/30 bg-blue-500/5",
                    tags: "ring-amber-500/30 bg-amber-500/5",
                  };
                  return (
                    <div key={i} className="flex items-center gap-3 p-2 rounded-lg border border-border/30 bg-muted/10">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{header || `Coluna ${i + 1}`}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{sample || "—"}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
                      <Select value={mapping} onValueChange={(v) => updateImportMapping(i, v as ContactColumnMapping)}>
                        <SelectTrigger className={cn("w-[150px] h-9 text-xs", mapping !== "ignorar" && (mappingColors[mapping] || "ring-primary/30 bg-primary/5"))}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MAPPING_OPTIONS.map(opt => {
                            const taken = opt.value !== "ignorar" && rawImport.columnMappings.some((m, idx) => idx !== i && m === opt.value);
                            return <SelectItem key={opt.value} value={opt.value} disabled={taken} className={taken ? "opacity-30" : ""}>{opt.label}</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>

            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRawImport(null)}>Cancelar</Button>
            <Button onClick={confirmImportMapping} disabled={!rawImport?.columnMappings.includes("numero") || createContacts.isPending}>
              {createContacts.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
              Importar {rawImport ? rawImport.rows.length : 0} contatos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={(open) => { setExportDialogOpen(open); if (!open) { setExportTagFilter("all"); setExportLimit(""); setExportSelectedIds(new Set()); } }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>Exportar contatos</DialogTitle></DialogHeader>
          <div className="space-y-4 flex-1 min-h-0 flex flex-col">
            {/* Filters row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Filtrar por tag</Label>
                <Select value={exportTagFilter} onValueChange={(v) => { setExportTagFilter(v); setExportSelectedIds(new Set()); }}>
                  <SelectTrigger className="w-full h-8 text-xs">
                    <SelectValue placeholder="Todas as tags" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as tags</SelectItem>
                    {[...customTags].sort((a, b) => a.localeCompare(b)).map(tag => (
                      <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Limite (vazio = todos)</Label>
                <Input type="number" min="1" value={exportLimit} onChange={e => { setExportLimit(e.target.value); setExportSelectedIds(new Set()); }} placeholder={`Todos`} className="h-8 text-xs" />
              </div>
              <div className="flex items-end gap-2 pb-0.5">
                <Checkbox id="export-vars" checked={exportIncludeVars} onCheckedChange={(v) => setExportIncludeVars(!!v)} />
                <Label htmlFor="export-vars" className="text-[10px] cursor-pointer text-muted-foreground">Incluir variáveis</Label>
              </div>
            </div>

            {/* Select all / count */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <button className="hover:text-foreground transition-colors" onClick={() => {
                if (exportSelectedIds.size === exportFilteredContacts.length) setExportSelectedIds(new Set());
                else setExportSelectedIds(new Set(exportFilteredContacts.map(c => c.id)));
              }}>
                {exportSelectedIds.size === exportFilteredContacts.length && exportFilteredContacts.length > 0 ? "Desmarcar todos" : "Selecionar todos"}
              </button>
              <span className="tabular-nums font-medium">
                {exportSelectedIds.size > 0 ? `${exportSelectedIds.size} selecionado(s)` : `${exportFilteredContacts.length} contato(s)`}
              </span>
            </div>

            {/* Contact list with variables */}
            <div className="flex-1 min-h-0 overflow-auto border border-border/20 rounded-lg max-h-[400px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card z-10 border-b border-border/20">
                  <tr>
                    <th className="p-2 w-8"></th>
                    <th className="p-2 text-left font-medium text-muted-foreground">Nome</th>
                    <th className="p-2 text-left font-medium text-muted-foreground">Telefone</th>
                    <th className="p-2 text-left font-medium text-muted-foreground">Tags</th>
                    {exportIncludeVars && VAR_KEYS.map((_, i) => (
                      <th key={i} className="p-2 text-left font-medium text-muted-foreground whitespace-nowrap">V{i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/10">
                  {exportFilteredContacts.length === 0 ? (
                    <tr><td colSpan={4 + (exportIncludeVars ? 10 : 0)} className="p-8 text-center text-muted-foreground">Nenhum contato</td></tr>
                  ) : exportFilteredContacts.map(c => {
                    const isSelected = exportSelectedIds.has(c.id);
                    return (
                      <tr key={c.id} onClick={() => setExportSelectedIds(prev => {
                        const next = new Set(prev);
                        next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                        return next;
                      })} className={cn("cursor-pointer hover:bg-muted/10 transition-colors", isSelected && "bg-primary/5")}>
                        <td className="p-2 text-center"><Checkbox checked={isSelected} className="pointer-events-none" /></td>
                        <td className="p-2 font-medium text-foreground truncate max-w-[140px]">{c.name}</td>
                        <td className="p-2 text-muted-foreground font-mono">{c.phone}</td>
                        <td className="p-2">
                          <div className="flex gap-1 flex-wrap">
                            {(c.tags || []).map(t => <Badge key={t} variant="outline" className="text-[9px] px-1.5 py-0">{t}</Badge>)}
                          </div>
                        </td>
                        {exportIncludeVars && VAR_KEYS.map(k => (
                          <td key={k} className="p-2 text-muted-foreground truncate max-w-[80px]">{c[k]?.trim() || "—"}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Export count */}
            <div className="rounded-lg bg-muted/30 border border-border/30 p-2 text-center">
              <p className="text-lg font-bold text-foreground">{exportContacts.length}</p>
              <p className="text-[10px] text-muted-foreground">contatos serão exportados</p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>Cancelar</Button>
            <Button variant="outline" onClick={handleExportCSV} disabled={exportContacts.length === 0}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
            </Button>
            <Button onClick={handleExportXLSX} disabled={exportContacts.length === 0}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> XLSX
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Contacts;
