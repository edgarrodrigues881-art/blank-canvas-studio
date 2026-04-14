
-- Knowledge base documents table for storing company info, PDFs, prompts etc
CREATE TABLE public.ai_knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  doc_type text NOT NULL DEFAULT 'text',
  content text,
  file_url text,
  file_name text,
  file_size integer DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_kb_user ON public.ai_knowledge_base(user_id, is_active);

ALTER TABLE public.ai_knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own KB"
  ON public.ai_knowledge_base FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own KB"
  ON public.ai_knowledge_base FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own KB"
  ON public.ai_knowledge_base FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own KB"
  ON public.ai_knowledge_base FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access KB"
  ON public.ai_knowledge_base FOR ALL
  TO service_role
  USING (true);
