DROP TRIGGER IF EXISTS trg_notify_device_status_change ON public.devices;

CREATE TRIGGER trg_notify_device_status_change
AFTER UPDATE OF status ON public.devices
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.notify_device_status_change();