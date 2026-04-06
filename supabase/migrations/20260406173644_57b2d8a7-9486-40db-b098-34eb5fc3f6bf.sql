-- Add origin column to conversation_messages
ALTER TABLE public.conversation_messages
ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'whatsapp';

-- Index for filtering
CREATE INDEX IF NOT EXISTS idx_conversation_messages_origin
ON public.conversation_messages (origin);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_conversation_messages_conv_origin
ON public.conversation_messages (conversation_id, origin);