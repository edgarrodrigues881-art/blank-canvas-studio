
CREATE TABLE public.quick_replies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  label TEXT NOT NULL,
  content TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own quick_replies"
  ON public.quick_replies FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own quick_replies"
  ON public.quick_replies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own quick_replies"
  ON public.quick_replies FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own quick_replies"
  ON public.quick_replies FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_quick_replies_user ON public.quick_replies (user_id, sort_order);
