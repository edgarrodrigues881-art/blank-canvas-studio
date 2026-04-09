import { useMemo } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ScheduledMessage, statusConfig } from "./types";

interface Props {
  currentMonth: Date;
  schedules: ScheduledMessage[];
  onDayClick: (date: Date) => void;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function ScheduleCalendarGrid({ currentMonth, schedules, onDayClick }: Props) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    const result: Date[] = [];
    let d = start;
    while (d <= end) {
      result.push(d);
      d = addDays(d, 1);
    }
    return result;
  }, [currentMonth]);

  const schedulesByDay = useMemo(() => {
    const map = new Map<string, ScheduledMessage[]>();
    schedules.forEach(s => {
      const key = format(new Date(s.scheduled_at), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    // Sort each day by time
    map.forEach(list => list.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()));
    return map;
  }, [schedules]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-border bg-muted/30">
        {WEEKDAYS.map(w => (
          <div key={w} className="py-2.5 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            {w}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const key = format(day, "yyyy-MM-dd");
          const daySchedules = schedulesByDay.get(key) || [];
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);
          const hasItems = daySchedules.length > 0;

          return (
            <button
              key={i}
              onClick={() => onDayClick(day)}
              className={cn(
                "relative flex flex-col items-start p-1.5 sm:p-2 min-h-[80px] sm:min-h-[100px] border-b border-r border-border/40 text-left transition-colors duration-100",
                "hover:bg-accent/40 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:ring-inset",
                !inMonth && "opacity-30",
                today && "bg-primary/5",
              )}
            >
              {/* Day number */}
              <span className={cn(
                "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium mb-1",
                today && "bg-primary text-primary-foreground",
                !today && "text-foreground",
              )}>
                {format(day, "d")}
              </span>

              {/* Schedule previews */}
              <div className="flex flex-col gap-0.5 w-full overflow-hidden flex-1">
                {daySchedules.slice(0, 2).map(s => {
                  const sc = statusConfig[s.status] || statusConfig.pending;
                  return (
                    <div key={s.id} className="flex items-center gap-1 px-1 py-0.5 rounded bg-muted/50 overflow-hidden">
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", sc.dot)} />
                      <span className="text-[10px] text-foreground truncate">
                        {s.contact_name || s.contact_phone.slice(-4)}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                        {format(new Date(s.scheduled_at), "HH:mm")}
                      </span>
                    </div>
                  );
                })}
                {daySchedules.length > 2 && (
                  <span className="text-[10px] text-primary font-medium px-1">
                    +{daySchedules.length - 2} mais...
                  </span>
                )}
              </div>

              {/* Dot indicator for mobile */}
              {hasItems && (
                <div className="absolute top-1.5 right-1.5 sm:hidden flex gap-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
