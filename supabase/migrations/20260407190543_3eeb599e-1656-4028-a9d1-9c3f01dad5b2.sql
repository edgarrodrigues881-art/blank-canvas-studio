-- Reset today_count and reschedule all running interactions so they fire immediately
UPDATE group_interactions 
SET today_count = 0, 
    next_action_at = now() + interval '5 seconds'
WHERE status IN ('running', 'active') 
  AND daily_limit_total = 0;