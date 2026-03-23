-- ═══════════════════════════════════════════════════════════
-- 1. AUTO-CREATE PROFILE ON AUTH SIGNUP
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _phone text;
  _full_name text;
  _company text;
  _existing_profile_id uuid;
  _old_full_name text;
BEGIN
  _phone := COALESCE(NEW.raw_user_meta_data->>'phone', '');
  _full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  _company := COALESCE(NEW.raw_user_meta_data->>'company', '');

  IF _phone <> '' THEN
    SELECT id, full_name INTO _existing_profile_id, _old_full_name
    FROM public.profiles
    WHERE phone = _phone
      AND id NOT IN (SELECT au.id FROM auth.users au)
    LIMIT 1;
  END IF;

  IF _existing_profile_id IS NOT NULL THEN
    UPDATE public.devices SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.subscriptions SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.subscription_cycles SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.campaigns SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.contacts SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.templates SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.proxies SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.delay_profiles SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.user_api_tokens SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.warmup_autosave_contacts SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.notifications SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.alerts SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.operation_logs SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    DELETE FROM public.profiles WHERE id = _existing_profile_id;
    INSERT INTO public.profiles (id, full_name, phone, company, client_type, status, created_at, updated_at)
    VALUES (NEW.id, COALESCE(NULLIF(_full_name, ''), _old_full_name), _phone, _company, 'normal', 'active', now(), now());
  ELSE
    INSERT INTO public.profiles (id, full_name, phone, company, client_type, status, created_at, updated_at)
    VALUES (NEW.id, _full_name, _phone, _company, 'normal', 'active', now(), now())
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ═══════════════════════════════════════════════════════════
-- 2. SCALABILITY INDEXES
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_devices_user_id ON public.devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON public.devices(status);
CREATE INDEX IF NOT EXISTS idx_warmup_cycles_device_id ON public.warmup_cycles(device_id);
CREATE INDEX IF NOT EXISTS idx_warmup_cycles_user_id ON public.warmup_cycles(user_id);
CREATE INDEX IF NOT EXISTS idx_warmup_cycles_is_running ON public.warmup_cycles(is_running) WHERE is_running = true;
CREATE INDEX IF NOT EXISTS idx_warmup_jobs_status_run_at ON public.warmup_jobs(status, run_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_warmup_jobs_cycle_id ON public.warmup_jobs(cycle_id);
CREATE INDEX IF NOT EXISTS idx_warmup_logs_device_id_created ON public.warmup_logs(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warmup_logs_user_id ON public.warmup_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON public.campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_cid_status ON public.campaign_contacts(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_active ON public.campaign_contacts(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON public.contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_operation_logs_uid_created ON public.operation_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_logs_device_id ON public.operation_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_message_queue_pending ON public.message_queue(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_message_queue_user_id ON public.message_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_cwc_device_id ON public.community_warmup_configs(device_id);
CREATE INDEX IF NOT EXISTS idx_cwc_user_id ON public.community_warmup_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_cwl_device_id ON public.community_warmup_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_cp_cycle_id ON public.community_pairs(cycle_id);
CREATE INDEX IF NOT EXISTS idx_cp_instance_a ON public.community_pairs(instance_id_a);
CREATE INDEX IF NOT EXISTS idx_cp_instance_b ON public.community_pairs(instance_id_b);
CREATE INDEX IF NOT EXISTS idx_proxies_user_id ON public.proxies(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_uid_resolved ON public.alerts(user_id, resolved);
CREATE INDEX IF NOT EXISTS idx_wds_device_id ON public.warmup_daily_stats(device_id);
CREATE INDEX IF NOT EXISTS idx_wds_date ON public.warmup_daily_stats(stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_wur_cycle_id ON public.warmup_unique_recipients(cycle_id);
CREATE INDEX IF NOT EXISTS idx_templates_user_id ON public.templates(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_chip_conv_user_id ON public.chip_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chip_conv_logs_cid ON public.chip_conversation_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_gi_user_id ON public.group_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_gil_iid ON public.group_interaction_logs(interaction_id);
CREATE INDEX IF NOT EXISTS idx_af_user_id ON public.autoreply_flows(user_id);
CREATE INDEX IF NOT EXISTS idx_as_flow_id ON public.autoreply_sessions(flow_id);
CREATE INDEX IF NOT EXISTS idx_cdl_device_id ON public.campaign_device_locks(device_id);
CREATE INDEX IF NOT EXISTS idx_cdl_heartbeat ON public.campaign_device_locks(heartbeat_at);
CREATE INDEX IF NOT EXISTS idx_ad_user_id ON public.announcement_dismissals(user_id);
CREATE INDEX IF NOT EXISTS idx_al_admin_created ON public.admin_logs(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_gjc_user_id ON public.group_join_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_gjq_campaign_id ON public.group_join_queue(campaign_id);
CREATE INDEX IF NOT EXISTS idx_gjq_pending ON public.group_join_queue(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_wcm_device_id ON public.warmup_community_membership(device_id);
CREATE INDEX IF NOT EXISTS idx_rwc_user_id ON public.report_wa_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_rwl_user_id ON public.report_wa_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_wal_device_id ON public.warmup_audit_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_wal_cycle_id ON public.warmup_audit_logs(cycle_id);