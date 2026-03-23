-- Allow users to insert their own warmup jobs
CREATE POLICY "Users insert own warmup jobs"
ON public.warmup_jobs
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Allow users to update their own warmup jobs
CREATE POLICY "Users update own warmup jobs"
ON public.warmup_jobs
FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

-- Allow users to delete their own warmup jobs
CREATE POLICY "Users delete own warmup jobs"
ON public.warmup_jobs
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Extend admin policy to cover all operations
DROP POLICY IF EXISTS "Admins see all warmup jobs" ON public.warmup_jobs;
CREATE POLICY "Admins manage all warmup jobs"
ON public.warmup_jobs
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));