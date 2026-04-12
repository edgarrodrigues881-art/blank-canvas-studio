import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Plus, Trash2, Copy, ChevronLeft, ChevronRight, GripVertical,
  ImageIcon, X, Link, Phone, MousePointerClick, Loader2, ArrowUp, ArrowDown,
} from "lucide-react";
import { CarouselCard, CarouselCardButton, createEmptyCard, detectMediaType, MAX_CAROUSEL_CARDS } from "./carousel-types";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

interface CarouselEditorProps {
  cards: CarouselCard[];
  onChange: (cards: CarouselCard[]) => void;
}

// Compress images client-side
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
      const ctx = canvas.getContext("2d")!;
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
        outputType === "image/jpeg" ? quality : undefined
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
};

export function CarouselEditor({ cards, onChange }: CarouselEditorProps) {
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const mediaRef = useRef<HTMLInputElement>(null);
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
      toast({ title: `Máximo de ${MAX_CAROUSEL_CARDS} cards`, description: "Este é o limite compatível com o envio atual do carrossel.", variant: "destructive" });
      return;
    }
    const newCard = createEmptyCard(cards.length);
    const newCards = [...cards, newCard];
    onChange(newCards);
    setActiveCardIndex(newCards.length - 1);
  };

  const duplicateCard = (index: number) => {
    if (cards.length >= MAX_CAROUSEL_CARDS) {
      toast({ title: `Máximo de ${MAX_CAROUSEL_CARDS} cards`, description: "Este é o limite compatível com o envio atual do carrossel.", variant: "destructive" });
      return;
    }
    const source = cards[index];
    const newCard: CarouselCard = {
      ...source,
      id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      position: cards.length,
      buttons: source.buttons.map(b => ({ ...b, id: Math.floor(Date.now() + Math.random() * 10000) })),
    };
    const newCards = [...cards];
    newCards.splice(index + 1, 0, newCard);
    onChange(newCards.map((c, i) => ({ ...c, position: i })));
    setActiveCardIndex(index + 1);
  };

  const removeCard = (index: number) => {
    if (cards.length <= 1) {
      toast({ title: "Mínimo 1 card", variant: "destructive" });
      return;
    }
    const newCards = cards.filter((_, i) => i !== index).map((c, i) => ({ ...c, position: i }));
    onChange(newCards);
    setActiveCardIndex(Math.min(activeCardIndex, newCards.length - 1));
  };

  const moveCard = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= cards.length) return;
    const newCards = [...cards];
    [newCards[index], newCards[newIndex]] = [newCards[newIndex], newCards[index]];
    onChange(newCards.map((c, i) => ({ ...c, position: i })));
    setActiveCardIndex(newIndex);
  };

  // Button operations for active card
  const addButton = (type: "reply" | "url") => {
    if (!activeCard) return;
    if (activeCard.buttons.length >= 3) {
      toast({ title: "Máximo 3 botões por card", variant: "destructive" });
      return;
    }
    const newBtn: CarouselCardButton = { id: Math.floor(Date.now() + Math.random() * 10000), type, text: "", value: "" };
    const updatedButtons = [...activeCard.buttons, newBtn];
    updateCard(activeCardIndex, { buttons: updatedButtons });
    toast({ title: `Botão ${type === "url" ? "URL" : "Resposta"} adicionado`, description: `Preencha o texto do botão abaixo.` });
  };

  const removeButton = (btnId: number) => {
    if (!activeCard) return;
    updateCard(activeCardIndex, {
      buttons: activeCard.buttons.filter(b => b.id !== btnId),
    });
  };

  const updateButton = (btnId: number, field: keyof CarouselCardButton, val: string) => {
    if (!activeCard) return;
    updateCard(activeCardIndex, {
      buttons: activeCard.buttons.map(b => b.id === btnId ? { ...b, [field]: val } : b),
    });
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!session) {
      toast({ title: "Sessão expirada", description: "Faça login novamente para enviar mídia.", variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 20MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const optimized = await compressImage(file);
      const ext = optimized.name.split(".").pop() || "bin";
      const path = `${session.user.id}/carousel/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("media").upload(path, optimized);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
      updateCard(activeCardIndex, {
        mediaUrl: urlData.publicUrl,
        mediaType: detectMediaType(urlData.publicUrl),
        mediaFileName: file.name,
      });
      toast({ title: "Mídia enviada!" });
    } catch (err: any) {
      console.error("[CarouselEditor] upload error:", err);
      toast({ title: "Erro no upload", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (mediaRef.current) mediaRef.current.value = "";
    }
  };

  if (!activeCard) return null;

  return (
    <div className="space-y-4">
      {/* Card Tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {cards.map((card, i) => {
          const hasContent = card.text.trim() || card.mediaUrl;
          return (
            <button
              key={card.id}
              onClick={() => setActiveCardIndex(i)}
              className={cn(
                "px-3 py-1.5 text-[11px] transition-all rounded-sm font-sans font-extrabold relative",
                activeCardIndex === i
                  ? "bg-primary/15 text-primary"
                  : hasContent
                    ? "bg-muted/20 text-foreground/70 hover:bg-muted/30"
                    : "bg-muted/8 text-muted-foreground/40 hover:bg-muted/15"
              )}
            >
              Card {i + 1}
              {hasContent && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary inline-block" />}
            </button>
          );
        })}
        <button
          onClick={addCard}
          className="px-2.5 py-1.5 text-[11px] rounded-sm bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-semibold flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Card
        </button>
        <span className="text-[9px] text-muted-foreground/40 ml-2">
          {cards.length}/{MAX_CAROUSEL_CARDS} cards
        </span>
      </div>

      {/* Card Actions */}
      <div className="flex items-center gap-1 flex-wrap">
        <Button
          variant="ghost" size="sm"
          className="h-7 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
          onClick={() => moveCard(activeCardIndex, "up")}
          disabled={activeCardIndex === 0}
        >
          <ArrowUp className="w-3 h-3" /> Mover
        </Button>
        <Button
          variant="ghost" size="sm"
          className="h-7 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
          onClick={() => moveCard(activeCardIndex, "down")}
          disabled={activeCardIndex === cards.length - 1}
        >
          <ArrowDown className="w-3 h-3" /> Mover
        </Button>
        <Button
          variant="ghost" size="sm"
          className="h-7 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
          onClick={() => duplicateCard(activeCardIndex)}
        >
          <Copy className="w-3 h-3" /> Duplicar
        </Button>
        <Button
          variant="outline" size="sm"
          className="h-7 text-[10px] gap-1 border-destructive/30 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => removeCard(activeCardIndex)}
          disabled={cards.length <= 1}
        >
          <Trash2 className="w-3 h-3" /> Excluir
        </Button>
      </div>

      {/* Card Text */}
      <div className="space-y-2">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
          Texto do Card {activeCardIndex + 1}
        </label>
        <Textarea
          value={activeCard.text}
          onChange={(e) => updateCard(activeCardIndex, { text: e.target.value })}
          placeholder="Texto deste card..."
          rows={5}
          className="text-sm leading-[1.8] bg-muted/8 dark:bg-muted/4 border-border/15 resize-none focus-visible:ring-1 focus-visible:ring-primary/30 px-4 py-3 text-foreground/90 placeholder:text-muted-foreground/30 rounded-xl"
        />
      </div>

      {/* Card Media */}
      <div className="space-y-2">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
          Mídia do Card {activeCardIndex + 1}
        </label>
        <input type="file" ref={mediaRef} accept="image/*,video/*,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov" className="hidden" onChange={handleMediaUpload} />
        {!activeCard.mediaUrl ? (
          <button
            type="button"
            onClick={() => { console.log("[CarouselEditor] upload click, ref:", !!mediaRef.current); mediaRef.current?.click(); }}
            disabled={uploading}
            className="w-full py-6 rounded-xl border-2 border-dashed border-primary/30 hover:border-primary/50 bg-primary/5 flex flex-col items-center justify-center gap-2 transition-colors duration-100 hover:bg-primary/10 group cursor-pointer"
          >
            {uploading ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> : <ImageIcon className="w-5 h-5 text-primary/60 group-hover:text-primary transition-colors" />}
            <span className="text-xs font-medium text-primary/70 group-hover:text-primary transition-colors">
              {uploading ? "Enviando..." : "Toque para adicionar imagem"}
            </span>
          </button>
        ) : (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/60 shadow-sm">
            <img src={activeCard.mediaUrl} alt="preview" className="w-10 h-10 rounded-lg object-cover shrink-0" onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{activeCard.mediaFileName || "Mídia"}</p>
              <p className="text-[10px] text-muted-foreground/60">Anexado</p>
            </div>
            <button onClick={() => updateCard(activeCardIndex, { mediaUrl: "", mediaType: null, mediaFileName: "" })} className="text-muted-foreground/50 hover:text-destructive transition-colors p-1.5 rounded-lg hover:bg-destructive/10">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Card Buttons */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            Botões do Card {activeCardIndex + 1}
          </label>
          <Badge variant="secondary" className="text-[10px] h-5 bg-primary/10 text-primary border-primary/20">
            {activeCard.buttons.length}/3
          </Badge>
        </div>
        
        {activeCard.buttons.map((btn) => {
          const TypeIcon = btn.type === "url" ? Link : btn.type === "phone" ? Phone : MousePointerClick;
          return (
            <div key={btn.id} className="rounded-xl border border-border/30 dark:border-border/15 bg-muted/15 dark:bg-muted/8 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                    <TypeIcon className="w-3 h-3 text-primary" />
                  </div>
                  <select
                    value={btn.type}
                    onChange={(e) => updateButton(btn.id, "type", e.target.value)}
                    className="text-[10px] bg-transparent border-none text-muted-foreground focus:outline-none cursor-pointer"
                  >
                    <option value="reply">Resposta Rápida</option>
                    <option value="url">Link (URL)</option>
                    
                  </select>
                </div>
                <button onClick={() => removeButton(btn.id)} className="text-muted-foreground/30 hover:text-destructive transition-colors p-1">
                  <X className="w-3 h-3" />
                </button>
              </div>
              <Input
                value={btn.text}
                onChange={(e) => updateButton(btn.id, "text", e.target.value)}
                placeholder="Texto do botão"
                className="h-8 text-xs bg-background/50 border-border/20"
                maxLength={25}
              />
              {btn.type !== "reply" && (
                <Input
                  value={btn.value}
                  onChange={(e) => updateButton(btn.id, "value", e.target.value)}
                  placeholder={btn.type === "url" ? "https://..." : "+55..."}
                  className="h-8 text-xs bg-background/50 border-border/20"
                />
              )}
            </div>
          );
        })}

        {activeCard.buttons.length < 3 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 border-border/20" onClick={() => addButton("reply")}>
              <MousePointerClick className="w-3 h-3" /> Resposta
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 border-border/20" onClick={() => addButton("url")}>
              <Link className="w-3 h-3" /> URL
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
