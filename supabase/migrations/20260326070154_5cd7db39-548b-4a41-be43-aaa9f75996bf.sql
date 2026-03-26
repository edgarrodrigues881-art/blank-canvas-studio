
-- Drop all existing SELECT policies on warmup_messages
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'warmup_messages' AND schemaname = 'public' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.warmup_messages', pol.policyname);
  END LOOP;
END$$;

-- Create user-scoped SELECT policy
CREATE POLICY "Users read own warmup messages"
  ON public.warmup_messages FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Admin access
CREATE POLICY "Admins read all warmup messages"
  ON public.warmup_messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
