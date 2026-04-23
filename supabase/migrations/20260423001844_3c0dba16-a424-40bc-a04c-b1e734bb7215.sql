-- Drop existing function (integer signature) to replace with BIGINT version
DROP FUNCTION IF EXISTS public.claim_device_send_slot(uuid, integer);

-- Tabela para rastrear o último envio de cada dispositivo
CREATE TABLE IF NOT EXISTS public.device_last_sent (
  device_id UUID PRIMARY KEY,
  last_sent_at TIMESTAMPTZ NOT NULL
);

-- Enable RLS (only service_role / SECURITY DEFINER functions should write)
ALTER TABLE public.device_last_sent ENABLE ROW LEVEL SECURITY;

-- No public policies: access exclusively via SECURITY DEFINER function below

-- Função para controlar o intervalo de envio por dispositivo
CREATE OR REPLACE FUNCTION public.claim_device_send_slot(
  p_device_id UUID,
  p_min_interval_ms BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_last_sent_at TIMESTAMPTZ;
  v_now TIMESTAMPTZ := now();
  v_wait_ms BIGINT := 0;
  v_elapsed_ms BIGINT;
BEGIN
  SELECT last_sent_at INTO v_last_sent_at
  FROM public.device_last_sent
  WHERE device_id = p_device_id
  FOR UPDATE;

  IF v_last_sent_at IS NOT NULL THEN
    v_elapsed_ms := (EXTRACT(EPOCH FROM (v_now - v_last_sent_at)) * 1000)::BIGINT;
    IF v_elapsed_ms < p_min_interval_ms THEN
      v_wait_ms := p_min_interval_ms - v_elapsed_ms;
    END IF;
  END IF;

  IF v_wait_ms = 0 THEN
    INSERT INTO public.device_last_sent (device_id, last_sent_at)
    VALUES (p_device_id, v_now)
    ON CONFLICT (device_id) DO UPDATE SET last_sent_at = v_now;
  END IF;

  RETURN v_wait_ms;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_device_send_slot(UUID, BIGINT) TO anon, authenticated, service_role;