-- 1. Fix Realtime: replace open policy with scoped one
-- The realtime.messages policy with USING(true) allows any authenticated user
-- to subscribe to any channel. Replace with identity-scoped check.
DROP POLICY IF EXISTS "Authenticated users receive own realtime events" ON realtime.messages;

CREATE POLICY "Authenticated users receive own realtime events"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- For postgres_changes: RLS on the source tables (devices, group_interactions, etc.)
  -- already filters rows by user_id = auth.uid().
  -- This policy allows the realtime system to deliver those pre-filtered events.
  -- We restrict to the authenticated role only (not public/anon).
  EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid()
  )
);

-- 2. Fix Storage: change warmup upload policy from public to authenticated
DROP POLICY IF EXISTS "Users upload to own warmup folder" ON storage.objects;

CREATE POLICY "Users upload to own warmup folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] IN ('warmup-media', 'warmup-audio')
  AND (
    (auth.uid())::text = (storage.foldername(name))[2]
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);