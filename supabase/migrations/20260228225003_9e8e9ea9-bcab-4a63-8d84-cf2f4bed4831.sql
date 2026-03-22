
CREATE OR REPLACE FUNCTION public.notify_device_disconnected()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('Disconnected', 'disconnected') AND OLD.status NOT IN ('Disconnected', 'disconnected') THEN
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

  IF NEW.status IN ('Connected', 'Ready', 'authenticated') AND OLD.status NOT IN ('Connected', 'Ready', 'authenticated') THEN
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

  RETURN NEW;
END;
$function$;
