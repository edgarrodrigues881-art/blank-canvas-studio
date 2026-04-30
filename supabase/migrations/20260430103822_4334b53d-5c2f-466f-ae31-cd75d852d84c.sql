UPDATE public.autosave_schedules
SET pause_every_min = 0, pause_every_max = 0, pause_duration_min = 0, pause_duration_max = 0
WHERE pause_every_min >= 999999 OR pause_every_max >= 999999;