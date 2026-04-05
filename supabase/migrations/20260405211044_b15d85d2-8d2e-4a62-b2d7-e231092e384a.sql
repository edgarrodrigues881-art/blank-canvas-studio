
-- Conversations table
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  remote_jid TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  last_message TEXT DEFAULT '',
  last_message_at TIMESTAMPTZ DEFAULT now(),
  unread_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'offline',
  attending_status TEXT DEFAULT 'nova',
  tags TEXT[] DEFAULT '{}',
  category TEXT,
  email TEXT,
  company TEXT,
  notes TEXT,
  origin TEXT DEFAULT 'whatsapp',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, device_id, remote_jid)
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversations" ON public.conversations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own conversations" ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own conversations" ON public.conversations
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own conversations" ON public.conversations
  FOR DELETE USING (auth.uid() = user_id);

-- Service role bypass for webhook
CREATE POLICY "Service role full access conversations" ON public.conversations
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_conversations_user ON public.conversations(user_id);
CREATE INDEX idx_conversations_device ON public.conversations(device_id);
CREATE INDEX idx_conversations_last_msg ON public.conversations(user_id, last_message_at DESC);

-- Messages table
CREATE TABLE public.conversation_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  remote_jid TEXT,
  content TEXT DEFAULT '',
  message_type TEXT DEFAULT 'text',
  direction TEXT NOT NULL DEFAULT 'received',
  status TEXT DEFAULT 'sent',
  media_url TEXT,
  media_type TEXT,
  audio_duration INTEGER,
  is_ai_response BOOLEAN DEFAULT false,
  whatsapp_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own messages" ON public.conversation_messages
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own messages" ON public.conversation_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own messages" ON public.conversation_messages
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role full access messages" ON public.conversation_messages
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_conv_messages_conv ON public.conversation_messages(conversation_id, created_at);
CREATE INDEX idx_conv_messages_user ON public.conversation_messages(user_id);
CREATE INDEX idx_conv_messages_wa_id ON public.conversation_messages(whatsapp_message_id);

-- Trigger for updated_at
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
