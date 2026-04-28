import { useMemo, useState } from "react";
import { useNotes, type NoteBlock, type NoteColumn, type ChecklistItem, type GoalRow } from "@/hooks/useNotes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Trash2, ImageIcon, Link2, Tag as TagIcon, CheckSquare,
  Target, X, Pencil, Notebook as NotebookIcon, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const COLOR_MAP: Record<string, { dot: string; bg: string; border: string }> = {
  slate:   { dot: "bg-slate-500",   bg: "bg-slate-500/10",   border: "border-slate-500/30" },
  blue:    { dot: "bg-blue-500",    bg: "bg-blue-500/10",    border: "border-blue-500/30" },
  amber:   { dot: "bg-amber-500",   bg: "bg-amber-500/10",   border: "border-amber-500/30" },
  emerald: { dot: "bg-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  rose:    { dot: "bg-rose-500",    bg: "bg-rose-500/10",    border: "border-rose-500/30" },
  violet:  { dot: "bg-violet-500",  bg: "bg-violet-500/10",  border: "border-violet-500/30" },
  cyan:    { dot: "bg-cyan-500",    bg: "bg-cyan-500/10",    border: "border-cyan-500/30" },
  orange:  { dot: "bg-orange-500",  bg: "bg-orange-500/10",  border: "border-orange-500/30" },
};
const COLOR_KEYS = Object.keys(COLOR_MAP);

const fmtBRL = (v: number | null | undefined) =>
  v == null ? null : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function Notes() {
  const {
    loading, notebooks, columns, blocks,
    activeNotebookId, setActiveNotebookId,
    createNotebook, updateNotebook, deleteNotebook,
    createColumn, updateColumn, deleteColumn,
    createBlock, updateBlock, deleteBlock, moveBlock,
    uploadImage,
  } = useNotes();

  const [editingBlock, setEditingBlock] = useState<NoteBlock | null>(null);
  const [renameNotebookId, setRenameNotebookId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const activeNotebook = notebooks.find(n => n.id === activeNotebookId) || null;
  const activeColumns = useMemo(
    () => columns.filter(c => c.notebook_id === activeNotebookId).sort((a, b) => a.position - b.position),
    [columns, activeNotebookId]
  );
  const blocksByColumn = useMemo(() => {
    const map: Record<string, NoteBlock[]> = { __none: [] };
    activeColumns.forEach(c => { map[c.id] = []; });
    blocks
      .filter(b => b.notebook_id === activeNotebookId)
      .sort((a, b) => a.position - b.position)
      .forEach(b => {
        const key = b.column_id || "__none";
        if (!map[key]) map[key] = [];
        map[key].push(b);
      });
    return map;
  }, [blocks, activeColumns, activeNotebookId]);

  const handleNewNotebook = async () => {
    try { await createNotebook(); toast.success("Caderno criado"); }
    catch { toast.error("Erro ao criar caderno"); }
  };

  const handleDrop = async (columnId: string | null, index: number) => {
    if (!draggedId) return;
    await moveBlock(draggedId, columnId, index);
    setDraggedId(null);
  };

  if (loading) {
    return <div className="p-8 text-muted-foreground">Carregando anotações…</div>;
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-background">
      {/* ================= NOTEBOOKS SIDEBAR ================= */}
      <aside className="w-64 shrink-0 border-r border-border bg-card/30 flex flex-col">
        <div className="px-4 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/70">
            Cadernos
          </h2>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleNewNotebook} title="Novo caderno">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {notebooks.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              Nenhum caderno ainda.<br/>
              <button className="text-primary mt-2 underline" onClick={handleNewNotebook}>
                Criar o primeiro
              </button>
            </div>
          )}
          {notebooks.map(nb => {
            const isActive = nb.id === activeNotebookId;
            const colorTokens = COLOR_MAP[nb.color] || COLOR_MAP.emerald;
            return (
              <div
                key={nb.id}
                onClick={() => setActiveNotebookId(nb.id)}
                className={cn(
                  "group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                  isActive ? "bg-primary/10 text-primary" : "hover:bg-muted/60 text-foreground/80"
                )}
              >
                <span className={cn("h-2 w-2 rounded-full shrink-0", colorTokens.dot)} />
                <NotebookIcon className="h-4 w-4 shrink-0 opacity-70" />
                <span className="flex-1 truncate text-sm font-medium">{nb.name}</span>
                <button
                  className="opacity-0 group-hover:opacity-100 transition"
                  onClick={(e) => { e.stopPropagation(); setRenameNotebookId(nb.id); }}
                  title="Renomear"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <button
                  className="opacity-0 group-hover:opacity-100 transition"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Excluir caderno "${nb.name}" e todas as anotações?`)) deleteNotebook(nb.id);
                  }}
                  title="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-500/70" />
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ================= KANBAN ================= */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {!activeNotebook ? (
          <div className="flex-1 flex items-center justify-center text-center px-6">
            <div className="max-w-sm">
              <div className="h-16 w-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <NotebookIcon className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">Anotações em pipelines</h3>
              <p className="text-sm text-muted-foreground mb-5">
                Crie cadernos, organize blocos em colunas e gerencie ideias, metas, links e valores no estilo kanban.
              </p>
              <Button onClick={handleNewNotebook}>
                <Plus className="h-4 w-4 mr-1.5" /> Criar primeiro caderno
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 py-5 border-b border-border flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground/70 mb-1">
                  <NotebookIcon className="h-3 w-3" />
                  <span>Anotações</span>
                  <ChevronRight className="h-3 w-3" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight">{activeNotebook.name}</h1>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  {activeColumns.length} colunas · {blocks.filter(b => b.notebook_id === activeNotebookId).length} anotações
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => createColumn(activeNotebook.id)}>
                <Plus className="h-4 w-4 mr-1.5" /> Nova coluna
              </Button>
            </div>

            {/* Columns */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden">
              <div className="flex gap-4 p-6 h-full min-w-max">
                {activeColumns.length === 0 && (
                  <div className="text-sm text-muted-foreground self-center">
                    Crie a primeira coluna para começar.
                  </div>
                )}
                {activeColumns.map(col => (
                  <ColumnView
                    key={col.id}
                    column={col}
                    blocks={blocksByColumn[col.id] || []}
                    onAddBlock={() => createBlock(activeNotebook.id, col.id).then(b => b && setEditingBlock(b))}
                    onEditBlock={(b) => setEditingBlock(b)}
                    onUpdateColumn={updateColumn}
                    onDeleteColumn={deleteColumn}
                    onDragStart={setDraggedId}
                    onDrop={handleDrop}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </main>

      {/* ================= MODALS ================= */}
      {editingBlock && (
        <BlockEditor
          block={editingBlock}
          onClose={() => setEditingBlock(null)}
          onSave={async (patch) => { await updateBlock(editingBlock.id, patch); }}
          onDelete={async () => { await deleteBlock(editingBlock.id); setEditingBlock(null); }}
          onUploadImage={uploadImage}
        />
      )}
      {renameNotebookId && (
        <RenameDialog
          initial={notebooks.find(n => n.id === renameNotebookId)?.name || ""}
          initialColor={notebooks.find(n => n.id === renameNotebookId)?.color || "emerald"}
          onClose={() => setRenameNotebookId(null)}
          onSave={async (name, color) => {
            await updateNotebook(renameNotebookId, { name, color });
            setRenameNotebookId(null);
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// COLUMN
// =====================================================================
function ColumnView({
  column, blocks, onAddBlock, onEditBlock, onUpdateColumn, onDeleteColumn,
  onDragStart, onDrop,
}: {
  column: NoteColumn;
  blocks: NoteBlock[];
  onAddBlock: () => void;
  onEditBlock: (b: NoteBlock) => void;
  onUpdateColumn: (id: string, patch: Partial<NoteColumn>) => void;
  onDeleteColumn: (id: string) => void;
  onDragStart: (id: string) => void;
  onDrop: (columnId: string, index: number) => void;
}) {
  const tokens = COLOR_MAP[column.color] || COLOR_MAP.slate;
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(column.label);
  const totalPrice = blocks.reduce((s, b) => s + (Number(b.price) || 0), 0);

  return (
    <div className="w-80 shrink-0 flex flex-col bg-card/40 rounded-xl border border-border">
      {/* Header */}
      <div className={cn("px-3 py-2.5 border-b rounded-t-xl flex items-center gap-2", tokens.bg, tokens.border)}>
        <span className={cn("h-2 w-2 rounded-full", tokens.dot)} />
        {editing ? (
          <Input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => { onUpdateColumn(column.id, { label }); setEditing(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="h-7 text-sm font-bold flex-1"
          />
        ) : (
          <button
            className="flex-1 text-left text-sm font-bold uppercase tracking-wide truncate"
            onClick={() => setEditing(true)}
          >
            {column.label}
          </button>
        )}
        <Badge variant="outline" className="text-[10px] tabular-nums">{blocks.length}</Badge>
        <select
          value={column.color}
          onChange={(e) => onUpdateColumn(column.id, { color: e.target.value })}
          className="h-6 text-xs bg-transparent border border-border rounded px-1"
          title="Cor"
        >
          {COLOR_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <button
          onClick={() => { if (confirm(`Excluir coluna "${column.label}"?`)) onDeleteColumn(column.id); }}
          title="Excluir coluna"
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-rose-500" />
        </button>
      </div>

      {/* Total price */}
      {totalPrice > 0 && (
        <div className="px-3 py-1.5 text-[11px] text-emerald-500 font-semibold border-b border-border/50 tabular-nums">
          Σ {fmtBRL(totalPrice)}
        </div>
      )}

      {/* Blocks */}
      <div
        className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[200px]"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); onDrop(column.id, blocks.length); }}
      >
        {blocks.map((b, idx) => (
          <BlockCard
            key={b.id}
            block={b}
            onClick={() => onEditBlock(b)}
            onDragStart={() => onDragStart(b.id)}
            onDropAbove={() => onDrop(column.id, idx)}
          />
        ))}
        <button
          onClick={onAddBlock}
          className="w-full py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg border border-dashed border-border transition flex items-center justify-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar anotação
        </button>
      </div>
    </div>
  );
}

// =====================================================================
// BLOCK CARD
// =====================================================================
function BlockCard({ block, onClick, onDragStart, onDropAbove }: {
  block: NoteBlock; onClick: () => void; onDragStart: () => void; onDropAbove: () => void;
}) {
  const checklistDone = block.checklist.filter(i => i.done).length;
  const goalProgress = block.goals.length > 0
    ? Math.round(block.goals.reduce((s, g) => s + Math.min(100, (g.current / Math.max(1, g.target)) * 100), 0) / block.goals.length)
    : null;

  return (
    <Card
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDropAbove(); }}
      onClick={onClick}
      className="p-3 cursor-grab active:cursor-grabbing hover:border-primary/40 transition group"
    >
      {block.image_url && (
        <img src={block.image_url} alt="" className="w-full h-24 object-cover rounded-md mb-2" />
      )}
      <div className="flex items-start gap-2">
        <h4 className="flex-1 text-sm font-bold leading-snug truncate">
          {block.title || <span className="text-muted-foreground italic">Sem título</span>}
        </h4>
      </div>
      {block.content && (
        <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-2 whitespace-pre-wrap">
          {block.content}
        </p>
      )}

      {/* Tags */}
      {block.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {block.tags.slice(0, 4).map((t, i) => (
            <Badge key={i} variant="secondary" className="text-[10px] py-0 h-4">{t}</Badge>
          ))}
        </div>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-2 mt-2.5 flex-wrap text-[11px] text-muted-foreground">
        {block.price != null && (
          <span className="text-emerald-500 font-semibold tabular-nums">{fmtBRL(block.price)}</span>
        )}
        {block.link_url && <Link2 className="h-3 w-3" />}
        {block.checklist.length > 0 && (
          <span className="flex items-center gap-0.5"><CheckSquare className="h-3 w-3" />{checklistDone}/{block.checklist.length}</span>
        )}
        {goalProgress != null && (
          <span className="flex items-center gap-0.5"><Target className="h-3 w-3" />{goalProgress}%</span>
        )}
      </div>
    </Card>
  );
}

// =====================================================================
// BLOCK EDITOR
// =====================================================================
function BlockEditor({ block, onClose, onSave, onDelete, onUploadImage }: {
  block: NoteBlock;
  onClose: () => void;
  onSave: (patch: Partial<NoteBlock>) => Promise<void>;
  onDelete: () => Promise<void>;
  onUploadImage: (f: File) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState<NoteBlock>(block);
  const [uploading, setUploading] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const patch = (p: Partial<NoteBlock>) => setDraft(prev => ({ ...prev, ...p }));

  const handleSave = async () => {
    await onSave({
      title: draft.title,
      content: draft.content,
      image_url: draft.image_url,
      link_url: draft.link_url,
      price: draft.price,
      checklist: draft.checklist,
      tags: draft.tags,
      goals: draft.goals,
    });
    toast.success("Anotação salva");
    onClose();
  };

  const handleImageFile = async (file: File) => {
    setUploading(true);
    const url = await onUploadImage(file);
    setUploading(false);
    if (url) patch({ image_url: url });
    else toast.error("Falha no upload");
  };

  // Checklist helpers
  const addChecklistItem = () => patch({
    checklist: [...draft.checklist, { id: crypto.randomUUID(), text: "", done: false }]
  });
  const updateChecklistItem = (id: string, p: Partial<ChecklistItem>) =>
    patch({ checklist: draft.checklist.map(i => i.id === id ? { ...i, ...p } : i) });
  const removeChecklistItem = (id: string) =>
    patch({ checklist: draft.checklist.filter(i => i.id !== id) });

  // Goals helpers
  const addGoal = () => patch({ goals: [...draft.goals, { label: "", target: 100, current: 0, unit: "" }] });
  const updateGoal = (idx: number, p: Partial<GoalRow>) =>
    patch({ goals: draft.goals.map((g, i) => i === idx ? { ...g, ...p } : g) });
  const removeGoal = (idx: number) => patch({ goals: draft.goals.filter((_, i) => i !== idx) });

  // Tag helpers
  const addTag = () => {
    const t = tagInput.trim();
    if (!t || draft.tags.includes(t)) return;
    patch({ tags: [...draft.tags, t] });
    setTagInput("");
  };
  const removeTag = (t: string) => patch({ tags: draft.tags.filter(x => x !== t) });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar anotação</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            value={draft.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Título da anotação"
            className="text-lg font-bold"
          />

          {/* Image */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1.5">
              <ImageIcon className="h-3.5 w-3.5" /> Imagem
            </label>
            {draft.image_url ? (
              <div className="relative">
                <img src={draft.image_url} alt="" className="w-full max-h-48 object-cover rounded-lg border border-border" />
                <button
                  onClick={() => patch({ image_url: null })}
                  className="absolute top-2 right-2 bg-background/80 rounded-full p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center h-24 border border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/40 text-xs text-muted-foreground">
                {uploading ? "Enviando..." : "Clique para enviar imagem"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }}
                />
              </label>
            )}
          </div>

          {/* Content */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Conteúdo</label>
            <Textarea
              value={draft.content || ""}
              onChange={(e) => patch({ content: e.target.value })}
              placeholder="Escreva sua anotação... (suporta markdown simples)"
              rows={5}
            />
          </div>

          {/* Link + Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1.5">
                <Link2 className="h-3.5 w-3.5" /> Link
              </label>
              <Input
                value={draft.link_url || ""}
                onChange={(e) => patch({ link_url: e.target.value })}
                placeholder="https://..."
                type="url"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Preço (R$)</label>
              <Input
                value={draft.price ?? ""}
                onChange={(e) => patch({ price: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder="0,00"
                type="number"
                step="0.01"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1.5">
              <TagIcon className="h-3.5 w-3.5" /> Tags
            </label>
            <div className="flex flex-wrap gap-1 mb-2">
              {draft.tags.map(t => (
                <Badge key={t} variant="secondary" className="gap-1">
                  {t}
                  <button onClick={() => removeTag(t)}><X className="h-3 w-3" /></button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                placeholder="Nova tag e Enter"
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={addTag}>Adicionar</Button>
            </div>
          </div>

          {/* Checklist */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1.5">
              <CheckSquare className="h-3.5 w-3.5" /> Checklist
            </label>
            <div className="space-y-1.5">
              {draft.checklist.map(item => (
                <div key={item.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={(e) => updateChecklistItem(item.id, { done: e.target.checked })}
                  />
                  <Input
                    value={item.text}
                    onChange={(e) => updateChecklistItem(item.id, { text: e.target.value })}
                    placeholder="Item..."
                    className={cn("h-8", item.done && "line-through opacity-60")}
                  />
                  <button onClick={() => removeChecklistItem(item.id)}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addChecklistItem}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar item
              </Button>
            </div>
          </div>

          {/* Goals */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1.5">
              <Target className="h-3.5 w-3.5" /> Tabela de metas
            </label>
            {draft.goals.length > 0 && (
              <div className="space-y-1.5 mb-2">
                <div className="grid grid-cols-12 gap-2 text-[10px] uppercase font-semibold text-muted-foreground/60">
                  <div className="col-span-5">Meta</div>
                  <div className="col-span-2">Atual</div>
                  <div className="col-span-2">Alvo</div>
                  <div className="col-span-2">Unidade</div>
                </div>
                {draft.goals.map((g, idx) => {
                  const pct = Math.min(100, Math.round((g.current / Math.max(1, g.target)) * 100));
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <Input className="col-span-5 h-8" value={g.label} onChange={(e) => updateGoal(idx, { label: e.target.value })} placeholder="Vendas..." />
                        <Input className="col-span-2 h-8 tabular-nums" type="number" value={g.current} onChange={(e) => updateGoal(idx, { current: Number(e.target.value) })} />
                        <Input className="col-span-2 h-8 tabular-nums" type="number" value={g.target} onChange={(e) => updateGoal(idx, { target: Number(e.target.value) })} />
                        <Input className="col-span-2 h-8" value={g.unit || ""} onChange={(e) => updateGoal(idx, { unit: e.target.value })} placeholder="R$, un..." />
                        <button className="col-span-1 justify-self-center" onClick={() => removeGoal(idx)}>
                          <X className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={cn("h-full transition-all", pct >= 100 ? "bg-emerald-500" : "bg-primary")} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <Button type="button" variant="outline" size="sm" onClick={addGoal}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar meta
            </Button>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <Button variant="ghost" className="text-rose-500" onClick={() => { if (confirm("Excluir anotação?")) onDelete(); }}>
              <Trash2 className="h-4 w-4 mr-1.5" /> Excluir
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleSave}>Salvar</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// RENAME NOTEBOOK
// =====================================================================
function RenameDialog({ initial, initialColor, onClose, onSave }: {
  initial: string; initialColor: string;
  onClose: () => void;
  onSave: (name: string, color: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [color, setColor] = useState(initialColor);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Editar caderno</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Nome</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Cor</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_KEYS.map(k => (
                <button
                  key={k}
                  onClick={() => setColor(k)}
                  className={cn(
                    "h-8 w-8 rounded-full border-2 transition",
                    COLOR_MAP[k].dot,
                    color === k ? "border-foreground scale-110" : "border-transparent"
                  )}
                  title={k}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={() => onSave(name, color)}>Salvar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
