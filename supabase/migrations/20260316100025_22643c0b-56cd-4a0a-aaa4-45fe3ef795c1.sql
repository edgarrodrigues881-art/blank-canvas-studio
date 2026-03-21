
-- report_wa_configs
CREATE POLICY "Users can view own report config" ON public.report_wa_configs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own report config" ON public.report_wa_configs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own report config" ON public.report_wa_configs FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own report config" ON public.report_wa_configs FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- warmup_groups
CREATE POLICY "Users can view own warmup groups" ON public.warmup_groups FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own warmup groups" ON public.warmup_groups FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own warmup groups" ON public.warmup_groups FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own warmup groups" ON public.warmup_groups FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- warmup_sessions
CREATE POLICY "Users can view own warmup sessions" ON public.warmup_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own warmup sessions" ON public.warmup_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own warmup sessions" ON public.warmup_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own warmup sessions" ON public.warmup_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- admin_costs (re-add authenticated policies)
CREATE POLICY "Admins can view costs" ON public.admin_costs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert costs" ON public.admin_costs FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update costs" ON public.admin_costs FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete costs" ON public.admin_costs FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
