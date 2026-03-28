
SELECT cron.schedule(
  'report-wa-cron-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:=concat(
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1),
      '/functions/v1/report-wa-cron'
    ),
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', concat('Bearer ', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1))
    ),
    body:='{"time": "now"}'::jsonb
  ) AS request_id;
  $$
);
