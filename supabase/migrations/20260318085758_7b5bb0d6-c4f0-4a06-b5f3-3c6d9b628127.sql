CREATE TABLE public.autoreply_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Minha Automação',
  is_active boolean NOT NULL DEFAULT false,
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  edges jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.autoreply_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own flows" ON public.autoreply_flows
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own flows" ON public.autoreply_flows
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own flows" ON public.autoreply_flows
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own flows" ON public.autoreply_flows
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_autoreply_flows_updated_at
  BEFORE UPDATE ON public.autoreply_flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();