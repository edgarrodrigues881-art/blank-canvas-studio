-- First clean up duplicate locks
DELETE FROM campaign_device_locks a
USING campaign_device_locks b
WHERE a.id > b.id
  AND a.campaign_id = b.campaign_id
  AND a.device_id = b.device_id;

-- Add unique constraint to prevent duplicate locks
ALTER TABLE campaign_device_locks
ADD CONSTRAINT campaign_device_locks_campaign_device_unique
UNIQUE (campaign_id, device_id);

-- Fix the acquire function to use ON CONFLICT properly
CREATE OR REPLACE FUNCTION public.acquire_device_lock(
  _campaign_id uuid,
  _device_id uuid,
  _user_id uuid,
  _stale_seconds integer DEFAULT 120
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE _acquired boolean;
BEGIN
  DELETE FROM public.campaign_device_locks
  WHERE device_id = _device_id AND heartbeat_at < now() - (_stale_seconds || ' seconds')::interval;

  INSERT INTO public.campaign_device_locks (campaign_id, device_id, user_id, acquired_at, heartbeat_at)
  VALUES (_campaign_id, _device_id, _user_id, now(), now())
  ON CONFLICT (campaign_id, device_id) DO UPDATE
    SET heartbeat_at = now(), user_id = _user_id
    WHERE campaign_device_locks.campaign_id = _campaign_id;

  SELECT EXISTS (
    SELECT 1 FROM public.campaign_device_locks
    WHERE campaign_id = _campaign_id AND device_id = _device_id AND user_id = _user_id
  ) INTO _acquired;

  RETURN _acquired;
END;
$$;