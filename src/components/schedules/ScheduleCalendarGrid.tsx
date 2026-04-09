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
  onReschedule: (scheduleId: string, newDate: Date) => void;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function ScheduleCalendarGrid({
  currentMonth, schedules, onDayClick, onSendNow, onEdit, onCancel, onNewForDay, onReschedule,
}: Props) {
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInTooltipRef = useRef(false);
  const isInCellRef = useRef(false);

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);

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

  // Hover tooltip logic
  const tryClose = useCallback(() => {
    setTimeout(() => {
      if (!isInCellRef.current && !isInTooltipRef.current) {
        setHoveredDay(null);
      }
    }, 100);
  }, []);

  const handleCellMouseEnter = useCallback((key: string, e: React.MouseEvent) => {
    if (draggingId) return; // disable tooltip during drag
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
  }, [draggingId]);

  const handleCellMouseLeave = useCallback(() => {
    isInCellRef.current = false;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    tryClose();
  }, [tryClose]);

  const handleTooltipMouseEnter = useCallback(() => { isInTooltipRef.current = true; }, []);
  const handleTooltipMouseLeave = useCallback(() => { isInTooltipRef.current = false; tryClose(); }, [tryClose]);

  const hoveredDayDate = useMemo(() => {
    if (!hoveredDay) return null;
    return days.find(d => format(d, "yyyy-MM-dd") === hoveredDay) || null;
  }, [hoveredDay, days]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, schedule: ScheduledMessage) => {
    if (schedule.status !== "pending") { e.preventDefault(); return; }
    e.stopPropagation();
    setDraggingId(schedule.id);
    setHoveredDay(null); // close tooltip
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", schedule.id);
    // custom drag image
    const el = e.currentTarget as HTMLElement;
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.style.width = `${el.offsetWidth}px`;
    ghost.style.opacity = "0.85";
    ghost.style.position = "absolute";
    ghost.style.top = "-9999px";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, el.offsetWidth / 2, 12);
    requestAnimationFrame(() => document.body.removeChild(ghost));
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropTargetKey(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, key: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetKey(key);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent, key: string) => {
    // Only clear if actually leaving the cell
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { clientX, clientY } = e;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      if (dropTargetKey === key) setDropTargetKey(null);
    }
  }, [dropTargetKey]);

  const handleDrop = useCallback((e: React.DragEvent, day: Date) => {
    e.preventDefault();
    const scheduleId = e.dataTransfer.getData("text/plain");
    if (!scheduleId) return;

    const sourceKey = schedules.find(s => s.id === scheduleId);
    if (!sourceKey) return;

    const targetKey = format(day, "yyyy-MM-dd");
    const sourceDate = format(new Date(sourceKey.scheduled_at), "yyyy-MM-dd");

    if (sourceDate !== targetKey) {
      onReschedule(scheduleId, day);
    }

    setDraggingId(null);
    setDropTargetKey(null);
  }, [schedules, onReschedule]);

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
          const isDropTarget = dropTargetKey === key && draggingId !== null;

          return (
            <div
              key={i}
              onClick={() => { if (!draggingId) onDayClick(day); }}
              onMouseEnter={(e) => handleCellMouseEnter(key, e)}
              onMouseLeave={handleCellMouseLeave}
              onDragOver={(e) => handleDragOver(e, key)}
              onDragLeave={(e) => handleDragLeave(e, key)}
              onDrop={(e) => handleDrop(e, day)}
              className={cn(
                "relative flex flex-col items-start p-1.5 sm:p-2 min-h-[80px] sm:min-h-[100px] border-b border-r border-border/40 text-left transition-all duration-100 cursor-pointer",
                "hover:bg-accent/40 focus:outline-none",
                !inMonth && "opacity-30",
                today && "bg-primary/5",
                hoveredDay === key && !draggingId && "bg-accent/50",
                isDropTarget && "bg-primary/10 ring-2 ring-inset ring-primary/40",
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
                  const isDragging = draggingId === s.id;
                  const canDrag = s.status === "pending";
                  return (
                    <div
                      key={s.id}
                      draggable={canDrag}
                      onDragStart={(e) => handleDragStart(e, s)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        "flex items-center gap-1 px-1 py-0.5 rounded bg-muted/50 overflow-hidden transition-all",
                        canDrag && "cursor-grab active:cursor-grabbing hover:bg-muted/80 hover:shadow-sm",
                        isDragging && "opacity-30 scale-95",
                      )}
                    >
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
            </div>
          );
        })}
      </div>

      {/* Hover tooltip — hidden during drag */}
      {hoveredDay && hoveredDayDate && !draggingId && (
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
