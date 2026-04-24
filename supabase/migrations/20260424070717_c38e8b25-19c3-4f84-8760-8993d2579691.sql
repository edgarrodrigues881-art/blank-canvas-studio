-- Tabela de tags universais do CRM por usuário
CREATE TABLE IF NOT EXISTS public.crm_user_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  label TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, label)
);

ALTER TABLE public.crm_user_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own crm tags"
ON public.crm_user_tags FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own crm tags"
ON public.crm_user_tags FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own crm tags"
ON public.crm_user_tags FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own crm tags"
ON public.crm_user_tags FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_crm_user_tags_updated_at
BEFORE UPDATE ON public.crm_user_tags
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_crm_user_tags_user ON public.crm_user_tags(user_id);