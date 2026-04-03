-- Recreate the trigger that was accidentally dropped
-- This trigger fires the existing notify_device_status_change function
-- which creates notifications when devices connect/disconnect

DROP TRIGGER IF EXISTS trg_notify_device_status_change ON public.devices;

CREATE TRIGGER trg_notify_device_status_change
AFTER UPDATE ON public.devices
FOR EACH ROW
EXECUTE FUNCTION public.notify_device_status_change();