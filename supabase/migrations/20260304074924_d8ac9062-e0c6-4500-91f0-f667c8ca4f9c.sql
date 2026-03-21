
CREATE OR REPLACE FUNCTION public.check_device_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _sub RECORD;
  _profile RECORD;
  _max_allowed INT;
  _current_count INT;
BEGIN
  -- Report WA devices are exempt from plan limits
  IF NEW.login_type = 'report_wa' THEN
    RETURN NEW;
  END IF;

  -- Get active subscription
  SELECT * INTO _sub FROM public.subscriptions
    WHERE user_id = NEW.user_id
    ORDER BY created_at DESC LIMIT 1;

  IF _sub IS NULL THEN
    RAISE EXCEPTION 'Sem plano ativo. Ative um plano para criar instâncias.';
  END IF;

  IF _sub.expires_at < now() THEN
    RAISE EXCEPTION 'Assinatura vencida. Renove para criar instâncias.';
  END IF;

  SELECT status, instance_override INTO _profile FROM public.profiles WHERE id = NEW.user_id;

  IF _profile.status IN ('suspended', 'cancelled') THEN
    RAISE EXCEPTION 'Conta suspensa/cancelada. Criação de instâncias bloqueada.';
  END IF;

  _max_allowed := _sub.max_instances + COALESCE(_profile.instance_override, 0);

  -- Count only non-report_wa devices
  SELECT COUNT(*) INTO _current_count FROM public.devices
    WHERE user_id = NEW.user_id AND login_type != 'report_wa';

  IF _current_count >= _max_allowed THEN
    RAISE EXCEPTION 'Limite de instâncias atingido (% de %).', _current_count, _max_allowed;
  END IF;

  RETURN NEW;
END;
$function$;
