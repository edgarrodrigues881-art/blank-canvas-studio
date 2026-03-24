
-- ═══════════════════════════════════════════════════════════
-- Performance Optimization: Missing Indices for Hot Queries
-- ═══════════════════════════════════════════════════════════

-- Notifications: unread count per user (sidebar stats)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
  ON public.notifications (user_id, read) WHERE read = false;

-- Campaigns: active campaigns count per user (sidebar stats)
CREATE INDEX IF NOT EXISTS idx_campaigns_user_active_status
  ON public.campaigns (user_id, status) WHERE status IN ('processing', 'pending', 'scheduled', 'running');

-- Campaign contacts: pending contacts per campaign (dispatch processing)
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign_pending
  ON public.campaign_contacts (campaign_id, status) WHERE status = 'pending';

-- Community warmup configs: active configs per user
CREATE INDEX IF NOT EXISTS idx_community_warmup_configs_user_active
  ON public.community_warmup_configs (user_id, is_active) WHERE is_active = true;

-- Announcements: active announcements (global query)
CREATE INDEX IF NOT EXISTS idx_announcements_active
  ON public.announcements (is_active, created_at DESC) WHERE is_active = true;

-- Announcement dismissals: per user lookup
CREATE INDEX IF NOT EXISTS idx_announcement_dismissals_user
  ON public.announcement_dismissals (user_id, announcement_id);

-- Operation logs: device + event for 404 strike lookups
CREATE INDEX IF NOT EXISTS idx_operation_logs_device_event_created
  ON public.operation_logs (device_id, event, created_at DESC);

-- Warmup audit logs: cycle + created for log viewing  
CREATE INDEX IF NOT EXISTS idx_warmup_audit_logs_cycle_created
  ON public.warmup_audit_logs (cycle_id, created_at);

-- Warmup audit logs: user + created for user log queries
CREATE INDEX IF NOT EXISTS idx_warmup_audit_logs_user_created
  ON public.warmup_audit_logs (user_id, created_at DESC);

-- Community warmup logs: user + created for recent logs
CREATE INDEX IF NOT EXISTS idx_community_warmup_logs_user_created
  ON public.community_warmup_logs (user_id, created_at DESC);

-- Group interaction logs: user + sent_at for recent logs
CREATE INDEX IF NOT EXISTS idx_group_interaction_logs_user_sent
  ON public.group_interaction_logs (user_id, sent_at DESC);

-- Chip conversation logs: conversation + sent_at for log viewing
CREATE INDEX IF NOT EXISTS idx_chip_conversation_logs_conv_sent
  ON public.chip_conversation_logs (conversation_id, sent_at DESC);

-- ═══════════════════════════════════════════════════════════
-- Auto-cleanup: Schedule old log purge (extend cleanup_old_logs)
-- ═══════════════════════════════════════════════════════════

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

  RETURN _result;
END;
$function$;
