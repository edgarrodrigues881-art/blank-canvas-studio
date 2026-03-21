
CREATE OR REPLACE FUNCTION public.notify_campaign_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _recent_count integer;
  _profile_status text;
BEGIN
  -- Skip if user account is suspended/cancelled/deleted (account deletion cleanup)
  SELECT status INTO _profile_status FROM public.profiles WHERE id = NEW.user_id;
  IF _profile_status IN ('suspended', 'cancelled', 'deleted') THEN
    RETURN NEW;
  END IF;

  -- Completed
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    SELECT COUNT(*) INTO _recent_count FROM public.notifications
    WHERE user_id = NEW.user_id AND title = '✅ Campanha concluída' AND message LIKE '%' || NEW.name || '%'
      AND created_at > now() - interval '60 seconds';
    IF _recent_count = 0 THEN
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
  END IF;

  -- Failed
  IF NEW.status = 'failed' AND (OLD.status IS DISTINCT FROM 'failed') THEN
    SELECT COUNT(*) INTO _recent_count FROM public.notifications
    WHERE user_id = NEW.user_id AND title = '❌ Campanha falhou' AND message LIKE '%' || NEW.name || '%'
      AND created_at > now() - interval '60 seconds';
    IF _recent_count = 0 THEN
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (
        NEW.user_id,
        '❌ Campanha falhou',
        'A campanha "' || NEW.name || '" apresentou erro durante o envio.',
        'error'
      );
    END IF;
  END IF;

  -- Paused
  IF NEW.status = 'paused' AND (OLD.status IS DISTINCT FROM 'paused') THEN
    SELECT COUNT(*) INTO _recent_count FROM public.notifications
    WHERE user_id = NEW.user_id AND title = '⏸️ Campanha pausada' AND message LIKE '%' || NEW.name || '%'
      AND created_at > now() - interval '60 seconds';
    IF _recent_count = 0 THEN
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (
        NEW.user_id,
        '⏸️ Campanha pausada',
        'A campanha "' || NEW.name || '" foi pausada. ' ||
          COALESCE(NEW.sent_count, 0) || '/' || COALESCE(NEW.total_contacts, 0) || ' enviadas.',
        'warning'
      );
    END IF;
  END IF;

  -- Canceled
  IF NEW.status = 'canceled' AND (OLD.status IS DISTINCT FROM 'canceled') THEN
    SELECT COUNT(*) INTO _recent_count FROM public.notifications
    WHERE user_id = NEW.user_id AND title = '🚫 Campanha cancelada' AND message LIKE '%' || NEW.name || '%'
      AND created_at > now() - interval '60 seconds';
    IF _recent_count = 0 THEN
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (
        NEW.user_id,
        '🚫 Campanha cancelada',
        'A campanha "' || NEW.name || '" foi cancelada.',
        'warning'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
