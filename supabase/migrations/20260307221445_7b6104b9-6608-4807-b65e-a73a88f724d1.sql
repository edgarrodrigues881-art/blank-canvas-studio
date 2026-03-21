
-- ══ PERFORMANCE INDEXES ══
-- devices: most queried table
CREATE INDEX IF NOT EXISTS idx_devices_user_id_status ON public.devices (user_id, status);
CREATE INDEX IF NOT EXISTS idx_devices_user_id_login_type ON public.devices (user_id, login_type);

-- user_api_tokens: pool operations
CREATE INDEX IF NOT EXISTS idx_user_api_tokens_user_id_status ON public.user_api_tokens (user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_api_tokens_device_id ON public.user_api_tokens (device_id) WHERE device_id IS NOT NULL;

-- campaigns: listing and filtering
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id_status ON public.campaigns (user_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id_created_at ON public.campaigns (user_id, created_at DESC);

-- campaign_contacts: batch processing
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign_id_status ON public.campaign_contacts (campaign_id, status);

-- warmup_cycles: engine queries
CREATE INDEX IF NOT EXISTS idx_warmup_cycles_device_id_is_running ON public.warmup_cycles (device_id, is_running);
CREATE INDEX IF NOT EXISTS idx_warmup_cycles_user_id_phase ON public.warmup_cycles (user_id, phase);

-- warmup_jobs: tick processing
CREATE INDEX IF NOT EXISTS idx_warmup_jobs_status_run_at ON public.warmup_jobs (status, run_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_warmup_jobs_device_id_status ON public.warmup_jobs (device_id, status);
CREATE INDEX IF NOT EXISTS idx_warmup_jobs_cycle_id ON public.warmup_jobs (cycle_id);

-- subscriptions: plan checks (called on every request)
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id_created_at ON public.subscriptions (user_id, created_at DESC);

-- profiles: status checks
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles (status) WHERE status != 'active';

-- proxies: assignment
CREATE INDEX IF NOT EXISTS idx_proxies_user_id_status ON public.proxies (user_id, status);

-- contacts: listing
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON public.contacts (user_id);

-- notifications: user feed
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_read ON public.notifications (user_id, read, created_at DESC);

-- warmup_audit_logs: admin queries
CREATE INDEX IF NOT EXISTS idx_warmup_audit_logs_device_id ON public.warmup_audit_logs (device_id);
CREATE INDEX IF NOT EXISTS idx_warmup_audit_logs_cycle_id ON public.warmup_audit_logs (cycle_id) WHERE cycle_id IS NOT NULL;

-- operation_logs: admin and user queries
CREATE INDEX IF NOT EXISTS idx_operation_logs_user_id_created_at ON public.operation_logs (user_id, created_at DESC);

-- admin_logs: admin dashboard
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON public.admin_logs (created_at DESC);

-- warmup_community_membership: eligibility queries
CREATE INDEX IF NOT EXISTS idx_warmup_community_membership_device_id ON public.warmup_community_membership (device_id);

-- community_pairs: cycle lookups
CREATE INDEX IF NOT EXISTS idx_community_pairs_cycle_id ON public.community_pairs (cycle_id);

-- warmup_instance_groups: device group lookups
CREATE INDEX IF NOT EXISTS idx_warmup_instance_groups_device_id ON public.warmup_instance_groups (device_id);

-- subscription_cycles: user history
CREATE INDEX IF NOT EXISTS idx_subscription_cycles_user_id ON public.subscription_cycles (user_id);
