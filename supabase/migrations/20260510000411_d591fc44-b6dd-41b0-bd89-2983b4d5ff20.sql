CREATE OR REPLACE FUNCTION public.normalize_conversation_unread_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_pending_received boolean;
  is_manual_mark_unread boolean;
BEGIN
  IF COALESCE(NEW.unread_count, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  is_manual_mark_unread := TG_OP = 'UPDATE'
    AND COALESCE(OLD.unread_count, 0) = 0
    AND COALESCE(NEW.unread_count, 0) = 1
    AND NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at
    AND NEW.last_message_at IS NOT DISTINCT FROM OLD.last_message_at;

  IF is_manual_mark_unread THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_messages m
    LEFT JOIN public.conversations sibling ON sibling.id = m.conversation_id
    WHERE m.user_id = NEW.user_id
      AND m.direction = 'received'
      AND (m.status = 'received' OR m.status IS NULL)
      AND (
        m.conversation_id = NEW.id
        OR (
          sibling.user_id = NEW.user_id
          AND sibling.device_id IS NOT DISTINCT FROM NEW.device_id
          AND sibling.remote_jid = NEW.remote_jid
        )
      )
    LIMIT 1
  ) INTO has_pending_received;

  IF NOT has_pending_received THEN
    NEW.unread_count := 0;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_conversation_unread_count_before_write ON public.conversations;
CREATE TRIGGER normalize_conversation_unread_count_before_write
BEFORE INSERT OR UPDATE OF unread_count ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.normalize_conversation_unread_count();

UPDATE public.conversations c
SET unread_count = 0
WHERE COALESCE(c.unread_count, 0) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.conversation_messages m
    LEFT JOIN public.conversations sibling ON sibling.id = m.conversation_id
    WHERE m.user_id = c.user_id
      AND m.direction = 'received'
      AND (m.status = 'received' OR m.status IS NULL)
      AND (
        m.conversation_id = c.id
        OR (
          sibling.user_id = c.user_id
          AND sibling.device_id IS NOT DISTINCT FROM c.device_id
          AND sibling.remote_jid = c.remote_jid
        )
      )
  );