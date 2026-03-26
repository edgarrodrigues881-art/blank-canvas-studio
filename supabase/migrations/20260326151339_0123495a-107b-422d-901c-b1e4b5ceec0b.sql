-- Clean up orphan community_pairs created by community-core (have no session_id)
UPDATE community_pairs 
SET status = 'closed', closed_at = now() 
WHERE status = 'active' AND session_id IS NULL;

-- Recover stuck running community_interaction jobs
UPDATE warmup_jobs 
SET status = 'pending', run_at = now(), last_error = 'Recuperado de running travado'
WHERE job_type = 'community_interaction' AND status = 'running' AND updated_at < now() - interval '3 minutes';