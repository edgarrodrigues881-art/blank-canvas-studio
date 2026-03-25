CREATE OR REPLACE FUNCTION public.cleanup_old_logs(_retention_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _cutoff timestamptz := now() - (_retention_days || ' days')::interval;
  _result jsonb := '{}'::jsonb;
  _count integer;
BEGIN
  DELETE FROM public.warmup_audit_logs WHERE created_at < _cutoff;
  GET DIAGNOSTICS _count = ROW_COUNT;
  _result := _result || jsonb_build_object('warmup_audit_logs', _count);

  DELETE FROM public.operation_logs WHERE created_at < _cutoff;
  GET DIAGNOSTICS _count = ROW_COUNT;
  _result := _result || jsonb_build_object('operation_logs', _count);

  DELETE FROM public.admin_logs WHERE created_at < _cutoff;
  GET DIAGNOSTICS _count = ROW_COUNT;
  _result := _result || jsonb_build_object('admin_logs', _count);

  DELETE FROM public.community_warmup_logs WHERE created_at < _cutoff;
  GET DIAGNOSTICS _count = ROW_COUNT;
  _result := _result || jsonb_build_object('community_warmup_logs', _count);

  DELETE FROM public.group_interaction_logs WHERE created_at < _cutoff;
  GET DIAGNOSTICS _count = ROW_COUNT;
  _result := _result || jsonb_build_object('group_interaction_logs', _count);

  DELETE FROM public.chip_conversation_logs WHERE created_at < _cutoff;
  GET DIAGNOSTICS _count = ROW_COUNT;
  _result := _result || jsonb_build_object('chip_conversation_logs', _count);

  DELETE FROM public.group_join_logs WHERE created_at < _cutoff;
  GET DIAGNOSTICS _count = ROW_COUNT;
  _result := _result || jsonb_build_object('group_join_logs', _count);

  -- Clean consumed events older than retention period, skipping active campaigns
  DELETE FROM public.mass_inject_events e
  WHERE e.created_at < _cutoff
    AND e.consumed = true
    AND NOT EXISTS (
      SELECT 1 FROM public.mass_inject_campaigns c
      WHERE c.id = e.campaign_id AND c.status IN ('queued', 'running', 'processing')
    );
  GET DIAGNOSTICS _count = ROW_COUNT;
  _result := _result || jsonb_build_object('mass_inject_events', _count);

  RETURN _result;
END;
$function$;