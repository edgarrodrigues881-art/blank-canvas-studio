ALTER TABLE public.service_contacts
ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'novo';

UPDATE public.service_contacts
SET pipeline_stage = CASE
  WHEN lower(coalesce(status, '')) IN ('perdido', 'lost') THEN 'perdido'
  WHEN lower(coalesce(status, '')) IN ('fechado', 'closed', 'won', 'cliente') THEN 'fechado'
  WHEN lower(coalesce(status, '')) IN ('negociacao', 'negociação') THEN 'negociacao'
  WHEN lower(coalesce(status, '')) IN ('interessado') THEN 'interessado'
  WHEN lower(coalesce(status, '')) IN ('respondeu') THEN 'respondeu'
  ELSE 'novo'
END
WHERE pipeline_stage IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_contacts_user_pipeline_stage
ON public.service_contacts (user_id, pipeline_stage);