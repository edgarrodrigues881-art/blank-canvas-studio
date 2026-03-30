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

function WhatsAppPreview({ content }: { content: string }) {
  const isDark = document.documentElement.classList.contains("dark");

  const varClass = isDark ? "text-emerald-400" : "text-emerald-600";
  const rendered = content
    .replace(/\*(.*?)\*/g, "<b>$1</b>")
    .replace(/_(.*?)_/g, "<i>$1</i>")
    .replace(/~(.*?)~/g, "<s>$1</s>")
    .replace(/\n/g, "<br/>")
    .replace(/\{nome\}/g, `<span class="${varClass}">João Silva</span>`)
    .replace(/\{numero\}/g, `<span class="${varClass}">5511999999999</span>`)
    .replace(/\{grupo\}/g, `<span class="${varClass}">Grupo VIP</span>`)
    .replace(/\{data\}/g, `<span class="${varClass}">30/03/2026</span>`)
    .replace(/\{hora\}/g, `<span class="${varClass}">14:30</span>`);

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
          <div
            className="rounded-xl rounded-tr-sm px-3 py-2 max-w-[85%] text-sm leading-relaxed shadow-lg"
            style={{
              backgroundColor: isDark ? "#005c4b" : "#DCF8C6",
              color: isDark ? "#ffffff" : "#111b21",
            }}
          >
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
        </div>
      </div>
    </div>
  );
}

export function WelcomeMessageEditor({ value, onChange }: {
  value: string; onChange: (v: string) => void;
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
                      <button key={t.id} className="w-full text-left px-3 py-2.5 text-xs rounded-lg hover:bg-muted transition-colors" onClick={() => importTemplate(t.message.split("|||")[0])}>
                        <span className="font-medium">{t.name}</span>
                        <span className="block text-[10px] text-muted-foreground truncate mt-0.5">{t.message.split("|||")[0].slice(0, 60)}...</span>
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
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Olá {nome}! Seja bem-vindo(a) ao grupo {grupo}! 🎉"
          className="min-h-[300px] text-sm font-mono rounded-xl border-border/50 bg-muted/10 resize-none focus:ring-primary/30"
        />
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
        <WhatsAppPreview content={value} />
      </div>
    </div>
  );
}
