
-- Tabela de campanhas de extração
CREATE TABLE public.invite_extract_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  device_name TEXT,
  total_links INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_invite_extract_campaigns_user ON public.invite_extract_campaigns(user_id, created_at DESC);

ALTER TABLE public.invite_extract_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own campaigns"
ON public.invite_extract_campaigns FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own campaigns"
ON public.invite_extract_campaigns FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own campaigns"
ON public.invite_extract_campaigns FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own campaigns"
ON public.invite_extract_campaigns FOR DELETE
USING (auth.uid() = user_id);

-- Adicionar campaign_id na tabela de links
ALTER TABLE public.extracted_invite_links
ADD COLUMN campaign_id UUID REFERENCES public.invite_extract_campaigns(id) ON DELETE CASCADE;

CREATE INDEX idx_extracted_invite_links_campaign ON public.extracted_invite_links(campaign_id);
