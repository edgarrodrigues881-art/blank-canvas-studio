-- 1. Create admin_profile_data table for sensitive admin-only fields
CREATE TABLE public.admin_profile_data (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_notes text,
  risk_flag boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.admin_profile_data ENABLE ROW LEVEL SECURITY;

-- 3. Admin-only policies
CREATE POLICY "Admins can view all admin profile data"
  ON public.admin_profile_data FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update admin profile data"
  ON public.admin_profile_data FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert admin profile data"
  ON public.admin_profile_data FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Migrate existing data
INSERT INTO public.admin_profile_data (id, admin_notes, risk_flag)
SELECT id, admin_notes, risk_flag FROM public.profiles
WHERE admin_notes IS NOT NULL OR risk_flag = true
ON CONFLICT (id) DO NOTHING;

-- 5. Fix media bucket storage policies
-- Drop old overly permissive policies
DROP POLICY IF EXISTS "Public read access for media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;

-- Create user-isolated policies
CREATE POLICY "Users can read own media"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Admins can read all media"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'media' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can upload to own media folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);