
-- Warmup folders table
CREATE TABLE public.warmup_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#10b981',
  icon text NOT NULL DEFAULT 'folder',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.warmup_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own folders" ON public.warmup_folders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own folders" ON public.warmup_folders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own folders" ON public.warmup_folders FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own folders" ON public.warmup_folders FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Association table: folders <-> devices
CREATE TABLE public.warmup_folder_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES public.warmup_folders(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(folder_id, device_id)
);

ALTER TABLE public.warmup_folder_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own folder devices" ON public.warmup_folder_devices FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own folder devices" ON public.warmup_folder_devices FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own folder devices" ON public.warmup_folder_devices FOR DELETE TO authenticated USING (auth.uid() = user_id);
