
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove old schedule with same name if exists
DO $$
BEGIN
  PERFORM cron.unschedule('crm-followup-dispatch-every-min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'crm-followup-dispatch-every-min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://amizwispkprvyrnwypws.supabase.co/functions/v1/crm-followup-dispatch',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtaXp3aXNwa3Bydnlybnd5cHdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNjE4NTcsImV4cCI6MjA4OTYzNzg1N30.ovxoeF5CQiZnwfeg1w1uRIKLHFA5H0Axx693XvPw3fw"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
