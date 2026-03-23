
-- ═══════════════════════════════════════════════════════════
-- RLS POLICIES FOR ALL CLIENT-FACING TABLES
-- Ensures each user only sees their own data
-- ═══════════════════════════════════════════════════════════

-- DEVICES
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own devices" ON public.devices FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own devices" ON public.devices FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own devices" ON public.devices FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users delete own devices" ON public.devices FOR DELETE TO authenticated USING (user_id = auth.uid());

-- PROXIES
ALTER TABLE public.proxies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own proxies" ON public.proxies FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own proxies" ON public.proxies FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own proxies" ON public.proxies FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users delete own proxies" ON public.proxies FOR DELETE TO authenticated USING (user_id = auth.uid());

-- CONTACTS
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own contacts" ON public.contacts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own contacts" ON public.contacts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own contacts" ON public.contacts FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users delete own contacts" ON public.contacts FOR DELETE TO authenticated USING (user_id = auth.uid());

-- CAMPAIGNS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own campaigns" ON public.campaigns FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own campaigns" ON public.campaigns FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own campaigns" ON public.campaigns FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users delete own campaigns" ON public.campaigns FOR DELETE TO authenticated USING (user_id = auth.uid());

-- CAMPAIGN_CONTACTS
ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own campaign contacts" ON public.campaign_contacts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = auth.uid()));
CREATE POLICY "Users insert own campaign contacts" ON public.campaign_contacts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = auth.uid()));
CREATE POLICY "Users update own campaign contacts" ON public.campaign_contacts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = auth.uid()));
CREATE POLICY "Users delete own campaign contacts" ON public.campaign_contacts FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = auth.uid()));

-- TEMPLATES
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own templates" ON public.templates FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own templates" ON public.templates FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own templates" ON public.templates FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users delete own templates" ON public.templates FOR DELETE TO authenticated USING (user_id = auth.uid());

-- PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- SUBSCRIPTIONS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own subscriptions" ON public.subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());

-- NOTIFICATIONS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- WARMUP_CYCLES
ALTER TABLE public.warmup_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own warmup cycles" ON public.warmup_cycles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own warmup cycles" ON public.warmup_cycles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own warmup cycles" ON public.warmup_cycles FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- WARMUP_AUTOSAVE_CONTACTS
ALTER TABLE public.warmup_autosave_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own autosave contacts" ON public.warmup_autosave_contacts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own autosave contacts" ON public.warmup_autosave_contacts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own autosave contacts" ON public.warmup_autosave_contacts FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users delete own autosave contacts" ON public.warmup_autosave_contacts FOR DELETE TO authenticated USING (user_id = auth.uid());

-- WARMUP_AUDIT_LOGS
ALTER TABLE public.warmup_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own warmup logs" ON public.warmup_audit_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own warmup logs" ON public.warmup_audit_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- DELAY_PROFILES
ALTER TABLE public.delay_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own delay profiles" ON public.delay_profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own delay profiles" ON public.delay_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own delay profiles" ON public.delay_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users delete own delay profiles" ON public.delay_profiles FOR DELETE TO authenticated USING (user_id = auth.uid());

-- REPORT_WA_CONFIGS
ALTER TABLE public.report_wa_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own report configs" ON public.report_wa_configs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own report configs" ON public.report_wa_configs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own report configs" ON public.report_wa_configs FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users delete own report configs" ON public.report_wa_configs FOR DELETE TO authenticated USING (user_id = auth.uid());

-- REPORT_WA_LOGS
ALTER TABLE public.report_wa_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own report logs" ON public.report_wa_logs FOR SELECT TO authenticated USING (user_id = auth.uid());

-- AUTOREPLY_FLOWS
ALTER TABLE public.autoreply_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own autoreply flows" ON public.autoreply_flows FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own autoreply flows" ON public.autoreply_flows FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own autoreply flows" ON public.autoreply_flows FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users delete own autoreply flows" ON public.autoreply_flows FOR DELETE TO authenticated USING (user_id = auth.uid());

-- AUTOREPLY_SESSIONS
ALTER TABLE public.autoreply_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own autoreply sessions" ON public.autoreply_sessions FOR SELECT TO authenticated USING (user_id = auth.uid());

-- CHIP_CONVERSATIONS
ALTER TABLE public.chip_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own chip conversations" ON public.chip_conversations FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own chip conversations" ON public.chip_conversations FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own chip conversations" ON public.chip_conversations FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- CHIP_CONVERSATION_LOGS
ALTER TABLE public.chip_conversation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own chip conv logs" ON public.chip_conversation_logs FOR SELECT TO authenticated USING (user_id = auth.uid());

-- COMMUNITY_WARMUP_CONFIGS
ALTER TABLE public.community_warmup_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own community configs" ON public.community_warmup_configs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own community configs" ON public.community_warmup_configs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own community configs" ON public.community_warmup_configs FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- COMMUNITY_WARMUP_LOGS
ALTER TABLE public.community_warmup_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own community logs" ON public.community_warmup_logs FOR SELECT TO authenticated USING (user_id = auth.uid());

-- GROUP_INTERACTIONS
ALTER TABLE public.group_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own group interactions" ON public.group_interactions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own group interactions" ON public.group_interactions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own group interactions" ON public.group_interactions FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- GROUP_INTERACTION_LOGS
ALTER TABLE public.group_interaction_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own group interaction logs" ON public.group_interaction_logs FOR SELECT TO authenticated USING (user_id = auth.uid());

-- GROUP_JOIN_CAMPAIGNS
ALTER TABLE public.group_join_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own group join campaigns" ON public.group_join_campaigns FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own group join campaigns" ON public.group_join_campaigns FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own group join campaigns" ON public.group_join_campaigns FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users delete own group join campaigns" ON public.group_join_campaigns FOR DELETE TO authenticated USING (user_id = auth.uid());

-- GROUP_JOIN_QUEUE
ALTER TABLE public.group_join_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own group join queue" ON public.group_join_queue FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own group join queue" ON public.group_join_queue FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own group join queue" ON public.group_join_queue FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- GROUP_JOIN_LOGS
ALTER TABLE public.group_join_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own group join logs" ON public.group_join_logs FOR SELECT TO authenticated USING (user_id = auth.uid());

-- PAYMENTS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own payments" ON public.payments FOR SELECT TO authenticated USING (user_id = auth.uid());

-- USER_API_TOKENS
ALTER TABLE public.user_api_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own tokens" ON public.user_api_tokens FOR SELECT TO authenticated USING (user_id = auth.uid());

-- SUBSCRIPTION_CYCLES
ALTER TABLE public.subscription_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own sub cycles" ON public.subscription_cycles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- OPERATION_LOGS
ALTER TABLE public.operation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own op logs" ON public.operation_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own op logs" ON public.operation_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- CAMPAIGN_DEVICE_LOCKS
ALTER TABLE public.campaign_device_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own device locks" ON public.campaign_device_locks FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own device locks" ON public.campaign_device_locks FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own device locks" ON public.campaign_device_locks FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ALERTS
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own alerts" ON public.alerts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own alerts" ON public.alerts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own alerts" ON public.alerts FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- ANNOUNCEMENT_DISMISSALS
ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own dismissals" ON public.announcement_dismissals FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own dismissals" ON public.announcement_dismissals FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ANNOUNCEMENTS (public read)
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read announcements" ON public.announcements FOR SELECT TO authenticated USING (true);

-- FEATURE_CONTROLS (public read)
ALTER TABLE public.feature_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read features" ON public.feature_controls FOR SELECT TO authenticated USING (true);

-- WARMUP_GROUPS (users see system + own custom groups)
ALTER TABLE public.warmup_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see system and own groups" ON public.warmup_groups FOR SELECT TO authenticated
  USING (is_custom = false OR user_id = auth.uid());
CREATE POLICY "Users insert own groups" ON public.warmup_groups FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own groups" ON public.warmup_groups FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users delete own groups" ON public.warmup_groups FOR DELETE TO authenticated USING (user_id = auth.uid());

-- COMMUNITY_PAIRS (read by participants)
ALTER TABLE public.community_pairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own community pairs" ON public.community_pairs FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.devices d WHERE d.id = instance_id_a AND d.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.devices d WHERE d.id = instance_id_b AND d.user_id = auth.uid())
  );

-- COMMUNITY_SETTINGS (public read)
ALTER TABLE public.community_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read community settings" ON public.community_settings FOR SELECT TO authenticated USING (true);

-- WARMUP_COMMUNITY_MEMBERSHIP
ALTER TABLE public.warmup_community_membership ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own membership" ON public.warmup_community_membership FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.devices d WHERE d.id = device_id AND d.user_id = auth.uid()));

-- USER_ROLES (only own)
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- MESSAGE_QUEUE
ALTER TABLE public.message_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own messages" ON public.message_queue FOR SELECT TO authenticated USING (user_id = auth.uid());

-- AUTO_MESSAGE_TEMPLATES (public read)
ALTER TABLE public.auto_message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads auto templates" ON public.auto_message_templates FOR SELECT TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════
-- ADMIN TABLES (admin-only via has_role)
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read admin logs" ON public.admin_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert admin logs" ON public.admin_logs FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.admin_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage costs" ON public.admin_costs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.admin_dispatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage dispatches" ON public.admin_dispatches FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.admin_dispatch_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage dispatch contacts" ON public.admin_dispatch_contacts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.admin_dispatch_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage dispatch templates" ON public.admin_dispatch_templates FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.admin_profile_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage profile data" ON public.admin_profile_data FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.admin_connection_purposes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage connection purposes" ON public.admin_connection_purposes FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.client_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage client messages" ON public.client_messages FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ═══════════════════════════════════════════════════════════
-- ADMIN override: admins can read ALL data in client tables
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Admins read all devices" ON public.devices FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all proxies" ON public.proxies FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update all profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all subscriptions" ON public.subscriptions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage all subscriptions" ON public.subscriptions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all payments" ON public.payments FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage all payments" ON public.payments FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all tokens" ON public.user_api_tokens FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage all tokens" ON public.user_api_tokens FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all warmup cycles" ON public.warmup_cycles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all warmup logs" ON public.warmup_audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all contacts" ON public.contacts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all campaigns" ON public.campaigns FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all templates" ON public.templates FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all sub cycles" ON public.subscription_cycles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage all sub cycles" ON public.subscription_cycles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all community configs" ON public.community_warmup_configs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all op logs" ON public.operation_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage all notifications" ON public.notifications FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all autosave" ON public.warmup_autosave_contacts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all community pairs" ON public.community_pairs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all community settings" ON public.community_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all warmup groups" ON public.warmup_groups FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all report configs" ON public.report_wa_configs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ═══════════════════════════════════════════════════════════
-- SERVICE ROLE BYPASS: Edge Functions use service_role key
-- which bypasses RLS by default, so warmup-tick/engine work fine
-- ═══════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- POPULATE feature_controls for in-development features
-- ═══════════════════════════════════════════════════════════
INSERT INTO public.feature_controls (feature_key, feature_name, feature_description, feature_icon, status, route_path, maintenance_message)
VALUES
  ('group_join', 'Entrada em Grupos', 'Automatização de entrada em grupos do WhatsApp', 'LogIn', 'development', '/dashboard/group-join', 'A função Entrada em Grupos está em desenvolvimento e não está disponível no momento.'),
  ('community_warmup', 'Aquecimento Comunitário', 'Aquecimento usando a comunidade de chips', 'Heart', 'development', '/dashboard/community-warmup', 'A função Aquecimento Comunitário está em desenvolvimento e não está disponível no momento.'),
  ('chip_conversation', 'Conversa entre Chips', 'Simulação de conversas entre instâncias', 'ArrowRightLeft', 'development', '/dashboard/chip-conversation', 'A função Conversa entre Chips está em desenvolvimento e não está disponível no momento.'),
  ('group_interaction', 'Interação de Grupos', 'Interação automatizada em grupos do WhatsApp', 'UsersRound', 'development', '/dashboard/group-interaction', 'A função Interação de Grupos está em desenvolvimento e não está disponível no momento.'),
  ('auto_reply', 'Resposta Automática', 'Fluxos de resposta automática para mensagens recebidas', 'BotMessageSquare', 'development', '/dashboard/auto-reply', 'A função Resposta Automática está em desenvolvimento e não está disponível no momento.')
ON CONFLICT DO NOTHING;
