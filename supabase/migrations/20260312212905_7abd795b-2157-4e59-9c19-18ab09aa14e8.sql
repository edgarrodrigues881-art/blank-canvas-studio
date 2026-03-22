
-- Queue table for individual group join items (background processing)
CREATE TABLE public.group_join_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.group_join_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  device_id uuid NOT NULL,
  device_name text NOT NULL DEFAULT '',
  group_link text NOT NULL,
  group_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  response_status integer,
  attempt integer NOT NULL DEFAULT 0,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.group_join_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own queue items" ON public.group_join_queue
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own queue items" ON public.group_join_queue
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own queue items" ON public.group_join_queue
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own queue items" ON public.group_join_queue
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Index for fast lookup of pending items per campaign
CREATE INDEX idx_group_join_queue_campaign_status ON public.group_join_queue(campaign_id, status);
