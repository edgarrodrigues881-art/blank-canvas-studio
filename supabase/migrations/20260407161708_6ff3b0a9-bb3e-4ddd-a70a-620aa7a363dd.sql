
CREATE OR REPLACE FUNCTION public.get_daily_log_counts(p_user_id uuid, p_start text, p_end text)
RETURNS TABLE(source text, dt date, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'chip'::text AS source,
         (sent_at AT TIME ZONE 'America/Sao_Paulo')::date AS dt,
         COUNT(*) AS cnt
    FROM chip_conversation_logs
   WHERE user_id = p_user_id
     AND sent_at >= p_start::timestamptz
     AND sent_at <= p_end::timestamptz
   GROUP BY dt
  UNION ALL
  SELECT 'group'::text AS source,
         (sent_at AT TIME ZONE 'America/Sao_Paulo')::date AS dt,
         COUNT(*) AS cnt
    FROM group_interaction_logs
   WHERE user_id = p_user_id
     AND sent_at >= p_start::timestamptz
     AND sent_at <= p_end::timestamptz
   GROUP BY dt;
$$;
