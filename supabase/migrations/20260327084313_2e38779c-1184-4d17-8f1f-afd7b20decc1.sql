-- Performance indexes for frequently queried columns
-- These are CREATE INDEX IF NOT EXISTS to be safe

-- devices: user_id + status (sidebar stats, dashboard, warmup)
CREATE INDEX IF NOT EXISTS idx_devices_user_status ON public.devices (user_id, status);

-- warmup_cycles: user_id + phase (active cycles filter)
CREATE INDEX IF NOT EXISTS idx_warmup_cycles_user_phase ON public.warmup_cycles (user_id, phase);

-- warmup_cycles: device_id + phase (device detail page)
CREATE INDEX IF NOT EXISTS idx_warmup_cycles_device_phase ON public.warmup_cycles (device_id, phase);

-- warmup_daily_stats: user_id + stat_date (dashboard stats, messages today)
CREATE INDEX IF NOT EXISTS idx_warmup_daily_stats_user_date ON public.warmup_daily_stats (user_id, stat_date);

-- notifications: user_id + read (unread count, sidebar)
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications (user_id, read);

-- campaigns: user_id + status (campaign list, sidebar stats)
CREATE INDEX IF NOT EXISTS idx_campaigns_user_status ON public.campaigns (user_id, status);

-- warmup_audit_logs: user_id + cycle_id (audit log pages)
CREATE INDEX IF NOT EXISTS idx_warmup_audit_user_cycle ON public.warmup_audit_logs (user_id, cycle_id);

-- community_sessions: status + device (active session lookup)
CREATE INDEX IF NOT EXISTS idx_community_sessions_status ON public.community_sessions (status) WHERE status = 'active';

-- operation_logs: created_at (cleanup job)
CREATE INDEX IF NOT EXISTS idx_operation_logs_created ON public.operation_logs (created_at);

-- warmup_community_membership: device_id (community diagnostic)
CREATE INDEX IF NOT EXISTS idx_warmup_community_device ON public.warmup_community_membership (device_id);