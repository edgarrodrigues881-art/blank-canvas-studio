CREATE INDEX IF NOT EXISTS idx_group_messages_group_sent
  ON public.group_messages (user_id, device_id, group_jid, sent_at DESC);

CREATE OR REPLACE FUNCTION public.trim_group_messages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cnt integer;
BEGIN
  -- Cheap probabilistic trim: only run ~1 in 25 inserts to avoid hot-path cost
  IF (random() > 0.04) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO _cnt
  FROM public.group_messages
  WHERE user_id = NEW.user_id
    AND device_id = NEW.device_id
    AND group_jid = NEW.group_jid;

  IF _cnt > 1000 THEN
    DELETE FROM public.group_messages
    WHERE id IN (
      SELECT id FROM public.group_messages
      WHERE user_id = NEW.user_id
        AND device_id = NEW.device_id
        AND group_jid = NEW.group_jid
      ORDER BY sent_at ASC
      LIMIT (_cnt - 1000)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trim_group_messages ON public.group_messages;
CREATE TRIGGER trg_trim_group_messages
AFTER INSERT ON public.group_messages
FOR EACH ROW EXECUTE FUNCTION public.trim_group_messages();