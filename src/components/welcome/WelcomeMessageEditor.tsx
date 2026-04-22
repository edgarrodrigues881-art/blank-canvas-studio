import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTemplates } from "@/hooks/useTemplates";
import { useCarouselTemplates } from "@/hooks/useCarouselTemplates";
import { toast } from "sonner";
import {
  Variable, Import, Bold, Italic, Strikethrough, Code,
  Type, MousePointerClick, Images, Image as ImageIcon,
  Plus, Trash2, GripVertical, Link2, Phone, MessageCircle,
  Clock, Play, Video, FileAudio, FileText,
} from "lucide-react";

// ────────────────────────────────────────────────────────────
// Types — aligned with welcome_automations backend columns
// ────────────────────────────────────────────────────────────
export type WelcomeMessageType = "text" | "buttons" | "carousel" | "media";

export type WelcomeButtonType = "reply" | "url" | "phone";

export interface WelcomeButton {
  id: string;
  type: WelcomeButtonType;
  text: string;
  value: string; // URL, phone or reply payload
}

export interface WelcomeCarouselCard {
  id: string;
  title: string;
  description: string;
  image_url: string;
  buttons: WelcomeButton[];
}

export interface WelcomeMessagePayload {
  message_type: WelcomeMessageType;
  message_content: string;
  buttons: WelcomeButton[];
  carousel_cards: WelcomeCarouselCard[];
  media_url: string;
  media_caption: string;
  media_kind: "image" | "video" | "audio" | "document" | null;
  min_delay_seconds: number;
  max_delay_seconds: number;
}

export const DEFAULT_WELCOME_PAYLOAD: WelcomeMessagePayload = {
  message_type: "text",
  message_content: "Olá {nome}! Seja bem-vindo(a) ao {grupo}! 🎉",
  buttons: [],
  carousel_cards: [],
  media_url: "",
  media_caption: "",
  media_kind: null,
  min_delay_seconds: 30,
  max_delay_seconds: 60,
};

const VARIABLES = [
  { key: "{nome}", label: "Nome", desc: "Nome do participante" },
  { key: "{numero}", label: "Número", desc: "Telefone do participante" },
  { key: "{grupo}", label: "Grupo", desc: "Nome do grupo" },
  { key: "{data}", label: "Data", desc: "Data atual" },
  { key: "{hora}", label: "Hora", desc: "Hora atual" },
];

const FORMAT_BUTTONS = [
  { icon: Bold, wrap: ["*", "*"], label: "Negrito" },
  { icon: Italic, wrap: ["_", "_"], label: "Itálico" },
  { icon: Strikethrough, wrap: ["~", "~"], label: "Tachado" },
  { icon: Code, wrap: ["```", "```"], label: "Código" },
];

// UI-level message modes — composable. Backend keeps `text | buttons | media | carousel`,
// but the user picks only between "simple" (composable text + media + buttons) and "carousel".
export type WelcomeUiMode = "simple" | "carousel";

export const WELCOME_TYPE_OPTIONS: { value: WelcomeUiMode; label: string; desc: string; tag: string; icon: any }[] = [
  { value: "simple", label: "Mensagem", desc: "Texto, mídia e botões em uma única mensagem", tag: "Composável", icon: Type },
  { value: "carousel", label: "Carrossel", desc: "Múltiplos cards visuais com botões", tag: "Alta conversão", icon: Images },
];

/** Derive UI mode from backend message_type */
export function getUiModeFromPayload(p: Pick<WelcomeMessagePayload, "message_type">): WelcomeUiMode {
  return p.message_type === "carousel" ? "carousel" : "simple";
}

/** Derive backend message_type from a "simple" composition */
export function deriveBackendMessageType(p: WelcomeMessagePayload): WelcomeMessageType {
  if (p.message_type === "carousel") return "carousel";
  if (p.buttons && p.buttons.length > 0) return "buttons";
  if (p.media_url && p.media_url.trim()) return "media";
  return "text";
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────
function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function detectMediaKind(url: string): "image" | "video" | "audio" | "document" | null {
  const clean = (url || "").toLowerCase().split("?")[0];
  if (!clean) return null;
  if (/\.(mp4|mov|avi|mkv|webm|3gp)$/.test(clean)) return "video";
  if (/\.(mp3|wav|ogg|m4a|opus|aac|mpeg)$/.test(clean)) return "audio";
  if (/\.(pdf|docx?|xlsx?|pptx?|zip|rar|csv|txt)$/.test(clean)) return "document";
  if (/\.(jpe?g|png|gif|webp|bmp|svg)$/.test(clean)) return "image";
  return "image";
}

function renderVars(text: string, varClass: string) {
  return (text || "")
    .replace(/\*(.*?)\*/g, "<b>$1</b>")
    .replace(/_(.*?)_/g, "<i>$1</i>")
    .replace(/~(.*?)~/g, "<s>$1</s>")
    .replace(/\n/g, "<br/>")
    .replace(/\{nome\}/g, `<span class="${varClass}">João Silva</span>`)
    .replace(/\{numero\}/g, `<span class="${varClass}">5511999999999</span>`)
    .replace(/\{grupo\}/g, `<span class="${varClass}">Grupo VIP</span>`)
    .replace(/\{data\}/g, `<span class="${varClass}">30/03/2026</span>`)
    .replace(/\{hora\}/g, `<span class="${varClass}">14:30</span>`);
}

function clampDelay(value: number, min = 1, max = 1800) {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

// ────────────────────────────────────────────────────────────
// WhatsApp Preview
// ────────────────────────────────────────────────────────────
export function WelcomeWhatsAppPreview({ payload, height = 460 }: { payload: WelcomeMessagePayload; height?: number }) { return <WhatsAppPreviewInner payload={payload} height={height} />; }
function WhatsAppPreviewInner({ payload, height = 460 }: { payload: WelcomeMessagePayload; height?: number }) {
  const isDark = document.documentElement.classList.contains("dark");
  const varClass = isDark ? "text-emerald-400" : "text-emerald-600";
  const bubbleBg = isDark ? "#005c4b" : "#DCF8C6";
  const bubbleColor = isDark ? "#ffffff" : "#111b21";
  const cardBg = isDark ? "#1f2c33" : "#ffffff";
  const btnColor = isDark ? "#53bdeb" : "#027eb5";
  const subColor = isDark ? "#aebac1" : "#667781";

  const renderedText = renderVars(payload.message_content, varClass);
  const buttons = payload.buttons || [];
  const cards = payload.carousel_cards || [];
  const mediaKind = payload.media_url ? detectMediaKind(payload.media_url) : null;

  return (
    <div
      className="rounded-2xl border border-border/30 flex flex-col overflow-hidden"
      style={{ backgroundColor: isDark ? "#0b141a" : "#ECE5DD", height }}
    >
      <div className="flex items-center gap-2 px-4 pt-4 pb-2 border-b border-border/20 shrink-0">
        <div className="w-2 h-2 rounded-full bg-emerald-400" />
        <span className={`text-[10px] font-medium uppercase tracking-wider ${isDark ? "text-muted-foreground" : "text-gray-500"}`}>Preview WhatsApp</span>
        <Badge variant="outline" className="ml-auto text-[9px] px-1.5 py-0 h-4 font-mono uppercase">
          {payload.message_type}
        </Badge>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex justify-end">
          <div className="max-w-[90%] space-y-1">

            {/* Composable bubble for non-carousel: media + text + buttons can coexist */}
            {payload.message_type !== "carousel" && (
              <div className="rounded-xl rounded-tr-sm overflow-hidden shadow-lg" style={{ backgroundColor: bubbleBg, color: bubbleColor }}>
                {/* Media block (top) */}
                {payload.media_url && (
                  <>
                    {mediaKind === "image" && (
                      <img src={payload.media_url} alt="" className="w-full max-h-[200px] object-cover" onError={e => (e.currentTarget.style.display = "none")} />
                    )}
                    {mediaKind === "video" && (
                      <div className="relative h-[180px] bg-black/40 flex items-center justify-center">
                        <video src={payload.media_url} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
                            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                          </div>
                        </div>
                      </div>
                    )}
                    {mediaKind === "audio" && (
                      <div className="px-3 py-3 flex items-center gap-2 border-b border-black/10">
                        <FileAudio className="w-5 h-5" style={{ color: bubbleColor }} />
                        <span className="text-xs" style={{ color: bubbleColor }}>Áudio anexado</span>
                      </div>
                    )}
                    {mediaKind === "document" && (
                      <div className="px-3 py-3 flex items-center gap-2 border-b border-black/10">
                        <FileText className="w-5 h-5" style={{ color: bubbleColor }} />
                        <span className="text-xs truncate" style={{ color: bubbleColor }}>{payload.media_url.split("/").pop()}</span>
                      </div>
                    )}
                  </>
                )}

                {/* Text/caption */}
                <div className="px-3 py-2 text-sm leading-relaxed">
                  {payload.message_content ? (
                    <span dangerouslySetInnerHTML={{ __html: renderedText }} />
                  ) : (
                    <span className={isDark ? "text-white/40 italic" : "text-gray-400 italic"}>Digite uma mensagem...</span>
                  )}
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className={`text-[9px] ${isDark ? "text-white/50" : "text-gray-500"}`}>14:30</span>
                    <svg viewBox="0 0 16 11" className={`w-4 h-3 ${isDark ? "text-blue-300" : "text-blue-500"}`} fill="currentColor">
                      <path d="M11.071.653a.457.457 0 00-.304-.102.493.493 0 00-.381.178l-6.19 7.636-2.405-2.272a.463.463 0 00-.336-.146.47.47 0 00-.343.146l-.311.31a.445.445 0 00-.14.337c0 .136.047.25.14.343l2.996 2.996a.724.724 0 00.501.203.697.697 0 00.534-.229L11.2 1.292c.093-.118.14-.243.14-.375a.442.442 0 00-.269-.264z" />
                      <path d="M15.071.653a.457.457 0 00-.304-.102.493.493 0 00-.381.178l-6.19 7.636-1.2-1.134-.311.311a.39.39 0 00-.14.337c0 .136.047.25.14.343l1.791 1.791a.724.724 0 00.501.203.697.697 0 00.534-.229L15.2 1.292c.093-.118.14-.243.14-.375a.442.442 0 00-.269-.264z" />
                    </svg>
                  </div>
                </div>
              </div>
            )}

            {/* Inline buttons (composable, after main bubble) */}
            {payload.message_type !== "carousel" && buttons.length > 0 && (
              <div className="space-y-1">
                {buttons.map((btn, i) => (
                  <div key={btn.id} className="rounded-xl px-3 py-2 text-center text-sm font-medium shadow-sm flex items-center justify-center gap-1.5" style={{ backgroundColor: cardBg, color: btnColor }}>
                    {btn.type === "url" && <Link2 className="w-3.5 h-3.5" />}
                    {btn.type === "phone" && <Phone className="w-3.5 h-3.5" />}
                    {btn.type === "reply" && <MessageCircle className="w-3.5 h-3.5" />}
                    {btn.text || `Botão ${i + 1}`}
                  </div>
                ))}
              </div>
            )}

            {/* Carousel preview */}
            {payload.message_type === "carousel" && cards.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2 pt-1 -mx-1 px-1" style={{ scrollSnapType: "x mandatory" }}>
                {cards.map((card, i) => (
                  <div key={card.id} className="rounded-xl overflow-hidden shadow-sm shrink-0 w-[200px] flex flex-col" style={{ backgroundColor: cardBg, scrollSnapAlign: "start" }}>
                    {card.image_url ? (
                      <div className="h-[110px] bg-muted/30 flex items-center justify-center overflow-hidden">
                        <img src={card.image_url} alt="" className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = "none")} />
                      </div>
                    ) : (
                      <div className="h-[70px] flex items-center justify-center" style={{ backgroundColor: isDark ? "#2a3942" : "#e8e8e8" }}>
                        <ImageIcon className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="p-2 flex-1">
                      <p className="text-xs font-semibold truncate" style={{ color: bubbleColor }}>{card.title || `Card ${i + 1}`}</p>
                      {card.description && (
                        <p className="text-[10px] mt-0.5 line-clamp-3" style={{ color: subColor }}>
                          {card.description}
                        </p>
                      )}
                    </div>
                    {card.buttons.length > 0 && (
                      <div className="border-t" style={{ borderColor: isDark ? "#2a3942" : "#e8e8e8" }}>
                        {card.buttons.map((btn, bi) => (
                          <div key={btn.id} className="px-2 py-1.5 text-center text-[10px] font-medium border-b last:border-b-0" style={{ color: btnColor, borderColor: isDark ? "#2a3942" : "#e8e8e8" }}>
                            {btn.text || `Botão ${bi + 1}`}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {payload.message_type === "carousel" && cards.length === 0 && (
              <p className={`text-[10px] italic text-right ${isDark ? "text-white/40" : "text-gray-500"}`}>Adicione cards ao lado →</p>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Sub-editors
// ────────────────────────────────────────────────────────────
function ButtonsBuilder({
  buttons,
  onChange,
}: {
  buttons: WelcomeButton[];
  onChange: (b: WelcomeButton[]) => void;
}) {
  const update = (id: string, patch: Partial<WelcomeButton>) =>
    onChange(buttons.map(b => (b.id === id ? { ...b, ...patch } : b)));
  const remove = (id: string) => onChange(buttons.filter(b => b.id !== id));
  const add = () => {
    if (buttons.length >= 3) {
      toast.error("Máximo de 3 botões por mensagem");
      return;
    }
    onChange([...buttons, { id: newId("btn"), type: "reply", text: "", value: "" }]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Botões ({buttons.length}/3)
        </Label>
        <Button type="button" variant="outline" size="sm" onClick={add} className="h-7 gap-1.5 text-xs">
          <Plus className="w-3.5 h-3.5" /> Adicionar botão
        </Button>
      </div>
      {buttons.length === 0 ? (
        <Card className="border-dashed border-border/50 p-4 text-center">
          <MousePointerClick className="w-5 h-5 text-muted-foreground mx-auto mb-1.5" />
          <p className="text-xs text-muted-foreground">Nenhum botão adicionado</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {buttons.map((btn, i) => (
            <Card key={btn.id} className="p-3 space-y-2 border-border/40">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px] font-mono shrink-0">#{i + 1}</Badge>
                <Select value={btn.type} onValueChange={(v: WelcomeButtonType) => update(btn.id, { type: v, value: "" })}>
                  <SelectTrigger className="h-8 text-xs w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reply"><span className="flex items-center gap-1.5"><MessageCircle className="w-3 h-3" /> Resposta</span></SelectItem>
                    <SelectItem value="url"><span className="flex items-center gap-1.5"><Link2 className="w-3 h-3" /> Link</span></SelectItem>
                    <SelectItem value="phone"><span className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> Telefone</span></SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 ml-auto text-destructive hover:bg-destructive/10" onClick={() => remove(btn.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
              <Input
                value={btn.text}
                onChange={e => update(btn.id, { text: e.target.value })}
                placeholder="Texto do botão"
                className="h-8 text-xs"
                maxLength={20}
              />
              {btn.type !== "reply" && (
                <Input
                  value={btn.value}
                  onChange={e => update(btn.id, { value: e.target.value })}
                  placeholder={btn.type === "url" ? "https://..." : "5511999999999"}
                  className="h-8 text-xs font-mono"
                />
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CarouselBuilder({
  cards,
  onChange,
}: {
  cards: WelcomeCarouselCard[];
  onChange: (c: WelcomeCarouselCard[]) => void;
}) {
  const update = (id: string, patch: Partial<WelcomeCarouselCard>) =>
    onChange(cards.map(c => (c.id === id ? { ...c, ...patch } : c)));
  const remove = (id: string) => onChange(cards.filter(c => c.id !== id));
  const add = () => {
    if (cards.length >= 4) {
      toast.error("Máximo de 4 cards no carrossel");
      return;
    }
    onChange([...cards, { id: newId("card"), title: "", description: "", image_url: "", buttons: [] }]);
  };
  const updateCardButtons = (cardId: string, buttons: WelcomeButton[]) =>
    onChange(cards.map(c => (c.id === cardId ? { ...c, buttons } : c)));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Cards do carrossel ({cards.length}/4)
        </Label>
        <Button type="button" variant="outline" size="sm" onClick={add} className="h-7 gap-1.5 text-xs">
          <Plus className="w-3.5 h-3.5" /> Adicionar card
        </Button>
      </div>
      {cards.length === 0 ? (
        <Card className="border-dashed border-border/50 p-4 text-center">
          <Images className="w-5 h-5 text-muted-foreground mx-auto mb-1.5" />
          <p className="text-xs text-muted-foreground">Nenhum card adicionado</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {cards.map((card, i) => (
            <Card key={card.id} className="p-3 space-y-2 border-border/40">
              <div className="flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                <Badge variant="secondary" className="text-[10px] font-mono">Card {i + 1}</Badge>
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 ml-auto text-destructive hover:bg-destructive/10" onClick={() => remove(card.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
              <Input
                value={card.title}
                onChange={e => update(card.id, { title: e.target.value })}
                placeholder="Título do card"
                className="h-8 text-xs font-medium"
                maxLength={60}
              />
              <Textarea
                value={card.description}
                onChange={e => update(card.id, { description: e.target.value })}
                placeholder="Descrição do card"
                className="text-xs min-h-[60px] resize-none"
                maxLength={200}
              />
              <Input
                value={card.image_url}
                onChange={e => update(card.id, { image_url: e.target.value })}
                placeholder="URL da imagem (https://...)"
                className="h-8 text-xs font-mono"
              />
              <details className="group">
                <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground select-none flex items-center gap-1.5">
                  <MousePointerClick className="w-3 h-3" />
                  Botões do card ({card.buttons.length}/3)
                </summary>
                <div className="mt-2 pl-3 border-l-2 border-border/40">
                  <ButtonsBuilder buttons={card.buttons} onChange={b => updateCardButtons(card.id, b)} />
                </div>
              </details>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function MediaBuilder({
  payload,
  onChange,
}: {
  payload: WelcomeMessagePayload;
  onChange: (patch: Partial<WelcomeMessagePayload>) => void;
}) {
  const kind = payload.media_url ? detectMediaKind(payload.media_url) : null;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">URL da mídia</Label>
        <Input
          value={payload.media_url}
          onChange={e => onChange({ media_url: e.target.value, media_kind: detectMediaKind(e.target.value) })}
          placeholder="https://exemplo.com/imagem.jpg"
          className="text-xs font-mono"
        />
        {kind && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
            {kind === "image" && <ImageIcon className="w-3 h-3" />}
            {kind === "video" && <Video className="w-3 h-3" />}
            {kind === "audio" && <FileAudio className="w-3 h-3" />}
            {kind === "document" && <FileText className="w-3 h-3" />}
            Tipo detectado: <span className="font-mono uppercase">{kind}</span>
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Legenda (opcional)</Label>
        <Textarea
          value={payload.media_caption}
          onChange={e => onChange({ media_caption: e.target.value })}
          placeholder="Mensagem que acompanha a mídia..."
          className="text-xs min-h-[80px] resize-none"
        />
      </div>
    </div>
  );
}

function DelaySection({
  min,
  max,
  onChange,
}: {
  min: number;
  max: number;
  onChange: (patch: { min_delay_seconds?: number; max_delay_seconds?: number }) => void;
}) {
  return (
    <Card className="p-3 border-border/40 bg-muted/10">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-primary" />
        <Label className="text-xs font-semibold uppercase tracking-wider">Delay entre envios</Label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground">
            Mínimo: <span className="text-primary font-semibold">{min}s</span>
          </Label>
          <Slider
            value={[min]}
            onValueChange={v => {
              const next = clampDelay(v[0]);
              onChange({ min_delay_seconds: next, max_delay_seconds: Math.max(max, next) });
            }}
            min={1}
            max={300}
            step={1}
          />
          <Input
            type="number"
            value={min}
            onChange={e => {
              const next = clampDelay(Number(e.target.value));
              onChange({ min_delay_seconds: next, max_delay_seconds: Math.max(max, next) });
            }}
            className="h-7 text-xs"
            min={1}
            max={1800}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground">
            Máximo: <span className="text-primary font-semibold">{max}s</span>
          </Label>
          <Slider
            value={[max]}
            onValueChange={v => onChange({ max_delay_seconds: clampDelay(Math.max(v[0], min)) })}
            min={1}
            max={600}
            step={1}
          />
          <Input
            type="number"
            value={max}
            onChange={e => onChange({ max_delay_seconds: clampDelay(Math.max(Number(e.target.value), min)) })}
            className="h-7 text-xs"
            min={1}
            max={1800}
          />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">
        O sistema sorteia um delay aleatório entre {min}s e {max}s para humanizar os envios.
      </p>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Main builder
// ────────────────────────────────────────────────────────────
interface Props {
  value: WelcomeMessagePayload;
  onChange: (patch: Partial<WelcomeMessagePayload>) => void;
  /** Hide the delay section if the parent already exposes it elsewhere */
  hideDelay?: boolean;
  /** Hide the type selector grid (parent renders it) */
  hideTypeSelector?: boolean;
  /** Hide the inline WhatsApp preview (parent renders it elsewhere) */
  hidePreview?: boolean;
}

export function WelcomeMessageBuilder({ value, onChange, hideDelay, hideTypeSelector, hidePreview }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { data: templates } = useTemplates();
  const { data: carouselTemplates } = useCarouselTemplates();
  const [showTemplates, setShowTemplates] = useState(false);

  const setType = (next: WelcomeMessageType) => {
    onChange({ message_type: next });
  };

  const insertAtCursor = (text: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      onChange({ message_content: (value.message_content || "") + text });
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = value.message_content.slice(0, start) + text + value.message_content.slice(end);
    onChange({ message_content: next });
    setTimeout(() => {
      ta.selectionStart = ta.selectionEnd = start + text.length;
      ta.focus();
    }, 0);
  };

  const wrapSelection = (before: string, after: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.message_content.slice(start, end);
    const next = value.message_content.slice(0, start) + before + selected + after + value.message_content.slice(end);
    onChange({ message_content: next });
    setTimeout(() => {
      ta.selectionStart = start + before.length;
      ta.selectionEnd = start + before.length + selected.length;
      ta.focus();
    }, 0);
  };

  const importTextTemplate = (content: string, importedButtons?: any[]) => {
    const buttons: WelcomeButton[] = Array.isArray(importedButtons)
      ? importedButtons.slice(0, 3).map((b: any, i: number) => ({
          id: newId("btn"),
          type: (b?.type === "url" || b?.type === "phone" ? b.type : "reply") as WelcomeButtonType,
          text: b?.text || b?.label || `Botão ${i + 1}`,
          value: b?.value || b?.url || "",
        }))
      : [];
    onChange({
      message_type: buttons.length > 0 ? "buttons" : "text",
      message_content: content || "",
      buttons,
    });
    setShowTemplates(false);
    toast.success("Template importado!");
  };

  const importCarouselTemplate = (t: any) => {
    const cards: WelcomeCarouselCard[] = Array.isArray(t?.cards)
      ? t.cards.slice(0, 4).map((c: any) => ({
          id: newId("card"),
          title: c?.title || "",
          description: c?.description || c?.text || "",
          image_url: c?.image_url || c?.image || c?.media_url || c?.mediaUrl || "",
          buttons: Array.isArray(c?.buttons)
            ? c.buttons.slice(0, 3).map((b: any, i: number) => ({
                id: newId("btn"),
                type: (b?.type === "url" || b?.type === "phone" ? b.type : "reply") as WelcomeButtonType,
                text: b?.text || b?.label || `Botão ${i + 1}`,
                value: b?.value || b?.url || "",
              }))
            : [],
        }))
      : [];
    onChange({
      message_type: "carousel",
      message_content: (t?.message || "").split("|||")[0] || "",
      carousel_cards: cards,
    });
    setShowTemplates(false);
    toast.success("Carrossel importado!");
  };

  return (
    <div className="space-y-4">
      {/* Type selector */}
      {!hideTypeSelector && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TYPE_OPTIONS.map(opt => {
            const active = value.message_type === opt.value;
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className={`group relative rounded-xl border p-3 text-left transition-all ${
                  active
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border/50 bg-muted/10 hover:border-border hover:bg-muted/20"
                }`}
              >
                <Icon className={`w-4 h-4 mb-1.5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                <p className={`text-xs font-semibold ${active ? "text-foreground" : "text-foreground/80"}`}>{opt.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</p>
                {active && <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>
      )}

      <div className={hidePreview ? "" : "grid lg:grid-cols-[3fr_2fr] gap-5"}>
        {/* Editor side */}
        <div className="space-y-3 min-w-0">
          {/* Toolbar (text-related types) */}
          {value.message_type !== "media" && (
            <div className="flex items-center gap-1 flex-wrap rounded-xl border border-border/50 bg-muted/20 p-2">
              {FORMAT_BUTTONS.map(fb => (
                <Button
                  key={fb.label}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 rounded-lg hover:bg-primary/10"
                  title={fb.label}
                  onClick={() => wrapSelection(fb.wrap[0], fb.wrap[1])}
                >
                  <fb.icon className="w-4 h-4" />
                </Button>
              ))}
              <div className="w-px h-6 bg-border/50 mx-1" />
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-8 px-3 gap-1.5 text-xs rounded-lg hover:bg-primary/10">
                    <Variable className="w-4 h-4" /> Variáveis
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-1.5" align="start">
                  {VARIABLES.map(v => (
                    <button
                      key={v.key}
                      className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-muted transition-colors flex items-center justify-between"
                      onClick={() => insertAtCursor(v.key)}
                    >
                      <span className="font-mono text-primary font-medium">{v.key}</span>
                      <span className="text-muted-foreground text-[10px]">{v.desc}</span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
              <div className="w-px h-6 bg-border/50 mx-1" />
              <Popover open={showTemplates} onOpenChange={setShowTemplates}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-8 px-3 gap-1.5 text-xs rounded-lg hover:bg-primary/10">
                    <Import className="w-4 h-4" /> Importar
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="start">
                  <div className="p-3 border-b border-border/50">
                    <p className="text-xs font-semibold">Importar Template</p>
                  </div>
                  <ScrollArea className="max-h-[280px]">
                    {templates && templates.length > 0 && (
                      <div className="p-1.5">
                        <p className="text-[10px] font-semibold text-muted-foreground px-2 py-1.5 uppercase tracking-wider">Texto / Botões</p>
                        {templates.map(t => (
                          <button
                            key={t.id}
                            className="w-full text-left px-3 py-2.5 text-xs rounded-lg hover:bg-muted transition-colors"
                            onClick={() => importTextTemplate(t.content || "", (t as any).buttons)}
                          >
                            <span className="font-medium">{t.name}</span>
                            <span className="block text-[10px] text-muted-foreground truncate mt-0.5">
                              {(t.content || "").slice(0, 60)}...
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {carouselTemplates && carouselTemplates.length > 0 && (
                      <div className="p-1.5">
                        <p className="text-[10px] font-semibold text-muted-foreground px-2 py-1.5 uppercase tracking-wider">Carrossel</p>
                        {carouselTemplates.map(t => (
                          <button
                            key={t.id}
                            className="w-full text-left px-3 py-2.5 text-xs rounded-lg hover:bg-muted transition-colors"
                            onClick={() => importCarouselTemplate(t)}
                          >
                            <span className="font-medium">{t.name}</span>
                            <span className="block text-[10px] text-muted-foreground truncate mt-0.5">
                              {(t.message || "").split("|||")[0].slice(0, 60)}...
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {(!templates?.length && !carouselTemplates?.length) && (
                      <p className="text-xs text-muted-foreground p-6 text-center">Nenhum template disponível</p>
                    )}
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Text input (text/buttons/carousel) */}
          {value.message_type !== "media" && (
            <div className="rounded-xl border border-border/50 bg-muted/10">
              <Textarea
                ref={textareaRef}
                value={value.message_content}
                onChange={e => onChange({ message_content: e.target.value })}
                placeholder={
                  value.message_type === "carousel"
                    ? "Mensagem antes do carrossel (opcional)"
                    : "Olá {nome}! Seja bem-vindo(a) ao grupo {grupo}! 🎉"
                }
                className="min-h-[140px] text-sm font-mono border-0 bg-transparent resize-none focus-visible:ring-0"
              />
            </div>
          )}

          {/* Variable chips */}
          {value.message_type !== "media" && (
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map(v => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertAtCursor(v.key)}
                  className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-mono font-medium hover:bg-primary/20 transition-colors"
                >
                  {v.key}
                </button>
              ))}
            </div>
          )}

          {/* Type-specific editor */}
          {value.message_type === "buttons" && (
            <ButtonsBuilder buttons={value.buttons} onChange={b => onChange({ buttons: b })} />
          )}
          {value.message_type === "carousel" && (
            <CarouselBuilder cards={value.carousel_cards} onChange={c => onChange({ carousel_cards: c })} />
          )}
          {value.message_type === "media" && (
            <MediaBuilder payload={value} onChange={onChange} />
          )}

          {/* Delay */}
          {!hideDelay && (
            <DelaySection
              min={value.min_delay_seconds}
              max={value.max_delay_seconds}
              onChange={onChange}
            />
          )}
        </div>

        {/* Preview */}
        {!hidePreview && (
          <div className="min-w-0">
            <WhatsAppPreviewInner payload={value} />
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Backwards-compatible wrapper (legacy text-only API)
// ────────────────────────────────────────────────────────────
interface LegacyProps {
  value: string;
  onChange: (v: string) => void;
  buttons?: { text: string; action?: string }[];
  carouselCards?: any[];
  onImportTemplate?: (payload: {
    type: "text" | "buttons" | "carousel";
    content: string;
    buttons?: { text: string; url?: string; action?: string }[];
    carouselCards?: any[];
  }) => void;
}

/**
 * Legacy adapter — wraps the new builder so old call sites that only manage
 * `message_content` keep working until they migrate to the full payload API.
 */
export function WelcomeMessageEditor(props: LegacyProps) {
  const [local, setLocal] = useState<WelcomeMessagePayload>(() => ({
    ...DEFAULT_WELCOME_PAYLOAD,
    message_content: props.value || "",
  }));

  // Sync external content updates back into local state
  useEffect(() => {
    setLocal(prev => (prev.message_content === props.value ? prev : { ...prev, message_content: props.value || "" }));
  }, [props.value]);

  const handle = (patch: Partial<WelcomeMessagePayload>) => {
    setLocal(prev => {
      const next = { ...prev, ...patch };
      if (patch.message_content !== undefined && patch.message_content !== prev.message_content) {
        props.onChange(patch.message_content);
      }
      return next;
    });
  };

  return <WelcomeMessageBuilder value={local} onChange={handle} hideDelay />;
}
