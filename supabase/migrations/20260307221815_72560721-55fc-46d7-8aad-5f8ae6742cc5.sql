
-- ══ RLS HARDENING MIGRATION ══

-- ═══ 1. ADD ADMIN SELECT POLICIES FOR BACKOFFICE ═══

-- devices: admin needs to view all devices in backoffice
CREATE POLICY "Admins can view all devices"
  ON public.devices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- campaigns: admin needs to view all campaigns
CREATE POLICY "Admins can view all campaigns"
  ON public.campaigns FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- campaign_contacts: admin needs to view campaign details
CREATE POLICY "Admins can view all campaign contacts"
  ON public.campaign_contacts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- proxies: admin needs to manage proxies globally
CREATE POLICY "Admins can view all proxies"
  ON public.proxies FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all proxies"
  ON public.proxies FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ═══ 2. FIX POLICIES USING 'public' ROLE (should be 'authenticated') ═══

-- notifications: fix all policies from public to authenticated
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- user_api_tokens: fix from public to authenticated
DROP POLICY IF EXISTS "Admins can manage user tokens" ON public.user_api_tokens;
CREATE POLICY "Admins can manage user tokens"
  ON public.user_api_tokens FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can view own tokens" ON public.user_api_tokens;
CREATE POLICY "Users can view own tokens"
  ON public.user_api_tokens FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own tokens" ON public.user_api_tokens;
CREATE POLICY "Users can update own tokens"
  ON public.user_api_tokens FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- subscriptions: fix user SELECT from public to authenticated
DROP POLICY IF EXISTS "Users can view their own subscription" ON public.subscriptions;
CREATE POLICY "Users can view their own subscription"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- profiles: fix admin policies from public to authenticated
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ═══ 3. ADD ADMIN SELECT FOR WARMUP COMMUNITY MEMBERSHIP ═══
CREATE POLICY "Admins can view all community membership"
  ON public.warmup_community_membership FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
