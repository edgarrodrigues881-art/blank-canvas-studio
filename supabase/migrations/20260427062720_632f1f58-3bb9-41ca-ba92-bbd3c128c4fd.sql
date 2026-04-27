ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS dismissed_warnings text[] NOT NULL DEFAULT '{}';