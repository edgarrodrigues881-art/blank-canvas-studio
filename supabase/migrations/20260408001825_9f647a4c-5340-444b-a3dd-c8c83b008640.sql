-- Propagar JIDs conhecidos para todos os registros de warmup_instance_groups que têm o mesmo invite_link mas estão sem JID
UPDATE warmup_instance_groups AS target
SET group_jid = source.group_jid,
    join_status = 'joined',
    joined_at = COALESCE(target.joined_at, now()),
    updated_at = now()
FROM warmup_instance_groups AS source
WHERE source.group_jid IS NOT NULL
  AND target.group_jid IS NULL
  AND source.invite_link = target.invite_link
  AND source.id != target.id;