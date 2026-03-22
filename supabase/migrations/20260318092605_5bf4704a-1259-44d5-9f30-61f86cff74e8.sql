
-- Table to track autoreply conversation state per contact
CREATE TABLE public.autoreply_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.autoreply_flows(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  contact_phone text NOT NULL,
  current_node_id text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(flow_id, contact_phone)
);

-- Index for fast lookups
CREATE INDEX idx_autoreply_sessions_lookup ON public.autoreply_sessions(device_id, contact_phone, status);

-- RLS
ALTER TABLE public.autoreply_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions" ON public.autoreply_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions" ON public.autoreply_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions" ON public.autoreply_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions" ON public.autoreply_sessions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
