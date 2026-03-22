UPDATE warmup_jobs SET status = 'cancelled', last_error = 'Limpeza manual - reload geral', updated_at = now()
WHERE status IN ('pending', 'failed') AND job_type IN ('group_interaction', 'autosave_interaction', 'community_interaction');

UPDATE warmup_jobs SET status = 'cancelled', last_error = 'Limpeza manual - reload geral', updated_at = now()
WHERE status IN ('pending', 'failed') AND job_type = 'daily_reset';