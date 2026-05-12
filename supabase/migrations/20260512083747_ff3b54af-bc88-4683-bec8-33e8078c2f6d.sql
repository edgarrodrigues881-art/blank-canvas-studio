CREATE OR REPLACE FUNCTION public.trim_group_messages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cnt integer;
BEGIN
  IF (random() > 0.04) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO _cnt
  FROM public.group_messages
  WHERE user_id = NEW.user_id
    AND device_id = NEW.device_id
    AND group_jid = NEW.group_jid;

  IF _cnt > 300 THEN
    DELETE FROM public.group_messages
    WHERE id IN (
      SELECT id FROM public.group_messages
      WHERE user_id = NEW.user_id
        AND device_id = NEW.device_id
        AND group_jid = NEW.group_jid
      ORDER BY sent_at ASC
      LIMIT (_cnt - 300)
    );
  END IF;

  RETURN NEW;
END;
$$;