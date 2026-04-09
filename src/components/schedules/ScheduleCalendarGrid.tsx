import { useMemo, useRef, useState, useCallback } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { ScheduledMessage, statusConfig } from "./types";
import DayHoverTooltip from "./DayHoverTooltip";

interface Props {
  currentMonth: Date;
  schedules: ScheduledMessage[];
  onDayClick: (date: Date) => void;
  onSendNow: (s: ScheduledMessage) => void;
  onEdit: (s: ScheduledMessage) => void;
  onCancel: (id: string) => void;
  onNewForDay: (date: Date) => void;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function ScheduleCalendarGrid({
  currentMonth, schedules, onDayClick, onSendNow, onEdit, onCancel, onNewForDay,
}: Props) {
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInTooltipRef = useRef(false);
  const isInCellRef = useRef(false);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    const result: Date[] = [];
    let d = start;
    while (d <= end) { result.push(d); d = addDays(d, 1); }
    return result;
  }, [currentMonth]);

  const schedulesByDay = useMemo(() => {
    const map = new Map<string, ScheduledMessage[]>();
    schedules.forEach(s => {
      const key = format(new Date(s.scheduled_at), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    map.forEach(list => list.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()));
    return map;
  }, [schedules]);

  const tryClose = useCallback(() => {
    setTimeout(() => {
      if (!isInCellRef.current && !isInTooltipRef.current) {
        setHoveredDay(null);
      }
    }, 100);
  }, []);

  const handleCellMouseEnter = useCallback((key: string, e: React.MouseEvent) => {
    isInCellRef.current = true;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);

    hoverTimerRef.current = setTimeout(() => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const viewportW = window.innerWidth;

      let left = rect.right + 8;
      if (left + 310 > viewportW) left = rect.left - 310;
      if (left < 8) left = 8;

      let top = rect.top;
      const viewportH = window.innerHeight;
      if (top + 300 > viewportH) top = viewportH - 310;
      if (top < 8) top = 8;

      setTooltipPos({ top, left });
      setHoveredDay(key);
    }, 200);
  }, []);

  const handleCellMouseLeave = useCallback(() => {
    isInCellRef.current = false;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    tryClose();
  }, [tryClose]);

  const handleTooltipMouseEnter = useCallback(() => {
    isInTooltipRef.current = true;
  }, []);

  const handleTooltipMouseLeave = useCallback(() => {
    isInTooltipRef.current = false;
    tryClose();
  }, [tryClose]);

  const hoveredDayDate = useMemo(() => {
    if (!hoveredDay) return null;
    return days.find(d => format(d, "yyyy-MM-dd") === hoveredDay) || null;
  }, [hoveredDay, days]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden relative">
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
              onMouseEnter={(e) => handleCellMouseEnter(key, e)}
              onMouseLeave={handleCellMouseLeave}
              className={cn(
                "relative flex flex-col items-start p-1.5 sm:p-2 min-h-[80px] sm:min-h-[100px] border-b border-r border-border/40 text-left transition-colors duration-100",
                "hover:bg-accent/40 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:ring-inset",
                !inMonth && "opacity-30",
                today && "bg-primary/5",
                hoveredDay === key && "bg-accent/50",
              )}
            >
              <span className={cn(
                "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium mb-1",
                today && "bg-primary text-primary-foreground",
                !today && "text-foreground",
              )}>
                {format(day, "d")}
              </span>

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

              {hasItems && (
                <div className="absolute top-1.5 right-1.5 sm:hidden flex gap-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Hover tooltip */}
      {hoveredDay && hoveredDayDate && (
        <DayHoverTooltip
          date={hoveredDayDate}
          schedules={schedulesByDay.get(hoveredDay) || []}
          position={tooltipPos}
          onSendNow={onSendNow}
          onEdit={onEdit}
          onCancel={onCancel}
          onNewForDay={onNewForDay}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        />
      )}
    </div>
  );
}
