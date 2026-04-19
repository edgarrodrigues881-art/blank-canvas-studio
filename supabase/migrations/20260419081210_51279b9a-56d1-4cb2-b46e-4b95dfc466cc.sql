ALTER TABLE public.autosave_schedules
  ADD COLUMN IF NOT EXISTS weekdays JSONB NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,
  ADD COLUMN IF NOT EXISTS time_of_day TEXT NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS last_run_date DATE;

ALTER TABLE public.autosave_schedules ALTER COLUMN scheduled_at DROP NOT NULL;