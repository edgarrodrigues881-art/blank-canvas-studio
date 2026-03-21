CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- If caller is service role (auth.uid() is null) or admin, allow everything
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
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
$function$;