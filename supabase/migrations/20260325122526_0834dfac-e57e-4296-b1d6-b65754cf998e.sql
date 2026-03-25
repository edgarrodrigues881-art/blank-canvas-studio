INSERT INTO public.warmup_daily_stats (device_id, user_id, stat_date, messages_sent, messages_failed, messages_total)
SELECT
  device_id,
  user_id,
  (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS stat_date,
  COUNT(*) FILTER (WHERE event_type IN ('group_msg_sent','group_interaction','autosave_msg_sent','autosave_interaction','community_msg_sent','community_interaction','community_turn_sent','community_conversation_completed')),
  COUNT(*) FILTER (WHERE event_type IN ('group_interaction_error','community_interaction_error','autosave_interaction_error')),
  COUNT(*)
FROM public.warmup_audit_logs
WHERE created_at > now() - interval '14 days'
  AND event_type IN (
    'group_msg_sent','group_interaction','autosave_msg_sent','autosave_interaction',
    'community_msg_sent','community_interaction','community_turn_sent','community_conversation_completed',
    'group_interaction_error','community_interaction_error','autosave_interaction_error'
  )
GROUP BY device_id, user_id, (created_at AT TIME ZONE 'America/Sao_Paulo')::date
ON CONFLICT (device_id, stat_date)
DO UPDATE SET
  messages_sent = EXCLUDED.messages_sent,
  messages_failed = EXCLUDED.messages_failed,
  messages_total = EXCLUDED.messages_total,
  updated_at = now();