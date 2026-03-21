
CREATE TABLE public.user_api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL,
  device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'available',
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  assigned_at timestamptz,
  admin_id uuid NOT NULL
);

ALTER TABLE public.user_api_tokens ENABLE ROW LEVEL SECURITY;

-- Admins full access
CREATE POLICY "Admins can manage user tokens" ON public.user_api_tokens
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Users can read their own tokens (needed for device creation)
CREATE POLICY "Users can view own tokens" ON public.user_api_tokens
FOR SELECT USING (auth.uid() = user_id);
