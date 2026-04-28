
-- ══════════════════════════════════════════════════════════
-- CRM Follow-up System
-- ══════════════════════════════════════════════════════════

-- Sequences (reusable templates: day 1, day 3, day 7...)
CREATE TABLE public.crm_followup_sequences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ delay_hours, message, mode: 'auto'|'manual'|'ai_hybrid', ai_prompt }]
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Individual scheduled follow-ups
CREATE TABLE public.crm_followups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  contact_id UUID, -- references service_contacts; nullable to keep history if contact deleted
  contact_phone TEXT NOT NULL, -- snapshot for resilience
  contact_name TEXT,
  device_id UUID, -- which device sends (auto mode)

  trigger_type TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'no_response' | 'sequence'
  mode TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'auto' | 'ai_hybrid'
  message TEXT, -- pre-defined text (manual/auto)
  ai_prompt TEXT, -- guidance for AI when mode='ai_hybrid'
  media_url TEXT,
  media_type TEXT, -- 'image' | 'audio' | 'video' | 'document'

  scheduled_at TIMESTAMPTZ NOT NULL,
  cancel_on_reply BOOLEAN NOT NULL DEFAULT true,

  sequence_id UUID REFERENCES public.crm_followup_sequences(id) ON DELETE SET NULL,
  sequence_step INTEGER, -- which step within the sequence
  parent_followup_id UUID REFERENCES public.crm_followups(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'processing' | 'sent' | 'cancelled' | 'failed' | 'done_manually'
  sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_reason TEXT,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_followups_user_status ON public.crm_followups(user_id, status);
CREATE INDEX idx_crm_followups_scheduled ON public.crm_followups(scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_crm_followups_contact ON public.crm_followups(contact_id);
CREATE INDEX idx_crm_followups_phone ON public.crm_followups(user_id, contact_phone);
CREATE INDEX idx_crm_followup_sequences_user ON public.crm_followup_sequences(user_id);

-- RLS
ALTER TABLE public.crm_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_followup_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own followups"
  ON public.crm_followups FOR ALL
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users manage own followup sequences"
  ON public.crm_followup_sequences FOR ALL
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- updated_at triggers
CREATE TRIGGER update_crm_followups_updated_at
  BEFORE UPDATE ON public.crm_followups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_crm_followup_sequences_updated_at
  BEFORE UPDATE ON public.crm_followup_sequences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
