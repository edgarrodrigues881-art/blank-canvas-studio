
CREATE TABLE public.prospeccao_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  nicho text NOT NULL,
  estado text NOT NULL,
  cidade text NOT NULL,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE UNIQUE INDEX idx_prospeccao_cache_lookup ON public.prospeccao_cache (user_id, lower(nicho), lower(estado), lower(cidade));

ALTER TABLE public.prospeccao_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cache" ON public.prospeccao_cache FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own cache" ON public.prospeccao_cache FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own cache" ON public.prospeccao_cache FOR DELETE USING (auth.uid() = user_id);
