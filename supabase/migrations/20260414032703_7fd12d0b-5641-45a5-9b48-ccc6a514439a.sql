
-- Table to store AI learning insights from conversation analysis
CREATE TABLE public.ai_learning_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  analysis_type text NOT NULL DEFAULT 'conversation_patterns',
  total_conversations_analyzed integer NOT NULL DEFAULT 0,
  successful_patterns jsonb DEFAULT '[]'::jsonb,
  failure_patterns jsonb DEFAULT '[]'::jsonb,
  objection_handlers jsonb DEFAULT '[]'::jsonb,
  best_openers jsonb DEFAULT '[]'::jsonb,
  closing_techniques jsonb DEFAULT '[]'::jsonb,
  evolved_prompt text,
  confidence_score integer DEFAULT 0,
  insights_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_learning_insights_user ON public.ai_learning_insights(user_id);

ALTER TABLE public.ai_learning_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own insights"
  ON public.ai_learning_insights FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own insights"
  ON public.ai_learning_insights FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own insights"
  ON public.ai_learning_insights FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access"
  ON public.ai_learning_insights FOR ALL
  TO service_role
  USING (true);
