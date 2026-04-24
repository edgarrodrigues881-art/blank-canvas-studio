CREATE TABLE public.pipeline_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'azul',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, key)
);

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own pipeline stages"
ON public.pipeline_stages FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own pipeline stages"
ON public.pipeline_stages FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pipeline stages"
ON public.pipeline_stages FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own pipeline stages"
ON public.pipeline_stages FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_pipeline_stages_updated_at
BEFORE UPDATE ON public.pipeline_stages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_pipeline_stages_user_position ON public.pipeline_stages(user_id, position);