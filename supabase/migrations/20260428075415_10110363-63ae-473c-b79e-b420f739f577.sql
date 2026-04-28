
-- Enable extensions for HTTP-based cron (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule previous version if exists
DO $$
BEGIN
  PERFORM cron.unschedule('notify-reminders-every-minute');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule the reminder scanner every minute
SELECT cron.schedule(
  'notify-reminders-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://amizwispkprvyrnwypws.supabase.co/functions/v1/notify-reminders-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsImtpZCI6Imo5dXFGSjJVNm9JQTJsK3oiLCJ0eXAiOiJKV1QifQ'
    ),
    body := jsonb_build_object('time', now())
  );
  $$
);
