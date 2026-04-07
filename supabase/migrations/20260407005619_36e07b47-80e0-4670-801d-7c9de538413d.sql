ALTER TABLE public.group_interactions ADD COLUMN IF NOT EXISTS start_hour_2 TEXT DEFAULT NULL;
ALTER TABLE public.group_interactions ADD COLUMN IF NOT EXISTS end_hour_2 TEXT DEFAULT NULL;