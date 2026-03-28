
-- Login history table for IP tracking
CREATE TABLE public.login_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address text NOT NULL,
  user_agent text,
  logged_in_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_login_history_user_id ON public.login_history (user_id, logged_in_at DESC);
CREATE INDEX idx_login_history_ip ON public.login_history (ip_address);

-- RLS
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;

-- Only admins can read login history
CREATE POLICY "Admins can read login history"
ON public.login_history FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Service role inserts (via edge functions)
CREATE POLICY "Service can insert login history"
ON public.login_history FOR INSERT TO service_role
WITH CHECK (true);
