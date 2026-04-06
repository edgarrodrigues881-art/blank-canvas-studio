
ALTER TABLE public.conversation_messages 
  ADD COLUMN IF NOT EXISTS quoted_message_id text,
  ADD COLUMN IF NOT EXISTS quoted_content text;
