-- Add 'source' flag to isolate Group CRM templates from primary system / CRM
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'main';

ALTER TABLE public.carousel_templates
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'main';

CREATE INDEX IF NOT EXISTS idx_templates_user_source ON public.templates(user_id, source);
CREATE INDEX IF NOT EXISTS idx_carousel_templates_user_source ON public.carousel_templates(user_id, source);