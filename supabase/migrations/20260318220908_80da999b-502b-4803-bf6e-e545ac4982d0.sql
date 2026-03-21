
CREATE OR REPLACE FUNCTION public.increment_warmup_budget(
  p_cycle_id uuid,
  p_increment int DEFAULT 1,
  p_unique_recipient boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _result jsonb;
BEGIN
  UPDATE public.warmup_cycles
  SET
    daily_interaction_budget_used = daily_interaction_budget_used + p_increment,
    daily_unique_recipients_used = daily_unique_recipients_used + CASE WHEN p_unique_recipient THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE id = p_cycle_id
  RETURNING jsonb_build_object(
    'used', daily_interaction_budget_used,
    'target', daily_interaction_budget_target,
    'recipients_used', daily_unique_recipients_used
  ) INTO _result;

  RETURN _result;
END;
$$;
