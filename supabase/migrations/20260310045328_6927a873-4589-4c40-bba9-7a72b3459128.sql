
CREATE OR REPLACE FUNCTION public.notify_campaign_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Completed
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.user_id,
      '✅ Campanha concluída',
      'A campanha "' || NEW.name || '" foi finalizada. ' ||
        COALESCE(NEW.sent_count, 0) || ' enviadas, ' ||
        COALESCE(NEW.delivered_count, 0) || ' entregues, ' ||
        COALESCE(NEW.failed_count, 0) || ' falhas.',
      'success'
    );
  END IF;

  -- Failed
  IF NEW.status = 'failed' AND (OLD.status IS DISTINCT FROM 'failed') THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.user_id,
      '❌ Campanha falhou',
      'A campanha "' || NEW.name || '" apresentou erro durante o envio.',
      'error'
    );
  END IF;

  -- Paused
  IF NEW.status = 'paused' AND (OLD.status IS DISTINCT FROM 'paused') THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.user_id,
      '⏸️ Campanha pausada',
      'A campanha "' || NEW.name || '" foi pausada. ' ||
        COALESCE(NEW.sent_count, 0) || '/' || COALESCE(NEW.total_contacts, 0) || ' enviadas.',
      'warning'
    );
  END IF;

  -- Canceled
  IF NEW.status = 'canceled' AND (OLD.status IS DISTINCT FROM 'canceled') THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.user_id,
      '🚫 Campanha cancelada',
      'A campanha "' || NEW.name || '" foi cancelada.',
      'warning'
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure the trigger exists on campaigns table
DROP TRIGGER IF EXISTS trg_notify_campaign_status ON public.campaigns;
CREATE TRIGGER trg_notify_campaign_status
  AFTER UPDATE ON public.campaigns
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_campaign_completed();
