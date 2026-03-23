
-- Fix function search_path for all mutable functions
ALTER FUNCTION public.check_phone_available SET search_path = public;
ALTER FUNCTION public.cleanup_old_logs SET search_path = public;
ALTER FUNCTION public.increment_warmup_budget SET search_path = public;
ALTER FUNCTION public.try_provision_lock SET search_path = public;
ALTER FUNCTION public.release_provision_lock SET search_path = public;
ALTER FUNCTION public.claim_pending_messages SET search_path = public;
ALTER FUNCTION public.get_profile_safe SET search_path = public;
ALTER FUNCTION public.release_device_lock SET search_path = public;
ALTER FUNCTION public.acquire_device_lock SET search_path = public;
ALTER FUNCTION public.heartbeat_device_lock SET search_path = public;
ALTER FUNCTION public.cleanup_stale_locks SET search_path = public;
