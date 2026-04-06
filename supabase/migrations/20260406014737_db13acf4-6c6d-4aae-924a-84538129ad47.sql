
ALTER TABLE public.conversation_messages
ADD COLUMN IF NOT EXISTS responded_by TEXT DEFAULT NULL;
