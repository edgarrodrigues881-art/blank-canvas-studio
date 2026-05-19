CREATE OR REPLACE FUNCTION public.profiles_user_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Service-role calls from trusted Edge Functions do not have auth.uid(); allow them.
  -- Authenticated admins can also update admin-controlled profile fields.
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- For regular users, revert admin-controlled fields to their old values.
  NEW.risk_flag := OLD.risk_flag;
  NEW.admin_notes := OLD.admin_notes;
  NEW.status := OLD.status;
  NEW.instance_override := OLD.instance_override;
  NEW.client_type := OLD.client_type;
  NEW.notificacao_liberada := OLD.notificacao_liberada;
  NEW.beta_features := OLD.beta_features;

  RETURN NEW;
END;
$function$;