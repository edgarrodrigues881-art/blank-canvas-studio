-- Dedicated advisory lock helpers for the mass-inject watchdog
-- Uses session-level locks; auto-released when the connection closes.

CREATE OR REPLACE FUNCTION public.try_acquire_watchdog_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT pg_try_advisory_lock(2063989344);
$$;

CREATE OR REPLACE FUNCTION public.release_watchdog_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT pg_advisory_unlock(2063989344);
$$;

GRANT EXECUTE ON FUNCTION public.try_acquire_watchdog_lock() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_watchdog_lock() TO anon, authenticated, service_role;