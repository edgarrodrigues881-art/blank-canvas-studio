
-- Add pais column to prospeccao_cache
ALTER TABLE public.prospeccao_cache ADD COLUMN IF NOT EXISTS pais text NOT NULL DEFAULT 'BR';

-- Clear all existing cache to force fresh pulls (fixes stale data issue)
DELETE FROM public.prospeccao_cache;
