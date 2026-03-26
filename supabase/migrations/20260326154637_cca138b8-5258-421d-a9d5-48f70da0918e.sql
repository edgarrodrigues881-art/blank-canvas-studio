-- Activate community_day for all chips already past day 2 in warmup
UPDATE warmup_community_membership wcm
SET community_day = GREATEST(1, wc.day_index - 1),
    daily_limit = CASE 
      WHEN wc.day_index <= 2 THEN 10
      WHEN wc.day_index <= 4 THEN 30
      WHEN wc.day_index <= 6 THEN 50
      ELSE 80
    END
FROM warmup_cycles wc
WHERE wc.device_id = wcm.device_id
  AND wc.is_running = true
  AND wc.day_index >= 2
  AND wcm.community_day = 0;