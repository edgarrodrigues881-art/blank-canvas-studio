
-- The FK was already dropped in the failed migration. 
-- Don't re-add FK — keep group_id as plain UUID (references warmup_groups for new data, old data has pool IDs)
-- Just add helper columns
ALTER TABLE public.warmup_instance_groups 
  ADD COLUMN IF NOT EXISTS invite_link text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS group_name text DEFAULT NULL;
