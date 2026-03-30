
ALTER TABLE public.welcome_automations
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS buttons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS carousel_cards jsonb NOT NULL DEFAULT '[]'::jsonb;
