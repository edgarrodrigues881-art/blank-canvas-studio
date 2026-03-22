
CREATE TABLE public.warmup_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.warmup_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  device_id UUID NOT NULL,
  group_jid TEXT,
  group_name TEXT,
  message_content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.warmup_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own warmup logs" ON public.warmup_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert warmup logs" ON public.warmup_logs
  FOR INSERT WITH CHECK (true);

CREATE INDEX idx_warmup_logs_session ON public.warmup_logs(session_id);
CREATE INDEX idx_warmup_logs_user ON public.warmup_logs(user_id);
CREATE INDEX idx_warmup_logs_created ON public.warmup_logs(created_at DESC);
