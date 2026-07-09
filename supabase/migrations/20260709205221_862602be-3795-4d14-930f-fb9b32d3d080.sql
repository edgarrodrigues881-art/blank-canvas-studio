
-- 1. Media bucket: add UPDATE policy mirroring DELETE
CREATE POLICY "Users update own media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 2. Warmup subfolders: add UPDATE and DELETE policies scoped by second segment
CREATE POLICY "Users update own warmup media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] IN ('warmup-media','warmup-audio')
  AND (storage.foldername(name))[2] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] IN ('warmup-media','warmup-audio')
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Users delete own warmup media"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] IN ('warmup-media','warmup-audio')
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- 3. Realtime: remove weak substring-based policy
DROP POLICY IF EXISTS "Users receive only their own realtime messages" ON realtime.messages;
