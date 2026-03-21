import { useState, useEffect } from "react";
import { CalendarIcon, X } from "lucide-react";
import { format, subDays, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type PeriodRange = { start: Date; end: Date; label: string };

const STORAGE_KEY = "dg-finance-period";

const PRESETS = [
  { id: "30d", label: "30 dias", getRange: () => ({ start: subDays(new Date(), 30), end: new Date() }) },
  { id: "60d", label: "60 dias", getRange: () => ({ start: subDays(new Date(), 60), end: new Date() }) },
  { id: "90d", label: "90 dias", getRange: () => ({ start: subDays(new Date(), 90), end: new Date() }) },
  { id: "month", label: "Mês atual", getRange: () => ({ start: startOfMonth(new Date()), end: new Date() }) },
] as const;

function loadPeriod(): { presetId: string; customStart?: string; customEnd?: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function savePeriod(presetId: string, customStart?: Date, customEnd?: Date) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    presetId,
    customStart: customStart?.toISOString(),
    customEnd: customEnd?.toISOString(),
  }));
}

export function usePeriodFilter() {
  const saved = loadPeriod();
  const [activePreset, setActivePreset] = useState(saved?.presetId || "month");
  const [customStart, setCustomStart] = useState<Date | undefined>(saved?.customStart ? new Date(saved.customStart) : undefined);
  const [customEnd, setCustomEnd] = useState<Date | undefined>(saved?.customEnd ? new Date(saved.customEnd) : undefined);

  const range: PeriodRange = (() => {
    if (activePreset === "custom" && customStart && customEnd) {
      return { start: customStart, end: customEnd, label: `${format(customStart, "dd/MM/yy")} → ${format(customEnd, "dd/MM/yy")}` };
    }
    const preset = PRESETS.find(p => p.id === activePreset) || PRESETS[3];
    const r = preset.getRange();
    return { ...r, label: preset.label };
  })();

  useEffect(() => {
    savePeriod(activePreset, customStart, customEnd);
  }, [activePreset, customStart, customEnd]);

  return { range, activePreset, setActivePreset, customStart, setCustomStart, customEnd, setCustomEnd };
}

export const PeriodFilter = ({
  activePreset, setActivePreset, customStart, setCustomStart, customEnd, setCustomEnd, range,
}: ReturnType<typeof usePeriodFilter>) => {
  const [popoverOpen, setPopoverOpen] = useState(false);

  const selectPreset = (id: string) => {
    setActivePreset(id);
    setCustomStart(undefined);
    setCustomEnd(undefined);
  };

  const applyCustom = () => {
    if (customStart && customEnd) {
      setActivePreset("custom");
      setPopoverOpen(false);
    }
  };

  const clear = () => {
    selectPreset("month");
    setPopoverOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      {/* Quick chips */}
      <div className="flex items-center gap-1 overflow-x-auto">
        {PRESETS.map(p => (
          <button
            key={p.id}
            onClick={() => selectPreset(p.id)}
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1.5 rounded-md transition-all duration-200 whitespace-nowrap",
              activePreset === p.id
                ? "bg-foreground/10 text-foreground border border-border"
                : "text-muted-foreground/40 hover:text-muted-foreground/70 border border-transparent"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1.5 rounded-md transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap",
              activePreset === "custom"
                ? "bg-foreground/10 text-foreground border border-border"
                : "text-muted-foreground/40 hover:text-muted-foreground/70 border border-transparent"
            )}
          >
            <CalendarIcon size={10} />
            Personalizado
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start" side="bottom">
          <div className="p-3 space-y-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Selecionar período</p>
            <div className="flex gap-2">
              <div className="space-y-1">
                <p className="text-[9px] text-muted-foreground/50 font-medium">Início</p>
                <Calendar
                  mode="single"
                  selected={customStart}
                  onSelect={setCustomStart}
                  className={cn("p-2 pointer-events-auto")}
                  locale={ptBR}
                />
              </div>
              <div className="space-y-1">
                <p className="text-[9px] text-muted-foreground/50 font-medium">Fim</p>
                <Calendar
                  mode="single"
                  selected={customEnd}
                  onSelect={setCustomEnd}
                  className={cn("p-2 pointer-events-auto")}
                  locale={ptBR}
                  disabled={(date) => customStart ? date < customStart : false}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={clear} className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground px-2 py-1 rounded border border-border/40 transition-colors">
                Limpar
              </button>
              <button
                onClick={applyCustom}
                disabled={!customStart || !customEnd}
                className="text-[10px] text-foreground font-semibold px-3 py-1 rounded bg-foreground/10 border border-border disabled:opacity-30 transition-colors hover:bg-foreground/15"
              >
                Aplicar
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Active period badge */}
      <span className="text-[9px] text-muted-foreground/30 font-medium ml-auto whitespace-nowrap">
        {format(range.start, "dd/MM/yyyy")} — {format(range.end, "dd/MM/yyyy")}
      </span>
    </div>
  );
};
