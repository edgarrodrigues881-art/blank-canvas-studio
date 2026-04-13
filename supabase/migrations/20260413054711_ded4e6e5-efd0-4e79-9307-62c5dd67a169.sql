
-- Tabela para salvar histórico de links extraídos
CREATE TABLE public.extracted_invite_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  device_name TEXT,
  group_jid TEXT NOT NULL,
  group_name TEXT,
  invite_link TEXT NOT NULL,
  extracted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_extracted_invite_links_user ON public.extracted_invite_links(user_id, extracted_at DESC);
CREATE UNIQUE INDEX idx_extracted_invite_links_unique ON public.extracted_invite_links(user_id, group_jid, invite_link);

-- RLS
ALTER TABLE public.extracted_invite_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own extracted links"
ON public.extracted_invite_links FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own extracted links"
ON public.extracted_invite_links FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own extracted links"
ON public.extracted_invite_links FOR DELETE
USING (auth.uid() = user_id);
