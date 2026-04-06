
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule job to process scheduled messages every minute
SELECT cron.schedule(
  'process-scheduled-messages',
  '* * * * *',
  $$
  SELECT extensions.http_post(
    url := 'https://amizwispkprvyrnwypws.supabase.co/functions/v1/process-scheduled-messages',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtaXp3aXNwa3Bydnlybnd5cHdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNjE4NTcsImV4cCI6MjA4OTYzNzg1N30.ovxoeF5CQiZnwfeg1w1uRIKLHFA5H0Axx693XvPw3fw"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
