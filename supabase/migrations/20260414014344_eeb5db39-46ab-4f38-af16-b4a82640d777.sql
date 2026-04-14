
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS lead_temperature text DEFAULT 'frio',
ADD COLUMN IF NOT EXISTS pipeline_stage text DEFAULT NULL;

ALTER TABLE public.service_contacts
ADD COLUMN IF NOT EXISTS lead_temperature text DEFAULT 'frio';
