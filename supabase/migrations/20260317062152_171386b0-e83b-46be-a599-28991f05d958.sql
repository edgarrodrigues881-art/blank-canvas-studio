-- Remove ghost pending groups without invite_link (created by old backfill)
DELETE FROM public.warmup_instance_groups
WHERE join_status = 'pending'
  AND (invite_link IS NULL OR invite_link = '')
  AND (group_name IS NULL OR group_name = '' OR group_name = 'Grupo');

-- Cancel failed join_group jobs referencing ghost groups (error contains "sem link")
UPDATE public.warmup_jobs
SET status = 'cancelled', updated_at = now()
WHERE job_type = 'join_group'
  AND status IN ('pending', 'failed')
  AND last_error ILIKE '%sem link%';