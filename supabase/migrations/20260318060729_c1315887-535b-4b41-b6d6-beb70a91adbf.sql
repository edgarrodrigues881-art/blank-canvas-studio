
-- Admin dispatch campaigns tracking
CREATE TABLE public.admin_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Disparo manual',
  status text NOT NULL DEFAULT 'pending',
  connection_purpose text NOT NULL DEFAULT 'dispatch',
  device_id text NULL,
  message_content text NOT NULL,
  total_contacts integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  min_delay_seconds integer NOT NULL DEFAULT 5,
  max_delay_seconds integer NOT NULL DEFAULT 15,
  pause_every_min integer NOT NULL DEFAULT 10,
  pause_every_max integer NOT NULL DEFAULT 20,
  pause_duration_min integer NOT NULL DEFAULT 30,
  pause_duration_max integer NOT NULL DEFAULT 120,
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage admin_dispatches" ON public.admin_dispatches
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admin dispatch contacts (individual items in a dispatch)
CREATE TABLE public.admin_dispatch_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.admin_dispatches(id) ON DELETE CASCADE,
  phone text NOT NULL,
  name text NOT NULL DEFAULT 'Contato',
  user_id uuid NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_dispatch_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage admin_dispatch_contacts" ON public.admin_dispatch_contacts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_admin_dispatch_contacts_dispatch ON public.admin_dispatch_contacts(dispatch_id);
CREATE INDEX idx_admin_dispatch_contacts_status ON public.admin_dispatch_contacts(dispatch_id, status);
