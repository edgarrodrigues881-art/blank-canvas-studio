-- ============================================
-- 1. AUTO-TAGGING IA: Tags pré-definidas pelo usuário
-- ============================================
CREATE TABLE IF NOT EXISTS public.ai_predefined_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tag text NOT NULL,
  description text,
  color text DEFAULT 'sky',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, tag)
);

ALTER TABLE public.ai_predefined_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own predefined tags"
  ON public.ai_predefined_tags FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_predefined_tags_user ON public.ai_predefined_tags(user_id);

-- ============================================
-- 2. AGENDAMENTOS DE DISPARO PENDENTES (pedidos detectados pela IA)
-- ============================================
CREATE TABLE IF NOT EXISTS public.ai_scheduled_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid,
  contact_name text,
  contact_phone text NOT NULL,
  device_id uuid,
  message_content text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  detected_from_message text,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected | sent | failed
  approved_at timestamptz,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_scheduled_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own AI dispatches"
  ON public.ai_scheduled_dispatches FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_dispatches_user_status ON public.ai_scheduled_dispatches(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_dispatches_scheduled ON public.ai_scheduled_dispatches(scheduled_for) WHERE status = 'approved';

CREATE TRIGGER trg_ai_dispatches_updated
  BEFORE UPDATE ON public.ai_scheduled_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 3. ALERTAS INTELIGENTES
-- ============================================
CREATE TABLE IF NOT EXISTS public.ai_smart_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid,
  contact_name text,
  contact_phone text NOT NULL,
  alert_type text NOT NULL, -- 'human_request' | 'closing_opportunity'
  severity text NOT NULL DEFAULT 'medium', -- low | medium | high | critical
  title text NOT NULL,
  description text NOT NULL,
  context_message text,
  ai_reasoning text,
  status text NOT NULL DEFAULT 'unread', -- unread | read | resolved | dismissed
  whatsapp_sent boolean NOT NULL DEFAULT false,
  whatsapp_sent_at timestamptz,
  whatsapp_error text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_smart_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own smart alerts"
  ON public.ai_smart_alerts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_alerts_user_status ON public.ai_smart_alerts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_alerts_created ON public.ai_smart_alerts(created_at DESC);

CREATE TRIGGER trg_ai_alerts_updated
  BEFORE UPDATE ON public.ai_smart_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 4. CONFIGURAÇÕES dos alertas inteligentes (canais)
-- ============================================
CREATE TABLE IF NOT EXISTS public.ai_alerts_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  alert_human_request boolean NOT NULL DEFAULT true,
  alert_closing_opportunity boolean NOT NULL DEFAULT true,
  notify_whatsapp boolean NOT NULL DEFAULT false,
  whatsapp_device_id uuid,
  whatsapp_target_phone text, -- número pessoal pra receber alertas
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_alerts_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own alerts config"
  ON public.ai_alerts_config FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_ai_alerts_config_updated
  BEFORE UPDATE ON public.ai_alerts_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();