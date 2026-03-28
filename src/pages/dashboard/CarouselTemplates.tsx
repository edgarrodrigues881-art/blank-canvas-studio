import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Plus, Search, Pencil, Trash2, Layers, Eye, Loader2, FileText } from "lucide-react";
import {
  useCarouselTemplates,
  useCreateCarouselTemplate,
  useUpdateCarouselTemplate,
  useDeleteCarouselTemplate,
} from "@/hooks/useCarouselTemplates";
import { useToast } from "@/hooks/use-toast";
import { CarouselEditor } from "@/components/campaigns/CarouselEditor";
import { CarouselPreview } from "@/components/campaigns/CarouselPreview";
import { CarouselCard, createEmptyCard } from "@/components/campaigns/carousel-types";

const CarouselTemplates = () => {
  const { toast } = useToast();
  const { data: templates = [], isLoading } = useCarouselTemplates();
  const createTemplate = useCreateCarouselTemplate();
  const updateTemplate = useUpdateCarouselTemplate();
  const deleteTemplate = useDeleteCarouselTemplate();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formCards, setFormCards] = useState<CarouselCard[]>([createEmptyCard(0)]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);

  const filtered = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.message.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditingId(null);
    setFormName("");
    setFormMessage("");
    setFormCards([createEmptyCard(0)]);
    setDialogOpen(true);
  };

  const openEdit = (t: any) => {
    setEditingId(t.id);
    setFormName(t.name);
    setFormMessage(t.message || "");
    setFormCards(
      Array.isArray(t.cards) && t.cards.length > 0
        ? t.cards
        : [createEmptyCard(0)]
    );
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!formName.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    const validCards = formCards.filter((c) => c.text.trim() || c.mediaUrl);
    if (validCards.length === 0) {
      toast({ title: "Adicione pelo menos 1 card com conteúdo", variant: "destructive" });
      return;
    }
    const payload = { name: formName, message: formMessage, cards: formCards };
    if (editingId) {
      updateTemplate.mutate(
        { id: editingId, ...payload },
        { onSuccess: () => { setDialogOpen(false); toast({ title: "Template atualizado" }); } }
      );
    } else {
      createTemplate.mutate(payload, {
        onSuccess: () => { setDialogOpen(false); toast({ title: "Template criado" }); },
      });
    }
  };

  const handleDelete = (id: string) => {
    deleteTemplate.mutate(id, { onSuccess: () => toast({ title: "Template excluído" }) });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary" />
            Templates Carrossel
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Modelos prontos de carrossel para usar nas campanhas
          </p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5 rounded-xl px-5 shadow-sm">
          <Plus className="w-4 h-4" /> Novo Template
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar template..."
          className="pl-9 h-10 text-sm rounded-xl bg-muted/30 border-border/50 focus:bg-background transition-colors"
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <Layers className="w-10 h-10 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">Nenhum template de carrossel encontrado</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((t, idx) => {
            const cardCount = Array.isArray(t.cards) ? t.cards.filter((c: any) => c.text?.trim() || c.mediaUrl).length : 0;
            return (
              <div
                key={t.id}
                className="group flex items-center gap-4 px-4 py-3.5 rounded-xl border border-border/40 bg-card hover:border-primary/20 hover:shadow-[0_2px_12px_-4px_hsl(var(--primary)/0.08)] transition-all duration-200"
              >
                <span className="text-xs font-mono text-muted-foreground/40 w-6 text-right tabular-nums shrink-0">
                  {idx + 1}
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] font-medium shrink-0 rounded-lg px-2 py-0.5 border-border/60 bg-muted/40"
                >
                  {cardCount} card{cardCount !== 1 ? "s" : ""}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground/60 truncate mt-0.5">
                    {t.message || "Sem mensagem principal"}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={() => { setPreviewTemplate(t); setPreviewOpen(true); }}
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={() => openEdit(t)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-destructive hover:text-destructive"
                    onClick={() => handleDelete(t.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              {editingId ? "Editar Template Carrossel" : "Novo Template Carrossel"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Nome do template</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex: Promoção Black Friday"
                className="rounded-xl"
              />
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Mensagem principal (enviada acima do carrossel)
              </label>
              <Textarea
                value={formMessage}
                onChange={(e) => setFormMessage(e.target.value)}
                placeholder="Olá! Confira nossas ofertas..."
                className="rounded-xl min-h-[80px]"
              />
            </div>

            {/* Cards */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Cards do carrossel</label>
              <CarouselEditor cards={formCards} onChange={setFormCards} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={createTemplate.isPending || updateTemplate.isPending}
              className="rounded-xl gap-1.5"
            >
              {(createTemplate.isPending || updateTemplate.isPending) && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              {editingId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-sm p-0 overflow-hidden rounded-[20px]">
          {previewTemplate && (
            <CarouselPreview
              cards={previewTemplate.cards || []}
              message={previewTemplate.message}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CarouselTemplates;
