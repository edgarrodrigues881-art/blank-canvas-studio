import { useMemo } from "react";
import { getSuggestions, applySuggestion, type Suggestion } from "@/lib/ptSuggestions";
import { Sparkles, Check } from "lucide-react";

interface Props {
  text: string;
  onApply: (newText: string) => void;
}

/**
 * Barra estilo teclado de celular: mostra até 3 sugestões/correções
 * acima do input. Clique aplica e substitui a última palavra.
 */
export function SmartSuggestions({ text, onApply }: Props) {
  const { suggestions } = useMemo(() => getSuggestions(text), [text]);

  if (suggestions.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-2 pb-1.5 overflow-x-auto scrollbar-none">
      {suggestions.map((s: Suggestion, i) => {
        const isCorrection = s.kind === "correction";
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
            ].join(" ")}
            title={isCorrection ? "Correção sugerida" : "Sugestão"}
          >
            {isCorrection ? <Check className="w-3 h-3" /> : <Sparkles className="w-3 h-3 opacity-60" />}
            <span className="max-w-[260px] truncate">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
