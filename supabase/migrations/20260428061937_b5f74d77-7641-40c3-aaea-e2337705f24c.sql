
CREATE TABLE IF NOT EXISTS public.task_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.task_projects(id) ON DELETE SET NULL,
  automation_id UUID REFERENCES public.task_automations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  task_title TEXT,
  from_value JSONB,
  to_value JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_history_user ON public.task_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_history_task ON public.task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_history_project ON public.task_history(project_id);

ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "th_select_own" ON public.task_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "th_insert_own" ON public.task_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "th_delete_own" ON public.task_history FOR DELETE USING (auth.uid() = user_id);
