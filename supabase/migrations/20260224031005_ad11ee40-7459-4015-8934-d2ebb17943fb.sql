CREATE TABLE public.warmup_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  link TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.warmup_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own warmup groups" ON public.warmup_groups
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own warmup groups" ON public.warmup_groups
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own warmup groups" ON public.warmup_groups
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own warmup groups" ON public.warmup_groups
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_warmup_groups_updated_at
  BEFORE UPDATE ON public.warmup_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();