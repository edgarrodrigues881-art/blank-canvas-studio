UPDATE warmup_instance_groups ig
SET cycle_id = c.id
FROM warmup_cycles c
WHERE c.device_id = ig.device_id
AND c.is_running = true
AND ig.cycle_id != c.id;