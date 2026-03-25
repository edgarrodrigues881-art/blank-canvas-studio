ALTER TABLE public.mass_inject_campaigns
ADD COLUMN IF NOT EXISTS last_event text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_event_at timestamptz DEFAULT NULL;