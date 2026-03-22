
-- Community warmup user configurations
CREATE TABLE public.community_warmup_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  intensity TEXT NOT NULL DEFAULT 'medium' CHECK (intensity IN ('low', 'medium', 'high')),
  start_hour TEXT NOT NULL DEFAULT '08:00',
  end_hour TEXT NOT NULL DEFAULT '18:00',
  active_days JSONB NOT NULL DEFAULT '["mon","tue","wed","thu","fri"]'::jsonb,
  daily_limit INTEGER NOT NULL DEFAULT 60,
  min_delay_seconds INTEGER NOT NULL DEFAULT 120,
  max_delay_seconds INTEGER NOT NULL DEFAULT 300,
  pause_after_messages_min INTEGER NOT NULL DEFAULT 5,
  pause_after_messages_max INTEGER NOT NULL DEFAULT 10,
  pause_duration_min INTEGER NOT NULL DEFAULT 300,
  pause_duration_max INTEGER NOT NULL DEFAULT 600,
  interactions_today INTEGER NOT NULL DEFAULT 0,
  last_interaction_at TIMESTAMPTZ,
  last_daily_reset_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'inactive',
  status_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, device_id)
);

-- RLS
ALTER TABLE public.community_warmup_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own configs" ON public.community_warmup_configs
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own configs" ON public.community_warmup_configs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own configs" ON public.community_warmup_configs
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can delete own configs" ON public.community_warmup_configs
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Admins full access
CREATE POLICY "Admins full access community_warmup_configs" ON public.community_warmup_configs
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Community warmup activity logs
CREATE TABLE public.community_warmup_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE NOT NULL,
  config_id UUID REFERENCES public.community_warmup_configs(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL,
  interaction_type TEXT,
  partner_device_id UUID,
  message_preview TEXT,
  intensity TEXT,
  delay_applied_seconds INTEGER,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.community_warmup_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own logs" ON public.community_warmup_logs
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Admins full access community_warmup_logs" ON public.community_warmup_logs
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Indexes
CREATE INDEX idx_cwc_user_device ON public.community_warmup_configs(user_id, device_id);
CREATE INDEX idx_cwc_active ON public.community_warmup_configs(is_active) WHERE is_active = true;
CREATE INDEX idx_cwl_user ON public.community_warmup_logs(user_id, created_at DESC);
CREATE INDEX idx_cwl_config ON public.community_warmup_logs(config_id, created_at DESC);

-- Updated_at trigger
CREATE TRIGGER update_community_warmup_configs_updated_at
  BEFORE UPDATE ON public.community_warmup_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
