import { useEffect, useMemo, useRef, useState } from "react";
import { getSuggestions, applySuggestion, type Suggestion } from "@/lib/ptSuggestions";
import { Sparkles, Check, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface Props {
  text: string;
  onApply: (newText: string) => void;
}

const LS_KEY = "smartSuggestions.confirmKey"; // "tab" | "space" | "enter" | "char:X"

type ConfirmMode = "tab" | "space" | "enter" | "char";

interface ConfirmConfig {
  mode: ConfirmMode;
  char?: string; // quando mode === "char"
}

function readConfig(): ConfirmConfig {
  try {
    const raw = localStorage.getItem(LS_KEY) ?? "space";
    if (raw.startsWith("char:")) return { mode: "char", char: raw.slice(5, 6) };
    if (raw === "space" || raw === "enter" || raw === "tab")
      return { mode: raw as ConfirmMode };
  } catch {}
  return { mode: "space" };
}

function writeConfig(cfg: ConfirmConfig) {
  try {
    const v =
      cfg.mode === "char" && cfg.char ? `char:${cfg.char}` : cfg.mode;
    localStorage.setItem(LS_KEY, v);
  } catch {}
}

function labelFor(cfg: ConfirmConfig): string {
  if (cfg.mode === "tab") return "Tab";
  if (cfg.mode === "space") return "Espaço";
  if (cfg.mode === "enter") return "Enter";
  if (cfg.mode === "char" && cfg.char) return cfg.char.toUpperCase();
  return "Tab";
}

/**
 * Barra estilo teclado de celular.
 * Tecla de confirmação é configurável (Tab, Espaço, Enter ou letra personalizada).
 * Setas ↑/↓ navegam entre as sugestões.
 */
export function SmartSuggestions({ text, onApply }: Props) {
  const { suggestions } = useMemo(() => getSuggestions(text), [text]);
  const [selected, setSelected] = useState(0);
  const [config, setConfig] = useState<ConfirmConfig>(() => readConfig());
  const charInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    writeConfig(config);
  }, [config]);

  useEffect(() => {
    setSelected(0);
  }, [suggestions.map((s) => s.insert).join("|")]);

  useEffect(() => {
    if (suggestions.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag !== "TEXTAREA" && tag !== "INPUT") return;

      const apply = (appendChar: string = " ") => {
        const s = suggestions[selected] ?? suggestions[0];
        if (!s) return;
        e.preventDefault();
        // applySuggestion já adiciona um espaço no final;
        // se a tecla de confirmação for outro caractere (ex: ".") usamos ele.
        const base = applySuggestion(text, s);
        const finalText =
          appendChar === " " ? base : base.replace(/ $/, appendChar);
        onApply(finalText);
      };

      // Navegação
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((i) => Math.min(suggestions.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowRight" && e.altKey) {
        e.preventDefault();
        setSelected((i) => Math.min(suggestions.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowLeft" && e.altKey) {
        e.preventDefault();
        setSelected((i) => Math.max(0, i - 1));
        return;
      }

      // Tecla de confirmação configurada
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (config.mode === "tab" && e.key === "Tab") return apply(" ");
      if (config.mode === "space" && e.key === " ") return apply(" ");
      if (config.mode === "enter" && e.key === "Enter" && !e.shiftKey)
        return apply(" ");
      if (
        config.mode === "char" &&
        config.char &&
        e.key.toLowerCase() === config.char.toLowerCase() &&
        e.key.length === 1
      ) {
        return apply(config.char);
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [suggestions, selected, text, onApply, config]);

  if (suggestions.length === 0) return null;

  const triggerLabel = labelFor(config);

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
              "shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs",
              "border transition-all duration-150 hover:scale-[1.02] active:scale-95",
              isCorrection
                ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15"
                : "bg-muted/60 border-border text-foreground hover:bg-muted",
              isSelected
                ? "ring-2 ring-[hsl(var(--chat-accent))]/60 scale-[1.03]"
                : "",
            ].join(" ")}
            title={`Confirmar com ${triggerLabel}`}
          >
            {isCorrection ? <Check className="w-3 h-3" /> : <Sparkles className="w-3 h-3 opacity-60" />}
            <span className="max-w-[260px] truncate">{s.label}</span>
          </button>
        );
      })}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md border border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted transition"
            title="Configurações de sugestões"
            onMouseDown={(e) => e.preventDefault()}
          >
            <Settings2 className="w-3 h-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-72">
          <DropdownMenuLabel>Tecla para confirmar sugestão</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="px-2 py-2 grid grid-cols-2 gap-1.5">
            {([
              { mode: "tab", label: "Tab" },
              { mode: "space", label: "Espaço" },
              { mode: "enter", label: "Enter" },
              { mode: "char", label: "Letra…" },
            ] as { mode: ConfirmMode; label: string }[]).map((opt) => {
              const active = config.mode === opt.mode;
              return (
                <button
                  key={opt.mode}
                  type="button"
                  onClick={() => {
                    if (opt.mode === "char") {
                      setConfig({ mode: "char", char: config.char ?? "." });
                      setTimeout(() => charInputRef.current?.focus(), 50);
                    } else {
                      setConfig({ mode: opt.mode });
                    }
                  }}
                  className={[
                    "px-2 py-1.5 rounded-md text-xs border transition",
                    active
                      ? "bg-[hsl(var(--chat-accent))]/15 border-[hsl(var(--chat-accent))]/40 text-foreground"
                      : "bg-muted/40 border-border text-muted-foreground hover:text-foreground hover:bg-muted",
                  ].join(" ")}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {config.mode === "char" && (
            <div className="px-2 pb-2">
              <label className="text-[11px] text-muted-foreground block mb-1">
                Caractere personalizado
              </label>
              <input
                ref={charInputRef}
                type="text"
                maxLength={1}
                value={config.char ?? ""}
                onChange={(e) => {
                  const ch = e.target.value.slice(0, 1);
                  setConfig({ mode: "char", char: ch || undefined });
                }}
                placeholder="Ex: ."
                className="w-16 text-center px-2 py-1 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--chat-accent))]/30"
              />
            </div>
          )}
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5 text-[11px] text-muted-foreground leading-snug">
            A tecla escolhida confirma a sugestão selecionada e adiciona um
            espaço (ou o próprio caractere). Use ↑/↓ para escolher.
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
