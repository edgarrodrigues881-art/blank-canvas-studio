
-- Warmup messages table for random message templates
CREATE TABLE public.warmup_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.warmup_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own warmup messages" ON public.warmup_messages
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own warmup messages" ON public.warmup_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own warmup messages" ON public.warmup_messages
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own warmup messages" ON public.warmup_messages
  FOR DELETE USING (auth.uid() = user_id);

-- Add last_executed_at to warmup_sessions for tracking
ALTER TABLE public.warmup_sessions ADD COLUMN IF NOT EXISTS last_executed_at TIMESTAMP WITH TIME ZONE;

-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
