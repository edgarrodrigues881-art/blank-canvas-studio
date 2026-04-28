import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTasks, Task, TaskProject, TaskPriority } from "@/hooks/useTasks";
import { KanbanView, TaskCard } from "@/components/tasks/KanbanView";
import {
  LayoutGrid, List, Calendar as CalendarIcon, Sparkles, Plus, FolderOpen, Layers, Zap, Trash2, Edit3,
  ChevronLeft, ChevronRight, Search, Filter, MoreVertical, X, CheckCircle2, Circle, Clock, User, Flag, AlignLeft, Tag,
} from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameDay, isSameMonth, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type ViewMode = "kanban" | "lista" | "calendario" | "diarias";

const PROJECT_COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#f43f5e", "#06b6d4", "#ec4899", "#84cc16"];

export default function Tasks() {
  const t = useTasks();
  const [view, setView] = useState<ViewMode>("kanban");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState<"all" | TaskPriority>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "todo" | "doing" | "done">("all");
  const [filterProjectId, setFilterProjectId] = useState<"all" | string>("all");
  const [filterLeadId, setFilterLeadId] = useState<"all" | string>("all");

  // Dialogs
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; task?: Task | null; defaultColumn?: string | null; defaultProject?: string | null }>({ open: false });
  const [projectDialog, setProjectDialog] = useState<{ open: boolean; project?: TaskProject | null }>({ open: false });
  const [templatesDialog, setTemplatesDialog] = useState(false);
  const [automationsDialog, setAutomationsDialog] = useState(false);

  const activeProject = useMemo(() => t.projects.find((p) => p.id === activeProjectId) || t.projects[0] || null, [t.projects, activeProjectId]);

  // Lista única de leads vinculados a tarefas (para o filtro)
  const leadOptions = useMemo(() => {
    const map = new Map<string, string>();
    t.tasks.forEach((tk) => { if (tk.lead_id && tk.lead_name) map.set(tk.lead_id, tk.lead_name); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [t.tasks]);

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return t.tasks.filter((task) => {
      if (q) {
        const inTitle = task.title.toLowerCase().includes(q);
        const inDesc = (task.description || "").toLowerCase().includes(q);
        const inLead = (task.lead_name || "").toLowerCase().includes(q);
        const inLabels = (task.labels || []).some((l) => l.toLowerCase().includes(q));
        if (!inTitle && !inDesc && !inLead && !inLabels) return false;
      }
      if (filterPriority !== "all" && task.priority !== filterPriority) return false;
      if (filterStatus !== "all" && task.status !== filterStatus) return false;
      if (filterProjectId !== "all" && task.project_id !== filterProjectId) return false;
      if (filterLeadId !== "all" && task.lead_id !== filterLeadId) return false;
      return true;
    });
  }, [t.tasks, search, filterPriority, filterStatus, filterProjectId, filterLeadId]);

  const hasActiveFilters = search || filterPriority !== "all" || filterStatus !== "all" || filterProjectId !== "all" || filterLeadId !== "all";
  const clearFilters = () => { setSearch(""); setFilterPriority("all"); setFilterStatus("all"); setFilterProjectId("all"); setFilterLeadId("all"); };


  const stats = useMemo(() => {
    const today = new Date();
    return {
      total: t.tasks.filter((x) => x.status !== "done" && x.status !== "archived").length,
      overdue: t.tasks.filter((x) => x.due_at && isPast(parseISO(x.due_at)) && x.status !== "done").length,
      todayCount: t.tasks.filter((x) => x.due_at && isSameDay(parseISO(x.due_at), today) && x.status !== "done").length,
      done: t.tasks.filter((x) => x.status === "done").length,
    };
  }, [t.tasks]);

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-background via-background to-muted/10">
      {/* HEADER */}
      <div className="px-6 pt-6 pb-3 border-b border-border/40 backdrop-blur-sm bg-background/40">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Tarefas</h1>
              <p className="text-xs text-muted-foreground">Projetos, kanban, calendário e tarefas diárias</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <StatChip label="Hoje" value={stats.todayCount} color="emerald" />
            <StatChip label="Atrasadas" value={stats.overdue} color={stats.overdue > 0 ? "rose" : "muted"} />
            <StatChip label="Pendentes" value={stats.total} color="violet" />
            <Button variant="outline" size="sm" onClick={() => setTemplatesDialog(true)} className="h-8">
              <Layers className="h-3.5 w-3.5 mr-1" /> Modelos
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAutomationsDialog(true)} className="h-8">
              <Zap className="h-3.5 w-3.5 mr-1" /> Automações
            </Button>
            <Button onClick={() => setTaskDialog({ open: true, defaultProject: activeProject?.id })} className="bg-gradient-to-br from-violet-500 to-fuchsia-600 hover:from-violet-600 hover:to-fuchsia-700 shadow-md shadow-violet-500/20">
              <Plus className="h-4 w-4 mr-1.5" /> Nova tarefa
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-5">
          <div className="flex items-center gap-2 flex-wrap">
            <ProjectPicker projects={t.projects} active={activeProject} onChange={(p) => setActiveProjectId(p?.id || null)} onNew={() => setProjectDialog({ open: true })} onEdit={(p) => setProjectDialog({ open: true, project: p })} />
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar tarefas..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pl-7 w-56 text-xs" />
            </div>
            <Select value={filterPriority} onValueChange={(v) => setFilterPriority(v as any)}>
              <SelectTrigger className="h-8 w-[130px] text-xs"><Filter className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Prioridade: todas</SelectItem>
                <SelectItem value="urgente">Urgente</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="baixa">Baixa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
            <TabsList className="h-8">
              <TabsTrigger value="kanban" className="text-xs h-6"><LayoutGrid className="h-3 w-3 mr-1" /> Kanban</TabsTrigger>
              <TabsTrigger value="lista" className="text-xs h-6"><List className="h-3 w-3 mr-1" /> Lista</TabsTrigger>
              <TabsTrigger value="calendario" className="text-xs h-6"><CalendarIcon className="h-3 w-3 mr-1" /> Calendário</TabsTrigger>
              <TabsTrigger value="diarias" className="text-xs h-6"><Sparkles className="h-3 w-3 mr-1" /> Diárias</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-hidden">
        {t.loading && <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>}
        {!t.loading && t.projects.length === 0 && (
          <EmptyState onCreate={() => setProjectDialog({ open: true })} onTemplates={() => setTemplatesDialog(true)} />
        )}
        {!t.loading && activeProject && view === "kanban" && (
          <KanbanView
            project={activeProject}
            columns={t.columns}
            tasks={filteredTasks}
            onCreateTask={(columnId) => setTaskDialog({ open: true, defaultColumn: columnId, defaultProject: activeProject.id })}
            onEditTask={(task) => setTaskDialog({ open: true, task })}
            onMoveTask={t.moveTaskToColumn}
            onCreateColumn={() => t.createColumn(activeProject.id, "Nova coluna")}
            onDeleteColumn={(id) => { if (confirm("Excluir esta coluna? As tarefas ficarão soltas.")) t.deleteColumn(id); }}
            onRenameColumn={(id, name) => t.updateColumn(id, { name })}
          />
        )}
        {!t.loading && view === "lista" && (
          <ListView
            tasks={filteredTasks}
            projects={t.projects}
            leadOptions={leadOptions}
            search={search} onSearch={setSearch}
            filterStatus={filterStatus} onFilterStatus={setFilterStatus}
            filterPriority={filterPriority} onFilterPriority={setFilterPriority}
            filterProjectId={filterProjectId} onFilterProjectId={setFilterProjectId}
            filterLeadId={filterLeadId} onFilterLeadId={setFilterLeadId}
            hasActiveFilters={hasActiveFilters} onClearFilters={clearFilters}
            totalCount={t.tasks.length}
            onEdit={(task) => setTaskDialog({ open: true, task })}
            onToggle={t.toggleTaskDone}
            onDelete={t.deleteTask}
          />
        )}
        {!t.loading && view === "calendario" && (
          <CalendarView tasks={filteredTasks} onEdit={(task) => setTaskDialog({ open: true, task })} onCreate={(date) => setTaskDialog({ open: true, defaultProject: activeProject?.id, task: { due_at: date.toISOString() } as any })} />
        )}
        {!t.loading && view === "diarias" && (
          <DailyView tasks={filteredTasks} onEdit={(task) => setTaskDialog({ open: true, task })} onToggle={t.toggleTaskDone} onCreateDaily={(date) => setTaskDialog({ open: true, task: { is_daily: true, daily_date: format(date, "yyyy-MM-dd") } as any, defaultProject: activeProject?.id })} />
        )}
      </div>

      <TaskDialog state={taskDialog} onClose={() => setTaskDialog({ open: false })} t={t} />
      <ProjectDialog state={projectDialog} onClose={() => setProjectDialog({ open: false })} t={t} />
      <TemplatesDialog open={templatesDialog} onClose={() => setTemplatesDialog(false)} t={t} />
      <AutomationsDialog open={automationsDialog} onClose={() => setAutomationsDialog(false)} t={t} activeProject={activeProject} />
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color: "emerald" | "rose" | "violet" | "muted" }) {
  const cls = {
    emerald: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    rose: "bg-rose-500/10 text-rose-500 border-rose-500/20",
    violet: "bg-violet-500/10 text-violet-500 border-violet-500/20",
    muted: "bg-muted/50 text-muted-foreground border-border/40",
  }[color];
  return (
    <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium", cls)}>
      <span className="font-bold">{value}</span><span className="opacity-80">{label}</span>
    </div>
  );
}

function ProjectPicker({ projects, active, onChange, onNew, onEdit }: any) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          {active ? (
            <><div className="h-2 w-2 rounded-full" style={{ backgroundColor: active.color }} /><span className="font-semibold">{active.name}</span></>
          ) : (
            <><FolderOpen className="h-3.5 w-3.5" /><span>Selecionar projeto</span></>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {projects.map((p: TaskProject) => (
          <DropdownMenuItem key={p.id} onClick={() => onChange(p)} className="flex items-center gap-2 group">
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="flex-1 truncate">{p.name}</span>
            <Edit3 className="h-3 w-3 opacity-0 group-hover:opacity-60 hover:opacity-100" onClick={(e) => { e.stopPropagation(); onEdit(p); }} />
          </DropdownMenuItem>
        ))}
        {projects.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onClick={onNew}><Plus className="h-3 w-3 mr-2" /> Novo projeto</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EmptyState({ onCreate, onTemplates }: any) {
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-500/30">
          <Layers className="h-8 w-8 text-white" />
        </div>
        <h2 className="text-xl font-bold mb-2">Comece criando seu primeiro projeto</h2>
        <p className="text-sm text-muted-foreground mb-6">Organize tarefas em quadros Kanban, vincule a leads e automatize o que precisar.</p>
        <div className="flex gap-2 justify-center">
          <Button onClick={onCreate} className="bg-gradient-to-br from-violet-500 to-fuchsia-600">
            <Plus className="h-4 w-4 mr-1" /> Novo projeto
          </Button>
          <Button variant="outline" onClick={onTemplates}><Layers className="h-4 w-4 mr-1" /> Usar modelo</Button>
        </div>
      </div>
    </div>
  );
}

// =============== LIST VIEW ===============
function ListView({
  tasks, projects, leadOptions,
  search, onSearch,
  filterStatus, onFilterStatus,
  filterPriority, onFilterPriority,
  filterProjectId, onFilterProjectId,
  filterLeadId, onFilterLeadId,
  hasActiveFilters, onClearFilters, totalCount,
  onEdit, onToggle, onDelete,
}: any) {
  const grouped = useMemo(() => {
    const map = new Map<string, Task[]>();
    (tasks as Task[]).forEach((t) => {
      const k = t.project_id || "_orphans";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    });
    return Array.from(map.entries());
  }, [tasks]);

  const visibleCount = (tasks as Task[]).length;

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar de filtros dedicados da Lista */}
      <div className="px-4 py-3 border-b border-border/40 bg-muted/10 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar em título, descrição, lead ou tag..."
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              className="h-8 pl-8 pr-8 text-xs"
            />
            {search && (
              <button onClick={() => onSearch("")} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Select value={filterStatus} onValueChange={onFilterStatus}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Status: todos</SelectItem>
              <SelectItem value="todo">A fazer</SelectItem>
              <SelectItem value="doing">Em andamento</SelectItem>
              <SelectItem value="done">Concluídas</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterPriority} onValueChange={onFilterPriority}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><Flag className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Prioridade: todas</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterProjectId} onValueChange={onFilterProjectId}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><FolderOpen className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Projeto: todos</SelectItem>
              {projects.map((p: TaskProject) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                    {p.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterLeadId} onValueChange={onFilterLeadId}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><User className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Lead/Cliente: todos</SelectItem>
              {leadOptions.length === 0 && <SelectItem value="__none" disabled>Nenhum lead vinculado</SelectItem>}
              {leadOptions.map((l: { id: string; name: string }) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-8 text-xs text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3 mr-1" /> Limpar
            </Button>
          )}

          <div className="ml-auto text-[10px] text-muted-foreground font-medium">
            {visibleCount} de {totalCount} {totalCount === 1 ? "tarefa" : "tarefas"}
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6 max-w-4xl mx-auto">
          {grouped.map(([projId, items]) => {
            const proj = projects.find((p: TaskProject) => p.id === projId);
            return (
              <div key={projId}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: proj?.color || "#64748b" }} />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{proj?.name || "Sem projeto"}</span>
                  <Badge variant="secondary" className="h-4 text-[9px]">{items.length}</Badge>
                </div>
                <div className="space-y-1.5">
                  {items.map((t: Task) => (
                    <Card key={t.id} className="p-2.5 hover:shadow-md transition-all flex items-center gap-2.5 cursor-pointer group" onClick={() => onEdit(t)}>
                      <button onClick={(e) => { e.stopPropagation(); onToggle(t); }} className="shrink-0">
                        {t.status === "done" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-muted-foreground hover:text-emerald-500" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-medium truncate", t.status === "done" && "line-through opacity-60")}>{t.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                          {t.due_at && <span className={cn("flex items-center gap-0.5", isPast(parseISO(t.due_at)) && t.status !== "done" && "text-rose-500 font-semibold")}><Clock className="h-2.5 w-2.5" />{format(parseISO(t.due_at), "d MMM HH:mm", { locale: ptBR })}</span>}
                          {t.lead_name && <span className="flex items-center gap-0.5"><User className="h-2.5 w-2.5" />{t.lead_name}</span>}
                          {t.labels?.map((l) => <span key={l} className="px-1 rounded bg-primary/10 text-primary">{l}</span>)}
                        </div>
                      </div>
                      {t.priority !== "media" && <Flag className="h-3 w-3" style={{ color: t.priority === "urgente" ? "#f43f5e" : t.priority === "alta" ? "#f59e0b" : "#64748b" }} />}
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); if (confirm("Excluir tarefa?")) onDelete(t.id); }}>
                        <Trash2 className="h-3 w-3 text-rose-500" />
                      </Button>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
          {grouped.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {hasActiveFilters ? (
                <>
                  Nenhuma tarefa corresponde aos filtros.
                  <Button variant="link" onClick={onClearFilters} className="h-auto p-0 ml-1 text-xs">Limpar filtros</Button>
                </>
              ) : "Nenhuma tarefa encontrada"}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}


// =============== CALENDAR VIEW ===============
function CalendarView({ tasks, onEdit, onCreate }: any) {
  const [cursor, setCursor] = useState(new Date());
  const monthStart = startOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
  const days: Date[] = [];
  let d = gridStart; while (d <= gridEnd) { days.push(d); d = addDays(d, 1); }

  // Agrupa por dia: combina tarefas com due_at e tarefas diárias (daily_date)
  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    (tasks as Task[]).forEach((t) => {
      let k: string | null = null;
      if (t.is_daily && t.daily_date) {
        k = t.daily_date;
      } else if (t.due_at) {
        k = format(parseISO(t.due_at), "yyyy-MM-dd");
      }
      if (!k) return;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    });
    // Ordena cada dia: pendentes primeiro, depois por hora (due_at)
    map.forEach((list) => list.sort((a, b) => {
      if ((a.status === "done") !== (b.status === "done")) return a.status === "done" ? 1 : -1;
      const ta = a.due_at ? parseISO(a.due_at).getTime() : 0;
      const tb = b.due_at ? parseISO(b.due_at).getTime() : 0;
      return ta - tb;
    }));
    return map;
  }, [tasks]);

  const monthCount = useMemo(() => {
    let total = 0;
    days.forEach((day) => {
      if (!isSameMonth(day, cursor)) return;
      total += (tasksByDay.get(format(day, "yyyy-MM-dd")) || []).length;
    });
    return total;
  }, [days, tasksByDay, cursor]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-border/40">
        <Button variant="outline" size="sm" onClick={() => setCursor(subMonths(cursor, 1))} className="h-7 w-7 p-0"><ChevronLeft className="h-3 w-3" /></Button>
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold capitalize">{format(cursor, "MMMM 'de' yyyy", { locale: ptBR })}</h3>
          <Badge variant="secondary" className="h-5 text-[10px]">{monthCount} {monthCount === 1 ? "tarefa" : "tarefas"}</Badge>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setCursor(new Date())}>Hoje</Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCursor(addMonths(cursor, 1))} className="h-7 w-7 p-0"><ChevronRight className="h-3 w-3" /></Button>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-border/30 bg-muted/10 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-violet-500/60" />Com prazo</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-amber-500/60" />Diária</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-emerald-500/60" />Concluída</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-rose-500/60" />Atrasada</span>
        <span className="ml-auto opacity-70">Clique no dia para criar · Clique na tarefa para editar</span>
      </div>

      <div className="grid grid-cols-7 border-b border-border/30 bg-muted/20">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((w) => (
          <div key={w} className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center py-2">{w}</div>
        ))}
      </div>

      <div className="flex-1 grid grid-cols-7 grid-rows-6 overflow-auto">
        {days.map((day) => {
          const k = format(day, "yyyy-MM-dd");
          const dayTasks = tasksByDay.get(k) || [];
          const inMonth = isSameMonth(day, cursor);
          const today = isToday(day);
          return (
            <div
              key={k}
              onClick={() => onCreate(day)}
              className={cn(
                "relative border-r border-b border-border/20 p-1.5 flex flex-col gap-1 min-h-[96px] hover:bg-muted/30 transition-colors cursor-pointer group",
                !inMonth && "opacity-40 bg-muted/10"
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn("text-xs font-semibold inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded", today && "bg-violet-500 text-white")}>{format(day, "d")}</span>
                <Plus className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-70" />
              </div>
              <div className="space-y-0.5 overflow-hidden">
                {dayTasks.slice(0, 3).map((t) => {
                  const overdue = !t.is_daily && t.due_at && isPast(parseISO(t.due_at)) && t.status !== "done";
                  const tone = t.status === "done"
                    ? "bg-emerald-500/15 text-emerald-600 line-through"
                    : overdue
                    ? "bg-rose-500/15 text-rose-600 hover:bg-rose-500/25"
                    : t.is_daily
                    ? "bg-amber-500/15 text-amber-600 hover:bg-amber-500/25"
                    : "bg-violet-500/15 text-violet-600 hover:bg-violet-500/25";
                  return (
                    <div
                      key={t.id}
                      onClick={(e) => { e.stopPropagation(); onEdit(t); }}
                      title={`${t.title}${t.due_at && !t.is_daily ? " — " + format(parseISO(t.due_at), "HH:mm") : ""}`}
                      className={cn("text-[10px] px-1.5 py-0.5 rounded truncate cursor-pointer flex items-center gap-1", tone)}
                    >
                      {t.is_daily && <Sparkles className="h-2 w-2 shrink-0" />}
                      {!t.is_daily && t.due_at && <span className="opacity-70 shrink-0">{format(parseISO(t.due_at), "HH:mm")}</span>}
                      <span className="truncate">{t.title}</span>
                    </div>
                  );
                })}
                {dayTasks.length > 3 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onEdit(dayTasks[3]); }}
                    className="text-[9px] text-muted-foreground hover:text-foreground px-1 font-medium"
                  >
                    +{dayTasks.length - 3} mais
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// =============== DAILY VIEW ===============
function DailyView({ tasks, onEdit, onToggle, onCreateDaily }: any) {
  const [date, setDate] = useState(new Date());
  const dateStr = format(date, "yyyy-MM-dd");
  const dailyTasks = (tasks as Task[]).filter((t) => t.is_daily && t.daily_date === dateStr);
  const dueToday = (tasks as Task[]).filter((t) => !t.is_daily && t.due_at && isSameDay(parseISO(t.due_at), date));
  const all = [...dailyTasks, ...dueToday].sort((a, b) => (a.status === "done" ? 1 : -1));

  return (
    <ScrollArea className="h-full">
      <div className="max-w-2xl mx-auto p-6">
        <Card className="overflow-hidden border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5">
          <div className="p-4 border-b border-border/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDate(addDays(date, -1))}><ChevronLeft className="h-3.5 w-3.5" /></Button>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Tarefas do dia</p>
                <h3 className="text-lg font-bold capitalize">{format(date, "EEEE, d 'de' MMMM", { locale: ptBR })}</h3>
              </div>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDate(addDays(date, 1))}><ChevronRight className="h-3.5 w-3.5" /></Button>
              <Button variant="outline" size="sm" onClick={() => setDate(new Date())} className="h-7 text-[10px]">Hoje</Button>
            </div>
            <Button onClick={() => onCreateDaily(date)} size="sm" className="bg-gradient-to-br from-violet-500 to-fuchsia-600">
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
            </Button>
          </div>
          <div className="p-3 space-y-1.5">
            {all.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Nenhuma tarefa para este dia
              </div>
            )}
            {all.map((t) => (
              <Card key={t.id} className="p-3 flex items-center gap-3 cursor-pointer hover:shadow-md" onClick={() => onEdit(t)}>
                <button onClick={(e) => { e.stopPropagation(); onToggle(t); }}>
                  {t.status === "done" ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-medium", t.status === "done" && "line-through opacity-60")}>{t.title}</p>
                  {t.description && <p className="text-[11px] text-muted-foreground truncate">{t.description}</p>}
                </div>
                {t.is_daily && <Badge variant="outline" className="text-[9px] h-4 bg-violet-500/10 text-violet-500 border-violet-500/30">Diária</Badge>}
                {t.priority === "urgente" && <Flag className="h-3 w-3 text-rose-500" />}
              </Card>
            ))}
          </div>
        </Card>
      </div>
    </ScrollArea>
  );
}

// =============== TASK DIALOG ===============
function TaskDialog({ state, onClose, t }: any) {
  const editing = state.task && state.task.id;
  const [form, setForm] = useState<any>({});

  useMemo(() => {
    if (state.open) {
      if (editing) {
        const x = state.task;
        setForm({
          title: x.title,
          description: x.description || "",
          project_id: x.project_id,
          column_id: x.column_id,
          priority: x.priority,
          due_date: x.due_at ? format(parseISO(x.due_at), "yyyy-MM-dd") : "",
          due_time: x.due_at ? format(parseISO(x.due_at), "HH:mm") : "",
          labels: (x.labels || []).join(", "),
          lead_name: x.lead_name || "",
          lead_phone: x.lead_phone || "",
          checklist: x.checklist || [],
          is_daily: x.is_daily,
          daily_date: x.daily_date || "",
          estimated_minutes: x.estimated_minutes || "",
        });
      } else {
        const initialDue = state.task?.due_at ? parseISO(state.task.due_at) : null;
        setForm({
          title: "",
          description: "",
          project_id: state.defaultProject || null,
          column_id: state.defaultColumn || null,
          priority: "media",
          due_date: initialDue ? format(initialDue, "yyyy-MM-dd") : "",
          due_time: initialDue ? format(initialDue, "HH:mm") : "",
          labels: "",
          lead_name: "",
          lead_phone: "",
          checklist: [],
          is_daily: state.task?.is_daily || false,
          daily_date: state.task?.daily_date || "",
          estimated_minutes: "",
        });
      }
    }
  }, [state.open]);

  const projectColumns = useMemo(() => t.columns.filter((c: any) => c.project_id === form.project_id).sort((a: any, b: any) => a.position - b.position), [t.columns, form.project_id]);

  const save = async () => {
    if (!form.title?.trim()) return;
    const due_at = form.due_date ? new Date(`${form.due_date}T${form.due_time || "09:00"}:00`).toISOString() : null;
    const payload = {
      title: form.title.trim(),
      description: form.description || null,
      project_id: form.project_id || null,
      column_id: form.column_id || projectColumns[0]?.id || null,
      priority: form.priority,
      due_at,
      labels: form.labels ? form.labels.split(",").map((l: string) => l.trim()).filter(Boolean) : [],
      lead_name: form.lead_name || null,
      lead_phone: form.lead_phone || null,
      checklist: form.checklist,
      is_daily: form.is_daily,
      daily_date: form.is_daily ? (form.daily_date || format(new Date(), "yyyy-MM-dd")) : null,
      estimated_minutes: form.estimated_minutes ? Number(form.estimated_minutes) : null,
    };
    if (editing) await t.updateTask(state.task.id, payload);
    else await t.createTask(payload);
    onClose();
  };

  const addChecklistItem = () => setForm({ ...form, checklist: [...(form.checklist || []), { id: crypto.randomUUID(), text: "", done: false }] });
  const updateChecklistItem = (id: string, patch: any) => setForm({ ...form, checklist: form.checklist.map((c: any) => c.id === id ? { ...c, ...patch } : c) });
  const removeChecklistItem = (id: string) => setForm({ ...form, checklist: form.checklist.filter((c: any) => c.id !== id) });

  return (
    <Dialog open={state.open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
              <Layers className="h-4 w-4 text-white" />
            </div>
            {editing ? "Editar tarefa" : "Nova tarefa"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Input value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Título da tarefa" autoFocus className="text-base font-medium" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Projeto</Label>
              <Select value={form.project_id || ""} onValueChange={(v) => setForm({ ...form, project_id: v, column_id: null })}>
                <SelectTrigger><SelectValue placeholder="Sem projeto" /></SelectTrigger>
                <SelectContent>
                  {t.projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Coluna</Label>
              <Select value={form.column_id || ""} onValueChange={(v) => setForm({ ...form, column_id: v })} disabled={!form.project_id}>
                <SelectTrigger><SelectValue placeholder="A Fazer" /></SelectTrigger>
                <SelectContent>
                  {projectColumns.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Prioridade</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1"><AlignLeft className="h-3 w-3" /> Descrição</Label>
            <Textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Prazo (data)</Label>
              <Input type="date" value={form.due_date || ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Prazo (hora)</Label>
              <Input type="time" value={form.due_time || ""} onChange={(e) => setForm({ ...form, due_time: e.target.value })} />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Estimativa (min)</Label>
              <Input type="number" value={form.estimated_minutes || ""} onChange={(e) => setForm({ ...form, estimated_minutes: e.target.value })} placeholder="60" />
            </div>
          </div>

          <div>
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Tag className="h-3 w-3" /> Etiquetas (separe por vírgula)</Label>
            <Input value={form.labels || ""} onChange={(e) => setForm({ ...form, labels: e.target.value })} placeholder="urgente, cliente-A, design" />
          </div>

          <div className="rounded-lg border border-border/50 p-3 space-y-2 bg-muted/20">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> Lead vinculado</div>
            <div className="grid grid-cols-2 gap-2">
              <Input value={form.lead_name || ""} onChange={(e) => setForm({ ...form, lead_name: e.target.value })} placeholder="Nome do lead" />
              <Input value={form.lead_phone || ""} onChange={(e) => setForm({ ...form, lead_phone: e.target.value })} placeholder="Telefone" />
            </div>
          </div>

          <div className="rounded-lg border border-border/50 p-3 space-y-2 bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Checklist</div>
              <Button variant="ghost" size="sm" onClick={addChecklistItem} className="h-6 text-[10px]"><Plus className="h-3 w-3 mr-1" /> Item</Button>
            </div>
            <div className="space-y-1">
              {(form.checklist || []).map((c: any) => (
                <div key={c.id} className="flex items-center gap-2">
                  <button onClick={() => updateChecklistItem(c.id, { done: !c.done })}>
                    {c.done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                  <Input value={c.text} onChange={(e) => updateChecklistItem(c.id, { text: e.target.value })} placeholder="Sub-tarefa..." className={cn("h-7 text-xs", c.done && "line-through opacity-60")} />
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeChecklistItem(c.id)}><X className="h-3 w-3" /></Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-violet-500/20 p-3 bg-violet-500/5">
            <div>
              <div className="text-xs font-semibold flex items-center gap-1 text-violet-600 dark:text-violet-400"><Sparkles className="h-3 w-3" /> Tarefa diária</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Aparece na visão "Diárias" do dia escolhido</div>
            </div>
            <div className="flex items-center gap-2">
              {form.is_daily && <Input type="date" value={form.daily_date || ""} onChange={(e) => setForm({ ...form, daily_date: e.target.value })} className="h-7 text-xs w-36" />}
              <Switch checked={form.is_daily} onCheckedChange={(v) => setForm({ ...form, is_daily: v })} />
            </div>
          </div>
        </div>
        <DialogFooter className="flex sm:justify-between">
          <div>
            {editing && (
              <Button variant="outline" onClick={async () => { if (confirm("Excluir tarefa?")) { await t.deleteTask(state.task.id); onClose(); } }} className="text-rose-500 border-rose-500/30">
                <Trash2 className="h-4 w-4 mr-1" /> Excluir
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} className="bg-gradient-to-br from-violet-500 to-fuchsia-600">{editing ? "Salvar" : "Criar"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============== PROJECT DIALOG ===============
function ProjectDialog({ state, onClose, t }: any) {
  const editing = state.project;
  const [form, setForm] = useState<any>({});
  useMemo(() => {
    if (state.open) {
      if (editing) setForm({ name: editing.name, description: editing.description || "", color: editing.color, lead_name: editing.lead_name || "" });
      else setForm({ name: "", description: "", color: PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)], lead_name: "" });
    }
  }, [state.open]);

  const save = async () => {
    if (!form.name?.trim()) return;
    if (editing) await t.updateProject(editing.id, form);
    else await t.createProject(form);
    onClose();
  };

  return (
    <Dialog open={state.open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Editar projeto" : "Novo projeto"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Nome *</Label>
            <Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>
          <div>
            <Label className="text-xs">Descrição</Label>
            <Textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <div>
            <Label className="text-xs">Lead/Cliente vinculado</Label>
            <Input value={form.lead_name || ""} onChange={(e) => setForm({ ...form, lead_name: e.target.value })} placeholder="Opcional" />
          </div>
          <div>
            <Label className="text-xs">Cor</Label>
            <div className="flex gap-1.5 mt-1">
              {PROJECT_COLORS.map((c) => (
                <button key={c} onClick={() => setForm({ ...form, color: c })} className={cn("h-7 w-7 rounded-lg border-2 transition-all", form.color === c ? "border-foreground scale-110" : "border-transparent")} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="flex sm:justify-between">
          <div>
            {editing && (
              <Button variant="outline" onClick={async () => { if (confirm("Excluir projeto e todas as suas tarefas?")) { await t.deleteProject(editing.id); onClose(); } }} className="text-rose-500 border-rose-500/30">
                <Trash2 className="h-4 w-4 mr-1" /> Excluir
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} className="bg-gradient-to-br from-violet-500 to-fuchsia-600">{editing ? "Salvar" : "Criar"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============== TEMPLATES DIALOG ===============
const BUILTIN_TEMPLATES = [
  {
    name: "Onboarding de Cliente",
    icon: "user-plus", color: "#10b981",
    structure: {
      columns: [{ name: "A Fazer", color: "#64748b" }, { name: "Em Andamento", color: "#3b82f6" }, { name: "Concluído", color: "#10b981" }],
      tasks: [
        { title: "Reunião de kick-off", column_index: 0, priority: "alta" as const },
        { title: "Coletar materiais e acessos", column_index: 0, priority: "alta" as const },
        { title: "Configurar ambiente", column_index: 0, priority: "media" as const },
        { title: "Treinamento inicial", column_index: 0, priority: "media" as const },
        { title: "Apresentar plano de ação", column_index: 0, priority: "media" as const },
      ],
    },
  },
  {
    name: "Lançamento de Campanha",
    icon: "megaphone", color: "#f59e0b",
    structure: {
      columns: [{ name: "Briefing", color: "#64748b" }, { name: "Produção", color: "#3b82f6" }, { name: "Aprovação", color: "#f59e0b" }, { name: "Publicado", color: "#10b981" }],
      tasks: [
        { title: "Definir público-alvo", column_index: 0, priority: "alta" as const },
        { title: "Criar copy", column_index: 0, priority: "alta" as const },
        { title: "Design dos criativos", column_index: 0, priority: "alta" as const },
        { title: "Programar disparo", column_index: 0, priority: "media" as const },
        { title: "Acompanhar métricas", column_index: 0, priority: "media" as const },
      ],
    },
  },
  {
    name: "Sprint Semanal",
    icon: "zap", color: "#8b5cf6",
    structure: {
      columns: [{ name: "Backlog", color: "#64748b" }, { name: "Esta Semana", color: "#3b82f6" }, { name: "Em Revisão", color: "#f59e0b" }, { name: "Feito", color: "#10b981" }],
      tasks: [
        { title: "Reunião de planejamento", column_index: 1, priority: "alta" as const },
        { title: "Daily standup", column_index: 1, priority: "media" as const },
        { title: "Retrospectiva", column_index: 0, priority: "media" as const },
      ],
    },
  },
];

function TemplatesDialog({ open, onClose, t }: any) {
  const [creating, setCreating] = useState<any>(null);
  const [newName, setNewName] = useState("");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Layers className="h-5 w-5 text-violet-500" /> Modelos de projeto</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Modelos prontos</h4>
            <div className="grid grid-cols-3 gap-2">
              {BUILTIN_TEMPLATES.map((tpl) => (
                <Card key={tpl.name} className="p-3 hover:shadow-md transition-all cursor-pointer group" onClick={() => { setCreating(tpl); setNewName(tpl.name); }}>
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center mb-2" style={{ backgroundColor: `${tpl.color}20`, color: tpl.color }}>
                    <Layers className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-semibold">{tpl.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{tpl.structure.tasks.length} tarefas • {tpl.structure.columns.length} colunas</p>
                </Card>
              ))}
            </div>
          </div>

          {t.templates.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Meus modelos</h4>
              <div className="grid grid-cols-3 gap-2">
                {t.templates.map((tpl: any) => (
                  <Card key={tpl.id} className="p-3 hover:shadow-md transition-all group">
                    <div className="flex items-start justify-between">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center mb-2" style={{ backgroundColor: `${tpl.color || "#8b5cf6"}20`, color: tpl.color || "#8b5cf6" }}>
                        <Layers className="h-4 w-4" />
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => { if (confirm("Excluir modelo?")) t.deleteTemplate(tpl.id); }}><Trash2 className="h-3 w-3 text-rose-500" /></Button>
                    </div>
                    <p className="text-xs font-semibold cursor-pointer" onClick={() => { setCreating(tpl); setNewName(tpl.name); }}>{tpl.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Usado {tpl.uses_count}× • {tpl.structure?.tasks?.length || 0} tarefas</p>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>

        <Dialog open={!!creating} onOpenChange={(o) => !o && setCreating(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Aplicar modelo: {creating?.name}</DialogTitle></DialogHeader>
            <div className="py-2">
              <Label>Nome do novo projeto</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
              <p className="text-[11px] text-muted-foreground mt-2">Serão criados {creating?.structure?.columns?.length || 0} colunas e {creating?.structure?.tasks?.length || 0} tarefas.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreating(null)}>Cancelar</Button>
              <Button onClick={async () => { await t.applyTemplate(creating, newName); setCreating(null); onClose(); }} className="bg-gradient-to-br from-violet-500 to-fuchsia-600">Criar projeto</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

// =============== AUTOMATIONS DIALOG ===============
function AutomationsDialog({ open, onClose, t, activeProject }: any) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<any>({ name: "", trigger_type: "due_overdue", action_type: "set_priority", action_config: { priority: "urgente" } });

  const save = async () => {
    if (!form.name?.trim()) return;
    await t.createAutomation({ ...form, project_id: activeProject?.id || null });
    setCreating(false);
    setForm({ name: "", trigger_type: "due_overdue", action_type: "set_priority", action_config: { priority: "urgente" } });
  };

  const TRIGGER_LABELS: Record<string, string> = {
    due_overdue: "Quando o prazo vencer",
    task_completed: "Quando a tarefa for concluída",
    label_added: "Quando uma etiqueta for adicionada",
    column_changed: "Quando mudar de coluna",
  };
  const ACTION_LABELS: Record<string, string> = {
    move_to_column: "Mover para coluna",
    set_priority: "Definir prioridade",
    add_label: "Adicionar etiqueta",
    mark_done: "Marcar como concluída",
    notify: "Enviar notificação",
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-amber-500" /> Automações</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {!creating && (
            <>
              <Button onClick={() => setCreating(true)} className="w-full bg-gradient-to-br from-amber-500 to-orange-600"><Plus className="h-4 w-4 mr-1" /> Nova automação</Button>
              <div className="space-y-2">
                {t.automations.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <Zap className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    Nenhuma automação criada
                  </div>
                )}
                {t.automations.map((a: any) => (
                  <Card key={a.id} className="p-3 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center"><Zap className="h-4 w-4 text-amber-500" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{a.name}</p>
                      <p className="text-[10px] text-muted-foreground">{TRIGGER_LABELS[a.trigger_type]} → {ACTION_LABELS[a.action_type]}</p>
                    </div>
                    <Switch checked={a.enabled} onCheckedChange={(v) => t.updateAutomation(a.id, { enabled: v })} />
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm("Excluir automação?")) t.deleteAutomation(a.id); }}><Trash2 className="h-3 w-3 text-rose-500" /></Button>
                  </Card>
                ))}
              </div>
            </>
          )}
          {creating && (
            <Card className="p-4 space-y-3 border-amber-500/30 bg-amber-500/5">
              <div>
                <Label className="text-xs">Nome</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Marcar urgente quando vencer" autoFocus />
              </div>
              <div>
                <Label className="text-xs">Quando (gatilho)</Label>
                <Select value={form.trigger_type} onValueChange={(v) => setForm({ ...form, trigger_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TRIGGER_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Então (ação)</Label>
                <Select value={form.action_type} onValueChange={(v) => setForm({ ...form, action_type: v, action_config: {} })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACTION_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.action_type === "set_priority" && (
                <div>
                  <Label className="text-xs">Prioridade alvo</Label>
                  <Select value={form.action_config?.priority || "urgente"} onValueChange={(v) => setForm({ ...form, action_config: { priority: v } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baixa">Baixa</SelectItem>
                      <SelectItem value="media">Média</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="urgente">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.action_type === "move_to_column" && activeProject && (
                <div>
                  <Label className="text-xs">Coluna destino</Label>
                  <Select value={form.action_config?.column_id || ""} onValueChange={(v) => setForm({ ...form, action_config: { column_id: v } })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {t.columns.filter((c: any) => c.project_id === activeProject.id).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.action_type === "add_label" && (
                <div>
                  <Label className="text-xs">Etiqueta a adicionar</Label>
                  <Input value={form.action_config?.label || ""} onChange={(e) => setForm({ ...form, action_config: { label: e.target.value } })} placeholder="urgente" />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setCreating(false)}>Cancelar</Button>
                <Button onClick={save} className="bg-gradient-to-br from-amber-500 to-orange-600">Salvar</Button>
              </div>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
