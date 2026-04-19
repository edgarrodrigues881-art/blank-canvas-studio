DROP POLICY IF EXISTS "Service insert autosave logs" ON public.autosave_schedule_logs;
CREATE POLICY "Users insert own autosave logs" ON public.autosave_schedule_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);