-- Expand notifications system to cover schedules, tasks, agenda, follow-ups
-- and unify the WhatsApp instance with Reports (report_wa)

-- 1) Extra toggles + group fields on ai_alerts_config
ALTER TABLE public.ai_alerts_config
  ADD COLUMN IF NOT EXISTS alert_scheduled_dispatch boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS alert_task_reminder boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS alert_appointment_reminder boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS alert_followup_event boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS whatsapp_target_jid text,
  ADD COLUMN IF NOT EXISTS whatsapp_target_label text,
  ADD COLUMN IF NOT EXISTS appointment_lead_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS task_lead_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS share_with_report_wa boolean NOT NULL DEFAULT true;

-- 2) Make ai_smart_alerts flexible enough to hold the new event categories.
-- We keep contact_phone optional since system events (e.g. campaign finished)
-- don't have a contact attached.
ALTER TABLE public.ai_smart_alerts
  ALTER COLUMN contact_phone DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source_table text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3) Dedup index — prevent same event being notified twice
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ai_alert_source
  ON public.ai_smart_alerts (user_id, alert_type, source_table, source_id)
  WHERE source_id IS NOT NULL;

-- 4) Helper view: a user's effective notification device (shared with report_wa).
-- Edge functions can query this to know where to send the WA notification.
CREATE OR REPLACE VIEW public.notification_effective_device AS
SELECT
  cfg.user_id,
  COALESCE(cfg.whatsapp_device_id, rwa.device_id) AS device_id,
  cfg.whatsapp_target_jid,
  cfg.whatsapp_target_phone,
  cfg.whatsapp_target_label,
  cfg.notify_whatsapp,
  cfg.enabled
FROM public.ai_alerts_config cfg
LEFT JOIN public.report_wa_configs rwa ON rwa.user_id = cfg.user_id;

GRANT SELECT ON public.notification_effective_device TO authenticated;