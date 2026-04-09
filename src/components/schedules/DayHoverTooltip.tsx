import { useRef, useState } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Pencil, Trash2, Plus, Clock } from "lucide-react";
import { ScheduledMessage, statusConfig } from "./types";
import { cn } from "@/lib/utils";

interface Props {
  schedules: ScheduledMessage[];
  date: Date;
  position: { top: number; left: number };
  onSendNow: (s: ScheduledMessage) => void;
  onEdit: (s: ScheduledMessage) => void;
  onCancel: (id: string) => void;
  onNewForDay: (date: Date) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export default function DayHoverTooltip({
  schedules, date, position, onSendNow, onEdit, onCancel, onNewForDay,
  onMouseEnter, onMouseLeave,
}: Props) {
  const sorted = [...schedules].sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  );

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed z-[100] w-[300px] rounded-xl border border-border bg-popover text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95 duration-150"
      style={{ top: position.top, left: position.left }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-border/50">
        <span className="text-xs font-semibold text-foreground">
          {format(date, "dd/MM")} · {sorted.length} agendamento{sorted.length !== 1 ? "s" : ""}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[10px] gap-1 text-primary hover:text-primary"
          onClick={(e) => { e.stopPropagation(); onNewForDay(date); }}
        >
          <Plus className="w-3 h-3" /> Novo
        </Button>
      </div>

      {/* Body */}
      <ScrollArea className={cn("px-1 py-1", sorted.length > 4 ? "max-h-[240px]" : "")}>
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-muted-foreground">
            <p className="text-xs mb-2">Nenhum agendamento</p>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] gap-1"
              onClick={(e) => { e.stopPropagation(); onNewForDay(date); }}
            >
              <Plus className="w-3 h-3" /> Criar agendamento
            </Button>
          </div>
        ) : (
          <div className="space-y-1 p-1">
            {sorted.map(s => {
              const sc = statusConfig[s.status] || statusConfig.pending;
              return (
                <div
                  key={s.id}
                  className="group rounded-lg border border-border/40 bg-card p-2 space-y-1 hover:border-border/70 transition-colors"
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", sc.dot)} />
                      <span className="text-[11px] font-medium text-foreground truncate">
                        {s.contact_name || s.contact_phone.slice(-4)}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Clock className="w-2.5 h-2.5 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(s.scheduled_at), "HH:mm")}
                      </span>
                    </div>
                  </div>

                  <p className="text-[10px] text-muted-foreground truncate pl-3">
                    {s.message_content}
                  </p>

                  {/* Actions — visible on hover */}
                  {s.status === "pending" && (
                    <div className="flex items-center gap-1 pt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); onSendNow(s); }}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors"
                      >
                        <Send className="w-2.5 h-2.5" /> Enviar
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onEdit(s); }}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      >
                        <Pencil className="w-2.5 h-2.5" /> Editar
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onCancel(s.id); }}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
