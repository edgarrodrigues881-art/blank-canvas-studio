import { useEffect, useMemo, useRef, useState } from "react";
import { getSuggestions, applySuggestion, type Suggestion } from "@/lib/ptSuggestions";
import { Sparkles, Check, MoreVertical, Keyboard, ArrowDownToLine, CornerDownLeft, Space as SpaceIcon, Type } from "lucide-react";
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

  // Sempre renderiza o painel (mesmo vazio) para ficar permanentemente visível.

  const triggerLabel = labelFor(config);

  return (
    <div className="w-full rounded-md border border-border bg-background/95 dark:bg-card/95 backdrop-blur shadow-sm px-2 py-1.5 flex items-start gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition"
            title="Configurações de sugestões"
            onMouseDown={(e) => e.preventDefault()}
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-[300px] p-0 overflow-hidden">
          {/* Header com gradiente */}
          <div className="px-3 py-2.5 bg-gradient-to-br from-[hsl(var(--chat-accent))]/15 via-[hsl(var(--chat-accent))]/5 to-transparent border-b border-border/60">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-[hsl(var(--chat-accent))]/15 flex items-center justify-center">
                <Keyboard className="w-3.5 h-3.5 text-[hsl(var(--chat-accent))]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-foreground leading-tight">
                  Sugestões inteligentes
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight">
                  Escolha a tecla para confirmar
                </div>
              </div>
            </div>
          </div>

          {/* Grid de teclas */}
          <div className="px-2 pt-2 pb-1.5 grid grid-cols-2 gap-1.5">
            {([
              { mode: "tab", label: "Tab", Icon: ArrowDownToLine, hint: "padrão de teclado" },
              { mode: "space", label: "Espaço", Icon: SpaceIcon, hint: "rápido ao digitar" },
              { mode: "enter", label: "Enter", Icon: CornerDownLeft, hint: "estilo iOS" },
              { mode: "char", label: "Letra…", Icon: Type, hint: "personalizado" },
            ] as { mode: ConfirmMode; label: string; Icon: any; hint: string }[]).map((opt) => {
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
                    "group relative flex flex-col items-start gap-1 px-2.5 py-2 rounded-lg border text-left transition-all",
                    active
                      ? "bg-gradient-to-br from-[hsl(var(--chat-accent))]/20 to-[hsl(var(--chat-accent))]/5 border-[hsl(var(--chat-accent))]/50 shadow-sm shadow-[hsl(var(--chat-accent))]/10"
                      : "bg-muted/30 border-border/60 hover:bg-muted/60 hover:border-border",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-1.5 w-full">
                    <opt.Icon
                      className={[
                        "w-3.5 h-3.5",
                        active ? "text-[hsl(var(--chat-accent))]" : "text-muted-foreground group-hover:text-foreground",
                      ].join(" ")}
                    />
                    <span className={[
                      "text-xs font-medium",
                      active ? "text-foreground" : "text-foreground/80",
                    ].join(" ")}>
                      {opt.label}
                    </span>
                    {active && (
                      <Check className="w-3 h-3 text-[hsl(var(--chat-accent))] ml-auto" />
                    )}
                  </div>
                  <span className="text-[9px] text-muted-foreground/80 leading-tight">
                    {opt.hint}
                  </span>
                </button>
              );
            })}
          </div>

          {config.mode === "char" && (
            <div className="px-3 pb-2.5 pt-1 flex items-center gap-2 border-t border-border/40 bg-muted/20">
              <label className="text-[11px] text-muted-foreground shrink-0">
                Caractere:
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
                placeholder="."
                className="w-12 text-center px-2 py-1 rounded-md border border-border bg-background text-sm font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-[hsl(var(--chat-accent))]/30"
              />
              <span className="text-[10px] text-muted-foreground/70 leading-tight">
                Ex: ponto, vírgula, "/"…
              </span>
            </div>
          )}

          {/* Rodapé com dica */}
          <div className="px-3 py-2 bg-muted/30 border-t border-border/40 flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 text-[9px] font-mono bg-background border border-border rounded shadow-sm">↑↓</kbd>
            <span className="text-[10px] text-muted-foreground leading-tight">
              navegam · <kbd className="px-1 py-px text-[9px] font-mono bg-background border border-border rounded">{labelFor(config)}</kbd> confirma
            </span>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1 flex flex-nowrap items-center gap-1.5 min-h-[28px] overflow-x-auto scrollbar-none">
        {suggestions.length === 0 ? (
          <span className="text-[11px] text-muted-foreground/60 italic px-1">
            Comece a digitar para ver sugestões…
          </span>
        ) : (
          suggestions.map((s: Suggestion, i) => {
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
          })
        )}
      </div>
    </div>
  );
}
