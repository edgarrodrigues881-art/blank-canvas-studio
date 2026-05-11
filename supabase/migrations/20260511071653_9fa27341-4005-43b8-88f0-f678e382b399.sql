CREATE TABLE IF NOT EXISTS public.group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id uuid,
  group_jid text NOT NULL,
  sender_jid text,
  sender_name text,
  content text,
  media_url text,
  media_type text,
  mime_type text,
  direction text NOT NULL DEFAULT 'received' CHECK (direction IN ('sent','received')),
  whatsapp_message_id text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_messages_user_group_sent
  ON public.group_messages (user_id, group_jid, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_messages_user_device
  ON public.group_messages (user_id, device_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_wa_id
  ON public.group_messages (whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;

ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own group messages"
  ON public.group_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own group messages"
  ON public.group_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own group messages"
  ON public.group_messages FOR DELETE
  USING (auth.uid() = user_id);

ALTER TABLE public.group_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;