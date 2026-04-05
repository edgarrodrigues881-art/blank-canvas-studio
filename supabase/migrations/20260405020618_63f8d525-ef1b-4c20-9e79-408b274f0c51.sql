
-- Campaigns table for prospecting
CREATE TABLE public.prospeccao_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  nicho TEXT NOT NULL,
  nichos_relacionados TEXT[] DEFAULT '{}',
  estado TEXT NOT NULL,
  cidade TEXT NOT NULL,
  max_results INTEGER NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'running',
  total_leads INTEGER DEFAULT 0,
  credits_used INTEGER DEFAULT 0,
  execution_time_ms INTEGER DEFAULT 0,
  city_radius_km NUMERIC(6,2),
  scoring_summary JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.prospeccao_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own prospeccao campaigns"
  ON public.prospeccao_campaigns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own prospeccao campaigns"
  ON public.prospeccao_campaigns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own prospeccao campaigns"
  ON public.prospeccao_campaigns FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own prospeccao campaigns"
  ON public.prospeccao_campaigns FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins full access prospeccao campaigns"
  ON public.prospeccao_campaigns FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Execution logs per campaign
CREATE TABLE public.prospeccao_campaign_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.prospeccao_campaigns(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  query_term TEXT,
  location_info TEXT,
  leads_added INTEGER DEFAULT 0,
  leads_total INTEGER DEFAULT 0,
  credits_spent INTEGER DEFAULT 1,
  score INTEGER,
  tier TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.prospeccao_campaign_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own campaign logs"
  ON public.prospeccao_campaign_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.prospeccao_campaigns c
    WHERE c.id = campaign_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Service role insert campaign logs"
  ON public.prospeccao_campaign_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins full access campaign logs"
  ON public.prospeccao_campaign_logs FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Leads linked to campaigns
CREATE TABLE public.prospeccao_campaign_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.prospeccao_campaigns(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT '',
  endereco TEXT DEFAULT '',
  telefone TEXT DEFAULT '',
  website TEXT DEFAULT '',
  avaliacao NUMERIC(2,1),
  total_avaliacoes INTEGER DEFAULT 0,
  categoria TEXT DEFAULT '',
  google_maps_url TEXT DEFAULT '',
  place_id TEXT DEFAULT '',
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.prospeccao_campaign_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own campaign leads"
  ON public.prospeccao_campaign_leads FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.prospeccao_campaigns c
    WHERE c.id = campaign_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Service role insert campaign leads"
  ON public.prospeccao_campaign_leads FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins full access campaign leads"
  ON public.prospeccao_campaign_leads FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Indexes
CREATE INDEX idx_prospeccao_campaigns_user ON public.prospeccao_campaigns(user_id);
CREATE INDEX idx_prospeccao_campaigns_status ON public.prospeccao_campaigns(status);
CREATE INDEX idx_prospeccao_campaign_logs_campaign ON public.prospeccao_campaign_logs(campaign_id);
CREATE INDEX idx_prospeccao_campaign_leads_campaign ON public.prospeccao_campaign_leads(campaign_id);

-- Updated_at trigger
CREATE TRIGGER update_prospeccao_campaigns_updated_at
  BEFORE UPDATE ON public.prospeccao_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
