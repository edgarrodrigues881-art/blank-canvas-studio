
CREATE TABLE public.group_join_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'running',
  total_items integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  already_member_count integer NOT NULL DEFAULT 0,
  device_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  group_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  min_delay integer NOT NULL DEFAULT 15,
  max_delay integer NOT NULL DEFAULT 45,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.group_join_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own group join campaigns" ON public.group_join_campaigns
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own group join campaigns" ON public.group_join_campaigns
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own group join campaigns" ON public.group_join_campaigns
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own group join campaigns" ON public.group_join_campaigns
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
