
-- Create alert_type enum
CREATE TYPE public.alert_type AS ENUM (
  'INSTANCE_CONNECTED',
  'INSTANCE_DISCONNECTED',
  'QRCODE_GENERATED',
  'CAMPAIGN_STARTED',
  'CAMPAIGN_PAUSED',
  'CAMPAIGN_FINISHED',
  'CAMPAIGN_ERROR',
  'HIGH_FAILURE_RATE',
  'WARMUP_REPORT_24H',
  'TEST_ALERT'
);

-- Create alert_severity enum
CREATE TYPE public.alert_severity AS ENUM (
  'INFO',
  'WARNING',
  'CRITICAL'
);

-- Create alerts table
CREATE TABLE public.alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  type public.alert_type NOT NULL,
  severity public.alert_severity NOT NULL DEFAULT 'INFO',
  instance_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  instance_name TEXT,
  phone_number TEXT,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  campaign_name TEXT,
  message_rendered TEXT NOT NULL,
  payload_json JSONB DEFAULT '{}'::jsonb,
  whatsapp_sent BOOLEAN NOT NULL DEFAULT false,
  whatsapp_group_id TEXT,
  whatsapp_sent_at TIMESTAMP WITH TIME ZONE,
  whatsapp_error TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own alerts" ON public.alerts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own alerts" ON public.alerts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own alerts" ON public.alerts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
