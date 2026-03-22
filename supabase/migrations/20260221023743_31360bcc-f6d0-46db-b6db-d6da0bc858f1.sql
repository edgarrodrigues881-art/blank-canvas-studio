
-- Trigger: notify when campaign status changes to 'completed'
CREATE OR REPLACE FUNCTION public.notify_campaign_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.user_id,
      'Campanha concluída',
      'A campanha "' || NEW.name || '" foi finalizada. ' ||
        COALESCE(NEW.sent_count, 0) || ' enviadas, ' ||
        COALESCE(NEW.delivered_count, 0) || ' entregues, ' ||
        COALESCE(NEW.failed_count, 0) || ' falhas.',
      'success'
    );
  END IF;

  IF NEW.status = 'failed' AND (OLD.status IS DISTINCT FROM 'failed') THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.user_id,
      'Campanha falhou',
      'A campanha "' || NEW.name || '" apresentou erro durante o envio.',
      'error'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_campaign_completed
  AFTER UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_campaign_completed();

-- Trigger: notify when device disconnects
CREATE OR REPLACE FUNCTION public.notify_device_disconnected()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'Disconnected' AND (OLD.status IS DISTINCT FROM 'Disconnected') THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.user_id,
      'Chip desconectado',
      'O dispositivo "' || NEW.name || '"' ||
        CASE WHEN NEW.number IS NOT NULL AND NEW.number != '' THEN ' (' || NEW.number || ')' ELSE '' END ||
        ' perdeu a conexão.',
      'warning'
    );
  END IF;

  IF NEW.status = 'Connected' AND (OLD.status IS DISTINCT FROM 'Connected') THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.user_id,
      'Chip conectado',
      'O dispositivo "' || NEW.name || '"' ||
        CASE WHEN NEW.number IS NOT NULL AND NEW.number != '' THEN ' (' || NEW.number || ')' ELSE '' END ||
        ' está online novamente.',
      'info'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_device_disconnected
  AFTER UPDATE ON public.devices
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_device_disconnected();
