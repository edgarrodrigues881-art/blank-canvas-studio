CREATE TABLE public.mass_inject_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.mass_inject_campaigns(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_level text NOT NULL DEFAULT 'info',
  message text,
  consumed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mass_inject_events_unconsumed 
  ON public.mass_inject_events (campaign_id, consumed, created_at) 
  WHERE consumed = false;

ALTER TABLE public.mass_inject_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own campaign events"
  ON public.mass_inject_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.mass_inject_campaigns c 
    WHERE c.id = mass_inject_events.campaign_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Users update own campaign events"
  ON public.mass_inject_events
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.mass_inject_campaigns c 
    WHERE c.id = mass_inject_events.campaign_id AND c.user_id = auth.uid()
  ));