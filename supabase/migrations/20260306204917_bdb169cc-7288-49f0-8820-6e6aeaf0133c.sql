
-- Device-level lock for campaign concurrency control
CREATE TABLE public.campaign_device_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(device_id)
);

ALTER TABLE public.campaign_device_locks ENABLE ROW LEVEL SECURITY;

-- Only service role (edge functions) manages locks, but users can see their own
CREATE POLICY "Users can view own locks" ON public.campaign_device_locks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all locks" ON public.campaign_device_locks
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Function to acquire lock atomically (returns true if acquired)
CREATE OR REPLACE FUNCTION public.acquire_device_lock(
  _device_id uuid,
  _campaign_id uuid,
  _user_id uuid,
  _stale_seconds int DEFAULT 120
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Delete stale locks first (no heartbeat for > _stale_seconds)
  DELETE FROM public.campaign_device_locks
  WHERE device_id = _device_id
    AND heartbeat_at < now() - (_stale_seconds || ' seconds')::interval;

  -- Try to insert (will fail if device already locked by another campaign)
  INSERT INTO public.campaign_device_locks (device_id, campaign_id, user_id)
  VALUES (_device_id, _campaign_id, _user_id)
  ON CONFLICT (device_id) DO UPDATE
    SET heartbeat_at = now()
    WHERE campaign_device_locks.campaign_id = _campaign_id;

  -- Check if we hold the lock
  RETURN EXISTS (
    SELECT 1 FROM public.campaign_device_locks
    WHERE device_id = _device_id AND campaign_id = _campaign_id
  );
END;
$$;

-- Function to release lock
CREATE OR REPLACE FUNCTION public.release_device_lock(
  _device_id uuid,
  _campaign_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.campaign_device_locks
  WHERE device_id = _device_id AND campaign_id = _campaign_id;
END;
$$;

-- Function to update heartbeat
CREATE OR REPLACE FUNCTION public.heartbeat_device_lock(
  _campaign_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.campaign_device_locks
  SET heartbeat_at = now()
  WHERE campaign_id = _campaign_id;
END;
$$;

-- Cleanup function for stale locks
CREATE OR REPLACE FUNCTION public.cleanup_stale_locks(_stale_seconds int DEFAULT 120)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _count int;
BEGIN
  DELETE FROM public.campaign_device_locks
  WHERE heartbeat_at < now() - (_stale_seconds || ' seconds')::interval;
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;
