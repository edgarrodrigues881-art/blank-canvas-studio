
-- Create the updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1. Automações de boas-vindas
CREATE TABLE public.welcome_automations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paused',
  monitoring_device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  message_type TEXT NOT NULL DEFAULT 'fixed',
  message_content TEXT,
  message_templates JSONB DEFAULT '[]'::jsonb,
  min_delay_seconds INTEGER NOT NULL DEFAULT 30,
  max_delay_seconds INTEGER NOT NULL DEFAULT 60,
  delay_between_accounts_seconds INTEGER NOT NULL DEFAULT 10,
  pause_every_min INTEGER NOT NULL DEFAULT 0,
  pause_every_max INTEGER NOT NULL DEFAULT 0,
  pause_duration_min INTEGER NOT NULL DEFAULT 0,
  pause_duration_max INTEGER NOT NULL DEFAULT 0,
  max_per_account INTEGER NOT NULL DEFAULT 50,
  max_retries INTEGER NOT NULL DEFAULT 3,
  dedupe_rule TEXT NOT NULL DEFAULT 'same_group',
  dedupe_window_days INTEGER NOT NULL DEFAULT 30,
  send_start_hour TEXT NOT NULL DEFAULT '08:00',
  send_end_hour TEXT NOT NULL DEFAULT '20:00',
  active_days JSONB NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.welcome_automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own welcome automations" ON public.welcome_automations FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own welcome automations" ON public.welcome_automations FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own welcome automations" ON public.welcome_automations FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users delete own welcome automations" ON public.welcome_automations FOR DELETE USING (user_id = auth.uid());
CREATE INDEX idx_welcome_automations_user ON public.welcome_automations(user_id);
CREATE INDEX idx_welcome_automations_status ON public.welcome_automations(status);

-- 2. Grupos monitorados
CREATE TABLE public.welcome_automation_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id UUID NOT NULL REFERENCES public.welcome_automations(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  group_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.welcome_automation_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own welcome groups" ON public.welcome_automation_groups FOR ALL
  USING (EXISTS (SELECT 1 FROM public.welcome_automations a WHERE a.id = welcome_automation_groups.automation_id AND a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.welcome_automations a WHERE a.id = welcome_automation_groups.automation_id AND a.user_id = auth.uid()));
CREATE INDEX idx_welcome_groups_automation ON public.welcome_automation_groups(automation_id);

-- 3. Contas remetentes
CREATE TABLE public.welcome_automation_senders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id UUID NOT NULL REFERENCES public.welcome_automations(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  priority_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.welcome_automation_senders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own welcome senders" ON public.welcome_automation_senders FOR ALL
  USING (EXISTS (SELECT 1 FROM public.welcome_automations a WHERE a.id = welcome_automation_senders.automation_id AND a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.welcome_automations a WHERE a.id = welcome_automation_senders.automation_id AND a.user_id = auth.uid()));
CREATE INDEX idx_welcome_senders_automation ON public.welcome_automation_senders(automation_id);

-- 4. Fila de boas-vindas
CREATE TABLE public.welcome_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id UUID NOT NULL REFERENCES public.welcome_automations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_phone TEXT NOT NULL,
  participant_name TEXT,
  group_id TEXT NOT NULL,
  group_name TEXT,
  sender_device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  error_reason TEXT,
  message_used TEXT,
  dedupe_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.welcome_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own welcome queue" ON public.welcome_queue FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users update own welcome queue" ON public.welcome_queue FOR UPDATE USING (user_id = auth.uid());
CREATE INDEX idx_welcome_queue_automation ON public.welcome_queue(automation_id);
CREATE INDEX idx_welcome_queue_status ON public.welcome_queue(status);
CREATE INDEX idx_welcome_queue_user ON public.welcome_queue(user_id);
CREATE INDEX idx_welcome_queue_dedupe ON public.welcome_queue(dedupe_hash);
CREATE UNIQUE INDEX idx_welcome_queue_unique_dedupe ON public.welcome_queue(dedupe_hash) WHERE status NOT IN ('ignored', 'duplicate_blocked');

-- 5. Logs de mensagens
CREATE TABLE public.welcome_message_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  queue_id UUID NOT NULL REFERENCES public.welcome_queue(id) ON DELETE CASCADE,
  sender_device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  message_text TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT 'pending',
  external_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.welcome_message_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own welcome message logs" ON public.welcome_message_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.welcome_queue q WHERE q.id = welcome_message_logs.queue_id AND q.user_id = auth.uid()));
CREATE INDEX idx_welcome_message_logs_queue ON public.welcome_message_logs(queue_id);

-- 6. Eventos
CREATE TABLE public.welcome_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id UUID NOT NULL REFERENCES public.welcome_automations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL DEFAULT '',
  reference_id UUID,
  payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.welcome_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own welcome events" ON public.welcome_events FOR SELECT USING (user_id = auth.uid());
CREATE INDEX idx_welcome_events_automation ON public.welcome_events(automation_id);
CREATE INDEX idx_welcome_events_user ON public.welcome_events(user_id);

-- Triggers
CREATE TRIGGER update_welcome_automations_updated_at
  BEFORE UPDATE ON public.welcome_automations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_welcome_queue_updated_at
  BEFORE UPDATE ON public.welcome_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
