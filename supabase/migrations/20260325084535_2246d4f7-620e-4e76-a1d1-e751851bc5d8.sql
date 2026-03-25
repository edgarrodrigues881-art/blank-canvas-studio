ALTER TABLE public.mass_inject_campaigns
  ADD COLUMN IF NOT EXISTS pause_reason text,
  ADD COLUMN IF NOT EXISTS rate_limit_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS timeout_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0;