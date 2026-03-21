
ALTER TABLE public.warmup_sessions 
ADD COLUMN IF NOT EXISTS quality_profile text NOT NULL DEFAULT 'novo',
ADD COLUMN IF NOT EXISTS safety_state text NOT NULL DEFAULT 'normal';
