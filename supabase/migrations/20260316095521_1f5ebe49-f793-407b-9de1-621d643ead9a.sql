
-- Fix remaining public-scoped policy on report_wa_logs
DROP POLICY IF EXISTS "Users can view their own report logs" ON public.report_wa_logs;
CREATE POLICY "Users can view their own report logs" ON public.report_wa_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- warmup_messages
DROP POLICY IF EXISTS "Users can view own warmup messages" ON public.warmup_messages;
DROP POLICY IF EXISTS "Users can insert own warmup messages" ON public.warmup_messages;
DROP POLICY IF EXISTS "Users can update own warmup messages" ON public.warmup_messages;
DROP POLICY IF EXISTS "Users can delete own warmup messages" ON public.warmup_messages;
CREATE POLICY "Users can view own warmup messages" ON public.warmup_messages FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own warmup messages" ON public.warmup_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own warmup messages" ON public.warmup_messages FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own warmup messages" ON public.warmup_messages FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- warmup_logs
DROP POLICY IF EXISTS "Users can view own warmup logs" ON public.warmup_logs;
DROP POLICY IF EXISTS "Users can insert own warmup logs" ON public.warmup_logs;
CREATE POLICY "Users can view own warmup logs" ON public.warmup_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own warmup logs" ON public.warmup_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- delay_profiles
DROP POLICY IF EXISTS "Users can view own delay profiles" ON public.delay_profiles;
DROP POLICY IF EXISTS "Users can insert own delay profiles" ON public.delay_profiles;
DROP POLICY IF EXISTS "Users can update own delay profiles" ON public.delay_profiles;
DROP POLICY IF EXISTS "Users can delete own delay profiles" ON public.delay_profiles;
CREATE POLICY "Users can view own delay profiles" ON public.delay_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own delay profiles" ON public.delay_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own delay profiles" ON public.delay_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own delay profiles" ON public.delay_profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- group_join_logs
DROP POLICY IF EXISTS "Users can view their own join logs" ON public.group_join_logs;
DROP POLICY IF EXISTS "Users can insert own join logs" ON public.group_join_logs;
CREATE POLICY "Users can view their own join logs" ON public.group_join_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own join logs" ON public.group_join_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- subscription_cycles
DROP POLICY IF EXISTS "Users can view their own cycles" ON public.subscription_cycles;
DROP POLICY IF EXISTS "Admins can view subscription cycles" ON public.subscription_cycles;
DROP POLICY IF EXISTS "Admins can insert subscription cycles" ON public.subscription_cycles;
DROP POLICY IF EXISTS "Admins can update subscription cycles" ON public.subscription_cycles;
DROP POLICY IF EXISTS "Admins can delete subscription cycles" ON public.subscription_cycles;
CREATE POLICY "Users can view their own cycles" ON public.subscription_cycles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view subscription cycles" ON public.subscription_cycles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert subscription cycles" ON public.subscription_cycles FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update subscription cycles" ON public.subscription_cycles FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete subscription cycles" ON public.subscription_cycles FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- payments
DROP POLICY IF EXISTS "Admins can view payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can update payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can delete payments" ON public.payments;
CREATE POLICY "Admins can view payments" ON public.payments FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update payments" ON public.payments FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete payments" ON public.payments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- admin_costs
DROP POLICY IF EXISTS "Admins can view admin costs" ON public.admin_costs;
DROP POLICY IF EXISTS "Admins can insert admin costs" ON public.admin_costs;
DROP POLICY IF EXISTS "Admins can update admin costs" ON public.admin_costs;
DROP POLICY IF EXISTS "Admins can delete admin costs" ON public.admin_costs;
CREATE POLICY "Admins can view admin costs" ON public.admin_costs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert admin costs" ON public.admin_costs FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update admin costs" ON public.admin_costs FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete admin costs" ON public.admin_costs FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- client_messages
DROP POLICY IF EXISTS "Admins can view client messages" ON public.client_messages;
DROP POLICY IF EXISTS "Admins can insert client messages" ON public.client_messages;
DROP POLICY IF EXISTS "Admins can update client messages" ON public.client_messages;
DROP POLICY IF EXISTS "Admins can delete client messages" ON public.client_messages;
CREATE POLICY "Admins can view client messages" ON public.client_messages FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert client messages" ON public.client_messages FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update client messages" ON public.client_messages FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete client messages" ON public.client_messages FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
