
-- Close excess community pairs: keep max 2 per device
-- For each device with >2 active pairs, close the newest ones (keeping oldest 2)

WITH device_pair_counts AS (
  SELECT device_id, pair_id, pair_created_at,
    ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY pair_created_at ASC) as rn
  FROM (
    SELECT instance_id_a as device_id, id as pair_id, created_at as pair_created_at
    FROM community_pairs WHERE status = 'active'
    UNION ALL
    SELECT instance_id_b as device_id, id as pair_id, created_at as pair_created_at
    FROM community_pairs WHERE status = 'active'
  ) all_pairs
),
excess_pairs AS (
  SELECT DISTINCT pair_id
  FROM device_pair_counts
  WHERE rn > 2
)
UPDATE community_pairs
SET status = 'closed', closed_at = now()
WHERE id IN (SELECT pair_id FROM excess_pairs)
AND status = 'active';
