ALTER TABLE public.warmup_community_membership
  ADD COLUMN IF NOT EXISTS config_type text NOT NULL DEFAULT 'preset',
  ADD COLUMN IF NOT EXISTS daily_pairs_min integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS daily_pairs_max integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS target_messages_per_pair integer NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS cooldown_min_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS cooldown_max_minutes integer NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS partner_repeat_policy text NOT NULL DEFAULT 'avoid_same_day',
  ADD COLUMN IF NOT EXISTS cross_user_preference text NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS own_accounts_allowed boolean NOT NULL DEFAULT true;