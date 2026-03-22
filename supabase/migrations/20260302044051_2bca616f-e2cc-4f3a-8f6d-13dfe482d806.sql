
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
  -- Get active subscription
  SELECT * INTO _sub FROM public.subscriptions
    WHERE user_id = NEW.user_id
    ORDER BY created_at DESC LIMIT 1;

  -- No subscription = block
  IF _sub IS NULL THEN
    RAISE EXCEPTION 'Sem plano ativo. Ative um plano para criar instâncias.';
  END IF;

  -- Expired = block
  IF _sub.expires_at < now() THEN
    RAISE EXCEPTION 'Assinatura vencida. Renove para criar instâncias.';
  END IF;

  -- Get profile for override + status
  SELECT status, instance_override INTO _profile FROM public.profiles WHERE id = NEW.user_id;

  IF _profile.status IN ('suspended', 'cancelled') THEN
    RAISE EXCEPTION 'Conta suspensa/cancelada. Criação de instâncias bloqueada.';
  END IF;

  _max_allowed := _sub.max_instances + COALESCE(_profile.instance_override, 0);

  SELECT COUNT(*) INTO _current_count FROM public.devices WHERE user_id = NEW.user_id;

  IF _current_count >= _max_allowed THEN
    RAISE EXCEPTION 'Limite de instâncias atingido (% de %).', _current_count, _max_allowed;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER check_device_limit_before_insert
  BEFORE INSERT ON public.devices
  FOR EACH ROW
  EXECUTE FUNCTION public.check_device_limit();
