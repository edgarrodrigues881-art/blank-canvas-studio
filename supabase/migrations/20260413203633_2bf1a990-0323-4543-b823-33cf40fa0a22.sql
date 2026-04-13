
CREATE TABLE public.ai_lead_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  remote_jid TEXT NOT NULL,
  contact_name TEXT,
  interest TEXT,
  stage TEXT NOT NULL DEFAULT 'cold' CHECK (stage IN ('cold', 'warm', 'hot')),
  notes TEXT,
  interaction_count INT NOT NULL DEFAULT 0,
  last_interaction_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, remote_jid)
);

ALTER TABLE public.ai_lead_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own leads"
  ON public.ai_lead_memory FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage own leads"
  ON public.ai_lead_memory FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_ai_lead_memory_updated_at
  BEFORE UPDATE ON public.ai_lead_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
