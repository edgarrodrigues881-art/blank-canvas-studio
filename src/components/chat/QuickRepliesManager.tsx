import { useState } from "react";
import { useQuickReplies, type QuickReply, QUICK_REPLY_CATEGORIES } from "@/hooks/chat/useQuickReplies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Zap, Loader2, Variable } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function QuickRepliesManager({ open, onOpenChange }: Props) {
  const { replies, isLoading, upsert, remove } = useQuickReplies();
  const [editing, setEditing] = useState<Partial<QuickReply> | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");

  const handleSave = () => {
    if (!editing?.label?.trim() || !editing?.content?.trim()) return;
    upsert.mutate(
      {
        id: editing.id,
        label: editing.label.trim(),
        content: editing.content.trim(),
        category: editing.category || "geral",
      },
      { onSuccess: () => setEditing(null) }
    );
  };

  const insertVariable = (variable: string) => {
    if (!editing) return;
    setEditing({ ...editing, content: (editing.content || "") + `{${variable}}` });
  };

  const filtered = categoryFilter === "all"
    ? replies
    : replies.filter((r) => r.category === categoryFilter);

  const getCategoryStyle = (cat: string) =>
    QUICK_REPLY_CATEGORIES.find((c) => c.value === cat)?.color || QUICK_REPLY_CATEGORIES[0].color;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Respostas Rápidas
          </DialogTitle>
        </DialogHeader>

        {editing ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Nome (ex: Saudação)"
                value={editing.label || ""}
                onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                className="flex-1"
              />
              <Select
                value={editing.category || "geral"}
                onValueChange={(v) => setEditing({ ...editing, category: v })}
              >
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUICK_REPLY_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Textarea
              placeholder="Conteúdo da mensagem... Use {nome} e {telefone} para variáveis"
              value={editing.content || ""}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              rows={4}
            />

            {/* Variable buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Variable className="w-3 h-3" /> Variáveis:
              </span>
              {["nome", "telefone"].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVariable(v)}
                  className="text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors font-mono"
                >
                  {`{${v}}`}
                </button>
              ))}
            </div>

            {/* Preview */}
            {editing.content && (
              <div className="rounded-lg bg-muted/30 border border-border/40 p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Pré-visualização</p>
                <p className="text-xs text-foreground whitespace-pre-wrap">
                  {editing.content
                    .replace(/\{nome\}/gi, "João Silva")
                    .replace(/\{telefone\}/gi, "+55 11 99999-1234")}
                </p>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>
                {upsert.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                Salvar
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 flex-1"
                onClick={() => setEditing({ label: "", content: "", category: "geral" })}
              >
                <Plus className="w-3.5 h-3.5" /> Nova resposta
              </Button>
            </div>

            {/* Category filter */}
            <div className="flex gap-1 overflow-x-auto scrollbar-none">
              <button
                onClick={() => setCategoryFilter("all")}
                className={cn(
                  "px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap transition-all",
                  categoryFilter === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted"
                )}
              >
                Todas ({replies.length})
              </button>
              {QUICK_REPLY_CATEGORIES.map((c) => {
                const count = replies.filter((r) => r.category === c.value).length;
                if (count === 0) return null;
                return (
                  <button
                    key={c.value}
                    onClick={() => setCategoryFilter(c.value === categoryFilter ? "all" : c.value)}
                    className={cn(
                      "px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap transition-all",
                      categoryFilter === c.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/40 text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {c.label} ({count})
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 mt-1">
              {isLoading && (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!isLoading && filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma resposta rápida encontrada.
                </p>
              )}
              {filtered.map((r) => (
                <div
                  key={r.id}
                  className="flex items-start gap-2 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-foreground">/{r.label}</p>
                      <Badge
                        variant="outline"
                        className={cn("text-[9px] px-1.5 py-0 h-4 rounded-md", getCategoryStyle(r.category))}
                      >
                        {QUICK_REPLY_CATEGORIES.find((c) => c.value === r.category)?.label || r.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{r.content}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-muted-foreground hover:text-foreground"
                      onClick={() => setEditing(r)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-muted-foreground hover:text-destructive"
                      onClick={() => remove.mutate(r.id)}
                      disabled={remove.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
