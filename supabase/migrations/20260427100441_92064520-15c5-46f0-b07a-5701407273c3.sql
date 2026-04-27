ALTER TABLE public.ai_alerts_config
  ADD COLUMN IF NOT EXISTS whatsapp_target_jid text,
  ADD COLUMN IF NOT EXISTS whatsapp_target_label text;