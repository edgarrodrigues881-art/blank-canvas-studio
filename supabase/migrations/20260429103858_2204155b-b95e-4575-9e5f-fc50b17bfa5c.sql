-- Add between-contacts delay fields to autosave_schedules
ALTER TABLE public.autosave_schedules
  ADD COLUMN IF NOT EXISTS between_contacts_min_seconds integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS between_contacts_max_seconds integer NOT NULL DEFAULT 90;

-- Sanity defaults for existing rows (safe no-op if defaults already applied)
UPDATE public.autosave_schedules
   SET between_contacts_min_seconds = COALESCE(between_contacts_min_seconds, 30),
       between_contacts_max_seconds = COALESCE(between_contacts_max_seconds, 90)
 WHERE between_contacts_min_seconds IS NULL OR between_contacts_max_seconds IS NULL;