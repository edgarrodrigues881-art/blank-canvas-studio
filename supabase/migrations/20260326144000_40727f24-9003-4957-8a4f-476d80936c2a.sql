-- Reset daily budgets on all running cycles so warmup-tick regenerates with new 120-200 group volume
UPDATE public.warmup_cycles
SET 
  daily_interaction_budget_used = 0,
  daily_interaction_budget_target = 0,
  daily_unique_recipients_used = 0,
  last_daily_reset_at = now(),
  updated_at = now()
WHERE is_running = true;

-- Cancel all pending/running jobs so they get regenerated with new volumes
UPDATE public.warmup_jobs
SET status = 'cancelled', last_error = 'Reset para nova regra de volume 120-200'
WHERE status IN ('pending', 'running')
AND cycle_id IN (SELECT id FROM public.warmup_cycles WHERE is_running = true);