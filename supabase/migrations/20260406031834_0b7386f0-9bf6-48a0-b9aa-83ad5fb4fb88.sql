
-- Create service_contacts table (Base de Atendimento - separate from contacts)
CREATE TABLE public.service_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ativo',
  origin TEXT DEFAULT 'manual',
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_service_contacts_user_id ON public.service_contacts(user_id);
CREATE INDEX idx_service_contacts_phone ON public.service_contacts(phone);
CREATE INDEX idx_service_contacts_tags ON public.service_contacts USING GIN(tags);

-- Enable RLS
ALTER TABLE public.service_contacts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own service contacts"
  ON public.service_contacts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own service contacts"
  ON public.service_contacts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own service contacts"
  ON public.service_contacts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own service contacts"
  ON public.service_contacts FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all service contacts"
  ON public.service_contacts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Auto-update updated_at
CREATE TRIGGER update_service_contacts_updated_at
  BEFORE UPDATE ON public.service_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
