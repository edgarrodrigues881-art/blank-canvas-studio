-- Tabela principal de agendamentos Auto Save
CREATE TABLE public.autosave_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Agendamento Auto Save',
  device_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  scheduled_at TIMESTAMPTZ NOT NULL,
  min_delay_seconds INTEGER NOT NULL DEFAULT 15,
  max_delay_seconds INTEGER NOT NULL DEFAULT 60,
  messages_per_instance INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled',
  total_sent INTEGER NOT NULL DEFAULT 0,
  total_failed INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_autosave_schedules_user ON public.autosave_schedules(user_id);
CREATE INDEX idx_autosave_schedules_status ON public.autosave_schedules(status, scheduled_at);

ALTER TABLE public.autosave_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own autosave schedules" ON public.autosave_schedules
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own autosave schedules" ON public.autosave_schedules
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own autosave schedules" ON public.autosave_schedules
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own autosave schedules" ON public.autosave_schedules
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_autosave_schedules_updated_at
  BEFORE UPDATE ON public.autosave_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Logs de envio por agendamento
CREATE TABLE public.autosave_schedule_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES public.autosave_schedules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  device_id UUID NOT NULL,
  device_name TEXT,
  contact_phone TEXT NOT NULL,
  contact_name TEXT,
  message_content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_autosave_logs_schedule ON public.autosave_schedule_logs(schedule_id, sent_at DESC);
CREATE INDEX idx_autosave_logs_user ON public.autosave_schedule_logs(user_id, sent_at DESC);
CREATE INDEX idx_autosave_logs_device ON public.autosave_schedule_logs(device_id);

ALTER TABLE public.autosave_schedule_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own autosave logs" ON public.autosave_schedule_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service insert autosave logs" ON public.autosave_schedule_logs
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Users delete own autosave logs" ON public.autosave_schedule_logs
  FOR DELETE USING (auth.uid() = user_id);