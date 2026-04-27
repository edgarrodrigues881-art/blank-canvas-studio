ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS beta_features text[] NOT NULL DEFAULT '{}';

-- Seed: keep current authorized emails enabled for existing beta features
UPDATE public.profiles
SET beta_features = ARRAY['assistant', 'mass_inject']::text[]
WHERE id IN (
  SELECT id FROM auth.users
  WHERE email IN ('edgarrodrigues881@gmail.com', 'dgdatacrazy01@gmail.com')
);