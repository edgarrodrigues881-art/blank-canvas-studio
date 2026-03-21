ALTER TABLE public.admin_dispatch_templates
ADD COLUMN IF NOT EXISTS media_url text,
ADD COLUMN IF NOT EXISTS buttons jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.admin_dispatch_templates
SET buttons = '[]'::jsonb
WHERE buttons IS NULL;