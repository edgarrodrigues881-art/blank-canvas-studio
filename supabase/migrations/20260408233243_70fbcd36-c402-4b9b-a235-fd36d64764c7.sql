-- Add new columns for lead capture
ALTER TABLE public.service_contacts
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_contact_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_message_content text;

-- Create unique constraint on user_id + phone for upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_contacts_user_phone
  ON public.service_contacts (user_id, phone);

-- Backfill first_contact_at from created_at for existing rows
UPDATE public.service_contacts
SET first_contact_at = created_at
WHERE first_contact_at IS NULL;