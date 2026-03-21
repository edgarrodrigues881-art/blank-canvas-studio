
-- Clean up stale pending join_group jobs where the group is already joined
UPDATE public.warmup_jobs 
SET status = 'succeeded', updated_at = now(), last_error = 'Auto-reconciliado: grupo já joined'
WHERE job_type = 'join_group' 
AND status = 'pending'
AND EXISTS (
  SELECT 1 FROM public.warmup_instance_groups wig 
  WHERE wig.device_id = warmup_jobs.device_id 
  AND wig.group_id = (warmup_jobs.payload->>'group_id')::uuid 
  AND wig.join_status = 'joined'
);
