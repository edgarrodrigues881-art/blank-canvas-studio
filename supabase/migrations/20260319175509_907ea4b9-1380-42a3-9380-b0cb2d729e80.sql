
-- Chip-to-chip conversation configurations
CREATE TABLE public.chip_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Conversa automática',
  status TEXT NOT NULL DEFAULT 'idle', -- idle, running, paused, completed
  
  -- Participating devices (array of device IDs)
  device_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Timing config
  min_delay_seconds INT NOT NULL DEFAULT 15,
  max_delay_seconds INT NOT NULL DEFAULT 60,
  pause_after_messages_min INT NOT NULL DEFAULT 4,
  pause_after_messages_max INT NOT NULL DEFAULT 8,
  pause_duration_min INT NOT NULL DEFAULT 120,
  pause_duration_max INT NOT NULL DEFAULT 300,
  
  -- Duration config
  duration_hours INT NOT NULL DEFAULT 1,
  duration_minutes INT NOT NULL DEFAULT 0,
  start_hour TEXT NOT NULL DEFAULT '08:00',
  end_hour TEXT NOT NULL DEFAULT '18:00',
  
  -- Messages per cycle
  messages_per_cycle_min INT NOT NULL DEFAULT 10,
  messages_per_cycle_max INT NOT NULL DEFAULT 30,
  
  -- Schedule
  active_days JSONB NOT NULL DEFAULT '["mon","tue","wed","thu","fri"]'::jsonb,
  
  -- Runtime tracking
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_messages_sent INT NOT NULL DEFAULT 0,
  last_error TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conversation logs
CREATE TABLE public.chip_conversation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chip_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  sender_device_id UUID NOT NULL,
  receiver_device_id UUID NOT NULL,
  sender_name TEXT,
  receiver_name TEXT,
  message_content TEXT NOT NULL,
  message_category TEXT NOT NULL DEFAULT 'continuacao', -- abertura, resposta, continuacao, encerramento
  status TEXT NOT NULL DEFAULT 'sent', -- sent, failed
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.chip_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chip_conversation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own chip conversations"
  ON public.chip_conversations FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users view own conversation logs"
  ON public.chip_conversation_logs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Indexes
CREATE INDEX idx_chip_conversations_user ON public.chip_conversations(user_id);
CREATE INDEX idx_chip_conversations_status ON public.chip_conversations(status);
CREATE INDEX idx_chip_conversation_logs_conv ON public.chip_conversation_logs(conversation_id);
CREATE INDEX idx_chip_conversation_logs_sent ON public.chip_conversation_logs(sent_at DESC);

-- Updated_at trigger
CREATE TRIGGER set_updated_at_chip_conversations
  BEFORE UPDATE ON public.chip_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
