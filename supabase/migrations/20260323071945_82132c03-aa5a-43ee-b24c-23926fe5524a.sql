
-- Enable RLS on remaining tables flagged by linter
ALTER TABLE public.warmup_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own warmup sessions" ON public.warmup_sessions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.devices d WHERE d.id = device_id AND d.user_id = auth.uid()));
CREATE POLICY "Admins see all warmup sessions" ON public.warmup_sessions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.warmup_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own warmup jobs" ON public.warmup_jobs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins see all warmup jobs" ON public.warmup_jobs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.warmup_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads warmup messages" ON public.warmup_messages FOR SELECT TO authenticated USING (true);

ALTER TABLE public.warmup_instance_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own instance groups" ON public.warmup_instance_groups FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.devices d WHERE d.id = device_id AND d.user_id = auth.uid()));
CREATE POLICY "Admins see all instance groups" ON public.warmup_instance_groups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.warmup_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own folders" ON public.warmup_folders FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own folders" ON public.warmup_folders FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own folders" ON public.warmup_folders FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users delete own folders" ON public.warmup_folders FOR DELETE TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.warmup_folder_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own folder devices" ON public.warmup_folder_devices FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.warmup_folders f WHERE f.id = folder_id AND f.user_id = auth.uid()));
