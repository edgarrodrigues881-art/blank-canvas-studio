-- Add scheduled send time to welcome_queue
ALTER TABLE public.welcome_queue
  ADD COLUMN IF NOT EXISTS send_at timestamptz;

-- Index for fast picking of due items
CREATE INDEX IF NOT EXISTS idx_welcome_queue_send_at
  ON public.welcome_queue (status, send_at)
  WHERE status = 'pending';

-- Backfill: itens existentes sem send_at ficam imediatamente prontos
UPDATE public.welcome_queue
SET send_at = COALESCE(detected_at, created_at, now())
WHERE send_at IS NULL AND status = 'pending';