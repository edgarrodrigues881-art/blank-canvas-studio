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

// Photorealistic iPhone Pro mockup with WhatsApp Dark Mode
function WhatsAppPreviewInner({ payload, height = 580 }: { payload: WelcomeMessagePayload; height?: number }) {
  // WhatsApp Dark palette (real values)
  const waBg = "#0b141a";
  const waHeader = "#1f2c34";
  const waBubbleSent = "#005c4b";
  const waBubbleRecv = "#1f2c34";
  const waText = "#e9edef";
  const waSubtext = "#8696a0";
  const waLink = "#53bdeb";
  const waInputBg = "#2a3942";
  const varClass = "text-emerald-300";

  const renderedText = renderVars(payload.message_content || "", varClass);
  const buttons = payload.buttons || [];
  const cards = payload.carousel_cards || [];
  const mediaKind = payload.media_url ? detectMediaKind(payload.media_url) : null;

  // Computed proportional sizing
  const screenH = height;
  const screenW = Math.round(height * 0.485); // iPhone Pro ratio ~ 19.5:9
  const radius = Math.round(screenW * 0.16);

  return (
    <div className="relative mx-auto select-none" style={{ width: screenW + 22 }}>
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 -m-6 rounded-[3rem] bg-emerald-500/5 blur-3xl" />

      {/* ── iPhone Pro chassis (titanium) ── */}
      <div
        className="relative mx-auto"
        style={{
          width: screenW + 22,
          height: screenH + 22,
          borderRadius: radius + 11,
          background:
            "linear-gradient(135deg, #4a4a4d 0%, #2a2a2d 25%, #1a1a1d 50%, #2a2a2d 75%, #3a3a3d 100%)",
          boxShadow:
            "0 30px 70px -20px rgba(0,0,0,0.7), 0 10px 30px -10px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 0 rgba(255,255,255,0.15)",
        }}
      >
        {/* Side buttons */}
        <div className="absolute -left-[3px] top-[16%] w-[3px] h-[6%] rounded-l-md" style={{ background: "linear-gradient(to right, #0a0a0c, #2a2a2d)" }} />
        <div className="absolute -left-[3px] top-[26%] w-[3px] h-[10%] rounded-l-md" style={{ background: "linear-gradient(to right, #0a0a0c, #2a2a2d)" }} />
        <div className="absolute -left-[3px] top-[40%] w-[3px] h-[10%] rounded-l-md" style={{ background: "linear-gradient(to right, #0a0a0c, #2a2a2d)" }} />
        <div className="absolute -right-[3px] top-[24%] w-[3px] h-[14%] rounded-r-md" style={{ background: "linear-gradient(to left, #0a0a0c, #2a2a2d)" }} />

        {/* Bezel inner ring */}
        <div
          className="absolute inset-[8px] overflow-hidden"
          style={{
            borderRadius: radius + 3,
            background: "#000",
            boxShadow: "inset 0 0 0 2px rgba(0,0,0,0.6)",
          }}
        >
          {/* ── Screen ── */}
          <div
            className="relative w-full h-full overflow-hidden"
            style={{ borderRadius: radius - 4, background: waBg }}
          >
            {/* Subtle screen reflection */}
            <div className="pointer-events-none absolute inset-0 z-30" style={{ background: "linear-gradient(115deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 22%, rgba(255,255,255,0) 78%, rgba(255,255,255,0.04) 100%)" }} />

            {/* iOS Status Bar */}
            <div className="relative z-20 flex items-center justify-between px-6 pt-2 pb-1 text-white" style={{ height: 28 }}>
              <span className="text-[11px] font-semibold tabular-nums tracking-tight">14:30</span>
              <div className="flex items-center gap-1">
                {/* Signal */}
                <svg viewBox="0 0 18 12" className="w-[15px] h-[10px]" fill="white">
                  <rect x="0" y="8" width="3" height="4" rx="0.5" />
                  <rect x="5" y="5" width="3" height="7" rx="0.5" />
                  <rect x="10" y="2" width="3" height="10" rx="0.5" />
                  <rect x="15" y="0" width="3" height="12" rx="0.5" opacity="0.4" />
                </svg>
                {/* Wifi */}
                <svg viewBox="0 0 16 12" className="w-[14px] h-[11px]" fill="white">
                  <path d="M8 11.5a1 1 0 100-2 1 1 0 000 2zm-3.5-3l1 1a3.5 3.5 0 015 0l1-1a4.9 4.9 0 00-7 0zM2 6l1 1a7 7 0 0110 0l1-1a8.4 8.4 0 00-12 0z" />
                </svg>
                {/* Battery */}
                <div className="flex items-center ml-0.5">
                  <div className="relative" style={{ width: 22, height: 11, border: "1px solid rgba(255,255,255,0.5)", borderRadius: 3 }}>
                    <div className="absolute top-[1px] left-[1px] bottom-[1px] bg-white rounded-[1.5px]" style={{ width: "78%" }} />
                  </div>
                  <div className="ml-[1px] w-[1.5px] h-[5px] rounded-r bg-white/50" />
                </div>
              </div>
            </div>

            {/* Dynamic Island */}
            <div className="absolute top-[7px] left-1/2 -translate-x-1/2 z-40 rounded-full bg-black" style={{ width: Math.round(screenW * 0.32), height: 24 }}>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-zinc-800" />
            </div>

            {/* WhatsApp Header */}
            <div className="relative z-10 flex items-center gap-2.5 px-3 py-2 shadow-md" style={{ background: waHeader, color: waText }}>
              <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="currentColor">
                <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z" />
              </svg>
              <div className="relative shrink-0">
                <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-[10px] font-bold text-white" style={{ background: "linear-gradient(135deg, #25d366, #128c7e)" }}>
                  GV
                </div>
              </div>
              <div className="flex-1 min-w-0 leading-tight">
                <p className="text-[13px] font-semibold truncate" style={{ color: waText }}>Grupo VIP</p>
                <p className="text-[10px] truncate" style={{ color: waSubtext }}>online</p>
              </div>
              <div className="flex items-center gap-3 shrink-0" style={{ color: waText }}>
                <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="currentColor">
                  <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z" />
                </svg>
                <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="currentColor">
                  <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
                </svg>
                <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="currentColor">
                  <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                </svg>
              </div>
            </div>

            {/* Chat area with WhatsApp doodle wallpaper */}
            <div
              className="relative flex-1 overflow-y-auto px-3 py-3"
              style={{
                height: `calc(100% - 28px - 48px - 56px)`,
                backgroundColor: waBg,
                backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><g fill='%23182229' fill-opacity='0.5'><circle cx='30' cy='30' r='2'/><circle cx='60' cy='80' r='1.5'/><circle cx='110' cy='40' r='2'/><circle cx='160' cy='90' r='1.5'/><circle cx='40' cy='150' r='1.5'/><circle cx='130' cy='160' r='2'/><circle cx='180' cy='30' r='1.5'/><circle cx='90' cy='110' r='2'/><path d='M20 60 L26 66 L20 72 Z' opacity='0.6'/><path d='M150 130 L156 136 L150 142 Z' opacity='0.6'/><path d='M75 25 L81 31 L75 37 Z' opacity='0.6'/></g></svg>")`,
                backgroundSize: "240px 240px",
              }}
            >
              {/* Date pill */}
              <div className="flex justify-center mb-3">
                <div className="px-2.5 py-0.5 rounded-md text-[9.5px] font-medium shadow-sm" style={{ background: waHeader, color: waSubtext }}>
                  HOJE
                </div>
              </div>

              {/* Sent messages */}
              <div className="flex justify-end">
                <div className="max-w-[85%] space-y-1">

                  {/* Composable bubble for non-carousel */}
                  {payload.message_type !== "carousel" && (
                    <div
                      className="relative rounded-lg shadow-sm overflow-hidden"
                      style={{ background: waBubbleSent, color: waText }}
                    >
                      {/* Tail */}
                      <svg className="absolute -right-[7px] top-0" width="8" height="13" viewBox="0 0 8 13">
                        <path d="M0 0 L8 0 L0 13 Z" fill={waBubbleSent} />
                      </svg>

                      {/* Media */}
                      {payload.media_url && (
                        <div className="p-1 pb-0">
                          {mediaKind === "image" && (
                            <img src={payload.media_url} alt="" className="w-full max-h-[180px] object-cover rounded-md" onError={e => (e.currentTarget.style.display = "none")} />
                          )}
                          {mediaKind === "video" && (
                            <div className="relative h-[160px] rounded-md overflow-hidden bg-black/40 flex items-center justify-center">
                              <video src={payload.media_url} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-10 h-10 rounded-full bg-black/55 flex items-center justify-center backdrop-blur-sm">
                                  <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                                </div>
                              </div>
                            </div>
                          )}
                          {mediaKind === "audio" && (
                            <div className="px-2 py-2 flex items-center gap-2 rounded-md" style={{ background: "rgba(0,0,0,0.18)" }}>
                              <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: waLink }}>
                                <Play className="w-3 h-3 text-white fill-white ml-0.5" />
                              </div>
                              <div className="flex-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.18)" }}>
                                <div className="h-full w-1/3 rounded-full" style={{ background: waLink }} />
                              </div>
                              <span className="text-[10px]" style={{ color: waSubtext }}>0:24</span>
                            </div>
                          )}
                          {mediaKind === "document" && (
                            <div className="px-2 py-2 flex items-center gap-2 rounded-md" style={{ background: "rgba(0,0,0,0.18)" }}>
                              <FileText className="w-5 h-5" style={{ color: waText }} />
                              <span className="text-[11px] truncate" style={{ color: waText }}>{payload.media_url.split("/").pop()}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Text */}
                      <div className="px-2.5 py-1.5 pb-1">
                        <div className="text-[13.5px] leading-snug whitespace-pre-wrap break-words" style={{ color: waText }}>
                          {payload.message_content ? (
                            <span dangerouslySetInnerHTML={{ __html: renderedText }} />
                          ) : (
                            <span style={{ color: "rgba(233,237,239,0.45)", fontStyle: "italic" }}>Digite uma mensagem...</span>
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-1 mt-0.5 -mb-0.5">
                          <span className="text-[10px]" style={{ color: "rgba(233,237,239,0.55)" }}>14:30</span>
                          <svg viewBox="0 0 16 11" className="w-[15px] h-[11px]" fill="#53bdeb">
                            <path d="M11.071.653a.457.457 0 00-.304-.102.493.493 0 00-.381.178l-6.19 7.636-2.405-2.272a.463.463 0 00-.336-.146.47.47 0 00-.343.146l-.311.31a.445.445 0 00-.14.337c0 .136.047.25.14.343l2.996 2.996a.724.724 0 00.501.203.697.697 0 00.534-.229L11.2 1.292c.093-.118.14-.243.14-.375a.442.442 0 00-.269-.264z" />
                            <path d="M15.071.653a.457.457 0 00-.304-.102.493.493 0 00-.381.178l-6.19 7.636-1.2-1.134-.311.311a.39.39 0 00-.14.337c0 .136.047.25.14.343l1.791 1.791a.724.724 0 00.501.203.697.697 0 00.534-.229L15.2 1.292c.093-.118.14-.243.14-.375a.442.442 0 00-.269-.264z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Inline buttons */}
                  {payload.message_type !== "carousel" && buttons.length > 0 && (
                    <div className="space-y-[2px] mt-1">
                      {buttons.map((btn, i) => (
                        <div
                          key={btn.id}
                          className="rounded-md px-3 py-2 text-center text-[12.5px] font-medium shadow-sm flex items-center justify-center gap-1.5"
                          style={{ background: waHeader, color: waLink }}
                        >
                          {btn.type === "url" && <Link2 className="w-3 h-3" />}
                          {btn.type === "phone" && <Phone className="w-3 h-3" />}
                          {btn.type === "reply" && <MessageCircle className="w-3 h-3" />}
                          {btn.text || `Botão ${i + 1}`}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Carousel */}
                  {payload.message_type === "carousel" && cards.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollSnapType: "x mandatory" }}>
                      {cards.map((card, i) => (
                        <div
                          key={card.id}
                          className="rounded-lg overflow-hidden shadow-sm shrink-0 flex flex-col"
                          style={{ background: waBubbleSent, scrollSnapAlign: "start", width: 170 }}
                        >
                          {card.image_url ? (
                            <div className="h-[100px] overflow-hidden">
                              <img src={card.image_url} alt="" className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = "none")} />
                            </div>
                          ) : (
                            <div className="h-[70px] flex items-center justify-center" style={{ background: waInputBg }}>
                              <ImageIcon className="w-5 h-5" style={{ color: waSubtext }} />
                            </div>
                          )}
                          <div className="p-2 flex-1">
                            <p className="text-[11.5px] font-semibold truncate" style={{ color: waText }}>{card.title || `Card ${i + 1}`}</p>
                            {card.description && (
                              <p className="text-[10px] mt-0.5 line-clamp-3" style={{ color: "rgba(233,237,239,0.7)" }}>
                                {card.description}
                              </p>
                            )}
                          </div>
                          {card.buttons.length > 0 && (
                            <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                              {card.buttons.map((btn, bi) => (
                                <div key={btn.id} className="px-2 py-1.5 text-center text-[10.5px] font-medium border-b last:border-b-0" style={{ color: waLink, borderColor: "rgba(255,255,255,0.08)" }}>
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
                    <p className="text-[10px] italic text-right" style={{ color: "rgba(233,237,239,0.5)" }}>Adicione cards →</p>
                  )}
                </div>
              </div>
            </div>

            {/* Input bar */}
            <div className="absolute bottom-0 left-0 right-0 z-20 px-2 pb-2 pt-1.5 flex items-center gap-1.5" style={{ background: waBg }}>
              <div className="flex-1 flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ background: waInputBg }}>
                <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] shrink-0" fill={waSubtext}>
                  <path d="M9.153 11.603c.795 0 1.439-.879 1.439-1.962s-.644-1.962-1.439-1.962-1.439.879-1.439 1.962.644 1.962 1.439 1.962zm-3.204 1.362c-.026-.307-.131 5.218 6.063 5.551 6.066-.25 6.066-5.551 6.066-5.551-6.078 1.416-12.129 0-12.129 0zm11.363 1.108s-.669 1.959-5.051 1.959c-3.505 0-5.388-1.164-5.607-1.959 0 0 5.912 1.055 10.658 0zM11.804 1.011C5.609 1.011.978 6.033.978 12.228s4.826 10.761 11.021 10.761S23.02 18.423 23.02 12.228c.001-6.195-5.021-11.217-11.216-11.217zM12 21.354c-5.273 0-9.381-3.886-9.381-9.159s3.942-9.548 9.215-9.548 9.548 4.275 9.548 9.548c-.001 5.272-4.109 9.159-9.382 9.159zm3.108-9.751c.795 0 1.439-.879 1.439-1.962s-.644-1.962-1.439-1.962-1.439.879-1.439 1.962.644 1.962 1.439 1.962z" />
                </svg>
                <span className="flex-1 text-[12.5px]" style={{ color: waSubtext }}>Mensagem</span>
                <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] shrink-0" fill={waSubtext}>
                  <path d="M1.816 15.556v.002c0 1.502.584 2.912 1.646 3.972s2.472 1.647 3.974 1.647a5.58 5.58 0 003.972-1.645l9.547-9.548c.769-.768 1.147-1.767 1.058-2.817-.079-.968-.548-1.927-1.319-2.698-1.594-1.592-4.068-1.711-5.517-.262l-7.916 7.915c-.881.881-.792 2.25.214 3.261.959.958 2.423 1.053 3.263.215l5.511-5.512c.18-.18.245-.41.171-.584-.073-.176-.272-.274-.514-.274h-.001c-.139 0-.272.057-.346.149L9.847 15.144c-.508.504-1.422.405-1.95-.123-.281-.282-.439-.633-.445-.992-.005-.295.097-.55.286-.739l7.915-7.917c.73-.73 2.156-.586 3.176.434.541.541.852 1.232.901 1.998.045.531-.165 1.077-.591 1.502l-9.547 9.549a3.97 3.97 0 01-2.829 1.171 3.975 3.975 0 01-2.83-1.173 3.973 3.973 0 01-1.172-2.828c0-1.071.415-2.076 1.172-2.83l7.209-7.211c.157-.157.264-.579.028-.814-.137-.137-.21-.385-.385-.385h-.001c-.139 0-.225.058-.317.151l-7.21 7.211a5.61 5.61 0 00-1.642 3.99z" />
                </svg>
                <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] shrink-0" fill={waSubtext}>
                  <path d="M9 16h6c.55 0 1-.45 1-1V9h1.59c.89 0 1.34-1.08.71-1.71L12.71 2.71a.9959.9959 0 00-1.41 0L5.71 7.29C5.08 7.92 5.52 9 6.41 9H8v6c0 .55.45 1 1 1z" />
                </svg>
              </div>
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "#00a884" }}>
                <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="white">
                  <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="text-center text-[10px] text-muted-foreground mt-4 font-medium tracking-wide uppercase">
        iPhone 16 Pro · WhatsApp
      </p>
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
  const [showMediaSlot, setShowMediaSlot] = useState<boolean>(!!value.media_url);
  const [showButtonsSlot, setShowButtonsSlot] = useState<boolean>((value.buttons || []).length > 0);

  const uiMode: WelcomeUiMode = getUiModeFromPayload(value);

  // In "simple" UI mode, derive backend message_type from contents (text/buttons/media).
  const syncBackendType = (patch: Partial<WelcomeMessagePayload>) => {
    const next: WelcomeMessagePayload = { ...value, ...patch };
    if (next.message_type !== "carousel") {
      patch.message_type = deriveBackendMessageType(next);
    }
    onChange(patch);
  };

  const setUiMode = (mode: WelcomeUiMode) => {
    if (mode === "carousel") {
      onChange({ message_type: "carousel" });
    } else {
      const derived = deriveBackendMessageType({ ...value, message_type: "text" });
      onChange({ message_type: derived });
    }
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
    if (buttons.length > 0) setShowButtonsSlot(true);
    syncBackendType({ message_content: content || "", buttons });
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

  const removeMediaSlot = () => {
    setShowMediaSlot(false);
    syncBackendType({ media_url: "", media_caption: "", media_kind: null });
  };

  const removeButtonsSlot = () => {
    setShowButtonsSlot(false);
    syncBackendType({ buttons: [] });
  };

  return (
    <div className="space-y-4">
      {/* UI mode selector — only "Simples" vs "Carrossel" */}
      {!hideTypeSelector && (
        <div className="grid grid-cols-2 gap-2">
          {WELCOME_TYPE_OPTIONS.map(opt => {
            const active = uiMode === opt.value;
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setUiMode(opt.value)}
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
          {/* Toolbar — always visible (text exists in both modes) */}
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

          {/* Main text editor */}
          <div className="rounded-xl border border-border/50 bg-muted/10">
            <Textarea
              ref={textareaRef}
              value={value.message_content}
              onChange={e => syncBackendType({ message_content: e.target.value })}
              placeholder={
                uiMode === "carousel"
                  ? "Mensagem antes do carrossel (opcional)"
                  : "Olá {nome}! Seja bem-vindo(a) ao grupo {grupo}! 🎉"
              }
              className="min-h-[140px] text-sm font-mono border-0 bg-transparent resize-none focus-visible:ring-0"
            />
          </div>

          {/* Variable chips */}
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

          {/* SIMPLE composable mode: optional media + optional buttons slots */}
          {uiMode === "simple" && (
            <div className="space-y-3">
              {showMediaSlot && (
                <Card className="p-3 border-border/40 bg-muted/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5" /> Mídia anexada
                    </Label>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:bg-destructive/10 gap-1" onClick={removeMediaSlot}>
                      <Trash2 className="w-3.5 h-3.5" /> Remover
                    </Button>
                  </div>
                  <Input
                    value={value.media_url}
                    onChange={e => syncBackendType({ media_url: e.target.value, media_kind: detectMediaKind(e.target.value) })}
                    placeholder="https://exemplo.com/imagem.jpg"
                    className="h-8 text-xs font-mono"
                  />
                  {value.media_url && (
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                      {detectMediaKind(value.media_url) === "image" && <ImageIcon className="w-3 h-3" />}
                      {detectMediaKind(value.media_url) === "video" && <Video className="w-3 h-3" />}
                      {detectMediaKind(value.media_url) === "audio" && <FileAudio className="w-3 h-3" />}
                      {detectMediaKind(value.media_url) === "document" && <FileText className="w-3 h-3" />}
                      Tipo detectado: <span className="font-mono uppercase">{detectMediaKind(value.media_url)}</span>
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground italic">
                    O texto principal será enviado como legenda da mídia.
                  </p>
                </Card>
              )}

              {showButtonsSlot && (
                <Card className="p-3 border-border/40 bg-muted/5">
                  <div className="flex items-center justify-end mb-2">
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:bg-destructive/10 gap-1" onClick={removeButtonsSlot}>
                      <Trash2 className="w-3.5 h-3.5" /> Remover botões
                    </Button>
                  </div>
                  <ButtonsBuilder buttons={value.buttons} onChange={b => syncBackendType({ buttons: b })} />
                </Card>
              )}

              {/* Add slot actions */}
              <div className="flex flex-wrap gap-2">
                {!showMediaSlot && (
                  <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 text-xs border-dashed" onClick={() => setShowMediaSlot(true)}>
                    <ImageIcon className="w-3.5 h-3.5" /> + Adicionar mídia
                  </Button>
                )}
                {!showButtonsSlot && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 text-xs border-dashed"
                    onClick={() => {
                      setShowButtonsSlot(true);
                      if ((value.buttons || []).length === 0) {
                        syncBackendType({ buttons: [{ id: newId("btn"), type: "reply", text: "", value: "" }] });
                      }
                    }}
                  >
                    <MousePointerClick className="w-3.5 h-3.5" /> + Adicionar botão
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* CAROUSEL mode editor */}
          {uiMode === "carousel" && (
            <CarouselBuilder cards={value.carousel_cards} onChange={c => onChange({ carousel_cards: c })} />
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
