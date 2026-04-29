-- Folders for status schedules (visual organization only)
CREATE TABLE IF NOT EXISTS public.status_schedule_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#25D366',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.status_schedule_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own status folders"
  ON public.status_schedule_folders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own status folders"
  ON public.status_schedule_folders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own status folders"
  ON public.status_schedule_folders FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own status folders"
  ON public.status_schedule_folders FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_status_schedule_folders_updated_at
  BEFORE UPDATE ON public.status_schedule_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_status_schedule_folders_user
  ON public.status_schedule_folders(user_id, position);

-- Link schedules to folders (nullable = avulso)
ALTER TABLE public.status_schedules
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.status_schedule_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_status_schedules_folder
  ON public.status_schedules(folder_id);