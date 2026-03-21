
CREATE TABLE public.proxies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  host TEXT NOT NULL,
  port TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'HTTP',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.proxies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own proxies"
ON public.proxies FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own proxies"
ON public.proxies FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own proxies"
ON public.proxies FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own proxies"
ON public.proxies FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_proxies_updated_at
BEFORE UPDATE ON public.proxies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
