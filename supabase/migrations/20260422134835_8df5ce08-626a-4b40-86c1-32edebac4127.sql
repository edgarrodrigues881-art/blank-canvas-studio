-- Add priority column to welcome_queue for intelligent scheduling
ALTER TABLE public.welcome_queue 
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;

-- Index optimized for the new selection order: priority DESC, send_at ASC
CREATE INDEX IF NOT EXISTS idx_welcome_queue_priority_send_at 
  ON public.welcome_queue (automation_id, status, priority DESC, send_at ASC NULLS FIRST)
  WHERE status = 'pending';