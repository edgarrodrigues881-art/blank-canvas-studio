
-- Table: group_interactions (automation config)
CREATE TABLE public.group_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Interação de Grupos',
  status text NOT NULL DEFAULT 'idle',
  group_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  min_delay_seconds integer NOT NULL DEFAULT 15,
  max_delay_seconds integer NOT NULL DEFAULT 60,
  pause_after_messages_min integer NOT NULL DEFAULT 4,
  pause_after_messages_max integer NOT NULL DEFAULT 8,
  pause_duration_min integer NOT NULL DEFAULT 120,
  pause_duration_max integer NOT NULL DEFAULT 300,
  messages_per_cycle_min integer NOT NULL DEFAULT 10,
  messages_per_cycle_max integer NOT NULL DEFAULT 30,
  duration_hours integer NOT NULL DEFAULT 1,
  duration_minutes integer NOT NULL DEFAULT 0,
  start_hour text NOT NULL DEFAULT '08:00',
  end_hour text NOT NULL DEFAULT '18:00',
  active_days jsonb NOT NULL DEFAULT '["mon","tue","wed","thu","fri"]'::jsonb,
  daily_limit_per_group integer NOT NULL DEFAULT 50,
  daily_limit_total integer NOT NULL DEFAULT 200,
  total_messages_sent integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.group_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own group interactions"
  ON public.group_interactions FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Table: group_interaction_logs
CREATE TABLE public.group_interaction_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id uuid NOT NULL REFERENCES public.group_interactions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  group_id text NOT NULL,
  group_name text DEFAULT '',
  message_content text NOT NULL,
  message_category text NOT NULL DEFAULT 'continuacao',
  device_id uuid,
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  pause_applied_seconds integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.group_interaction_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own group interaction logs"
  ON public.group_interaction_logs FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
