
-- Operational logs for diagnostics and support
CREATE TABLE public.operation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id uuid NULL,
  event text NOT NULL,
  details text NULL,
  meta jsonb NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_operation_logs_user_created ON public.operation_logs (user_id, created_at DESC);
CREATE INDEX idx_operation_logs_device ON public.operation_logs (device_id) WHERE device_id IS NOT NULL;
CREATE INDEX idx_operation_logs_event ON public.operation_logs (event);

-- RLS
ALTER TABLE public.operation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own operation logs"
ON public.operation_logs FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all operation logs"
ON public.operation_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Auto-cleanup: keep only last 30 days (via scheduled function)
-- Insert allowed only from backend (service role)
