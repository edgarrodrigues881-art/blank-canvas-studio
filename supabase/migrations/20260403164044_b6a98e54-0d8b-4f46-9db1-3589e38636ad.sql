
-- Remove duplicate trigger that causes double notifications
DROP TRIGGER IF EXISTS trg_notify_device_disconnect ON public.devices;

-- Also drop the duplicate function
DROP FUNCTION IF EXISTS public.notify_device_disconnect();
