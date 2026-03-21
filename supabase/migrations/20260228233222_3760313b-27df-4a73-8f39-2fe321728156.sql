
CREATE OR REPLACE FUNCTION public.notify_device_disconnected()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _recent_count integer;
BEGIN
  -- DISCONNECTED: only notify if no similar notification in last 60 seconds
  IF NEW.status IN ('Disconnected', 'disconnected') AND OLD.status NOT IN ('Disconnected', 'disconnected') THEN
    SELECT COUNT(*) INTO _recent_count
    FROM public.notifications
    WHERE user_id = NEW.user_id
      AND title = '⚠️ Chip desconectado'
      AND message LIKE '%' || NEW.name || '%'
      AND created_at > now() - interval '60 seconds';

    IF _recent_count = 0 THEN
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (
        NEW.user_id,
        '⚠️ Chip desconectado',
        'O dispositivo "' || NEW.name || '"' ||
          CASE WHEN NEW.number IS NOT NULL AND NEW.number != '' THEN ' (' || NEW.number || ')' ELSE '' END ||
          ' perdeu a conexão.',
        'warning'
      );
    END IF;
  END IF;

  -- CONNECTED: only notify if no similar notification in last 60 seconds
  IF NEW.status IN ('Connected', 'Ready', 'authenticated') AND OLD.status NOT IN ('Connected', 'Ready', 'authenticated') THEN
    SELECT COUNT(*) INTO _recent_count
    FROM public.notifications
    WHERE user_id = NEW.user_id
      AND title = '✅ Chip conectado'
      AND message LIKE '%' || NEW.name || '%'
      AND created_at > now() - interval '60 seconds';

    IF _recent_count = 0 THEN
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (
        NEW.user_id,
        '✅ Chip conectado',
        'O dispositivo "' || NEW.name || '"' ||
          CASE WHEN NEW.number IS NOT NULL AND NEW.number != '' THEN ' (' || NEW.number || ')' ELSE '' END ||
          ' está online novamente.',
        'success'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
