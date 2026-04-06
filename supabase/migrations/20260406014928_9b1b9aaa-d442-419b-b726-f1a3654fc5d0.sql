
-- Automation config (one row per user)
CREATE TABLE public.conversation_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  welcome_enabled BOOLEAN NOT NULL DEFAULT false,
  welcome_message TEXT NOT NULL DEFAULT 'Olá! Como posso te ajudar? 😊',
  followup_enabled BOOLEAN NOT NULL DEFAULT false,
  followup_minutes INTEGER NOT NULL DEFAULT 30,
  followup_message TEXT NOT NULL DEFAULT 'Oi! Vi que não tivemos retorno. Posso ajudar em algo?',
  awaiting_enabled BOOLEAN NOT NULL DEFAULT false,
  awaiting_message TEXT NOT NULL DEFAULT 'Estamos analisando sua solicitação e retornaremos em breve!',
  awaiting_delay_minutes INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.conversation_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own automations"
  ON public.conversation_automations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_conversation_automations_updated_at
  BEFORE UPDATE ON public.conversation_automations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Automation execution log
CREATE TABLE public.conversation_automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  automation_type TEXT NOT NULL, -- 'welcome', 'followup', 'awaiting'
  message_sent TEXT NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'sent', -- 'sent', 'failed'
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conversation_automation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own automation logs"
  ON public.conversation_automation_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service can insert automation logs"
  ON public.conversation_automation_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_automation_logs_conv ON public.conversation_automation_logs (conversation_id, automation_type);
CREATE INDEX idx_automation_logs_user ON public.conversation_automation_logs (user_id, created_at DESC);

-- Track last automation sent per conversation to avoid duplicates
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_automation_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_automation_type TEXT DEFAULT NULL;
