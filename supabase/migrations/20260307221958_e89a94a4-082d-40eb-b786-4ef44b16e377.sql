
-- ══ AUTO-CLEANUP FUNCTION FOR OLD LOGS ══
-- Purges records older than 90 days from log tables

CREATE OR REPLACE FUNCTION public.cleanup_old_logs(_retention_days integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cutoff timestamptz := now() - (_retention_days || ' days')::interval;
  _result jsonb := '{}'::jsonb;
  _count integer;
BEGIN
  -- operation_logs
  DELETE FROM public.operation_logs WHERE created_at < _cutoff;
  GET DIAGNOSTICS _count = ROW_COUNT;
  _result := _result || jsonb_build_object('operation_logs', _count);

  -- admin_logs
  DELETE FROM public.admin_logs WHERE created_at < _cutoff;
  GET DIAGNOSTICS _count = ROW_COUNT;
  _result := _result || jsonb_build_object('admin_logs', _count);

  -- warmup_logs
  DELETE FROM public.warmup_logs WHERE created_at < _cutoff;
  GET DIAGNOSTICS _count = ROW_COUNT;
  _result := _result || jsonb_build_object('warmup_logs', _count);

  -- warmup_audit_logs
  DELETE FROM public.warmup_audit_logs WHERE created_at < _cutoff;
  GET DIAGNOSTICS _count = ROW_COUNT;
  _result := _result || jsonb_build_object('warmup_audit_logs', _count);

  -- group_join_logs
  DELETE FROM public.group_join_logs WHERE created_at < _cutoff;
  GET DIAGNOSTICS _count = ROW_COUNT;
  _result := _result || jsonb_build_object('group_join_logs', _count);

  -- report_wa_logs
  DELETE FROM public.report_wa_logs WHERE created_at < _cutoff;
  GET DIAGNOSTICS _count = ROW_COUNT;
  _result := _result || jsonb_build_object('report_wa_logs', _count);

  -- notifications (read, older than 30 days)
  DELETE FROM public.notifications WHERE read = true AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS _count = ROW_COUNT;
  _result := _result || jsonb_build_object('notifications_read', _count);

  RETURN _result;
END;
$$;

-- Enable extensions for cron scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
