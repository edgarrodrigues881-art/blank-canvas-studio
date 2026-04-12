import { useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Plus,
  Trash2,
  Copy,
  ImageIcon,
  X,
  Link,
  Phone,
  MousePointerClick,
  Loader2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  CarouselCard,
  CarouselCardButton,
  createEmptyCard,
  detectMediaType,
  MAX_CAROUSEL_CARDS,
} from "./carousel-types";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

interface GroupCarouselEditorProps {
  cards: CarouselCard[];
  onChange: (cards: CarouselCard[]) => void;
}

const compressImage = (file: File, maxWidth = 1200, quality = 0.8): Promise<File> => {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/") || file.type === "image/gif") {
      resolve(file);
      return;
    }

    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, w, h);
      const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
      const outputExt = outputType === "image/png" ? ".png" : ".jpg";

      canvas.toBlob(
        (blob) => {
          if (blob && blob.size < file.size) {
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, outputExt), { type: outputType }));
          } else {
            resolve(file);
          }
        },
        outputType,
        outputType === "image/jpeg" ? quality : undefined,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
};

export function GroupCarouselEditor({ cards, onChange }: GroupCarouselEditorProps) {
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const { session } = useAuth();
  const { toast } = useToast();

  const activeCard = cards[activeCardIndex];

  const updateCard = (index: number, updates: Partial<CarouselCard>) => {
    const newCards = [...cards];
    newCards[index] = { ...newCards[index], ...updates };
    onChange(newCards);
  };

  const addCard = () => {
    if (cards.length >= MAX_CAROUSEL_CARDS) {
      toast({
        title: `Máximo de ${MAX_CAROUSEL_CARDS} cards`,
        description: "Este é o limite compatível com o envio atual do carrossel.",
        variant: "destructive",
      });
      return;
    }

    const newCard = createEmptyCard(cards.length);
    const newCards = [...cards, newCard];
    onChange(newCards);
    setActiveCardIndex(newCards.length - 1);
  };

  const duplicateCard = (index: number) => {
    if (cards.length >= MAX_CAROUSEL_CARDS) {
      toast({
        title: `Máximo de ${MAX_CAROUSEL_CARDS} cards`,
        description: "Este é o limite compatível com o envio atual do carrossel.",
        variant: "destructive",
      });
      return;
    }

    const source = cards[index];
    const newCard: CarouselCard = {
      ...source,
      id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      position: cards.length,
      buttons: source.buttons.map((button) => ({
        ...button,
        id: Math.floor(Date.now() + Math.random() * 10000),
      })),
    };

    const newCards = [...cards];
    newCards.splice(index + 1, 0, newCard);
    onChange(newCards.map((card, cardIndex) => ({ ...card, position: cardIndex })));
    setActiveCardIndex(index + 1);
  };

  const removeCard = (index: number) => {
    if (cards.length <= 1) {
      toast({ title: "Mínimo 1 card", variant: "destructive" });
      return;
    }

    const newCards = cards.filter((_, cardIndex) => cardIndex !== index).map((card, cardIndex) => ({
      ...card,
      position: cardIndex,
    }));

    onChange(newCards);
    setActiveCardIndex(Math.min(activeCardIndex, newCards.length - 1));
  };

  const moveCard = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= cards.length) return;

    const newCards = [...cards];
    [newCards[index], newCards[newIndex]] = [newCards[newIndex], newCards[index]];
    onChange(newCards.map((card, cardIndex) => ({ ...card, position: cardIndex })));
    setActiveCardIndex(newIndex);
  };

  const addButton = (type: "reply" | "url") => {
    if (!activeCard) return;
    if (activeCard.buttons.length >= 3) {
      toast({ title: "Máximo 3 botões por card", variant: "destructive" });
      return;
    }

    const newButton: CarouselCardButton = {
      id: Math.floor(Date.now() + Math.random() * 10000),
      type,
      text: "",
      value: "",
    };

    updateCard(activeCardIndex, { buttons: [...activeCard.buttons, newButton] });
    toast({
      title: `Botão ${type === "url" ? "URL" : "Resposta"} adicionado`,
      description: "Preencha o texto do botão abaixo.",
    });
  };

  const removeButton = (buttonId: number) => {
    if (!activeCard) return;
    updateCard(activeCardIndex, {
      buttons: activeCard.buttons.filter((button) => button.id !== buttonId),
    });
  };

  const updateButton = (buttonId: number, field: keyof CarouselCardButton, value: string) => {
    if (!activeCard) return;
    updateCard(activeCardIndex, {
      buttons: activeCard.buttons.map((button) =>
        button.id === buttonId ? { ...button, [field]: value } : button,
      ),
    });
  };

  const handleMediaUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];

    if (!file) return;

    if (!session) {
      toast({
        title: "Sessão expirada",
        description: "Faça login novamente para enviar a imagem.",
        variant: "destructive",
      });
      input.value = "";
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Arquivo inválido",
        description: "Para carrossel em grupos, envie apenas imagem.",
        variant: "destructive",
      });
      input.value = "";
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast({
        title: "Arquivo muito grande",
        description: "Máximo 20MB.",
        variant: "destructive",
      });
      input.value = "";
      return;
    }

    setUploading(true);

    try {
      const optimized = await compressImage(file);
      const ext = optimized.name.split(".").pop() || "bin";
      const path = `${session.user.id}/group-carousel/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage.from("media").upload(path, optimized, {
        upsert: false,
      });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);

      updateCard(activeCardIndex, {
        mediaUrl: urlData.publicUrl,
        mediaType: detectMediaType(urlData.publicUrl),
        mediaFileName: file.name,
      });

      toast({ title: "Imagem enviada!" });
    } catch (error: any) {
      toast({
        title: "Erro no upload",
        description: error?.message || "Não foi possível enviar a imagem.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      input.value = "";
    }
  };

  if (!activeCard) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 flex-wrap">
        {cards.map((card, index) => {
          const hasContent = card.text.trim() || card.mediaUrl;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setActiveCardIndex(index)}
              className={cn(
                "px-3 py-1.5 text-[11px] transition-all rounded-sm font-sans font-extrabold relative",
                activeCardIndex === index
                  ? "bg-primary/15 text-primary"
                  : hasContent
                    ? "bg-muted/20 text-foreground/70 hover:bg-muted/30"
                    : "bg-muted/8 text-muted-foreground/40 hover:bg-muted/15",
              )}
            >
              Card {index + 1}
              {hasContent && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-primary" />}
            </button>
          );
        })}

        <button
          type="button"
          onClick={addCard}
          className="flex items-center gap-1 rounded-sm bg-primary/10 px-2.5 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20"
        >
          <Plus className="h-3 w-3" /> Card
        </button>

        <span className="ml-2 text-[9px] text-muted-foreground/40">
          {cards.length}/{MAX_CAROUSEL_CARDS} cards
        </span>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => moveCard(activeCardIndex, "up")}
          disabled={activeCardIndex === 0}
        >
          <ArrowUp className="h-3 w-3" /> Mover
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => moveCard(activeCardIndex, "down")}
          disabled={activeCardIndex === cards.length - 1}
        >
          <ArrowDown className="h-3 w-3" /> Mover
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => duplicateCard(activeCardIndex)}
        >
          <Copy className="h-3 w-3" /> Duplicar
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 border-destructive/30 text-[10px] text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => removeCard(activeCardIndex)}
          disabled={cards.length <= 1}
        >
          <Trash2 className="h-3 w-3" /> Excluir
        </Button>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
          Texto do Card {activeCardIndex + 1}
        </label>
        <Textarea
          value={activeCard.text}
          onChange={(event) => updateCard(activeCardIndex, { text: event.target.value })}
          placeholder="Texto deste card..."
          rows={5}
          className="resize-none rounded-xl border-border/15 bg-muted/8 px-4 py-3 text-sm leading-[1.8] text-foreground/90 placeholder:text-muted-foreground/30 focus-visible:ring-1 focus-visible:ring-primary/30 dark:bg-muted/4"
        />
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
          Imagem do Card {activeCardIndex + 1}
        </label>

        {!activeCard.mediaUrl ? (
          <div className="relative overflow-hidden rounded-xl">
            <input
              type="file"
              accept="image/*,.jpg,.jpeg,.png,.gif,.webp"
              onChange={handleMediaUpload}
              disabled={uploading}
              aria-label={`Adicionar imagem do card ${activeCardIndex + 1}`}
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
            <div className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 py-6 transition-colors group-hover:border-primary/50 group-hover:bg-primary/10">
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : (
                <ImageIcon className="h-5 w-5 text-primary/60" />
              )}
              <span className="text-xs font-medium text-primary/70">
                {uploading ? "Enviando imagem..." : "Toque para adicionar imagem"}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-sm">
            <img
              src={activeCard.mediaUrl}
              alt="Preview da imagem do card"
              className="h-10 w-10 shrink-0 rounded-lg object-cover"
              onError={(event) => {
                (event.target as HTMLImageElement).src = "/placeholder.svg";
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">
                {activeCard.mediaFileName || "Imagem"}
              </p>
              <p className="text-[10px] text-muted-foreground/60">Anexada</p>
            </div>
            <button
              type="button"
              onClick={() => updateCard(activeCardIndex, { mediaUrl: "", mediaType: null, mediaFileName: "" })}
              className="rounded-lg p-1.5 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            Botões do Card {activeCardIndex + 1}
          </label>
          <Badge variant="secondary" className="h-5 border-primary/20 bg-primary/10 text-[10px] text-primary">
            {activeCard.buttons.length}/3
          </Badge>
        </div>

        {activeCard.buttons.map((button) => {
          const TypeIcon = button.type === "url" ? Link : button.type === "phone" ? Phone : MousePointerClick;

          return (
            <div
              key={button.id}
              className="space-y-2 rounded-xl border border-border/30 bg-muted/15 p-3 dark:border-border/15 dark:bg-muted/8"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
                    <TypeIcon className="h-3 w-3 text-primary" />
                  </div>
                  <select
                    value={button.type}
                    onChange={(event) => updateButton(button.id, "type", event.target.value)}
                    className="cursor-pointer border-none bg-transparent text-[10px] text-muted-foreground focus:outline-none"
                  >
                    <option value="reply">Resposta Rápida</option>
                    <option value="url">Link (URL)</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => removeButton(button.id)}
                  className="p-1 text-muted-foreground/30 transition-colors hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <Input
                value={button.text}
                onChange={(event) => updateButton(button.id, "text", event.target.value)}
                placeholder="Texto do botão"
                className="h-8 border-border/20 bg-background/50 text-xs"
                maxLength={25}
              />
              {button.type !== "reply" && (
                <Input
                  value={button.value}
                  onChange={(event) => updateButton(button.id, "value", event.target.value)}
                  placeholder={button.type === "url" ? "https://..." : "+55..."}
                  className="h-8 border-border/20 bg-background/50 text-xs"
                />
              )}
            </div>
          );
        })}

        {activeCard.buttons.length < 3 && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 border-border/20 text-[10px]"
              onClick={() => addButton("reply")}
            >
              <MousePointerClick className="h-3 w-3" /> Resposta
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 border-border/20 text-[10px]"
              onClick={() => addButton("url")}
            >
              <Link className="h-3 w-3" /> URL
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
