
UPDATE warmup_community_membership wm
SET community_day = 1
FROM warmup_cycles wc
WHERE wc.device_id = wm.device_id
  AND wc.is_running = true
  AND wc.phase IN ('community_ramp_up', 'community_stable')
  AND wm.community_day = 0;
