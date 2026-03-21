
CREATE OR REPLACE FUNCTION public.try_provision_lock(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Advisory lock based on user_id hash prevents concurrent provisioning
  IF NOT pg_try_advisory_lock(hashtext('provision_' || _user_id::text)) THEN
    RETURN false;
  END IF;
  
  -- Double-check: if tokens already exist, release lock and return false
  IF EXISTS (SELECT 1 FROM public.user_api_tokens WHERE user_id = _user_id LIMIT 1) THEN
    PERFORM pg_advisory_unlock(hashtext('provision_' || _user_id::text));
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_provision_lock(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM pg_advisory_unlock(hashtext('provision_' || _user_id::text));
END;
$$;
