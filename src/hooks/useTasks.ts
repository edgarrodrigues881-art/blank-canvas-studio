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
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchAll]);

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
    return data;
  };

  const updateTask = async (id: string, patch: Partial<Task>) => {
    const { error } = await supabase.from("tasks" as any).update(patch as any).eq("id", id);
    if (error) toast.error("Erro ao atualizar tarefa");
  };

  const deleteTask = async (id: string) => {
    const { error } = await supabase.from("tasks" as any).delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir tarefa"); return false; }
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
    await supabase.from("tasks" as any).update({
      column_id: columnId,
      position: newPosition,
      status: newStatus,
      completed_at: col?.is_done_column ? new Date().toISOString() : null,
    } as any).eq("id", taskId);
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
    projects, columns, tasks, templates, automations, loading, fetchAll,
    createProject, updateProject, deleteProject,
    createColumn, updateColumn, deleteColumn,
    createTask, updateTask, deleteTask, toggleTaskDone, moveTaskToColumn,
    createTemplate, deleteTemplate, applyTemplate,
    createAutomation, updateAutomation, deleteAutomation,
  };
}
