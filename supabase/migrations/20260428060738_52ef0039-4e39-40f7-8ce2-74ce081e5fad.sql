
-- PROJETOS
CREATE TABLE public.task_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#8b5cf6',
  icon TEXT DEFAULT 'folder',
  lead_id UUID,
  lead_name TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_view_own_projects" ON public.task_projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_projects" ON public.task_projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_projects" ON public.task_projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_projects" ON public.task_projects FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER update_task_projects_updated_at BEFORE UPDATE ON public.task_projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- COLUNAS
CREATE TABLE public.task_columns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID REFERENCES public.task_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  position INTEGER NOT NULL DEFAULT 0,
  is_done_column BOOLEAN NOT NULL DEFAULT false,
  wip_limit INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_view_own_columns" ON public.task_columns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_columns" ON public.task_columns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_columns" ON public.task_columns FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_columns" ON public.task_columns FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_task_columns_project ON public.task_columns(project_id, position);

-- TAREFAS
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID REFERENCES public.task_projects(id) ON DELETE SET NULL,
  column_id UUID REFERENCES public.task_columns(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo', -- todo, doing, done, archived
  priority TEXT NOT NULL DEFAULT 'media', -- baixa, media, alta, urgente
  due_at TIMESTAMPTZ,
  start_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  position INTEGER NOT NULL DEFAULT 0,
  labels TEXT[] DEFAULT ARRAY[]::TEXT[],
  lead_id UUID,
  lead_name TEXT,
  lead_phone TEXT,
  checklist JSONB DEFAULT '[]'::jsonb, -- [{id, text, done}]
  estimated_minutes INTEGER,
  actual_minutes INTEGER,
  is_daily BOOLEAN NOT NULL DEFAULT false,
  daily_date DATE, -- if is_daily, the date this daily task belongs to
  recurrence JSONB, -- {type: 'daily'|'weekly'|'monthly', days: [], until: date}
  parent_task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE, -- for subtasks
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_view_own_tasks" ON public.tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_tasks" ON public.tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_tasks" ON public.tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_tasks" ON public.tasks FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_tasks_user_project ON public.tasks(user_id, project_id);
CREATE INDEX idx_tasks_user_due ON public.tasks(user_id, due_at) WHERE status != 'done';
CREATE INDEX idx_tasks_user_daily ON public.tasks(user_id, daily_date) WHERE is_daily = true;
CREATE INDEX idx_tasks_lead ON public.tasks(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_tasks_column ON public.tasks(column_id, position);
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- TEMPLATES
CREATE TABLE public.task_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'layers',
  color TEXT DEFAULT '#8b5cf6',
  structure JSONB NOT NULL DEFAULT '{"columns":[],"tasks":[]}'::jsonb,
  uses_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_view_own_templates" ON public.task_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_templates" ON public.task_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_templates" ON public.task_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_templates" ON public.task_templates FOR DELETE USING (auth.uid() = user_id);

-- AUTOMAÇÕES
CREATE TABLE public.task_automations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID REFERENCES public.task_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  trigger_type TEXT NOT NULL, -- due_overdue, task_completed, label_added, column_changed
  trigger_config JSONB DEFAULT '{}'::jsonb,
  action_type TEXT NOT NULL, -- move_to_column, set_priority, add_label, mark_done, notify
  action_config JSONB DEFAULT '{}'::jsonb,
  last_run_at TIMESTAMPTZ,
  runs_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_view_own_automations" ON public.task_automations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_automations" ON public.task_automations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_automations" ON public.task_automations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_automations" ON public.task_automations FOR DELETE USING (auth.uid() = user_id);
