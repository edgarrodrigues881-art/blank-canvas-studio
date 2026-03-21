
-- Admin can view all warmup_cycles
CREATE POLICY "Admins can view all cycles" ON public.warmup_cycles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Admin can update all warmup_cycles
CREATE POLICY "Admins can update all cycles" ON public.warmup_cycles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Admin can view all warmup_jobs
CREATE POLICY "Admins can view all jobs" ON public.warmup_jobs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Admin can update all warmup_jobs
CREATE POLICY "Admins can update all jobs" ON public.warmup_jobs FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Admin can view all warmup_audit_logs
CREATE POLICY "Admins can view all audit logs" ON public.warmup_audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Admin can view all warmup_instance_groups
CREATE POLICY "Admins can view all instance groups" ON public.warmup_instance_groups FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Admin can manage warmup_groups_pool (full CRUD)
CREATE POLICY "Admins can manage groups pool" ON public.warmup_groups_pool FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
