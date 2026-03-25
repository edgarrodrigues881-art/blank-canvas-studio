
-- Trigger function: create notification when device status changes to disconnected
CREATE OR REPLACE FUNCTION public.notify_device_disconnect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _connected_statuses text[] := ARRAY['Ready', 'Connected', 'authenticated', 'open', 'active', 'online'];
  _disconnected_statuses text[] := ARRAY['Disconnected', 'disconnected', 'close', 'TIMEOUT'];
BEGIN
  -- Only fire when status actually changed
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Device went from connected to disconnected
  IF OLD.status = ANY(_connected_statuses) AND NEW.status = ANY(_disconnected_statuses) THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.user_id,
      'Instância desconectou',
      COALESCE(NEW.name, 'Instância') || CASE WHEN NEW.number IS NOT NULL AND NEW.number <> '' THEN ' (' || NEW.number || ')' ELSE '' END || ' perdeu a conexão.',
      'warning'
    );
  END IF;

  -- Device reconnected
  IF OLD.status = ANY(_disconnected_statuses) AND NEW.status = ANY(_connected_statuses) THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.user_id,
      'Instância reconectou',
      COALESCE(NEW.name, 'Instância') || CASE WHEN NEW.number IS NOT NULL AND NEW.number <> '' THEN ' (' || NEW.number || ')' ELSE '' END || ' está conectada novamente.',
      'success'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to devices table
CREATE TRIGGER trg_notify_device_disconnect
AFTER UPDATE ON public.devices
FOR EACH ROW
EXECUTE FUNCTION public.notify_device_disconnect();
