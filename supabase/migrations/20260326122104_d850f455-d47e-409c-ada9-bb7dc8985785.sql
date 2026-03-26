-- ══════════════════════════════════════════════════════════
-- COMMUNITY CORE ARCHITECTURE - Motor Central Unificado
-- ══════════════════════════════════════════════════════════

-- 1. Expandir warmup_community_membership com campos do motor central
ALTER TABLE public.warmup_community_membership
  ADD COLUMN IF NOT EXISTS community_mode text NOT NULL DEFAULT 'disabled',
  ADD COLUMN IF NOT EXISTS community_day integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intensity text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS daily_limit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS messages_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pairs_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cooldown_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_partner_device_id uuid,
  ADD COLUMN IF NOT EXISTS last_session_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS start_hour text NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS end_hour text NOT NULL DEFAULT '19:00',
  ADD COLUMN IF NOT EXISTS active_days jsonb NOT NULL DEFAULT '["mon","tue","wed","thu","fri"]'::jsonb,
  ADD COLUMN IF NOT EXISTS custom_peers_min integer,
  ADD COLUMN IF NOT EXISTS custom_peers_max integer,
  ADD COLUMN IF NOT EXISTS custom_msgs_per_peer integer,
  ADD COLUMN IF NOT EXISTS custom_min_delay_seconds integer,
  ADD COLUMN IF NOT EXISTS custom_max_delay_seconds integer,
  ADD COLUMN IF NOT EXISTS custom_pause_after_min integer,
  ADD COLUMN IF NOT EXISTS custom_pause_after_max integer,
  ADD COLUMN IF NOT EXISTS custom_pause_duration_min integer,
  ADD COLUMN IF NOT EXISTS custom_pause_duration_max integer,
  ADD COLUMN IF NOT EXISTS last_daily_reset_at timestamptz;

-- Update existing rows: if is_enabled=true and cycle_id is not null, set to warmup_managed
UPDATE public.warmup_community_membership
SET community_mode = CASE
  WHEN is_enabled = true AND cycle_id IS NOT NULL THEN 'warmup_managed'
  WHEN is_enabled = true AND cycle_id IS NULL THEN 'community_only'
  ELSE 'disabled'
END;

-- 2. Criar tabela community_sessions (cada bloco de conversa entre uma dupla)
CREATE TABLE IF NOT EXISTS public.community_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id uuid NOT NULL REFERENCES public.community_pairs(id) ON DELETE CASCADE,
  device_a uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  device_b uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  user_a uuid NOT NULL,
  user_b uuid NOT NULL,
  community_mode text NOT NULL DEFAULT 'warmup_managed',
  target_messages integer NOT NULL DEFAULT 120,
  messages_sent_a integer NOT NULL DEFAULT 0,
  messages_sent_b integer NOT NULL DEFAULT 0,
  messages_total integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  end_reason text,
  last_sender uuid,
  last_message_at timestamptz,
  min_delay_seconds integer NOT NULL DEFAULT 30,
  max_delay_seconds integer NOT NULL DEFAULT 90,
  pause_after_messages_min integer NOT NULL DEFAULT 8,
  pause_after_messages_max integer NOT NULL DEFAULT 15,
  pause_duration_min integer NOT NULL DEFAULT 60,
  pause_duration_max integer NOT NULL DEFAULT 180,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own community sessions" ON public.community_sessions
  FOR SELECT TO authenticated
  USING (user_a = auth.uid() OR user_b = auth.uid());

CREATE POLICY "Admins see all community sessions" ON public.community_sessions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Criar tabela community_session_logs (cada mensagem enviada numa sessão)
CREATE TABLE IF NOT EXISTS public.community_session_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.community_sessions(id) ON DELETE CASCADE,
  pair_id uuid NOT NULL,
  sender_device_id uuid NOT NULL,
  receiver_device_id uuid NOT NULL,
  sender_user_id uuid NOT NULL,
  message_content text NOT NULL,
  message_index integer NOT NULL DEFAULT 0,
  delay_applied_seconds integer DEFAULT 0,
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_session_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own community session logs" ON public.community_session_logs
  FOR SELECT TO authenticated
  USING (sender_user_id = auth.uid());

CREATE POLICY "Admins see all community session logs" ON public.community_session_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Expandir community_pairs: adicionar community_mode e session tracking
ALTER TABLE public.community_pairs
  ADD COLUMN IF NOT EXISTS community_mode text NOT NULL DEFAULT 'warmup_managed',
  ADD COLUMN IF NOT EXISTS session_id uuid,
  ADD COLUMN IF NOT EXISTS messages_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_messages integer NOT NULL DEFAULT 120;

-- 5. Índices para performance
CREATE INDEX IF NOT EXISTS idx_community_membership_mode ON public.warmup_community_membership(community_mode);
CREATE INDEX IF NOT EXISTS idx_community_membership_eligible ON public.warmup_community_membership(is_eligible, community_mode) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_community_membership_device ON public.warmup_community_membership(device_id);
CREATE INDEX IF NOT EXISTS idx_community_sessions_status ON public.community_sessions(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_community_sessions_pair ON public.community_sessions(pair_id);
CREATE INDEX IF NOT EXISTS idx_community_sessions_devices ON public.community_sessions(device_a, device_b);
CREATE INDEX IF NOT EXISTS idx_community_session_logs_session ON public.community_session_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_community_session_logs_sender ON public.community_session_logs(sender_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_pairs_mode ON public.community_pairs(community_mode, status);

-- 6. Tabela community_daily_stats para tracking por conta/dia
CREATE TABLE IF NOT EXISTS public.community_daily_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  stat_date date NOT NULL,
  community_mode text NOT NULL DEFAULT 'warmup_managed',
  pairs_completed integer NOT NULL DEFAULT 0,
  messages_sent integer NOT NULL DEFAULT 0,
  messages_received integer NOT NULL DEFAULT 0,
  messages_failed integer NOT NULL DEFAULT 0,
  sessions_started integer NOT NULL DEFAULT 0,
  sessions_completed integer NOT NULL DEFAULT 0,
  unique_partners integer NOT NULL DEFAULT 0,
  last_partner_device_id uuid,
  last_error text,
  last_cooldown_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(device_id, stat_date)
);

ALTER TABLE public.community_daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own community daily stats" ON public.community_daily_stats
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins see all community daily stats" ON public.community_daily_stats
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_community_daily_stats_device_date ON public.community_daily_stats(device_id, stat_date DESC);

-- 7. Função para progressão de duplas por community_day (warmup_managed)
CREATE OR REPLACE FUNCTION public.get_community_pairs_target(p_community_day integer)
RETURNS integer[]
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_community_day <= 1 THEN ARRAY[1, 3]
    WHEN p_community_day = 2 THEN ARRAY[2, 5]
    WHEN p_community_day = 3 THEN ARRAY[4, 7]
    WHEN p_community_day BETWEEN 4 AND 6 THEN ARRAY[5, 8]
    ELSE ARRAY[6, 10]
  END;
$$;

-- 8. Função para calcular elegibilidade
CREATE OR REPLACE FUNCTION public.check_community_eligibility(
  p_device_id uuid,
  p_community_mode text DEFAULT 'warmup_managed'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
DECLARE
  _membership record;
  _device record;
  _cycle record;
  _active_session_count integer;
BEGIN
  SELECT * INTO _membership FROM public.warmup_community_membership
  WHERE device_id = p_device_id LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'no_membership');
  END IF;

  IF _membership.community_mode = 'disabled' THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'mode_disabled');
  END IF;

  SELECT id, status, number INTO _device FROM public.devices WHERE id = p_device_id;
  IF _device.status NOT IN ('Ready', 'Connected', 'authenticated', 'open', 'active') THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'device_disconnected', 'device_status', _device.status);
  END IF;

  IF _membership.cooldown_until IS NOT NULL AND _membership.cooldown_until > now() THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'cooldown_active', 'cooldown_until', _membership.cooldown_until);
  END IF;

  IF _membership.daily_limit > 0 AND _membership.messages_today >= _membership.daily_limit THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'daily_limit_reached', 'messages_today', _membership.messages_today, 'daily_limit', _membership.daily_limit);
  END IF;

  SELECT count(*) INTO _active_session_count FROM public.community_sessions
  WHERE (device_a = p_device_id OR device_b = p_device_id) AND status = 'active';
  IF _active_session_count > 0 THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'session_active', 'active_sessions', _active_session_count);
  END IF;

  IF _membership.community_mode = 'warmup_managed' THEN
    SELECT * INTO _cycle FROM public.warmup_cycles
    WHERE device_id = p_device_id AND status = 'running' LIMIT 1;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object('eligible', false, 'reason', 'no_active_cycle');
    END IF;

    IF _membership.community_day < 1 THEN
      RETURN jsonb_build_object('eligible', false, 'reason', 'community_day_not_started', 'community_day', _membership.community_day);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'eligible', true,
    'community_mode', _membership.community_mode,
    'community_day', _membership.community_day,
    'messages_today', _membership.messages_today,
    'pairs_today', _membership.pairs_today,
    'daily_limit', _membership.daily_limit
  );
END;
$$;