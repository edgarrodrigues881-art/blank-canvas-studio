
ALTER TABLE public.warmup_daily_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own daily stats" ON public.warmup_daily_stats FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins all daily stats" ON public.warmup_daily_stats FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.warmup_groups_pool ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads groups pool" ON public.warmup_groups_pool FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage groups pool" ON public.warmup_groups_pool FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.warmup_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own warmup logs2" ON public.warmup_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins all warmup logs2" ON public.warmup_logs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.warmup_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads warmup plans" ON public.warmup_plans FOR SELECT TO authenticated USING (true);

ALTER TABLE public.warmup_unique_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own unique recipients" ON public.warmup_unique_recipients FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins all unique recipients" ON public.warmup_unique_recipients FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
