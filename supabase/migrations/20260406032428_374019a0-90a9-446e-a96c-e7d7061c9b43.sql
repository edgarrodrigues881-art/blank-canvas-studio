
CREATE TABLE public.scheduled_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL,
  message_content TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scheduled_messages_user ON public.scheduled_messages(user_id);
CREATE INDEX idx_scheduled_messages_status ON public.scheduled_messages(status, scheduled_at);

ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scheduled messages"
  ON public.scheduled_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own scheduled messages"
  ON public.scheduled_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own scheduled messages"
  ON public.scheduled_messages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own scheduled messages"
  ON public.scheduled_messages FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins manage all scheduled messages"
  ON public.scheduled_messages FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role full access scheduled messages"
  ON public.scheduled_messages FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER update_scheduled_messages_updated_at
  BEFORE UPDATE ON public.scheduled_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add permission column for team_permissions
ALTER TABLE public.team_permissions
ADD COLUMN IF NOT EXISTS perm_schedules BOOLEAN NOT NULL DEFAULT true;
