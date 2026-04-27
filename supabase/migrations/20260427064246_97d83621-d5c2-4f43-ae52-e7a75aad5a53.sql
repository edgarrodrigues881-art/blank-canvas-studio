CREATE OR REPLACE FUNCTION public.profiles_user_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- If the user is an admin, allow all changes
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- For regular users, revert admin-controlled fields to their old values
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