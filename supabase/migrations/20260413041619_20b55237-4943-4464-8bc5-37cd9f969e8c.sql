
CREATE OR REPLACE FUNCTION public.enforce_device_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _max_instances integer;
  _instance_override integer;
  _current_count integer;
  _allowed integer;
BEGIN
  -- Get plan limit and override
  SELECT s.max_instances, COALESCE(p.instance_override, 0)
  INTO _max_instances, _instance_override
  FROM public.subscriptions s
  LEFT JOIN public.profiles p ON p.id = NEW.user_id
  WHERE s.user_id = NEW.user_id
  ORDER BY s.max_instances DESC
  LIMIT 1;

  IF _max_instances IS NULL THEN
    _max_instances := 3; -- fallback Trial
  END IF;

  _allowed := _max_instances + _instance_override;

  -- Count current devices (excluding report_wa)
  SELECT count(*) INTO _current_count
  FROM public.devices
  WHERE user_id = NEW.user_id
    AND login_type != 'report_wa';

  IF _current_count >= _allowed THEN
    RAISE EXCEPTION 'Limite de instâncias atingido (% de %)', _current_count, _allowed;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_device_limit_trigger
BEFORE INSERT ON public.devices
FOR EACH ROW
EXECUTE FUNCTION public.enforce_device_limit();
