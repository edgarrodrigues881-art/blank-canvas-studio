
CREATE OR REPLACE FUNCTION public.notify_device_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _connected_statuses text[] := ARRAY['Ready', 'Connected', 'connected', 'authenticated', 'open', 'active', 'online'];
  _disconnected_statuses text[] := ARRAY['Disconnected', 'disconnected', 'close', 'TIMEOUT'];
  _recent_count int;
  _recent_same int;
  _event_title text;
  _event_message text;
  _event_type text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = ANY(_connected_statuses) AND NEW.status = ANY(_disconnected_statuses) THEN
    _event_title := 'Instância desconectou';
    _event_message := COALESCE(NEW.name, 'Instância')
      || CASE WHEN NEW.number IS NOT NULL AND NEW.number <> '' THEN ' (' || NEW.number || ')' ELSE '' END
      || ' perdeu a conexão.';
    _event_type := 'warning';
  ELSIF OLD.status = ANY(_disconnected_statuses) AND NEW.status = ANY(_connected_statuses) THEN
    _event_title := 'Instância reconectou';
    _event_message := COALESCE(NEW.name, 'Instância')
      || CASE WHEN NEW.number IS NOT NULL AND NEW.number <> '' THEN ' (' || NEW.number || ')' ELSE '' END
      || ' está conectada novamente.';
    _event_type := 'success';
  ELSE
    RETURN NEW;
  END IF;

  SELECT count(*) INTO _recent_same
  FROM public.notifications
  WHERE user_id = NEW.user_id
    AND title = _event_title
    AND message = _event_message
    AND created_at > now() - interval '2 minutes';

  IF _recent_same > 0 THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO _recent_count
  FROM public.notifications
  WHERE user_id = NEW.user_id
    AND title = _event_title
    AND created_at > now() - interval '30 seconds';

  IF _recent_count >= 3 THEN
    PERFORM 1 FROM public.notifications
    WHERE user_id = NEW.user_id
      AND title = _event_title
      AND message LIKE 'Múltiplas instâncias%'
      AND created_at > now() - interval '2 minutes';

    IF NOT FOUND THEN
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (
        NEW.user_id,
        _event_title,
        'Múltiplas instâncias alteraram o status simultaneamente. Isso geralmente é causado por uma reinicialização temporária do servidor.',
        _event_type
      );
    END IF;

    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (NEW.user_id, _event_title, _event_message, _event_type);

  RETURN NEW;
END;
$$;
