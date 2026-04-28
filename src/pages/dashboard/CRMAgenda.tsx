import { useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, addWeeks, subWeeks, isSameDay, isSameMonth, parseISO, startOfDay, endOfDay, isWithinInterval, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, Clock, MapPin, Link as LinkIcon, User, Phone, Trash2, CheckCircle2, Circle, Bell, AlignLeft, ListTodo, Users, Video, Briefcase, Sparkles, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useCrmAgenda, AgendaEvent, AgendaEventType, AgendaPriority } from "@/hooks/useCrmAgenda";

type ViewMode = "mes" | "semana" | "dia" | "lista";

const TYPE_META: Record<AgendaEventType, { label: string; icon: any; color: string }> = {
  compromisso: { label: "Compromisso", icon: CalendarIcon, color: "hsl(160 84% 39%)" },
  tarefa: { label: "Tarefa", icon: ListTodo, color: "hsl(199 89% 48%)" },
  reuniao: { label: "Reunião", icon: Users, color: "hsl(262 83% 58%)" },
  visita: { label: "Visita", icon: Briefcase, color: "hsl(31 95% 56%)" },
  call: { label: "Call", icon: Video, color: "hsl(340 82% 60%)" },
};

const PRIORITY_META: Record<AgendaPriority, { label: string; class: string }> = {
  baixa: { label: "Baixa", class: "bg-muted text-muted-foreground" },
  media: { label: "Média", class: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  alta: { label: "Alta", class: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
};

export default function CRMAgenda() {
  const { events, loading, createEvent, updateEvent, deleteEvent, toggleComplete } = useCrmAgenda();
  const [view, setView] = useState<ViewMode>("mes");
  const [cursor, setCursor] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AgendaEvent | null>(null);
  const [filterType, setFilterType] = useState<"all" | AgendaEventType>("all");
  const [hideDone, setHideDone] = useState(false);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (filterType !== "all" && e.event_type !== filterType) return false;
      if (hideDone && e.status === "concluido") return false;
      return true;
    });
  }, [events, filterType, hideDone]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>();
    filteredEvents.forEach((e) => {
      const k = format(parseISO(e.start_at), "yyyy-MM-dd");
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    });
    return map;
  }, [filteredEvents]);

  const todayEvents = useMemo(() => {
    return filteredEvents
      .filter((e) => isSameDay(parseISO(e.start_at), selectedDate))
      .sort((a, b) => a.start_at.localeCompare(b.start_at));
  }, [filteredEvents, selectedDate]);

  const upcomingCount = useMemo(() => {
    const now = new Date();
    return filteredEvents.filter((e) => e.status === "pendente" && parseISO(e.start_at) >= now).length;
  }, [filteredEvents]);

  const overdueCount = useMemo(() => {
    const now = new Date();
    return filteredEvents.filter((e) => e.status === "pendente" && isBefore(parseISO(e.start_at), now)).length;
  }, [filteredEvents]);

  const goPrev = () => {
    if (view === "mes") setCursor(subMonths(cursor, 1));
    else if (view === "semana") setCursor(subWeeks(cursor, 1));
    else setCursor(addDays(cursor, -1));
  };
  const goNext = () => {
    if (view === "mes") setCursor(addMonths(cursor, 1));
    else if (view === "semana") setCursor(addWeeks(cursor, 1));
    else setCursor(addDays(cursor, 1));
  };
  const goToday = () => {
    const t = new Date();
    setCursor(t);
    setSelectedDate(t);
  };

  const openNew = (date?: Date) => {
    setEditing(null);
    setSelectedDate(date || selectedDate);
    setDialogOpen(true);
  };

  const openEdit = (e: AgendaEvent) => {
    setEditing(e);
    setDialogOpen(true);
  };

  const headerTitle = useMemo(() => {
    if (view === "mes") return format(cursor, "MMMM 'de' yyyy", { locale: ptBR });
    if (view === "semana") {
      const s = startOfWeek(cursor, { weekStartsOn: 0 });
      const e = endOfWeek(cursor, { weekStartsOn: 0 });
      return `${format(s, "d MMM", { locale: ptBR })} – ${format(e, "d MMM yyyy", { locale: ptBR })}`;
    }
    if (view === "dia") return format(cursor, "EEEE, d 'de' MMMM", { locale: ptBR });
    return "Próximos eventos";
  }, [cursor, view]);

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-background via-background to-muted/20">
      {/* HEADER */}
      <div className="px-6 pt-6 pb-4 border-b border-border/40 backdrop-blur-sm bg-background/40">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <CalendarIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
              <p className="text-xs text-muted-foreground">Compromissos, tarefas, reuniões e visitas dos seus leads</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border border-border/40">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-medium">{upcomingCount} próximos</span>
            </div>
            {overdueCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20">
                <Bell className="h-3 w-3 text-rose-500" />
                <span className="text-xs font-medium text-rose-600 dark:text-rose-400">{overdueCount} atrasados</span>
              </div>
            )}
            <Button onClick={() => openNew()} className="bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-md shadow-emerald-500/20">
              <Plus className="h-4 w-4 mr-1.5" />
              Novo
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-5">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goPrev} className="h-8 w-8 p-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToday} className="h-8 px-3 text-xs">
              Hoje
            </Button>
            <Button variant="outline" size="sm" onClick={goNext} className="h-8 w-8 p-0">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <h2 className="text-sm font-semibold ml-2 capitalize">{headerTitle}</h2>
          </div>

          <div className="flex items-center gap-3">
            <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
              <TabsList className="h-8">
                <TabsTrigger value="mes" className="text-xs h-6">Mês</TabsTrigger>
                <TabsTrigger value="semana" className="text-xs h-6">Semana</TabsTrigger>
                <TabsTrigger value="dia" className="text-xs h-6">Dia</TabsTrigger>
                <TabsTrigger value="lista" className="text-xs h-6">Lista</TabsTrigger>
              </TabsList>
            </Tabs>

            <Select value={filterType} onValueChange={(v) => setFilterType(v as any)}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <Filter className="h-3 w-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {Object.entries(TYPE_META).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Switch checked={hideDone} onCheckedChange={setHideDone} id="hide-done" />
              <Label htmlFor="hide-done" className="text-xs cursor-pointer">Ocultar concluídos</Label>
            </div>
          </div>
        </div>
      </div>

      {/* CONTENT — Split layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 p-4 overflow-hidden">
        <Card className="overflow-hidden border-border/40 bg-card/60 backdrop-blur-sm">
          {view === "mes" && <MonthView cursor={cursor} eventsByDay={eventsByDay} selectedDate={selectedDate} onSelectDate={setSelectedDate} onCreate={openNew} onEdit={openEdit} />}
          {view === "semana" && <WeekView cursor={cursor} events={filteredEvents} onEdit={openEdit} onCreate={openNew} />}
          {view === "dia" && <DayView date={cursor} events={filteredEvents} onEdit={openEdit} onCreate={openNew} />}
          {view === "lista" && <ListView events={filteredEvents} onEdit={openEdit} onToggle={toggleComplete} loading={loading} />}
        </Card>

        {/* SIDE PANEL — Day details */}
        <Card className="overflow-hidden border-border/40 bg-card/60 backdrop-blur-sm flex flex-col">
          <div className="p-4 border-b border-border/40 bg-gradient-to-br from-emerald-500/5 to-transparent">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Detalhes</p>
                <h3 className="text-lg font-bold capitalize mt-0.5">
                  {format(selectedDate, "EEEE, d 'de' MMM", { locale: ptBR })}
                </h3>
              </div>
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 flex flex-col items-center justify-center border border-emerald-500/20">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold leading-none uppercase">{format(selectedDate, "MMM", { locale: ptBR })}</span>
                <span className="text-lg font-bold leading-none mt-0.5">{format(selectedDate, "d")}</span>
              </div>
            </div>
            <Button onClick={() => openNew(selectedDate)} variant="outline" size="sm" className="w-full mt-3 h-8 text-xs">
              <Plus className="h-3 w-3 mr-1" /> Novo neste dia
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {todayEvents.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum evento neste dia</p>
                </div>
              )}
              {todayEvents.map((e) => (
                <EventCard key={e.id} event={e} onClick={() => openEdit(e)} onToggle={() => toggleComplete(e)} compact />
              ))}
            </div>
          </ScrollArea>
        </Card>
      </div>

      <EventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        defaultDate={selectedDate}
        onCreate={createEvent}
        onUpdate={updateEvent}
        onDelete={deleteEvent}
      />
    </div>
  );
}

// ============== MONTH VIEW ==============
function MonthView({ cursor, eventsByDay, selectedDate, onSelectDate, onCreate, onEdit }: any) {
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days: Date[] = [];
  let d = gridStart;
  while (d <= gridEnd) {
    days.push(d);
    d = addDays(d, 1);
  }

  const today = new Date();
  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-7 border-b border-border/40 bg-muted/30">
        {weekDays.map((w) => (
          <div key={w} className="px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center">{w}</div>
        ))}
      </div>
      <div className="flex-1 grid grid-cols-7 grid-rows-6 overflow-auto">
        {days.map((day) => {
          const k = format(day, "yyyy-MM-dd");
          const dayEvents = eventsByDay.get(k) || [];
          const isToday = isSameDay(day, today);
          const isSelected = isSameDay(day, selectedDate);
          const inMonth = isSameMonth(day, cursor);
          return (
            <button
              key={k}
              onClick={() => onSelectDate(day)}
              onDoubleClick={() => onCreate(day)}
              className={cn(
                "border-r border-b border-border/30 p-1.5 text-left transition-all hover:bg-muted/40 flex flex-col gap-1 min-h-[88px] relative group",
                !inMonth && "bg-muted/10 opacity-50",
                isSelected && "bg-emerald-500/5 ring-1 ring-emerald-500/40 ring-inset"
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn(
                  "text-xs font-semibold inline-flex items-center justify-center h-6 min-w-[24px] px-1 rounded-md",
                  isToday && "bg-emerald-500 text-white"
                )}>{format(day, "d")}</span>
                {dayEvents.length > 0 && (
                  <span className="text-[9px] text-muted-foreground font-medium">{dayEvents.length}</span>
                )}
              </div>
              <div className="space-y-0.5 overflow-hidden">
                {dayEvents.slice(0, 3).map((e: AgendaEvent) => {
                  const meta = TYPE_META[e.event_type] || TYPE_META.compromisso;
                  return (
                    <div
                      key={e.id}
                      onClick={(ev) => { ev.stopPropagation(); onEdit(e); }}
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded truncate flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity",
                        e.status === "concluido" && "line-through opacity-50"
                      )}
                      style={{ backgroundColor: `${meta.color}22`, color: meta.color, borderLeft: `2px solid ${meta.color}` }}
                    >
                      <span className="truncate font-medium">{format(parseISO(e.start_at), "HH:mm")} {e.title}</span>
                    </div>
                  );
                })}
                {dayEvents.length > 3 && (
                  <div className="text-[9px] text-muted-foreground px-1">+{dayEvents.length - 3} mais</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============== WEEK VIEW ==============
function WeekView({ cursor, events, onEdit, onCreate }: any) {
  const weekStart = startOfWeek(cursor, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  return (
    <div className="h-full overflow-auto">
      <div className="grid grid-cols-7 gap-px bg-border/30 min-h-full">
        {days.map((day) => {
          const dayEvents = (events as AgendaEvent[])
            .filter((e) => isSameDay(parseISO(e.start_at), day))
            .sort((a, b) => a.start_at.localeCompare(b.start_at));
          const isToday = isSameDay(day, today);
          return (
            <div key={day.toISOString()} className="bg-card flex flex-col min-h-[400px]">
              <div className={cn("p-2 border-b border-border/40 text-center", isToday && "bg-emerald-500/5")}>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{format(day, "EEE", { locale: ptBR })}</div>
                <div className={cn("text-lg font-bold mt-0.5", isToday && "text-emerald-500")}>{format(day, "d")}</div>
              </div>
              <button onClick={() => onCreate(day)} className="flex-1 p-2 space-y-1.5 text-left hover:bg-muted/20 transition-colors">
                {dayEvents.length === 0 && (
                  <div className="text-[10px] text-muted-foreground/50 italic text-center pt-4">+ adicionar</div>
                )}
                {dayEvents.map((e) => {
                  const meta = TYPE_META[e.event_type] || TYPE_META.compromisso;
                  return (
                    <div
                      key={e.id}
                      onClick={(ev) => { ev.stopPropagation(); onEdit(e); }}
                      className={cn(
                        "p-1.5 rounded text-[10px] cursor-pointer hover:scale-[1.02] transition-transform",
                        e.status === "concluido" && "line-through opacity-50"
                      )}
                      style={{ backgroundColor: `${meta.color}1a`, borderLeft: `3px solid ${meta.color}` }}
                    >
                      <div className="font-semibold truncate" style={{ color: meta.color }}>{format(parseISO(e.start_at), "HH:mm")}</div>
                      <div className="font-medium truncate">{e.title}</div>
                      {e.lead_name && <div className="text-muted-foreground truncate text-[9px]">{e.lead_name}</div>}
                    </div>
                  );
                })}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============== DAY VIEW ==============
function DayView({ date, events, onEdit, onCreate }: any) {
  const dayEvents = (events as AgendaEvent[])
    .filter((e) => isSameDay(parseISO(e.start_at), date))
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <ScrollArea className="h-full">
      <div className="p-4">
        <div className="space-y-px">
          {hours.map((h) => {
            const hourEvents = dayEvents.filter((e) => parseISO(e.start_at).getHours() === h);
            return (
              <div key={h} className="grid grid-cols-[60px_1fr] gap-3 min-h-[56px] group">
                <div className="text-[10px] font-mono text-muted-foreground pt-1.5 text-right border-r border-border/30 pr-2">
                  {String(h).padStart(2, "0")}:00
                </div>
                <button
                  onClick={() => {
                    const d = new Date(date);
                    d.setHours(h, 0, 0, 0);
                    onCreate(d);
                  }}
                  className="text-left p-1.5 rounded hover:bg-muted/30 transition-colors space-y-1"
                >
                  {hourEvents.length === 0 && (
                    <span className="text-[10px] text-muted-foreground/0 group-hover:text-muted-foreground/40 italic">+ Adicionar evento</span>
                  )}
                  {hourEvents.map((e) => (
                    <EventCard key={e.id} event={e} onClick={(ev) => { ev?.stopPropagation(); onEdit(e); }} />
                  ))}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}

// ============== LIST VIEW ==============
function ListView({ events, onEdit, onToggle, loading }: any) {
  const grouped = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>();
    (events as AgendaEvent[])
      .slice()
      .sort((a, b) => a.start_at.localeCompare(b.start_at))
      .forEach((e) => {
        const k = format(parseISO(e.start_at), "yyyy-MM-dd");
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(e);
      });
    return Array.from(map.entries());
  }, [events]);

  if (loading) return <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>;

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6 max-w-3xl mx-auto">
        {grouped.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <CalendarIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>Nenhum evento na agenda</p>
          </div>
        )}
        {grouped.map(([date, items]) => (
          <div key={date}>
            <div className="flex items-center gap-2 mb-2 sticky top-0 bg-card/80 backdrop-blur-sm py-1 z-10">
              <div className="h-px flex-1 bg-border/40" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {format(parseISO(date + "T00:00:00"), "EEEE, d 'de' MMMM", { locale: ptBR })}
              </span>
              <div className="h-px flex-1 bg-border/40" />
            </div>
            <div className="space-y-2">
              {items.map((e) => (
                <EventCard key={e.id} event={e} onClick={() => onEdit(e)} onToggle={() => onToggle(e)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// ============== EVENT CARD ==============
function EventCard({ event, onClick, onToggle, compact }: { event: AgendaEvent; onClick?: any; onToggle?: any; compact?: boolean }) {
  const meta = TYPE_META[event.event_type] || TYPE_META.compromisso;
  const Icon = meta.icon;
  const done = event.status === "concluido";
  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative p-3 rounded-lg border transition-all cursor-pointer hover:shadow-md hover:-translate-y-px bg-card",
        done && "opacity-60"
      )}
      style={{ borderLeftWidth: 3, borderLeftColor: meta.color, borderColor: `${meta.color}30` }}
    >
      <div className="flex items-start gap-2.5">
        {onToggle && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="mt-0.5 shrink-0"
            title={done ? "Marcar como pendente" : "Marcar como concluído"}
          >
            {done ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-muted-foreground hover:text-emerald-500" />}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Icon className="h-3 w-3" style={{ color: meta.color }} />
            <span className={cn("text-sm font-semibold truncate", done && "line-through")}>{event.title}</span>
            <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5", PRIORITY_META[event.priority].class, "border-transparent")}>{PRIORITY_META[event.priority].label}</Badge>
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(parseISO(event.start_at), "HH:mm")}{event.end_at ? ` – ${format(parseISO(event.end_at), "HH:mm")}` : ""}</span>
            {event.location && <span className="flex items-center gap-1 truncate"><MapPin className="h-3 w-3" />{event.location}</span>}
            {event.lead_name && <span className="flex items-center gap-1 truncate"><User className="h-3 w-3" />{event.lead_name}</span>}
            {event.whatsapp_reminder && <Bell className="h-3 w-3 text-emerald-500" />}
            {event.google_sync_enabled && <span className="text-[9px] px-1 rounded bg-blue-500/15 text-blue-500">G</span>}
          </div>
          {!compact && event.description && (
            <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">{event.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============== EVENT DIALOG ==============
function EventDialog({ open, onOpenChange, editing, defaultDate, onCreate, onUpdate, onDelete }: any) {
  const [form, setForm] = useState<any>({});

  useMemo(() => {
    if (open) {
      if (editing) {
        setForm({
          title: editing.title,
          description: editing.description || "",
          event_type: editing.event_type,
          start_date: format(parseISO(editing.start_at), "yyyy-MM-dd"),
          start_time: format(parseISO(editing.start_at), "HH:mm"),
          duration: editing.end_at ? Math.round((parseISO(editing.end_at).getTime() - parseISO(editing.start_at).getTime()) / 60000) : 60,
          location: editing.location || "",
          link: editing.link || "",
          priority: editing.priority,
          lead_name: editing.lead_name || "",
          lead_phone: editing.lead_phone || "",
          whatsapp_reminder: editing.whatsapp_reminder,
          whatsapp_reminder_phone: editing.whatsapp_reminder_phone || "",
          reminder_minutes_before: editing.reminder_minutes_before || 30,
          google_sync_enabled: editing.google_sync_enabled,
        });
      } else {
        const d = defaultDate || new Date();
        setForm({
          title: "",
          description: "",
          event_type: "compromisso" as AgendaEventType,
          start_date: format(d, "yyyy-MM-dd"),
          start_time: format(d.getHours() === 0 ? new Date(d.setHours(9)) : d, "HH:mm"),
          duration: 60,
          location: "",
          link: "",
          priority: "media" as AgendaPriority,
          lead_name: "",
          lead_phone: "",
          whatsapp_reminder: false,
          whatsapp_reminder_phone: "",
          reminder_minutes_before: 30,
          google_sync_enabled: false,
        });
      }
    }
  }, [open, editing, defaultDate]);

  const handleSave = async () => {
    if (!form.title?.trim()) return;
    const start = new Date(`${form.start_date}T${form.start_time}:00`);
    const end = new Date(start.getTime() + (form.duration || 60) * 60000);
    const payload = {
      title: form.title.trim(),
      description: form.description || null,
      event_type: form.event_type,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      location: form.location || null,
      link: form.link || null,
      priority: form.priority,
      lead_name: form.lead_name || null,
      lead_phone: form.lead_phone || null,
      whatsapp_reminder: form.whatsapp_reminder,
      whatsapp_reminder_phone: form.whatsapp_reminder_phone || form.lead_phone || null,
      reminder_minutes_before: Number(form.reminder_minutes_before) || 30,
      google_sync_enabled: form.google_sync_enabled,
    };
    if (editing) {
      await onUpdate(editing.id, payload);
    } else {
      await onCreate(payload);
    }
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!editing) return;
    if (confirm("Excluir este evento?")) {
      await onDelete(editing.id);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
              <CalendarIcon className="h-4 w-4 text-white" />
            </div>
            {editing ? "Editar evento" : "Novo evento"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs">Título *</Label>
            <Input value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Reunião com cliente" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={form.event_type} onValueChange={(v) => setForm({ ...form, event_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_META).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Prioridade</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={form.start_date || ""} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Hora</Label>
              <Input type="time" value={form.start_time || ""} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Duração</Label>
              <Select value={String(form.duration)} onValueChange={(v) => setForm({ ...form, duration: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 min</SelectItem>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="60">1h</SelectItem>
                  <SelectItem value="90">1h30</SelectItem>
                  <SelectItem value="120">2h</SelectItem>
                  <SelectItem value="240">4h</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs flex items-center gap-1"><AlignLeft className="h-3 w-3" /> Descrição</Label>
            <Textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Notas, pauta, links..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3" /> Local</Label>
              <Input value={form.location || ""} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Endereço ou sala" />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><LinkIcon className="h-3 w-3" /> Link</Label>
              <Input value={form.link || ""} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="Meet, Zoom..." />
            </div>
          </div>

          <div className="rounded-lg border border-border/50 p-3 space-y-3 bg-muted/20">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> Lead vinculado</div>
            <div className="grid grid-cols-2 gap-3">
              <Input value={form.lead_name || ""} onChange={(e) => setForm({ ...form, lead_name: e.target.value })} placeholder="Nome do lead" />
              <Input value={form.lead_phone || ""} onChange={(e) => setForm({ ...form, lead_phone: e.target.value })} placeholder="Telefone (DDD + número)" />
            </div>
          </div>

          <div className="rounded-lg border border-emerald-500/20 p-3 space-y-3 bg-emerald-500/5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Bell className="h-3 w-3" /> Lembrete WhatsApp
              </div>
              <Switch checked={form.whatsapp_reminder} onCheckedChange={(v) => setForm({ ...form, whatsapp_reminder: v })} />
            </div>
            {form.whatsapp_reminder && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px]">Telefone destino</Label>
                  <Input value={form.whatsapp_reminder_phone || ""} onChange={(e) => setForm({ ...form, whatsapp_reminder_phone: e.target.value })} placeholder="Padrão: do lead" />
                </div>
                <div>
                  <Label className="text-[10px]">Antecedência</Label>
                  <Select value={String(form.reminder_minutes_before)} onValueChange={(v) => setForm({ ...form, reminder_minutes_before: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 min antes</SelectItem>
                      <SelectItem value="15">15 min antes</SelectItem>
                      <SelectItem value="30">30 min antes</SelectItem>
                      <SelectItem value="60">1h antes</SelectItem>
                      <SelectItem value="120">2h antes</SelectItem>
                      <SelectItem value="1440">1 dia antes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-blue-500/20 p-3 bg-blue-500/5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">Google Calendar</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Sincroniza com sua agenda Google</div>
            </div>
            <Switch checked={form.google_sync_enabled} onCheckedChange={(v) => setForm({ ...form, google_sync_enabled: v })} />
          </div>
        </div>

        <DialogFooter className="flex sm:justify-between gap-2">
          <div>
            {editing && (
              <Button variant="outline" onClick={handleDelete} className="text-rose-500 hover:text-rose-600 border-rose-500/30">
                <Trash2 className="h-4 w-4 mr-1" /> Excluir
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="bg-gradient-to-br from-emerald-500 to-emerald-600">{editing ? "Salvar" : "Criar"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
