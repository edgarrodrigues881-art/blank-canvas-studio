import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTemplates } from "@/hooks/useTemplates";
import { useCarouselTemplates } from "@/hooks/useCarouselTemplates";
import { toast } from "sonner";
import { Variable, Import, Bold, Italic, Strikethrough, Code } from "lucide-react";

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

interface CardButton { text: string; url?: string; action?: string }
interface CarouselCard { title: string; description: string; image_url?: string; buttons?: CardButton[] }

function renderVars(text: string, varClass: string) {
  return text
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

function WhatsAppPreview({ content, buttons, carouselCards }: {
  content: string;
  buttons?: { text: string; action?: string }[];
  carouselCards?: CarouselCard[];
}) {
  const isDark = document.documentElement.classList.contains("dark");
  const varClass = isDark ? "text-emerald-400" : "text-emerald-600";
  const rendered = renderVars(content, varClass);
  const bubbleBg = isDark ? "#005c4b" : "#DCF8C6";
  const bubbleColor = isDark ? "#ffffff" : "#111b21";
  const cardBg = isDark ? "#1f2c33" : "#ffffff";
  const btnColor = isDark ? "#53bdeb" : "#027eb5";

  return (
    <div
      className="rounded-2xl border border-border/30 flex flex-col h-[420px] overflow-hidden"
      style={{ backgroundColor: isDark ? "#0b141a" : "#ECE5DD" }}
    >
      <div className="flex items-center gap-2 px-4 pt-4 pb-2 border-b border-border/20 shrink-0">
        <div className="w-2 h-2 rounded-full bg-emerald-400" />
        <span className={`text-[10px] font-medium uppercase tracking-wider ${isDark ? "text-muted-foreground" : "text-gray-500"}`}>Preview WhatsApp</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex justify-end">
          <div className="max-w-[85%] space-y-1">
            {/* Main message bubble */}
            <div className="rounded-xl rounded-tr-sm px-3 py-2 text-sm leading-relaxed shadow-lg" style={{ backgroundColor: bubbleBg, color: bubbleColor }}>
              {content ? (
                <span dangerouslySetInnerHTML={{ __html: rendered }} />
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

            {/* Buttons preview */}
            {buttons && buttons.length > 0 && (
              <div className="space-y-1">
                {buttons.map((btn, i) => (
                  <div key={i} className="rounded-xl px-3 py-2 text-center text-sm font-medium shadow-sm" style={{ backgroundColor: cardBg, color: btnColor }}>
                    {btn.text || `Botão ${i + 1}`}
                  </div>
                ))}
              </div>
            )}

            {/* Carousel preview */}
            {carouselCards && carouselCards.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2 pt-1 -mx-1 px-1" style={{ scrollSnapType: "x mandatory" }}>
                {carouselCards.map((card, i) => (
                  <div key={i} className="rounded-xl overflow-hidden shadow-sm shrink-0 w-[180px] flex flex-col" style={{ backgroundColor: cardBg, scrollSnapAlign: "start" }}>
                    {card.image_url && (
                      <div className="h-[90px] bg-muted/30 flex items-center justify-center overflow-hidden">
                        <img src={card.image_url} alt="" className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = "none")} />
                      </div>
                    )}
                    {!card.image_url && (
                      <div className="h-[60px] flex items-center justify-center" style={{ backgroundColor: isDark ? "#2a3942" : "#e8e8e8" }}>
                        <span className="text-[10px] text-muted-foreground">Sem imagem</span>
                      </div>
                    )}
                    <div className="p-2 flex-1">
                      <p className="text-xs font-semibold truncate" style={{ color: bubbleColor }}>{card.title || `Card ${i + 1}`}</p>
                      {card.description && <p className="text-[10px] mt-0.5 line-clamp-2" style={{ color: isDark ? "#aebac1" : "#667781" }}>{card.description}</p>}
                    </div>
                    {(card.buttons || []).length > 0 && (
                      <div className="border-t" style={{ borderColor: isDark ? "#2a3942" : "#e8e8e8" }}>
                        {(card.buttons || []).map((btn: CardButton, bi: number) => (
                          <div key={bi} className="px-2 py-1.5 text-center text-[10px] font-medium border-b last:border-b-0" style={{ color: btnColor, borderColor: isDark ? "#2a3942" : "#e8e8e8" }}>
                            {btn.text || `Botão ${bi + 1}`}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function WelcomeMessageEditor({ value, onChange, buttons, carouselCards, onImportTemplate }: {
  value: string;
  onChange: (v: string) => void;
  buttons?: { text: string; action?: string }[];
  carouselCards?: CarouselCard[];
  onImportTemplate?: (payload: {
    type: "text" | "buttons" | "carousel";
    content: string;
    buttons?: { text: string; url?: string; action?: string }[];
    carouselCards?: CarouselCard[];
  }) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { data: templates } = useTemplates();
  const { data: carouselTemplates } = useCarouselTemplates();
  const [showTemplates, setShowTemplates] = useState(false);

  const insertAtCursor = (text: string) => {
    const ta = textareaRef.current;
    if (!ta) { onChange(value + text); return; }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    onChange(value.slice(0, start) + text + value.slice(end));
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + text.length; ta.focus(); }, 0);
  };

  const wrapSelection = (before: string, after: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    onChange(value.slice(0, start) + before + selected + after + value.slice(end));
    setTimeout(() => { ta.selectionStart = start + before.length; ta.selectionEnd = start + before.length + selected.length; ta.focus(); }, 0);
  };

  const importTemplate = (content: string) => { onChange(content); setShowTemplates(false); toast.success("Template importado!"); };

  const importStructuredTemplate = (payload: {
    type: "text" | "buttons" | "carousel";
    content: string;
    buttons?: { text: string; url?: string; action?: string }[];
    carouselCards?: CarouselCard[];
  }) => {
    if (onImportTemplate) {
      onImportTemplate(payload);
    } else {
      onChange(payload.content || "");
    }
    setShowTemplates(false);
    toast.success("Template importado!");
  };

  return (
    <div className="grid lg:grid-cols-[3fr_2fr] gap-5">
      {/* Editor */}
      <div className="space-y-3 min-w-0">
        <div className="flex items-center gap-1 flex-wrap rounded-xl border border-border/50 bg-muted/20 p-2">
          {FORMAT_BUTTONS.map(fb => (
            <Button key={fb.label} type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg hover:bg-primary/10" title={fb.label} onClick={() => wrapSelection(fb.wrap[0], fb.wrap[1])}>
              <fb.icon className="w-4 h-4" />
            </Button>
          ))}
          <div className="w-px h-6 bg-border/50 mx-1" />
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-8 px-3 gap-1.5 text-xs rounded-lg hover:bg-primary/10">
                <Variable className="w-4 h-4" />Variáveis
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1.5" align="start">
              {VARIABLES.map(v => (
                <button key={v.key} className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-muted transition-colors flex items-center justify-between" onClick={() => insertAtCursor(v.key)}>
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
                <Import className="w-4 h-4" />Importar
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
              <div className="p-3 border-b border-border/50">
                <p className="text-xs font-semibold">Importar Template</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Selecione para substituir o conteúdo</p>
              </div>
              <ScrollArea className="max-h-[250px]">
                {templates && templates.length > 0 && (
                  <div className="p-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground px-2 py-1.5 uppercase tracking-wider">Texto</p>
                    {templates.map(t => (
                      <button key={t.id} className="w-full text-left px-3 py-2.5 text-xs rounded-lg hover:bg-muted transition-colors" onClick={() => importTemplate(t.content)}>
                        <span className="font-medium">{t.name}</span>
                        <span className="block text-[10px] text-muted-foreground truncate mt-0.5">{t.content.slice(0, 60)}...</span>
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
                        onClick={() =>
                          importStructuredTemplate({
                            type: "carousel",
                            content: (t.message || "").split("|||")[0] || "",
                            carouselCards: Array.isArray(t.cards)
                              ? t.cards.map((c: any) => ({
                                  title: c?.title || "",
                                  description: c?.description || c?.text || "",
                                  image_url: c?.image_url || c?.image || c?.media_url || "",
                                  buttons: Array.isArray(c?.buttons)
                                    ? c.buttons.slice(0, 2).map((b: any, i: number) => ({
                                        text: b?.text || b?.label || `Botão ${i + 1}`,
                                        url: b?.url || b?.value || "",
                                        action: b?.action || b?.type || "link",
                                      }))
                                    : [],
                                }))
                              : [],
                          })
                        }
                      >
                        <span className="font-medium">{t.name}</span>
                        <span className="block text-[10px] text-muted-foreground truncate mt-0.5">{(t.message || "").split("|||")[0].slice(0, 60)}...</span>
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
        <div className="max-h-[340px] overflow-y-auto rounded-xl border border-border/50 bg-muted/10">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="Olá {nome}! Seja bem-vindo(a) ao grupo {grupo}! 🎉"
            className="min-h-[300px] text-sm font-mono border-0 bg-transparent resize-none focus:ring-primary/30 focus-visible:ring-0"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {VARIABLES.map(v => (
            <button
              key={v.key}
              onClick={() => insertAtCursor(v.key)}
              className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-mono font-medium hover:bg-primary/20 transition-colors"
            >
              {v.key}
            </button>
          ))}
        </div>
      </div>

      {/* Preview – fixed height, internal scroll */}
      <div className="min-w-0">
        <WhatsAppPreview content={value} buttons={buttons} carouselCards={carouselCards} />
      </div>
    </div>
  );
}
