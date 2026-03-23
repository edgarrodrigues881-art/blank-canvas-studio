-- 1) Create the "media" storage bucket (public, 50MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('media', 'media', true, 52428800)
ON CONFLICT (id) DO NOTHING;

-- 2) RLS: Allow authenticated users to upload to their own folder
CREATE POLICY "Users upload to own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3) RLS: Allow anyone to read public media
CREATE POLICY "Public read media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'media');

-- 4) RLS: Allow users to delete own files
CREATE POLICY "Users delete own media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 5) RLS: Allow service_role and warmup-media/warmup-audio folders (admin uploads)
CREATE POLICY "Admin warmup media upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media'
  AND (
    (storage.foldername(name))[1] IN ('warmup-media', 'warmup-audio')
  )
);

-- 6) Fix: Change campaign_contacts default status from 'active' to 'pending'
ALTER TABLE public.campaign_contacts ALTER COLUMN status SET DEFAULT 'pending';

-- 7) Fix orphan contacts with wrong status
UPDATE public.campaign_contacts
SET status = 'pending'
WHERE status = 'active';