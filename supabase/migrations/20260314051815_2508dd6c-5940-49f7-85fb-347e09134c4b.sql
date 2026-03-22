
-- Fix orphaned warmup_instance_groups: update cycle_id to match the active running cycle for each device
UPDATE warmup_instance_groups wig
SET cycle_id = wc.id
FROM warmup_cycles wc
WHERE wc.device_id = wig.device_id
  AND wc.is_running = true
  AND wig.cycle_id != wc.id;
