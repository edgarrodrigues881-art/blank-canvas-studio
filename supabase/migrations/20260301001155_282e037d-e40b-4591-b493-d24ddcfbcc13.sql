
-- Table to store WhatsApp report configuration per user
CREATE TABLE public.report_wa_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  group_id TEXT,
  group_name TEXT,
  frequency TEXT NOT NULL DEFAULT '1h',
  toggle_campaigns BOOLEAN NOT NULL DEFAULT true,
  toggle_warmup BOOLEAN NOT NULL DEFAULT true,
  toggle_instances BOOLEAN NOT NULL DEFAULT true,
  alert_disconnect BOOLEAN NOT NULL DEFAULT true,
  alert_campaign_end BOOLEAN NOT NULL DEFAULT true,
  alert_high_failures BOOLEAN NOT NULL DEFAULT false,
  connected_phone TEXT,
  connection_status TEXT NOT NULL DEFAULT 'disconnected',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Only one config per user
CREATE UNIQUE INDEX report_wa_configs_user_id_idx ON public.report_wa_configs (user_id);

-- RLS
ALTER TABLE public.report_wa_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own report config"
  ON public.report_wa_configs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own report config"
  ON public.report_wa_configs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own report config"
  ON public.report_wa_configs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own report config"
  ON public.report_wa_configs FOR DELETE
  USING (auth.uid() = user_id);

-- Logs table
CREATE TABLE public.report_wa_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  level TEXT NOT NULL DEFAULT 'INFO',
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.report_wa_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own report logs"
  ON public.report_wa_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert report logs"
  ON public.report_wa_logs FOR INSERT
  WITH CHECK (true);

-- Enable realtime for logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.report_wa_logs;
