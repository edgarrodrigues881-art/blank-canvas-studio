
-- Garante extensões
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove job anterior se existir (idempotente)
DO $$
DECLARE _jid bigint;
BEGIN
  SELECT jobid INTO _jid FROM cron.job WHERE jobname = 'process-scheduled-messages-fallback';
  IF _jid IS NOT NULL THEN PERFORM cron.unschedule(_jid); END IF;
END $$;

-- Agenda a cada minuto
SELECT cron.schedule(
  'process-scheduled-messages-fallback',
  '* * * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://amizwispkprvyrnwypws.supabase.co/functions/v1/process-scheduled-messages',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtaXp3aXNwa3Bydnlybnd5cHdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNjE4NTcsImV4cCI6MjA4OTYzNzg1N30.ovxoeF5CQiZnwfeg1w1uRIKLHFA5H0Axx693XvPw3fw"}'::jsonb,
      body := '{"trigger":"cron"}'::jsonb
    );
  $cron$
);
