UPDATE public.autosave_schedules
SET status = 'paused', updated_at = now()
WHERE status = 'running';