
-- Admin dispatch templates for reusable message models
CREATE TABLE public.admin_dispatch_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom',
  content TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_dispatch_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage dispatch templates"
  ON public.admin_dispatch_templates FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admin connection purposes (which device for which purpose)
CREATE TABLE public.admin_connection_purposes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purpose TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  group_id TEXT,
  group_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.admin_connection_purposes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage connection purposes"
  ON public.admin_connection_purposes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed default purposes
INSERT INTO public.admin_connection_purposes (purpose, label) VALUES
  ('lifecycle', 'Ciclo de vida (boas-vindas, vencimentos)'),
  ('alerts', 'Alertas do sistema'),
  ('dispatch', 'Disparos manuais'),
  ('onboarding', 'Notificações de cadastro');
