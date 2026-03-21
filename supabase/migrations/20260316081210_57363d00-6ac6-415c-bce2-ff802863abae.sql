
-- Table to persist daily message aggregates per user per device
CREATE TABLE public.warmup_daily_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id uuid NOT NULL,
  stat_date date NOT NULL DEFAULT CURRENT_DATE,
  messages_sent integer NOT NULL DEFAULT 0,
  messages_failed integer NOT NULL DEFAULT 0,
  messages_total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id, stat_date)
);

-- Index for fast lookups
CREATE INDEX idx_warmup_daily_stats_user_date ON public.warmup_daily_stats (user_id, stat_date);
CREATE INDEX idx_warmup_daily_stats_device_date ON public.warmup_daily_stats (device_id, stat_date);

-- RLS
ALTER TABLE public.warmup_daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own daily stats"
  ON public.warmup_daily_stats FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all daily stats"
  ON public.warmup_daily_stats FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger function: auto-increment stats when audit log is inserted
CREATE OR REPLACE FUNCTION public.increment_daily_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _interaction_events text[] := ARRAY[
    'group_msg_sent', 'autosave_msg_sent', 'community_msg_sent',
    'autosave_interaction', 'community_interaction', 'group_interaction'
  ];
  _is_sent boolean;
  _is_failed boolean;
BEGIN
  -- Only process interaction events
  IF NOT (NEW.event_type = ANY(_interaction_events)) THEN
    RETURN NEW;
  END IF;

  _is_sent := (NEW.level = 'info');
  _is_failed := (NEW.level = 'error');

  INSERT INTO public.warmup_daily_stats (user_id, device_id, stat_date, messages_sent, messages_failed, messages_total)
  VALUES (
    NEW.user_id,
    NEW.device_id,
    CURRENT_DATE,
    CASE WHEN _is_sent THEN 1 ELSE 0 END,
    CASE WHEN _is_failed THEN 1 ELSE 0 END,
    1
  )
  ON CONFLICT (user_id, device_id, stat_date)
  DO UPDATE SET
    messages_sent = warmup_daily_stats.messages_sent + CASE WHEN _is_sent THEN 1 ELSE 0 END,
    messages_failed = warmup_daily_stats.messages_failed + CASE WHEN _is_failed THEN 1 ELSE 0 END,
    messages_total = warmup_daily_stats.messages_total + 1,
    updated_at = now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_increment_daily_stats
  AFTER INSERT ON public.warmup_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_daily_stats();

-- Backfill existing data for the last 30 days
INSERT INTO public.warmup_daily_stats (user_id, device_id, stat_date, messages_sent, messages_failed, messages_total)
SELECT
  user_id,
  device_id,
  (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS stat_date,
  COUNT(*) FILTER (WHERE level = 'info') AS messages_sent,
  COUNT(*) FILTER (WHERE level = 'error') AS messages_failed,
  COUNT(*) AS messages_total
FROM public.warmup_audit_logs
WHERE event_type IN ('group_msg_sent', 'autosave_msg_sent', 'community_msg_sent', 'autosave_interaction', 'community_interaction', 'group_interaction')
  AND created_at >= now() - interval '30 days'
GROUP BY user_id, device_id, (created_at AT TIME ZONE 'America/Sao_Paulo')::date
ON CONFLICT (user_id, device_id, stat_date) DO UPDATE SET
  messages_sent = EXCLUDED.messages_sent,
  messages_failed = EXCLUDED.messages_failed,
  messages_total = EXCLUDED.messages_total,
  updated_at = now();
