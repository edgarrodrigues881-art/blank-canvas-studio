-- 1. Fix realtime: drop the overly broad policy
DROP POLICY IF EXISTS "Authenticated users receive own realtime events" ON realtime.messages;

-- 2. Fix community_audit_logs: add user-scoped SELECT policy
CREATE POLICY "Users can read their own audit logs"
ON public.community_audit_logs
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 3. Fix autoreply_queue: replace service_role ALL with scoped policies
DROP POLICY IF EXISTS "Service role full access" ON public.autoreply_queue;

CREATE POLICY "Service role full access on autoreply_queue"
ON public.autoreply_queue
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Users can read their own autoreply queue"
ON public.autoreply_queue
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own autoreply queue"
ON public.autoreply_queue
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- 4. Fix login_history: scope INSERT to own user
DROP POLICY IF EXISTS "Service can insert login history" ON public.login_history;

CREATE POLICY "Users can insert own login history"
ON public.login_history
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages login history"
ON public.login_history
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);