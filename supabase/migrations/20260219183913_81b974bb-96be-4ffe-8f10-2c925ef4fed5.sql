
-- Warmup sessions table
CREATE TABLE public.warmup_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'completed')),
  messages_per_day INTEGER NOT NULL DEFAULT 20,
  daily_increment INTEGER NOT NULL DEFAULT 5,
  max_messages_per_day INTEGER NOT NULL DEFAULT 100,
  current_day INTEGER NOT NULL DEFAULT 1,
  total_days INTEGER NOT NULL DEFAULT 14,
  messages_sent_today INTEGER NOT NULL DEFAULT 0,
  messages_sent_total INTEGER NOT NULL DEFAULT 0,
  min_delay_seconds INTEGER NOT NULL DEFAULT 30,
  max_delay_seconds INTEGER NOT NULL DEFAULT 120,
  start_time TEXT NOT NULL DEFAULT '08:00',
  end_time TEXT NOT NULL DEFAULT '18:00',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.warmup_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own warmup sessions"
  ON public.warmup_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own warmup sessions"
  ON public.warmup_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own warmup sessions"
  ON public.warmup_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own warmup sessions"
  ON public.warmup_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_warmup_sessions_updated_at
  BEFORE UPDATE ON public.warmup_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
