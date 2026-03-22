-- Add missing enum values to warmup_phase
ALTER TYPE public.warmup_phase ADD VALUE IF NOT EXISTS 'community_ramp_up';
ALTER TYPE public.warmup_phase ADD VALUE IF NOT EXISTS 'community_stable';