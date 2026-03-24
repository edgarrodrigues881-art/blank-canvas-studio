-- Mass inject campaigns table
CREATE TABLE public.mass_inject_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  group_id text NOT NULL,
  group_name text,
  device_ids jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'draft',
  total_contacts integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  already_count integer NOT NULL DEFAULT 0,
  fail_count integer NOT NULL DEFAULT 0,
  min_delay integer NOT NULL DEFAULT 3,
  max_delay integer NOT NULL DEFAULT 8,
  pause_after integer NOT NULL DEFAULT 0,
  pause_duration integer NOT NULL DEFAULT 30,
  rotate_after integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.mass_inject_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.mass_inject_campaigns(id) ON DELETE CASCADE,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  device_used text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mass_inject_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mass_inject_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own campaigns" ON public.mass_inject_campaigns FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own campaigns" ON public.mass_inject_campaigns FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own campaigns" ON public.mass_inject_campaigns FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own campaigns" ON public.mass_inject_campaigns FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can view own contacts" ON public.mass_inject_contacts FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.mass_inject_campaigns c WHERE c.id = campaign_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can insert own contacts" ON public.mass_inject_contacts FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.mass_inject_campaigns c WHERE c.id = campaign_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can update own contacts" ON public.mass_inject_contacts FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.mass_inject_campaigns c WHERE c.id = campaign_id AND c.user_id = auth.uid()));

CREATE INDEX idx_mass_inject_contacts_campaign ON public.mass_inject_contacts(campaign_id, status);
CREATE INDEX idx_mass_inject_campaigns_user ON public.mass_inject_campaigns(user_id, status);