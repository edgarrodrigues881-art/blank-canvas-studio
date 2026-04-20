-- Enum para tipo de campanha
DO $$ BEGIN
  CREATE TYPE public.contact_campaign_type AS ENUM ('verificacao', 'adicao');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Enum para status
DO $$ BEGIN
  CREATE TYPE public.contact_campaign_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Tabela principal de campanhas
CREATE TABLE IF NOT EXISTS public.contact_processing_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT,
  type public.contact_campaign_type NOT NULL,
  status public.contact_campaign_status NOT NULL DEFAULT 'pending',
  total INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  valid_count INTEGER NOT NULL DEFAULT 0,
  invalid_count INTEGER NOT NULL DEFAULT 0,
  device_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de resultados
CREATE TABLE IF NOT EXISTS public.contact_processing_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.contact_processing_campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  original TEXT NOT NULL,
  detected_type TEXT,
  number TEXT,
  jid TEXT,
  valid BOOLEAN NOT NULL DEFAULT false,
  status TEXT,
  error_message TEXT,
  device_id UUID,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpc_user ON public.contact_processing_campaigns(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cpc_status ON public.contact_processing_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_cpr_campaign ON public.contact_processing_results(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cpr_user ON public.contact_processing_results(user_id);

ALTER TABLE public.contact_processing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_processing_results ENABLE ROW LEVEL SECURITY;

-- RLS: campanhas
CREATE POLICY "Users view own campaigns"
  ON public.contact_processing_campaigns FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own campaigns"
  ON public.contact_processing_campaigns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own campaigns"
  ON public.contact_processing_campaigns FOR UPDATE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users delete own campaigns"
  ON public.contact_processing_campaigns FOR DELETE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- RLS: resultados
CREATE POLICY "Users view own results"
  ON public.contact_processing_results FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own results"
  ON public.contact_processing_results FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own results"
  ON public.contact_processing_results FOR UPDATE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users delete own results"
  ON public.contact_processing_results FOR DELETE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Trigger para updated_at
CREATE TRIGGER trg_cpc_updated_at
  BEFORE UPDATE ON public.contact_processing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER TABLE public.contact_processing_campaigns REPLICA IDENTITY FULL;
ALTER TABLE public.contact_processing_results REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_processing_campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_processing_results;