import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Send, Pencil, Trash2, Plus, Phone, GripVertical } from "lucide-react";
import { ScheduledMessage, statusConfig } from "./types";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date | null;
  schedules: ScheduledMessage[];
  onEdit: (s: ScheduledMessage) => void;
  onCancel: (id: string) => void;
  onSendNow: (s: ScheduledMessage) => void;
  onNewAtTime: (date: Date, time: string) => void;
  onRescheduleTime: (id: string, newHour: number, newMinute: number) => void;
}

const SLOT_HEIGHT = 48; // px per 30-min slot
const TOTAL_SLOTS = 48; // 24h × 2
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);

export default function DayDetailSheet({
  open, onOpenChange, date, schedules,
  onEdit, onCancel, onSendNow, onNewAtTime, onRescheduleTime,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [nowMinutes, setNowMinutes] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragGhostY, setDragGhostY] = useState<number | null>(null);
  const containerTopRef = useRef(0);

  // Update "now" line every minute
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      const n = new Date();
      setNowMinutes(n.getHours() * 60 + n.getMinutes());
    }, 60_000);
    return () => clearInterval(interval);
  }, [open]);

  // Auto-scroll to current time on open
  useEffect(() => {
    if (!open || !scrollRef.current) return;
    const scrollTarget = (nowMinutes / 30) * SLOT_HEIGHT - 120;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: Math.max(0, scrollTarget), behavior: "smooth" });
    });
  }, [open, nowMinutes]);

  const sorted = useMemo(() => {
    return [...schedules].sort((a, b) =>
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    );
  }, [schedules]);

  // Position helpers
  const getMinutesFromMidnight = (dt: Date) => dt.getHours() * 60 + dt.getMinutes();
  const getTopPx = (minutes: number) => (minutes / 30) * SLOT_HEIGHT;
  const getMinutesFromY = (y: number) => Math.round((y / SLOT_HEIGHT) * 30 / 15) * 15; // snap to 15min

  // Overlap detection: group overlapping blocks
  const positionedSchedules = useMemo(() => {
    const items = sorted.map(s => {
      const dt = new Date(s.scheduled_at);
      const mins = getMinutesFromMidnight(dt);
      return { ...s, _mins: mins, _top: getTopPx(mins) };
    });

    // Simple overlap: assign columns
    const result: Array<typeof items[number] & { _col: number; _totalCols: number }> = [];
    for (let i = 0; i < items.length; i++) {
      const overlapping = result.filter(r => Math.abs(r._mins - items[i]._mins) < 30);
      const col = overlapping.length;
      result.push({ ...items[i], _col: col, _totalCols: 1 });
    }
    // Fix totalCols
    for (const r of result) {
      const group = result.filter(x => Math.abs(x._mins - r._mins) < 30);
      r._totalCols = group.length;
      group.forEach((g, idx) => { g._col = idx; g._totalCols = group.length; });
    }
    return result;
  }, [sorted]);

  // Drag handlers
  const handlePointerDown = useCallback((e: React.PointerEvent, s: ScheduledMessage) => {
    if (s.status !== "pending") return;
    e.stopPropagation();
    const container = scrollRef.current;
    if (!container) return;
    containerTopRef.current = container.getBoundingClientRect().top - container.scrollTop;
    setDraggingId(s.id);
    setDragGhostY(null);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingId) return;
    const y = e.clientY - containerTopRef.current + (scrollRef.current?.scrollTop || 0);
    setDragGhostY(Math.max(0, Math.min(y, TOTAL_SLOTS * SLOT_HEIGHT - SLOT_HEIGHT)));
  }, [draggingId]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!draggingId || dragGhostY === null) {
      setDraggingId(null);
      setDragGhostY(null);
      return;
    }
    const minutes = getMinutesFromY(dragGhostY);
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    onRescheduleTime(draggingId, hour, minute);
    setDraggingId(null);
    setDragGhostY(null);
  }, [draggingId, dragGhostY, onRescheduleTime]);

  const handleSlotClick = useCallback((slotIndex: number) => {
    if (!date) return;
    const hour = Math.floor(slotIndex / 2);
    const minute = (slotIndex % 2) * 30;
    onNewAtTime(date, `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  }, [date, onNewAtTime]);

  if (!date) return null;

  const nowTop = getTopPx(nowMinutes);
  const isToday = new Date().toDateString() === date.toDateString();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="p-4 pb-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="text-base capitalize">
                {format(date, "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </SheetTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {sorted.length} agendamento{sorted.length !== 1 ? "s" : ""} · Clique em um horário para criar
              </p>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => date && onNewAtTime(date, "")}>
              <Plus className="w-3 h-3" /> Novo
            </Button>
          </div>
        </SheetHeader>

        {/* Timeline */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto relative"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div className="relative" style={{ height: TOTAL_SLOTS * SLOT_HEIGHT }}>
            {/* Hour labels + grid lines */}
            {HOUR_LABELS.map((label, i) => (
              <div
                key={label}
                className="absolute left-0 right-0 border-t border-border/30"
                style={{ top: i * 2 * SLOT_HEIGHT }}
              >
                <span className="absolute -top-2.5 left-2 text-[10px] text-muted-foreground font-mono bg-background px-1">
                  {label}
                </span>
              </div>
            ))}

            {/* Half-hour lines */}
            {Array.from({ length: 24 }, (_, i) => (
              <div
                key={`half-${i}`}
                className="absolute left-10 right-0 border-t border-border/15"
                style={{ top: (i * 2 + 1) * SLOT_HEIGHT }}
              />
            ))}

            {/* Clickable slots */}
            {Array.from({ length: TOTAL_SLOTS }, (_, i) => (
              <div
                key={`slot-${i}`}
                className="absolute left-10 right-2 cursor-pointer hover:bg-primary/5 rounded transition-colors"
                style={{ top: i * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                onClick={() => handleSlotClick(i)}
              />
            ))}

            {/* Now indicator */}
            {isToday && (
              <div
                className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
                style={{ top: nowTop }}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-destructive shrink-0 -ml-1" />
                <div className="flex-1 h-[2px] bg-destructive/70" />
              </div>
            )}

            {/* Schedule blocks */}
            {positionedSchedules.map(s => {
              const sc = statusConfig[s.status] || statusConfig.pending;
              const isDragging = draggingId === s.id;
              const canDrag = s.status === "pending";
              const blockTop = isDragging && dragGhostY !== null ? dragGhostY : s._top;
              const colWidth = `calc((100% - 52px) / ${s._totalCols})`;
              const colLeft = `calc(52px + (100% - 52px) * ${s._col} / ${s._totalCols})`;

              return (
                <div
                  key={s.id}
                  className={cn(
                    "absolute z-20 rounded-lg border px-2 py-1.5 transition-shadow group",
                    "hover:shadow-md hover:z-30",
                    isDragging && "z-40 shadow-lg ring-2 ring-primary/30 opacity-90",
                    canDrag && "cursor-grab active:cursor-grabbing",
                    sc.className,
                  )}
                  style={{
                    top: blockTop,
                    left: colLeft,
                    width: colWidth,
                    minHeight: SLOT_HEIGHT - 4,
                    marginRight: 8,
                  }}
                  onPointerDown={(e) => handlePointerDown(e, s)}
                >
                  {/* Drag handle */}
                  {canDrag && (
                    <GripVertical className="absolute -left-0.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}

                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-medium text-foreground truncate">
                      {s.contact_name || s.contact_phone.slice(-4)}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                      {format(new Date(s.scheduled_at), "HH:mm")}
                    </span>
                  </div>

                  <p className="text-[10px] text-muted-foreground/80 truncate mt-0.5">
                    {s.message_content}
                  </p>

                  {/* Hover actions */}
                  {s.status === "pending" && (
                    <div className="absolute -right-1 -top-1 hidden group-hover:flex gap-0.5 bg-popover border border-border rounded-lg p-0.5 shadow-sm z-50">
                      <button onClick={(e) => { e.stopPropagation(); onSendNow(s); }} className="p-1 rounded hover:bg-primary/10 text-primary transition-colors" title="Enviar agora">
                        <Send className="w-3 h-3" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); onEdit(s); }} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Editar">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); onCancel(s.id); }} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Excluir">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Drag ghost preview */}
            {draggingId && dragGhostY !== null && (
              <div
                className="absolute left-12 right-4 z-50 pointer-events-none rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 flex items-center justify-center"
                style={{ top: Math.round(getMinutesFromY(dragGhostY) / 30) * SLOT_HEIGHT, height: SLOT_HEIGHT }}
              >
                <span className="text-[11px] font-mono text-primary font-medium">
                  {String(Math.floor(getMinutesFromY(dragGhostY) / 60)).padStart(2, "0")}:
                  {String(getMinutesFromY(dragGhostY) % 60).padStart(2, "0")}
                </span>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
