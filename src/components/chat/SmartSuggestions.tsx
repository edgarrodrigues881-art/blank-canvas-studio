import { useEffect, useMemo, useState } from "react";
import { getSuggestions, applySuggestion, type Suggestion } from "@/lib/ptSuggestions";
import { Sparkles, Check } from "lucide-react";

interface Props {
  text: string;
  onApply: (newText: string) => void;
}

/**
 * Barra estilo teclado de celular.
 * Navegação: ← / → para mover seleção, Tab para aplicar.
 */
export function SmartSuggestions({ text, onApply }: Props) {
  const { suggestions } = useMemo(() => getSuggestions(text), [text]);
  const [selected, setSelected] = useState(0);

  // Reseta seleção quando o conjunto de sugestões muda
  useEffect(() => {
    setSelected(0);
  }, [suggestions.map((s) => s.insert).join("|")]);

  // Atalhos de teclado globais (enquanto há sugestões)
  useEffect(() => {
    if (suggestions.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      // Só atua se o foco estiver num input/textarea (não atrapalha resto da app)
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag !== "TEXTAREA" && tag !== "INPUT") return;

      if (e.key === "Tab") {
        e.preventDefault();
        const s = suggestions[selected] ?? suggestions[0];
        if (s) onApply(applySuggestion(text, s));
      } else if (e.key === "ArrowRight" && e.altKey) {
        e.preventDefault();
        setSelected((i) => Math.min(suggestions.length - 1, i + 1));
      } else if (e.key === "ArrowLeft" && e.altKey) {
        e.preventDefault();
        setSelected((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowUp") {
        // Up/Down navegam (não conflita com textarea de 1 linha)
        e.preventDefault();
        setSelected((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((i) => Math.min(suggestions.length - 1, i + 1));
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [suggestions, selected, text, onApply]);

  if (suggestions.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 flex-nowrap overflow-visible">
      {suggestions.map((s: Suggestion, i) => {
        const isCorrection = s.kind === "correction";
        const isSelected = i === selected;
        return (
          <button
            key={`${s.insert}-${i}`}
            type="button"
            onClick={() => onApply(applySuggestion(text, s))}
            className={[
              "shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs",
              "border transition-all duration-150 hover:scale-[1.02] active:scale-95",
              isCorrection
                ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15"
                : "bg-muted/60 border-border text-foreground hover:bg-muted",
              isSelected
                ? "ring-2 ring-[hsl(var(--chat-accent))]/60 scale-[1.03]"
                : "",
            ].join(" ")}
            title={isCorrection ? "Correção (Tab para aplicar)" : "Sugestão (Tab para aplicar)"}
          >
            {isCorrection ? <Check className="w-3 h-3" /> : <Sparkles className="w-3 h-3 opacity-60" />}
            <span className="max-w-[260px] truncate">{s.label}</span>
            {isSelected && (
              <span className="ml-1 text-[9px] uppercase opacity-60">Tab</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
