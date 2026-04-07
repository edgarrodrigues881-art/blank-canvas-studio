REVOKE ALL ON FUNCTION public.get_daily_log_counts(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_daily_log_counts(uuid, text, text) TO authenticated;