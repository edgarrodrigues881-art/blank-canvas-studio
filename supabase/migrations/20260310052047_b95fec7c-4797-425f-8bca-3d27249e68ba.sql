
-- Fix stale counters on all campaigns by syncing from campaign_contacts (source of truth)
UPDATE public.campaigns c SET
  sent_count = sub.real_sent,
  delivered_count = sub.real_sent,
  failed_count = sub.real_failed,
  total_contacts = sub.real_total
FROM (
  SELECT 
    cc.campaign_id,
    COUNT(*) FILTER (WHERE cc.status = 'sent') as real_sent,
    COUNT(*) FILTER (WHERE cc.status = 'failed') as real_failed,
    COUNT(*) as real_total
  FROM public.campaign_contacts cc
  GROUP BY cc.campaign_id
) sub
WHERE c.id = sub.campaign_id
  AND (c.sent_count != sub.real_sent OR c.failed_count != sub.real_failed);
