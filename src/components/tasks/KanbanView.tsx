import { useMemo, useState } from "react";
import { Task, TaskColumn, TaskProject } from "@/hooks/useTasks";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Plus, MoreVertical, GripVertical, Calendar as CalendarIcon, User, Flag, CheckSquare, Trash2, Edit3 } from "lucide-react";
import { format, parseISO, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, closestCorners,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const PRIORITY_COLORS: Record<string, string> = {
  baixa: "bg-slate-500/15 text-slate-500",
  media: "bg-blue-500/15 text-blue-500",
  alta: "bg-amber-500/15 text-amber-500",
  urgente: "bg-rose-500/15 text-rose-500",
};

export function KanbanView({
  project, columns, tasks, onCreateTask, onEditTask, onMoveTask, onCreateColumn, onDeleteColumn, onRenameColumn,
}: {
  project: TaskProject;
  columns: TaskColumn[];
  tasks: Task[];
  onCreateTask: (columnId: string) => void;
  onEditTask: (task: Task) => void;
  onMoveTask: (taskId: string, newColumnId: string, newPosition: number) => void;
  onCreateColumn: () => void;
  onDeleteColumn: (id: string) => void;
  onRenameColumn: (id: string, name: string) => void;
}) {
  const [draggingTask, setDraggingTask] = useState<Task | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const cols = useMemo(() => columns.filter((c) => c.project_id === project.id).sort((a, b) => a.position - b.position), [columns, project]);
  const tasksByCol = useMemo(() => {
    const map = new Map<string, Task[]>();
    cols.forEach((c) => map.set(c.id, []));
    tasks.filter((t) => t.project_id === project.id && t.status !== "archived" && !t.parent_task_id).forEach((t) => {
      if (t.column_id && map.has(t.column_id)) map.get(t.column_id)!.push(t);
    });
    map.forEach((arr) => arr.sort((a, b) => a.position - b.position));
    return map;
  }, [cols, tasks, project]);

  const handleDragStart = (e: DragStartEvent) => {
    const task = tasks.find((t) => t.id === e.active.id);
    setDraggingTask(task || null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setDraggingTask(null);
    const { active, over } = e;
    if (!over) return;
    const taskId = active.id as string;
    const overId = over.id as string;
    // dropped over a column
    const overCol = cols.find((c) => c.id === overId);
    if (overCol) {
      const list = tasksByCol.get(overCol.id) || [];
      onMoveTask(taskId, overCol.id, list.length);
      return;
    }
    // dropped over a task
    const overTask = tasks.find((t) => t.id === overId);
    if (overTask && overTask.column_id) {
      const list = tasksByCol.get(overTask.column_id) || [];
      const overIdx = list.findIndex((t) => t.id === overTask.id);
      onMoveTask(taskId, overTask.column_id, overIdx);
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 h-full overflow-x-auto p-4">
        {cols.map((col) => {
          const colTasks = tasksByCol.get(col.id) || [];
          return (
            <KanbanColumn
              key={col.id}
              column={col}
              tasks={colTasks}
              onAdd={() => onCreateTask(col.id)}
              onDelete={() => onDeleteColumn(col.id)}
              onRename={(name) => onRenameColumn(col.id, name)}
              onEditTask={onEditTask}
            />
          );
        })}
        <div className="shrink-0 w-72">
          <Button variant="outline" onClick={onCreateColumn} className="w-full h-12 border-dashed text-muted-foreground hover:text-foreground">
            <Plus className="h-4 w-4 mr-1" /> Adicionar coluna
          </Button>
        </div>
      </div>
      <DragOverlay>
        {draggingTask ? <TaskCard task={draggingTask} onClick={() => {}} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({ column, tasks, onAdd, onDelete, onRename, onEditTask }: any) {
  const { setNodeRef } = useSortable({ id: column.id });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(column.name);
  const wipExceeded = column.wip_limit && tasks.length > column.wip_limit;

  return (
    <div ref={setNodeRef} className="shrink-0 w-72 flex flex-col bg-muted/30 rounded-lg border border-border/40 max-h-full">
      <div className="p-3 border-b border-border/30 flex items-center gap-2">
        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: column.color }} />
        {editing ? (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { onRename(name); setEditing(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { onRename(name); setEditing(false); } }}
            autoFocus
            className="h-6 text-xs"
          />
        ) : (
          <button onClick={() => setEditing(true)} className="text-xs font-bold uppercase tracking-wider flex-1 text-left hover:text-primary truncate">
            {column.name}
          </button>
        )}
        <Badge variant="secondary" className={cn("h-5 text-[10px] px-1.5", wipExceeded && "bg-rose-500/15 text-rose-500")}>
          {tasks.length}{column.wip_limit ? `/${column.wip_limit}` : ""}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6"><MoreVertical className="h-3 w-3" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditing(true)}><Edit3 className="h-3 w-3 mr-2" /> Renomear</DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-rose-500"><Trash2 className="h-3 w-3 mr-2" /> Excluir</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        <SortableContext items={tasks.map((t: Task) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t: Task) => <SortableTaskCard key={t.id} task={t} onClick={() => onEditTask(t)} />)}
        </SortableContext>
        <Button variant="ghost" size="sm" onClick={onAdd} className="w-full justify-start text-muted-foreground text-xs h-8">
          <Plus className="h-3 w-3 mr-1" /> Nova tarefa
        </Button>
      </div>
    </div>
  );
}

function SortableTaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }} {...attributes} {...listeners}>
      <TaskCard task={task} onClick={onClick} />
    </div>
  );
}

export function TaskCard({ task, onClick, dragging }: { task: Task; onClick: () => void; dragging?: boolean }) {
  const overdue = task.due_at && isPast(parseISO(task.due_at)) && task.status !== "done";
  const checklistDone = task.checklist?.filter((c) => c.done).length || 0;
  const checklistTotal = task.checklist?.length || 0;
  return (
    <Card
      onClick={onClick}
      className={cn(
        "p-2.5 cursor-pointer hover:shadow-md transition-all bg-card border-border/40 group",
        dragging && "shadow-2xl rotate-2",
        task.status === "done" && "opacity-60"
      )}
    >
      <div className="flex items-start gap-1.5">
        <GripVertical className="h-3 w-3 text-muted-foreground/40 mt-0.5 opacity-0 group-hover:opacity-100" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-start gap-1.5">
            <p className={cn("text-xs font-medium leading-snug flex-1", task.status === "done" && "line-through")}>{task.title}</p>
            {task.priority !== "media" && <Flag className="h-2.5 w-2.5 mt-0.5 shrink-0" style={{ color: task.priority === "urgente" ? "#f43f5e" : task.priority === "alta" ? "#f59e0b" : "#64748b" }} />}
          </div>
          {task.labels?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {task.labels.slice(0, 3).map((l) => (
                <span key={l} className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{l}</span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
            {task.due_at && (
              <span className={cn("flex items-center gap-0.5", overdue && "text-rose-500 font-semibold")}>
                <CalendarIcon className="h-2.5 w-2.5" />
                {format(parseISO(task.due_at), isToday(parseISO(task.due_at)) ? "'Hoje' HH:mm" : "d MMM", { locale: ptBR })}
              </span>
            )}
            {checklistTotal > 0 && (
              <span className="flex items-center gap-0.5">
                <CheckSquare className="h-2.5 w-2.5" /> {checklistDone}/{checklistTotal}
              </span>
            )}
            {task.lead_name && (
              <span className="flex items-center gap-0.5 truncate">
                <User className="h-2.5 w-2.5" /> {task.lead_name}
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
