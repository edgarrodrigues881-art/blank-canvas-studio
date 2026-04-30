UPDATE public.autosave_schedules
SET status = 'scheduled',
    last_error = NULL,
    last_run_date = NULL,
    started_at = NULL,
    updated_at = now()
WHERE id = '1f21454c-5963-48ee-b1e6-0d31a385bd60';