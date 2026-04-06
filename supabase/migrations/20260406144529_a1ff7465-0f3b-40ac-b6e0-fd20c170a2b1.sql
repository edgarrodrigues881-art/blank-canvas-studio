
CREATE TABLE public.autoreply_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  from_phone TEXT NOT NULL,
  message_text TEXT NOT NULL DEFAULT '',
  button_response_id TEXT DEFAULT '',
  has_button_response BOOLEAN DEFAULT false,
  instance_token TEXT DEFAULT '',
  device_header_id TEXT DEFAULT '',
  raw_payload JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_autoreply_queue_status ON public.autoreply_queue(status, created_at) WHERE status = 'pending';
CREATE INDEX idx_autoreply_queue_device ON public.autoreply_queue(device_id, created_at);

ALTER TABLE public.autoreply_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.autoreply_queue FOR ALL USING (true) WITH CHECK (true);
