-- Fix 1: Restrict has_role() to only check the caller's own role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = _role
  )
$$;

-- Fix 2: Add trigger to protect sensitive fields on user_api_tokens
CREATE OR REPLACE FUNCTION public.protect_user_api_tokens_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role (auth.uid() is null) or admin can change anything
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  
  -- Regular users can only change 'label'; revert all other fields
  NEW.token := OLD.token;
  NEW.status := OLD.status;
  NEW.healthy := OLD.healthy;
  NEW.device_id := OLD.device_id;
  NEW.assigned_at := OLD.assigned_at;
  NEW.admin_id := OLD.admin_id;
  NEW.last_checked_at := OLD.last_checked_at;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_api_tokens ON public.user_api_tokens;
CREATE TRIGGER trg_protect_user_api_tokens
  BEFORE UPDATE ON public.user_api_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_api_tokens_fields();