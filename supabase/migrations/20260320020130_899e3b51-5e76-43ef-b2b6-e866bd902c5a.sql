ALTER TABLE public.warmup_autosave_contacts
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS use_count integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS contact_status text DEFAULT 'new' NOT NULL;

COMMENT ON COLUMN public.warmup_autosave_contacts.contact_status IS 'new, used, invalid, discarded';