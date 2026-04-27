CREATE TABLE public.status_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text','image','video','audio')),
  text_content TEXT,
  media_url TEXT,
  media_type TEXT,
  caption TEXT,
  background_color TEXT,
  font INTEGER,
  device_ids UUID[] NOT NULL DEFAULT '{}',
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','completed','failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_status_posts_user ON public.status_posts(user_id, created_at DESC);

ALTER TABLE public.status_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own status" ON public.status_posts FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own status" ON public.status_posts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own status" ON public.status_posts FOR UPDATE
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users delete own status" ON public.status_posts FOR DELETE
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_status_posts_updated_at
BEFORE UPDATE ON public.status_posts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();