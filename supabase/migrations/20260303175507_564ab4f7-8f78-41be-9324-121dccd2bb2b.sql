
-- Fix warmup_logs: drop permissive INSERT and add user_id check
DROP POLICY IF EXISTS "Service role can insert warmup logs" ON public.warmup_logs;
CREATE POLICY "Users can insert own warmup logs" ON public.warmup_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Fix group_join_logs: drop permissive INSERT and add user_id check
DROP POLICY IF EXISTS "Service role can insert join logs" ON public.group_join_logs;
CREATE POLICY "Users can insert own join logs" ON public.group_join_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Fix report_wa_logs: drop permissive INSERT and add user_id check
DROP POLICY IF EXISTS "System can insert report logs" ON public.report_wa_logs;
CREATE POLICY "Users can insert own report logs" ON public.report_wa_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
