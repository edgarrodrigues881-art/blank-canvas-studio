-- Fix NULL group_jid for DG CONTINGÊNCIA groups where we know the JID
UPDATE warmup_instance_groups wig
SET group_jid = sub.known_jid, updated_at = now()
FROM (
  SELECT wgp.id as group_id, MIN(wig2.group_jid) as known_jid
  FROM warmup_groups_pool wgp
  JOIN warmup_instance_groups wig2 ON wig2.group_id = wgp.id
  WHERE wig2.group_jid IS NOT NULL
  GROUP BY wgp.id
) sub
WHERE wig.group_id = sub.group_id
AND wig.group_jid IS NULL
AND wig.join_status = 'joined';