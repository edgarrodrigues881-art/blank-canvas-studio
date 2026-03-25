CREATE OR REPLACE FUNCTION public.upsert_warmup_daily_stat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _stat_date date;
  _is_sent boolean;
  _is_failed boolean;
BEGIN
  _is_sent := NEW.event_type IN (
    'group_msg_sent', 'group_interaction',
    'autosave_msg_sent', 'autosave_interaction',
    'community_msg_sent', 'community_interaction',
    'community_turn_sent', 'community_conversation_completed'
  );
  _is_failed := NEW.event_type IN (
    'group_interaction_error', 'community_interaction_error',
    'autosave_interaction_error'
  );

  IF NOT _is_sent AND NOT _is_failed THEN
    RETURN NEW;
  END IF;

  _stat_date := (NEW.created_at AT TIME ZONE 'America/Sao_Paulo')::date;

  INSERT INTO public.warmup_daily_stats (device_id, user_id, stat_date, messages_sent, messages_failed, messages_total)
  VALUES (
    NEW.device_id,
    NEW.user_id,
    _stat_date,
    CASE WHEN _is_sent THEN 1 ELSE 0 END,
    CASE WHEN _is_failed THEN 1 ELSE 0 END,
    1
  )
  ON CONFLICT (device_id, stat_date)
  DO UPDATE SET
    messages_sent = warmup_daily_stats.messages_sent + CASE WHEN _is_sent THEN 1 ELSE 0 END,
    messages_failed = warmup_daily_stats.messages_failed + CASE WHEN _is_failed THEN 1 ELSE 0 END,
    messages_total = warmup_daily_stats.messages_total + 1,
    updated_at = now();

  RETURN NEW;
END;
$$;

ALTER TABLE public.warmup_daily_stats ADD CONSTRAINT warmup_daily_stats_device_date_uq UNIQUE (device_id, stat_date);

DROP TRIGGER IF EXISTS trg_warmup_daily_stats ON public.warmup_audit_logs;
CREATE TRIGGER trg_warmup_daily_stats
  AFTER INSERT ON public.warmup_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.upsert_warmup_daily_stat();