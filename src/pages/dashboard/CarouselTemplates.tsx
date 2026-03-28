import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Plus, Search, Pencil, Trash2, Layers, Eye, Loader2, FileText, Bold, Italic, Strikethrough, Code, Smile } from "lucide-react";
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

const EMOJI_LIST = ["😀","😂","😍","🔥","✅","❌","👋","🎉","💰","📢","⚡","🚀","💬","📌","🏆","👏","💡","📲","🤝","⭐"];

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
  const [formMessages, setFormMessages] = useState<string[]>(["", "", "", "", ""]);
  const [activeMsgTab, setActiveMsgTab] = useState(0);
  const [formCards, setFormCards] = useState<CarouselCard[]>([createEmptyCard(0)]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentMessage = formMessages[activeMsgTab] || "";
  const setCurrentMessage = (val: string | ((prev: string) => string)) => {
    setFormMessages(prev => {
      const copy = [...prev];
      copy[activeMsgTab] = typeof val === "function" ? val(copy[activeMsgTab]) : val;
      return copy;
    });
  };
  const activeCount = formMessages.filter(m => m.trim()).length;

  const insertAtCursor = useCallback((text: string) => {
    const el = textareaRef.current;
    if (!el) { setCurrentMessage(prev => prev + text); return; }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const current = formMessages[activeMsgTab] || "";
    const newVal = current.substring(0, start) + text + current.substring(end);
    setCurrentMessage(newVal);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + text.length;
    });
  }, [activeMsgTab, formMessages]);

  const wrapSelectedText = useCallback((before: string, after: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const current = formMessages[activeMsgTab] || "";
    const selected = current.substring(start, end);
    const newVal = current.substring(0, start) + before + selected + after + current.substring(end);
    setCurrentMessage(newVal);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = start + before.length;
      el.selectionEnd = end + before.length;
    });
  }, [activeMsgTab, formMessages]);

  const filtered = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.message.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditingId(null);
    setFormName("");
    setFormMessages(["", "", "", "", ""]);
    setActiveMsgTab(0);
    setFormCards([createEmptyCard(0)]);
    setDialogOpen(true);
  };

  const openEdit = (t: any) => {
    setEditingId(t.id);
    setFormName(t.name);
    // Restore multi-message from ||| separator
    const rawMsg = t.message || "";
    const parts = rawMsg.split("|||");
    const slots = ["", "", "", "", ""];
    parts.slice(0, 5).forEach((p: string, i: number) => { slots[i] = p; });
    setFormMessages(slots);
    setActiveMsgTab(0);
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
    // Save only filled messages joined by |||
    const filledMessages = formMessages.filter(m => m.trim());
    const combinedMessage = filledMessages.join("|||");
    const payload = { name: formName, message: combinedMessage, cards: formCards };
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

            {/* Message with tabs + toolbar */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Mensagem principal (enviada acima do carrossel)
              </label>

              {/* Tabs */}
              <div className="flex items-center gap-1 flex-wrap">
                {[0, 1, 2, 3, 4].map(i => {
                  const hasText = formMessages[i]?.trim();
                  return (
                    <button
                      key={i}
                      onClick={() => setActiveMsgTab(i)}
                      className={cn(
                        "px-3 py-1.5 text-[11px] transition-all border-0 rounded-sm font-sans font-extrabold",
                        activeMsgTab === i
                          ? "bg-primary/15 text-primary"
                          : hasText
                            ? "bg-muted/20 text-foreground/70 hover:bg-muted/30"
                            : "bg-muted/8 text-muted-foreground/40 hover:bg-muted/15"
                      )}
                    >
                      Msg {i + 1}
                      {hasText && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary inline-block" />}
                    </button>
                  );
                })}
                <span className="text-[9px] text-muted-foreground/40 ml-2">
                  {activeCount}/5 ativas
                </span>
              </div>

              {/* Toolbar */}
              <div className="flex items-center gap-0.5 flex-wrap p-1.5 rounded-xl bg-muted/15 dark:bg-muted/8 border border-border/10">
                {/* Variables */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 text-[11px] gap-1.5 text-muted-foreground hover:text-foreground hover:bg-background/60 font-medium rounded-lg">
                      <FileText className="w-3.5 h-3.5" /> Variável
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-1.5 bg-popover border-border z-50" align="start">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60 px-2 py-1">Contato</p>
                    {[{ label: "Nome", tag: "{{nome}}" }, { label: "Número", tag: "{{numero}}" }].map(v => (
                      <button key={v.tag} className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-accent transition-colors flex items-center justify-between"
                        onClick={() => insertAtCursor(v.tag)}>
                        <span>{v.label}</span>
                        <code className="text-[9px] text-muted-foreground">{v.tag}</code>
                      </button>
                    ))}
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60 px-2 py-1 mt-1">Personalizadas</p>
                    {["Variável 1", "Variável 2", "Variável 3", "Variável 4", "Variável 5", "Variável 6", "Variável 7"].map((v, i) => (
                      <button key={v} className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-accent transition-colors flex items-center justify-between"
                        onClick={() => insertAtCursor(`{{var${i + 1}}}`)}>
                        <span>{v}</span>
                        <code className="text-[9px] text-muted-foreground">{`{{var${i + 1}}}`}</code>
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>

                <div className="w-px h-5 bg-border/30 mx-0.5" />

                {/* Formatting */}
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground" onClick={() => wrapSelectedText("*", "*")}><Bold className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground" onClick={() => wrapSelectedText("_", "_")}><Italic className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground" onClick={() => wrapSelectedText("~", "~")}><Strikethrough className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground" onClick={() => wrapSelectedText("```", "```")}><Code className="w-3.5 h-3.5" /></Button>

                <div className="w-px h-5 bg-border/30 mx-0.5" />

                {/* Emoji */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"><Smile className="w-3.5 h-3.5" /></Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2 bg-popover border-border z-50" align="start">
                    <div className="grid grid-cols-5 gap-1">
                      {EMOJI_LIST.map(e => (
                        <button key={e} className="text-lg hover:bg-accent rounded p-1 transition-colors" onClick={() => insertAtCursor(e)}>{e}</button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Textarea */}
              <Textarea
                ref={textareaRef}
                value={currentMessage}
                onChange={(e) => setCurrentMessage(e.target.value)}
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
