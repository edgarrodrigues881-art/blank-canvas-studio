import { useState } from "react";
import { useQuickReplies, type QuickReply } from "@/hooks/useQuickReplies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Zap, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function QuickRepliesManager({ open, onOpenChange }: Props) {
  const { replies, isLoading, upsert, remove } = useQuickReplies();
  const [editing, setEditing] = useState<Partial<QuickReply> | null>(null);

  const handleSave = () => {
    if (!editing?.label?.trim() || !editing?.content?.trim()) return;
    upsert.mutate(
      { id: editing.id, label: editing.label.trim(), content: editing.content.trim() },
      { onSuccess: () => setEditing(null) }
    );
  };

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
            <Input
              placeholder="Nome (ex: Saudação)"
              value={editing.label || ""}
              onChange={(e) => setEditing({ ...editing, label: e.target.value })}
            />
            <Textarea
              placeholder="Conteúdo da mensagem..."
              value={editing.content || ""}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              rows={4}
            />
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
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => setEditing({ label: "", content: "" })}
            >
              <Plus className="w-3.5 h-3.5" /> Nova resposta rápida
            </Button>

            <div className="flex-1 overflow-y-auto space-y-1 mt-2">
              {isLoading && (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!isLoading && replies.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma resposta rápida criada.
                </p>
              )}
              {replies.map((r) => (
                <div
                  key={r.id}
                  className="flex items-start gap-2 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">/{r.label}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{r.content}</p>
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
