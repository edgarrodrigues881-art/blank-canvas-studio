-- 1) Remove devices from Realtime publication to prevent token leak
ALTER PUBLICATION supabase_realtime DROP TABLE public.devices;

-- 2) Allow users to read their own login history
CREATE POLICY "Users see own login history"
  ON public.login_history
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());