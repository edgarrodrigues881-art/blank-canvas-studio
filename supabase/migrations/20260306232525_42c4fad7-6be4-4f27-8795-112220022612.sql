
-- 1. SUBSCRIPTIONS: Remove user INSERT and UPDATE policies (only admins should manage)
DROP POLICY IF EXISTS "Users can insert their own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update their own subscription" ON public.subscriptions;

-- Add admin-only write policies for subscriptions
CREATE POLICY "Admins can insert subscriptions"
ON public.subscriptions FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update subscriptions"
ON public.subscriptions FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete subscriptions"
ON public.subscriptions FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 2. PROFILES: Create trigger to protect sensitive fields from user self-updates
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- If caller is admin, allow everything
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  
  -- For non-admin users, revert sensitive fields to old values
  NEW.status := OLD.status;
  NEW.risk_flag := OLD.risk_flag;
  NEW.instance_override := OLD.instance_override;
  NEW.admin_notes := OLD.admin_notes;
  NEW.whatsapp_monitor_token := OLD.whatsapp_monitor_token;
  NEW.client_type := OLD.client_type;
  NEW.notificacao_liberada := OLD.notificacao_liberada;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_sensitive_fields();
