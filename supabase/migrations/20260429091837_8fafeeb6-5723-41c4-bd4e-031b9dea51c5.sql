SELECT cron.schedule(
  'status-schedule-tick-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url:='https://amizwispkprvyrnwypws.supabase.co/functions/v1/status-schedule-tick',
    headers:='{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtaXp3aXNwa3Bydnlybnd5cHdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNjE4NTcsImV4cCI6MjA4OTYzNzg1N30.ovxoeF5CQiZnwfeg1w1uRIKLHFA5H0Axx693XvPw3fw"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);