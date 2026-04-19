ALTER TABLE public.autosave_schedules
  ADD COLUMN IF NOT EXISTS contact_cursor JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_used_contact_per_device JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS current_cycle_used_contacts JSONB NOT NULL DEFAULT '{}'::jsonb;