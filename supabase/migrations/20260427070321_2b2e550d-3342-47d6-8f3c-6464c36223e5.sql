CREATE TABLE public.status_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  type TEXT NOT NULL CHECK (type IN ('text','image','video','audio')),
  text_content TEXT,
  media_url TEXT,
  caption TEXT,
  background_color TEXT,
  font INTEGER,
  weekdays INTEGER[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6],
  times TEXT[] NOT NULL DEFAULT ARRAY['09:00'],
  device_mode TEXT NOT NULL DEFAULT 'all_online' CHECK (device_mode IN ('all_online','fixed')),
  device_ids UUID[] NOT NULL DEFAULT '{}',
  last_run_at TIMESTAMPTZ,
  last_run_key TEXT,
  run_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_status_schedules_user ON public.status_schedules(user_id, created_at DESC);
CREATE INDEX idx_status_schedules_enabled ON public.status_schedules(enabled) WHERE enabled = true;

ALTER TABLE public.status_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own schedules" ON public.status_schedules FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own schedules" ON public.status_schedules FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own schedules" ON public.status_schedules FOR UPDATE
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users delete own schedules" ON public.status_schedules FOR DELETE
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_status_schedules_updated_at
BEFORE UPDATE ON public.status_schedules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.status_posts ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES public.status_schedules(id) ON DELETE SET NULL;