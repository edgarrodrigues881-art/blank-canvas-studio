ALTER TABLE public.scheduled_messages
ADD COLUMN IF NOT EXISTS schedule_type text NOT NULL DEFAULT 'followup',
ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.service_contacts(id) ON DELETE SET NULL;