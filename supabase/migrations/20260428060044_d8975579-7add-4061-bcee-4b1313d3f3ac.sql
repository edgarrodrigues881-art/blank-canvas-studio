
-- Categorias customizáveis
CREATE TABLE public.crm_agenda_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#10b981',
  icon TEXT DEFAULT 'calendar',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_agenda_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_own_agenda_categories" ON public.crm_agenda_categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_agenda_categories" ON public.crm_agenda_categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_agenda_categories" ON public.crm_agenda_categories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_agenda_categories" ON public.crm_agenda_categories FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_crm_agenda_categories_updated_at
BEFORE UPDATE ON public.crm_agenda_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Eventos da agenda
CREATE TABLE public.crm_agenda_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL DEFAULT 'compromisso', -- compromisso, tarefa, reuniao, visita, call
  category_id UUID REFERENCES public.crm_agenda_categories(id) ON DELETE SET NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  all_day BOOLEAN NOT NULL DEFAULT false,
  location TEXT,
  link TEXT,
  color TEXT DEFAULT '#10b981',
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente, concluido, cancelado
  priority TEXT NOT NULL DEFAULT 'media', -- baixa, media, alta
  lead_id UUID,
  lead_name TEXT,
  lead_phone TEXT,
  pipeline_stage TEXT,
  reminder_minutes_before INTEGER DEFAULT 30,
  whatsapp_reminder BOOLEAN NOT NULL DEFAULT false,
  whatsapp_reminder_phone TEXT,
  whatsapp_reminder_sent_at TIMESTAMPTZ,
  google_event_id TEXT,
  google_synced_at TIMESTAMPTZ,
  google_sync_enabled BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  recurrence JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_agenda_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_own_agenda_events" ON public.crm_agenda_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_agenda_events" ON public.crm_agenda_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_agenda_events" ON public.crm_agenda_events FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_agenda_events" ON public.crm_agenda_events FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_crm_agenda_events_user_start ON public.crm_agenda_events(user_id, start_at DESC);
CREATE INDEX idx_crm_agenda_events_lead ON public.crm_agenda_events(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_crm_agenda_events_status ON public.crm_agenda_events(user_id, status);
CREATE INDEX idx_crm_agenda_events_whatsapp_pending ON public.crm_agenda_events(start_at) 
  WHERE whatsapp_reminder = true AND whatsapp_reminder_sent_at IS NULL AND status = 'pendente';

CREATE TRIGGER update_crm_agenda_events_updated_at
BEFORE UPDATE ON public.crm_agenda_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
