
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS assigned_to UUID DEFAULT NULL,
ADD COLUMN IF NOT EXISTS assigned_name TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_assigned_to ON public.conversations (assigned_to);
