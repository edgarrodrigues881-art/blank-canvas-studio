ALTER TABLE public.status_schedules
  ADD COLUMN IF NOT EXISTS schedule_mode TEXT NOT NULL DEFAULT 'recurring',
  ADD COLUMN IF NOT EXISTS run_date DATE;

-- Garante que valores válidos existam
UPDATE public.status_schedules SET schedule_mode = 'recurring' WHERE schedule_mode IS NULL;