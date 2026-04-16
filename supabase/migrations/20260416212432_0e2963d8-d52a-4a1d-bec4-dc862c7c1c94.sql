ALTER TABLE public.campaigns
DROP CONSTRAINT IF EXISTS campaigns_template_id_fkey;

ALTER TABLE public.campaigns
ADD CONSTRAINT campaigns_template_id_fkey
FOREIGN KEY (template_id)
REFERENCES public.templates(id)
ON DELETE SET NULL;