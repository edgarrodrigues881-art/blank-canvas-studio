-- Add retry columns to scheduled_messages
ALTER TABLE public.scheduled_messages
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3;

-- Indexes for worker performance
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_pending
  ON public.scheduled_messages (scheduled_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_retry
  ON public.scheduled_messages (next_retry_at ASC)
  WHERE status = 'retry';

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_user_status
  ON public.scheduled_messages (user_id, status);

-- Atomic claim function for concurrency-safe processing
CREATE OR REPLACE FUNCTION public.claim_scheduled_messages(_limit integer DEFAULT 20)
RETURNS SETOF scheduled_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.scheduled_messages
  SET status = 'processing', updated_at = now()
  WHERE id IN (
    SELECT id FROM public.scheduled_messages
    WHERE (
      (status = 'pending' AND scheduled_at <= now())
      OR
      (status = 'retry' AND next_retry_at IS NOT NULL AND next_retry_at <= now())
    )
    ORDER BY scheduled_at ASC
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;