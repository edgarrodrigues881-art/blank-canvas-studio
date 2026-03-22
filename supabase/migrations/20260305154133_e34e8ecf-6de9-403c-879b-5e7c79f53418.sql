
-- ============================================
-- WARMUP V2 - ENUMS
-- ============================================

CREATE TYPE public.warmup_chip_state AS ENUM ('new', 'recovered');

CREATE TYPE public.warmup_phase AS ENUM (
  'pre_24h', 'groups_only', 'autosave_enabled', 
  'community_enabled', 'completed', 'paused', 'error'
);

CREATE TYPE public.warmup_group_join_status AS ENUM ('pending', 'joined', 'failed', 'left');

CREATE TYPE public.warmup_job_type AS ENUM (
  'join_group', 'enable_autosave', 'enable_community',
  'autosave_interaction', 'community_interaction',
  'daily_reset', 'phase_transition', 'health_check'
);

CREATE TYPE public.warmup_job_status AS ENUM ('pending', 'running', 'succeeded', 'failed', 'cancelled');

CREATE TYPE public.warmup_log_level AS ENUM ('info', 'warn', 'error');

-- ============================================
-- 1) warmup_plans (catálogo de planos)
-- ============================================
CREATE TABLE public.warmup_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  days_total int NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.warmup_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view active plans"
  ON public.warmup_plans FOR SELECT TO authenticated
  USING (is_active = true);

-- Seed 4 planos padrão
INSERT INTO public.warmup_plans (name, days_total) VALUES
  ('7 dias', 7),
  ('14 dias', 14),
  ('21 dias', 21),
  ('30 dias', 30);

-- ============================================
-- 2) warmup_cycles (1 ciclo ativo por device)
-- ============================================
CREATE TABLE public.warmup_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.warmup_plans(id),
  chip_state warmup_chip_state NOT NULL DEFAULT 'new',
  days_total int NOT NULL DEFAULT 14,
  started_at timestamptz NOT NULL DEFAULT now(),
  day_index int NOT NULL DEFAULT 1,
  phase warmup_phase NOT NULL DEFAULT 'pre_24h',
  is_running boolean NOT NULL DEFAULT true,
  first_24h_ends_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  daily_interaction_budget_min int NOT NULL DEFAULT 20,
  daily_interaction_budget_max int NOT NULL DEFAULT 30,
  daily_interaction_budget_target int NOT NULL DEFAULT 25,
  daily_interaction_budget_used int NOT NULL DEFAULT 0,
  daily_unique_recipients_cap int NOT NULL DEFAULT 55,
  daily_unique_recipients_used int NOT NULL DEFAULT 0,
  last_daily_reset_at timestamptz DEFAULT now(),
  next_run_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_warmup_cycles_device ON public.warmup_cycles(device_id);
CREATE INDEX idx_warmup_cycles_running ON public.warmup_cycles(is_running);
CREATE INDEX idx_warmup_cycles_phase ON public.warmup_cycles(phase);
CREATE INDEX idx_warmup_cycles_next_run ON public.warmup_cycles(next_run_at);
CREATE INDEX idx_warmup_cycles_user ON public.warmup_cycles(user_id);

ALTER TABLE public.warmup_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cycles" ON public.warmup_cycles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own cycles" ON public.warmup_cycles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own cycles" ON public.warmup_cycles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own cycles" ON public.warmup_cycles
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- 3) warmup_groups_pool (pool global de 8 grupos)
-- ============================================
CREATE TABLE public.warmup_groups_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  external_group_ref text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_warmup_groups_pool_active ON public.warmup_groups_pool(is_active);

ALTER TABLE public.warmup_groups_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view active pool groups"
  ON public.warmup_groups_pool FOR SELECT TO authenticated
  USING (is_active = true);

-- Seed 8 grupos placeholder
INSERT INTO public.warmup_groups_pool (name, external_group_ref) VALUES
  ('Grupo Aquecimento 1', 'placeholder_1'),
  ('Grupo Aquecimento 2', 'placeholder_2'),
  ('Grupo Aquecimento 3', 'placeholder_3'),
  ('Grupo Aquecimento 4', 'placeholder_4'),
  ('Grupo Aquecimento 5', 'placeholder_5'),
  ('Grupo Aquecimento 6', 'placeholder_6'),
  ('Grupo Aquecimento 7', 'placeholder_7'),
  ('Grupo Aquecimento 8', 'placeholder_8');

-- ============================================
-- 4) warmup_instance_groups (quais grupos cada device entrou)
-- ============================================
CREATE TABLE public.warmup_instance_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.warmup_groups_pool(id) ON DELETE CASCADE,
  cycle_id uuid REFERENCES public.warmup_cycles(id) ON DELETE SET NULL,
  join_status warmup_group_join_status NOT NULL DEFAULT 'pending',
  joined_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_instance_groups_device ON public.warmup_instance_groups(device_id);
CREATE INDEX idx_instance_groups_group ON public.warmup_instance_groups(group_id);
CREATE INDEX idx_instance_groups_status ON public.warmup_instance_groups(join_status);

ALTER TABLE public.warmup_instance_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own instance groups" ON public.warmup_instance_groups
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own instance groups" ON public.warmup_instance_groups
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own instance groups" ON public.warmup_instance_groups
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- 5) warmup_autosave_contacts (contatos do cliente para auto save)
-- ============================================
CREATE TABLE public.warmup_autosave_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_name text NOT NULL DEFAULT '',
  phone_e164 text NOT NULL,
  tags text DEFAULT 'autosave',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, phone_e164)
);

CREATE INDEX idx_autosave_contacts_user ON public.warmup_autosave_contacts(user_id);
CREATE INDEX idx_autosave_contacts_active ON public.warmup_autosave_contacts(is_active);

ALTER TABLE public.warmup_autosave_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own autosave contacts" ON public.warmup_autosave_contacts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own autosave contacts" ON public.warmup_autosave_contacts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own autosave contacts" ON public.warmup_autosave_contacts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own autosave contacts" ON public.warmup_autosave_contacts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- 6) warmup_community_membership
-- ============================================
CREATE TABLE public.warmup_community_membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  cycle_id uuid REFERENCES public.warmup_cycles(id) ON DELETE SET NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  enabled_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_community_membership_enabled ON public.warmup_community_membership(is_enabled);
CREATE INDEX idx_community_membership_device ON public.warmup_community_membership(device_id);

ALTER TABLE public.warmup_community_membership ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own community membership" ON public.warmup_community_membership
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own community membership" ON public.warmup_community_membership
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own community membership" ON public.warmup_community_membership
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- 7) warmup_jobs (fila de tarefas agendadas)
-- ============================================
CREATE TABLE public.warmup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES public.warmup_cycles(id) ON DELETE CASCADE,
  job_type warmup_job_type NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  run_at timestamptz NOT NULL DEFAULT now(),
  status warmup_job_status NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_warmup_jobs_status_run ON public.warmup_jobs(status, run_at);
CREATE INDEX idx_warmup_jobs_device_status ON public.warmup_jobs(device_id, status);
CREATE INDEX idx_warmup_jobs_cycle_status ON public.warmup_jobs(cycle_id, status);

ALTER TABLE public.warmup_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own warmup jobs" ON public.warmup_jobs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own warmup jobs" ON public.warmup_jobs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own warmup jobs" ON public.warmup_jobs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- 8) warmup_unique_recipients (controle diário)
-- ============================================
CREATE TABLE public.warmup_unique_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  cycle_id uuid NOT NULL REFERENCES public.warmup_cycles(id) ON DELETE CASCADE,
  day_date date NOT NULL DEFAULT CURRENT_DATE,
  recipient_phone_e164 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cycle_id, day_date, recipient_phone_e164)
);

CREATE INDEX idx_unique_recipients_cycle_day ON public.warmup_unique_recipients(cycle_id, day_date);

ALTER TABLE public.warmup_unique_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own unique recipients" ON public.warmup_unique_recipients
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own unique recipients" ON public.warmup_unique_recipients
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 9) warmup_audit_logs (auditoria completa - separado do warmup_logs existente)
-- ============================================
CREATE TABLE public.warmup_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id uuid NOT NULL,
  cycle_id uuid REFERENCES public.warmup_cycles(id) ON DELETE SET NULL,
  level warmup_log_level NOT NULL DEFAULT 'info',
  event_type text NOT NULL,
  message text NOT NULL DEFAULT '',
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_warmup_audit_device_created ON public.warmup_audit_logs(device_id, created_at);
CREATE INDEX idx_warmup_audit_cycle_created ON public.warmup_audit_logs(cycle_id, created_at);
CREATE INDEX idx_warmup_audit_user ON public.warmup_audit_logs(user_id);

ALTER TABLE public.warmup_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audit logs" ON public.warmup_audit_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own audit logs" ON public.warmup_audit_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
