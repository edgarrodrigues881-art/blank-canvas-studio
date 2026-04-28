import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export type TaskStatus = "todo" | "doing" | "done" | "archived";
export type TaskPriority = "baixa" | "media" | "alta" | "urgente";

export interface TaskProject {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  lead_id: string | null;
  lead_name: string | null;
  archived: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface TaskColumn {
  id: string;
  user_id: string;
  project_id: string | null;
  name: string;
  color: string;
  position: number;
  is_done_column: boolean;
  wip_limit: number | null;
}

export interface ChecklistItem { id: string; text: string; done: boolean; }

export interface Task {
  id: string;
  user_id: string;
  project_id: string | null;
  column_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  start_at: string | null;
  completed_at: string | null;
  position: number;
  labels: string[];
  lead_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  checklist: ChecklistItem[];
  estimated_minutes: number | null;
  actual_minutes: number | null;
  is_daily: boolean;
  daily_date: string | null;
  recurrence: any;
  parent_task_id: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
}

export interface TaskTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  structure: { columns: { name: string; color: string }[]; tasks: { title: string; column_index: number; priority?: TaskPriority; description?: string }[] };
  uses_count: number;
  created_at: string;
}

export interface TaskAutomation {
  id: string;
  user_id: string;
  project_id: string | null;
  name: string;
  enabled: boolean;
  trigger_type: string;
  trigger_config: any;
  action_type: string;
  action_config: any;
  last_run_at: string | null;
  runs_count: number;
}

export interface TaskHistoryEntry {
  id: string;
  user_id: string;
  task_id: string | null;
  project_id: string | null;
  automation_id: string | null;
  event_type: string;
  description: string;
  task_title: string | null;
  from_value: any;
  to_value: any;
  metadata: any;
  created_at: string;
}

export function useTasks() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<TaskProject[]>([]);
  const [columns, setColumns] = useState<TaskColumn[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [automations, setAutomations] = useState<TaskAutomation[]>([]);
  const [history, setHistory] = useState<TaskHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [p, c, t, tp, a, h] = await Promise.all([
      supabase.from("task_projects" as any).select("*").eq("user_id", user.id).order("position"),
      supabase.from("task_columns" as any).select("*").eq("user_id", user.id).order("position"),
      supabase.from("tasks" as any).select("*").eq("user_id", user.id).order("position"),
      supabase.from("task_templates" as any).select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("task_automations" as any).select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("task_history" as any).select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
    ]);
    setProjects((p.data as any) || []);
    setColumns((c.data as any) || []);
    setTasks((t.data as any) || []);
    setTemplates((tp.data as any) || []);
    setAutomations((a.data as any) || []);
    setHistory((h.data as any) || []);
    setLoading(false);
  }, [user]);

  const logHistory = useCallback(async (entry: Partial<TaskHistoryEntry> & { event_type: string; description: string }) => {
    if (!user) return;
    await supabase.from("task_history" as any).insert({
      user_id: user.id,
      ...entry,
    } as any);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("tasks_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${user.id}` }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "task_projects", filter: `user_id=eq.${user.id}` }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "task_columns", filter: `user_id=eq.${user.id}` }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "task_history", filter: `user_id=eq.${user.id}` }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchAll]);

  // ============ AUTOMATION ENGINE ============
  // Runs after a task mutation. Triggers supported:
  //  - task_completed: when status becomes "done"
  //  - column_changed: when column_id changes (optional from_column_id / to_column_id in trigger_config)
  //  - label_added: when a new label is added (optional label in trigger_config)
  //  - due_overdue: when task has past due_at and not done
  // Actions supported:
  //  - move_to_column { column_id }
  //  - set_priority { priority }
  //  - add_label { label }
  //  - mark_done {}
  //  - notify { message? }
  const runAutomations = useCallback(async (
    triggerType: "task_completed" | "column_changed" | "label_added" | "due_overdue",
    task: Task,
    context: { previousTask?: Task | null; addedLabels?: string[] } = {}
  ) => {
    if (!user) return;
    const matching = automations.filter((a) => {
      if (!a.enabled) return false;
      if (a.trigger_type !== triggerType) return false;
      if (a.project_id && a.project_id !== task.project_id) return false;
      const cfg = a.trigger_config || {};
      if (triggerType === "column_changed") {
        if (cfg.from_column_id && context.previousTask?.column_id !== cfg.from_column_id) return false;
        if (cfg.to_column_id && task.column_id !== cfg.to_column_id) return false;
      }
      if (triggerType === "label_added" && cfg.label) {
        if (!(context.addedLabels || []).includes(cfg.label)) return false;
      }
      return true;
    });

    for (const auto of matching) {
      const cfg = auto.action_config || {};
      const patch: Partial<Task> = {};
      let actionDesc = "";
      switch (auto.action_type) {
        case "move_to_column": {
          if (!cfg.column_id || cfg.column_id === task.column_id) continue;
          const targetCol = columns.find((c) => c.id === cfg.column_id);
          patch.column_id = cfg.column_id;
          if (targetCol?.is_done_column) {
            patch.status = "done";
            patch.completed_at = new Date().toISOString();
          }
          actionDesc = `movida para coluna "${targetCol?.name || "—"}"`;
          break;
        }
        case "set_priority": {
          if (!cfg.priority || cfg.priority === task.priority) continue;
          patch.priority = cfg.priority;
          actionDesc = `prioridade definida como "${cfg.priority}"`;
          break;
        }
        case "add_label": {
          if (!cfg.label) continue;
          const existing = task.labels || [];
          if (existing.includes(cfg.label)) continue;
          patch.labels = [...existing, cfg.label];
          actionDesc = `etiqueta "${cfg.label}" adicionada`;
          break;
        }
        case "mark_done": {
          if (task.status === "done") continue;
          patch.status = "done";
          patch.completed_at = new Date().toISOString();
          actionDesc = `marcada como concluída`;
          break;
        }
        case "notify": {
          actionDesc = cfg.message || `notificação disparada`;
          toast.info(`⚡ ${auto.name}`, { description: `${task.title}: ${actionDesc}` });
          break;
        }
      }

      if (Object.keys(patch).length > 0) {
        await supabase.from("tasks" as any).update(patch as any).eq("id", task.id);
      }
      await supabase.from("task_automations" as any).update({
        runs_count: (auto.runs_count || 0) + 1,
        last_run_at: new Date().toISOString(),
      } as any).eq("id", auto.id);
      await logHistory({
        task_id: task.id,
        project_id: task.project_id,
        automation_id: auto.id,
        event_type: "automation_run",
        description: `Automação "${auto.name}" → ${actionDesc}`,
        task_title: task.title,
        from_value: null,
        to_value: patch as any,
      });
    }
  }, [user, automations, columns, logHistory]);

  // PROJECT
  const createProject = async (input: Partial<TaskProject> & { name: string }) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("task_projects" as any)
      .insert({ user_id: user.id, position: projects.length, ...input } as any)
      .select().single();
    if (error) { toast.error("Erro ao criar projeto"); return null; }
    // Default columns
    const defaults = [
      { name: "A Fazer", color: "#64748b", position: 0, is_done_column: false },
      { name: "Em Andamento", color: "#3b82f6", position: 1, is_done_column: false },
      { name: "Concluído", color: "#10b981", position: 2, is_done_column: true },
    ];
    await supabase.from("task_columns" as any).insert(
      defaults.map((d) => ({ ...d, user_id: user.id, project_id: (data as any).id }))
    );
    toast.success("Projeto criado");
    return data;
  };

  const updateProject = async (id: string, patch: Partial<TaskProject>) => {
    const { error } = await supabase.from("task_projects" as any).update(patch as any).eq("id", id);
    if (error) toast.error("Erro ao atualizar projeto");
  };

  const deleteProject = async (id: string) => {
    const { error } = await supabase.from("task_projects" as any).delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return false; }
    toast.success("Projeto excluído"); return true;
  };

  // COLUMN
  const createColumn = async (project_id: string, name: string, color = "#64748b") => {
    if (!user) return;
    const projCols = columns.filter((c) => c.project_id === project_id);
    await supabase.from("task_columns" as any).insert({
      user_id: user.id, project_id, name, color, position: projCols.length,
    } as any);
  };
  const updateColumn = async (id: string, patch: Partial<TaskColumn>) => {
    await supabase.from("task_columns" as any).update(patch as any).eq("id", id);
  };
  const deleteColumn = async (id: string) => {
    await supabase.from("task_columns" as any).delete().eq("id", id);
  };

  // TASK
  const createTask = async (input: Partial<Task> & { title: string }) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("tasks" as any)
      .insert({ user_id: user.id, ...input } as any)
      .select().single();
    if (error) { toast.error("Erro ao criar tarefa: " + error.message); return null; }
    await logHistory({
      task_id: (data as any).id,
      project_id: (data as any).project_id,
      event_type: "task_created",
      description: `Tarefa criada: "${(data as any).title}"`,
      task_title: (data as any).title,
    });
    return data;
  };

  const updateTask = async (id: string, patch: Partial<Task>) => {
    const previous = tasks.find((x) => x.id === id) || null;
    const { data, error } = await supabase
      .from("tasks" as any).update(patch as any).eq("id", id).select().single();
    if (error) { toast.error("Erro ao atualizar tarefa"); return; }
    const updated = data as unknown as Task;

    // Log status change
    if (previous && patch.status && previous.status !== patch.status) {
      await logHistory({
        task_id: id,
        project_id: updated.project_id,
        event_type: "status_changed",
        description: `Status: "${previous.status}" → "${patch.status}"`,
        task_title: updated.title,
        from_value: { status: previous.status },
        to_value: { status: patch.status },
      });
      if (patch.status === "done") {
        await runAutomations("task_completed", updated, { previousTask: previous });
      }
    }
    // Log column change
    if (previous && patch.column_id !== undefined && previous.column_id !== patch.column_id) {
      const fromCol = columns.find((c) => c.id === previous.column_id);
      const toCol = columns.find((c) => c.id === patch.column_id);
      await logHistory({
        task_id: id,
        project_id: updated.project_id,
        event_type: "column_changed",
        description: `Movida de "${fromCol?.name || "—"}" para "${toCol?.name || "—"}"`,
        task_title: updated.title,
        from_value: { column_id: previous.column_id },
        to_value: { column_id: patch.column_id },
      });
      await runAutomations("column_changed", updated, { previousTask: previous });
    }
    // Log priority change
    if (previous && patch.priority && previous.priority !== patch.priority) {
      await logHistory({
        task_id: id,
        project_id: updated.project_id,
        event_type: "priority_changed",
        description: `Prioridade: "${previous.priority}" → "${patch.priority}"`,
        task_title: updated.title,
      });
    }
    // Log label additions
    if (previous && patch.labels) {
      const added = (patch.labels || []).filter((l) => !(previous.labels || []).includes(l));
      if (added.length > 0) {
        await logHistory({
          task_id: id,
          project_id: updated.project_id,
          event_type: "label_added",
          description: `Etiqueta(s) adicionada(s): ${added.join(", ")}`,
          task_title: updated.title,
          to_value: { labels: added },
        });
        await runAutomations("label_added", updated, { previousTask: previous, addedLabels: added });
      }
    }
  };

  const deleteTask = async (id: string) => {
    const previous = tasks.find((x) => x.id === id) || null;
    const { error } = await supabase.from("tasks" as any).delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir tarefa"); return false; }
    if (previous) {
      await logHistory({
        task_id: null,
        project_id: previous.project_id,
        event_type: "task_deleted",
        description: `Tarefa excluída: "${previous.title}"`,
        task_title: previous.title,
      });
    }
    return true;
  };

  const toggleTaskDone = async (task: Task) => {
    const isDone = task.status === "done";
    await updateTask(task.id, {
      status: isDone ? "todo" : "done",
      completed_at: isDone ? null : new Date().toISOString(),
    });
  };

  const moveTaskToColumn = async (taskId: string, columnId: string, newPosition: number) => {
    const col = columns.find((c) => c.id === columnId);
    const newStatus: TaskStatus = col?.is_done_column ? "done" : "todo";
    await updateTask(taskId, {
      column_id: columnId,
      position: newPosition,
      status: newStatus,
      completed_at: col?.is_done_column ? new Date().toISOString() : null,
    });
  };

  // TEMPLATE
  const createTemplate = async (input: Partial<TaskTemplate> & { name: string }) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("task_templates" as any)
      .insert({ user_id: user.id, ...input } as any)
      .select().single();
    if (error) { toast.error("Erro ao criar modelo"); return null; }
    toast.success("Modelo criado");
    return data;
  };

  const deleteTemplate = async (id: string) => {
    await supabase.from("task_templates" as any).delete().eq("id", id);
    toast.success("Modelo excluído");
  };

  const applyTemplate = async (template: TaskTemplate, projectName: string) => {
    if (!user) return null;
    const proj = await createProject({ name: projectName, color: template.color || "#8b5cf6", icon: template.icon || "layers" });
    if (!proj) return null;
    // wait briefly for default columns; replace them with template columns
    await supabase.from("task_columns" as any).delete().eq("project_id", (proj as any).id);
    const cols = template.structure.columns || [];
    const insertedCols: any[] = [];
    for (let i = 0; i < cols.length; i++) {
      const { data: c } = await supabase.from("task_columns" as any).insert({
        user_id: user.id, project_id: (proj as any).id, name: cols[i].name, color: cols[i].color, position: i, is_done_column: i === cols.length - 1,
      } as any).select().single();
      insertedCols.push(c);
    }
    const tasksToInsert = (template.structure.tasks || []).map((t, idx) => ({
      user_id: user.id,
      project_id: (proj as any).id,
      column_id: insertedCols[t.column_index]?.id || insertedCols[0]?.id,
      title: t.title,
      description: t.description || null,
      priority: t.priority || "media",
      position: idx,
    }));
    if (tasksToInsert.length) await supabase.from("tasks" as any).insert(tasksToInsert as any);
    await supabase.from("task_templates" as any).update({ uses_count: (template.uses_count || 0) + 1 } as any).eq("id", template.id);
    toast.success(`Modelo aplicado: ${tasksToInsert.length} tarefas criadas`);
    return proj;
  };

  // AUTOMATION
  const createAutomation = async (input: Partial<TaskAutomation> & { name: string; trigger_type: string; action_type: string }) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("task_automations" as any)
      .insert({ user_id: user.id, enabled: true, ...input } as any)
      .select().single();
    if (error) { toast.error("Erro ao criar automação"); return null; }
    toast.success("Automação criada");
    return data;
  };
  const updateAutomation = async (id: string, patch: Partial<TaskAutomation>) => {
    await supabase.from("task_automations" as any).update(patch as any).eq("id", id);
  };
  const deleteAutomation = async (id: string) => {
    await supabase.from("task_automations" as any).delete().eq("id", id);
    toast.success("Automação removida");
  };

  return {
    projects, columns, tasks, templates, automations, history, loading, fetchAll,
    createProject, updateProject, deleteProject,
    createColumn, updateColumn, deleteColumn,
    createTask, updateTask, deleteTask, toggleTaskDone, moveTaskToColumn,
    createTemplate, deleteTemplate, applyTemplate,
    createAutomation, updateAutomation, deleteAutomation,
  };
}
