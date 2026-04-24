ALTER TABLE public.quick_replies
  ADD COLUMN IF NOT EXISTS blocks jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.quick_replies.blocks IS
  'Ordered sequence of blocks: [{ type: "text"|"image"|"audio"|"file", content?: string, mediaUrl?: string, fileName?: string, delayMs?: number }]. Empty array means use legacy `content` field as a single text block.';