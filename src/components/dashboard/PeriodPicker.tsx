import { useState } from "react";
import { Calendar, Check, ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  MessagesPeriod,
  PERIOD_OPTIONS,
} from "@/hooks/useMessagesByPeriod";

interface PeriodPickerProps {
  value: MessagesPeriod;
  onChange: (v: MessagesPeriod) => void;
  className?: string;
}

export function PeriodPicker({ value, onChange, className }: PeriodPickerProps) {
  const [open, setOpen] = useState(false);
  const current = PERIOD_OPTIONS.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-border/40 bg-card/40 hover:bg-card hover:border-border transition-all duration-150 text-[11px] font-medium text-muted-foreground hover:text-foreground",
            open && "bg-card border-border text-foreground",
            className
          )}
          aria-label="Selecionar período"
        >
          <Calendar className="w-3 h-3" strokeWidth={2} />
          <span className="tabular-nums">{current?.short || "7d"}</span>
          <ChevronDown
            className={cn(
              "w-3 h-3 transition-transform duration-150 opacity-60",
              open && "rotate-180"
            )}
            strokeWidth={2}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-44 p-1 bg-popover border-border/60 shadow-2xl"
      >
        <div className="px-2 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">
          Período
        </div>
        {PERIOD_OPTIONS.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={String(opt.value)}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={cn(
                "flex items-center justify-between w-full px-2 py-1.5 rounded-md text-[12px] transition-colors duration-100",
                active
                  ? "bg-primary/10 text-foreground font-semibold"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              )}
            >
              <span>{opt.label}</span>
              {active && <Check className="w-3.5 h-3.5 text-primary" strokeWidth={2.5} />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

export default PeriodPicker;
