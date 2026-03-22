-- Create trigger for device status change notifications
CREATE TRIGGER on_device_status_change
  AFTER UPDATE OF status ON public.devices
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_device_disconnected();

-- Create trigger for campaign completion notifications
CREATE TRIGGER on_campaign_status_change
  AFTER UPDATE OF status ON public.campaigns
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_campaign_completed();