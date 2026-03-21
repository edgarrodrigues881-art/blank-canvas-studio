ALTER TABLE public.warmup_cycles ADD COLUMN group_source text NOT NULL DEFAULT 'system';

-- Also add a column to warmup_groups to distinguish system-provided vs user-custom groups
-- The warmup_groups table already exists per-user, we just need a flag
ALTER TABLE public.warmup_groups ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT false;