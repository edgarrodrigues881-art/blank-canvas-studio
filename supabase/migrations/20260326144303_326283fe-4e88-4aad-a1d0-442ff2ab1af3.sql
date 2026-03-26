-- Push updated_at back 6 minutes so orphan recovery bypasses cooldown
UPDATE public.warmup_cycles
SET updated_at = now() - interval '6 minutes'
WHERE is_running = true AND daily_interaction_budget_target = 0;