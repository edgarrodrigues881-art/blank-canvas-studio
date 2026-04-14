
-- ============================================
-- CRM Templates
-- ============================================
CREATE TABLE public.crm_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  message_type TEXT NOT NULL DEFAULT 'text',
  media_url TEXT,
  buttons JSONB NOT NULL DEFAULT '[]'::jsonb,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own crm_templates" ON public.crm_templates
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_crm_templates_updated_at
  BEFORE UPDATE ON public.crm_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- CRM Campaigns
-- ============================================
CREATE TABLE public.crm_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  message_type TEXT NOT NULL DEFAULT 'text',
  message_content TEXT,
  media_url TEXT,
  buttons JSONB DEFAULT '[]'::jsonb,
  carousel_cards JSONB,
  template_id UUID REFERENCES public.crm_templates(id) ON DELETE SET NULL,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  device_ids JSONB DEFAULT '[]'::jsonb,
  total_contacts INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  min_delay_seconds INTEGER NOT NULL DEFAULT 8,
  max_delay_seconds INTEGER NOT NULL DEFAULT 25,
  pause_every_min INTEGER NOT NULL DEFAULT 10,
  pause_every_max INTEGER NOT NULL DEFAULT 20,
  pause_duration_min INTEGER NOT NULL DEFAULT 30,
  pause_duration_max INTEGER NOT NULL DEFAULT 120,
  messages_per_instance INTEGER DEFAULT 0,
  pause_on_disconnect BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own crm_campaigns" ON public.crm_campaigns
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_crm_campaigns_updated_at
  BEFORE UPDATE ON public.crm_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- CRM Campaign Contacts
-- ============================================
CREATE TABLE public.crm_campaign_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.crm_campaigns(id) ON DELETE CASCADE,
  contact_id UUID,
  phone TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  var1 TEXT,
  var2 TEXT,
  var3 TEXT,
  var4 TEXT,
  var5 TEXT,
  var6 TEXT,
  var7 TEXT,
  var8 TEXT,
  var9 TEXT,
  var10 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_campaign_contacts ENABLE ROW LEVEL SECURITY;

-- RLS via campaign ownership
CREATE POLICY "Users manage own crm_campaign_contacts" ON public.crm_campaign_contacts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.crm_campaigns c WHERE c.id = campaign_id AND c.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.crm_campaigns c WHERE c.id = campaign_id AND c.user_id = auth.uid())
  );

CREATE INDEX idx_crm_campaign_contacts_campaign ON public.crm_campaign_contacts(campaign_id);
CREATE INDEX idx_crm_campaigns_user ON public.crm_campaigns(user_id);
CREATE INDEX idx_crm_templates_user ON public.crm_templates(user_id);
