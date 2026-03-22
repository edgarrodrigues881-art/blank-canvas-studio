
ALTER TABLE public.group_join_campaigns 
  ADD COLUMN IF NOT EXISTS description text DEFAULT '',
  ADD COLUMN IF NOT EXISTS pause_every integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS pause_duration integer DEFAULT 180;
