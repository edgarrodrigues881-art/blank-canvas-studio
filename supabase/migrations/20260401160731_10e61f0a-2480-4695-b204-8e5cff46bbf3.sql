
-- 1. Fix devices UPDATE policy: add WITH CHECK to prevent user_id takeover
DROP POLICY IF EXISTS "Users can update own devices" ON public.devices;
CREATE POLICY "Users can update own devices"
  ON public.devices
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Fix proxies UPDATE policy: add WITH CHECK
DROP POLICY IF EXISTS "Users can update own proxies" ON public.proxies;
CREATE POLICY "Users can update own proxies"
  ON public.proxies
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Restrict warmup-media storage uploads to user-scoped folders
DROP POLICY IF EXISTS "Admin warmup media upload" ON storage.objects;
CREATE POLICY "Users upload to own warmup folder"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'media'
    AND (
      (storage.foldername(name))[1] IN ('warmup-media', 'warmup-audio')
      AND (
        auth.uid()::text = (storage.foldername(name))[2]
        OR public.has_role(auth.uid(), 'admin')
      )
    )
  );
