CREATE TABLE public.delay_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  min_delay_seconds integer NOT NULL DEFAULT 8,
  max_delay_seconds integer NOT NULL DEFAULT 25,
  pause_every_min integer NOT NULL DEFAULT 10,
  pause_every_max integer NOT NULL DEFAULT 20,
  pause_duration_min integer NOT NULL DEFAULT 30,
  pause_duration_max integer NOT NULL DEFAULT 120,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.delay_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own delay profiles" ON public.delay_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own delay profiles" ON public.delay_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own delay profiles" ON public.delay_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own delay profiles" ON public.delay_profiles FOR DELETE USING (auth.uid() = user_id);