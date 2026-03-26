-- Community audit logs for pairing, eligibility, session lifecycle
CREATE TABLE IF NOT EXISTS public.community_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  user_id uuid,
  session_id uuid,
  pair_id uuid,
  partner_device_id uuid,
  event_type text NOT NULL,
  level text NOT NULL DEFAULT 'info',
  message text NOT NULL DEFAULT '',
  reason text,
  meta jsonb DEFAULT '{}'::jsonb,
  community_mode text,
  community_day integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_community_audit_device ON public.community_audit_logs(device_id, created_at DESC);
CREATE INDEX idx_community_audit_session ON public.community_audit_logs(session_id, created_at DESC);
CREATE INDEX idx_community_audit_event ON public.community_audit_logs(event_type, created_at DESC);
CREATE INDEX idx_community_audit_created ON public.community_audit_logs(created_at DESC);

ALTER TABLE public.community_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.community_audit_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.warmup_community_membership
  ADD COLUMN IF NOT EXISTS last_job text,
  ADD COLUMN IF NOT EXISTS last_pair_reject_reason text;
