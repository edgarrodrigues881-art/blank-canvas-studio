
-- Update existing cron job to be shard 0 of 5
SELECT cron.alter_job(
  16,
  command := $$
  SELECT net.http_post(
    url := (SELECT value FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/warmup-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'INTERNAL_TICK_SECRET' LIMIT 1)
    ),
    body := '{"action":"tick","source":"cron","shard":0,"shards":5}'::jsonb
  ) AS request_id;
  $$
);

-- Add shard 1
SELECT cron.schedule(
  'warmup-tick-shard-1',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/warmup-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'INTERNAL_TICK_SECRET' LIMIT 1)
    ),
    body := '{"action":"tick","source":"cron","shard":1,"shards":5}'::jsonb
  ) AS request_id;
  $$
);

-- Add shard 2
SELECT cron.schedule(
  'warmup-tick-shard-2',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/warmup-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'INTERNAL_TICK_SECRET' LIMIT 1)
    ),
    body := '{"action":"tick","source":"cron","shard":2,"shards":5}'::jsonb
  ) AS request_id;
  $$
);

-- Add shard 3
SELECT cron.schedule(
  'warmup-tick-shard-3',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/warmup-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'INTERNAL_TICK_SECRET' LIMIT 1)
    ),
    body := '{"action":"tick","source":"cron","shard":3,"shards":5}'::jsonb
  ) AS request_id;
  $$
);

-- Add shard 4
SELECT cron.schedule(
  'warmup-tick-shard-4',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/warmup-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'INTERNAL_TICK_SECRET' LIMIT 1)
    ),
    body := '{"action":"tick","source":"cron","shard":4,"shards":5}'::jsonb
  ) AS request_id;
  $$
);
