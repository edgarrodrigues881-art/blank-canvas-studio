
-- Add last_api_call_at to devices for global per-device rate limiting
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS last_api_call_at timestamptz DEFAULT NULL;

-- Atomic function: tries to claim a "send slot" for a device.
-- Returns the number of milliseconds the caller must wait (0 = go ahead now).
-- Updates last_api_call_at atomically to prevent race conditions across campaigns.
CREATE OR REPLACE FUNCTION public.claim_device_send_slot(
  p_device_id uuid,
  p_min_interval_ms integer DEFAULT 12000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_call timestamptz;
  v_elapsed_ms integer;
  v_wait_ms integer;
BEGIN
  -- Lock the device row to prevent concurrent claims
  SELECT last_api_call_at INTO v_last_call
  FROM public.devices
  WHERE id = p_device_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN -1; -- device not found
  END IF;

  IF v_last_call IS NULL THEN
    -- First call ever, proceed immediately
    UPDATE public.devices SET last_api_call_at = now() WHERE id = p_device_id;
    RETURN 0;
  END IF;

  v_elapsed_ms := EXTRACT(EPOCH FROM (now() - v_last_call)) * 1000;
  
  IF v_elapsed_ms >= p_min_interval_ms THEN
    -- Enough time passed, claim the slot
    UPDATE public.devices SET last_api_call_at = now() WHERE id = p_device_id;
    RETURN 0;
  ELSE
    -- Must wait — but still claim the slot for the future time
    v_wait_ms := p_min_interval_ms - v_elapsed_ms;
    UPDATE public.devices SET last_api_call_at = now() + (v_wait_ms || ' milliseconds')::interval WHERE id = p_device_id;
    RETURN v_wait_ms;
  END IF;
END;
$$;
