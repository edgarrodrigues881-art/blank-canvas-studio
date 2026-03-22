
DROP TRIGGER IF EXISTS on_campaign_status_change ON public.campaigns;
CREATE TRIGGER on_campaign_status_change
  AFTER UPDATE OF status ON public.campaigns
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_campaign_completed();
