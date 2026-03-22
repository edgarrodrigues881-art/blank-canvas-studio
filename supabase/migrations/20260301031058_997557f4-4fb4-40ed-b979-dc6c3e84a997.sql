-- Add per-type group columns to report_wa_configs
ALTER TABLE public.report_wa_configs
  ADD COLUMN IF NOT EXISTS warmup_group_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS warmup_group_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS campaigns_group_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS campaigns_group_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS connection_group_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS connection_group_name text DEFAULT NULL;

-- Migrate existing data: copy current group_id/group_name to all types
UPDATE public.report_wa_configs
SET 
  warmup_group_id = group_id,
  warmup_group_name = group_name,
  campaigns_group_id = group_id,
  campaigns_group_name = group_name,
  connection_group_id = group_id,
  connection_group_name = group_name
WHERE group_id IS NOT NULL;