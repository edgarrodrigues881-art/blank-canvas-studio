DO $$
DECLARE
  existing_job_id integer;
BEGIN
  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'warmup-tick-job'
  ORDER BY jobid DESC
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'warmup-tick-job',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://amizwispkprvyrnwypws.supabase.co/functions/v1/warmup-tick',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtaXp3aXNwa3Bydnlybnd5cHdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNjE4NTcsImV4cCI6MjA4OTYzNzg1N30.ovxoeF5CQiZnwfeg1w1uRIKLHFA5H0Axx693XvPw3fw"}'::jsonb,
    body := '{"source":"pg_cron"}'::jsonb
  ) as request_id;
  $$
);