
CREATE POLICY "Users delete own group interactions" ON public.group_interactions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
