
-- Add is_eligible and notes columns to warmup_community_membership
ALTER TABLE public.warmup_community_membership 
  ADD COLUMN IF NOT EXISTS is_eligible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notes text;

-- Create community_settings table for admin config
CREATE TABLE public.community_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.community_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage community settings" ON public.community_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Insert default settings
INSERT INTO public.community_settings (key, value) VALUES
  ('min_phase_required_for_pool', 'autosave_enabled'),
  ('max_active_pairs_per_instance', '1'),
  ('rotation_policy_last_n', '3'),
  ('show_community_to_users', 'false');

-- Add meta column to community_pairs if not exists
ALTER TABLE public.community_pairs
  ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_community_membership_eligible ON public.warmup_community_membership (is_eligible);
CREATE INDEX IF NOT EXISTS idx_community_membership_enabled ON public.warmup_community_membership (is_enabled);
CREATE INDEX IF NOT EXISTS idx_community_pairs_status ON public.community_pairs (status);
CREATE INDEX IF NOT EXISTS idx_community_pairs_created ON public.community_pairs (created_at);
