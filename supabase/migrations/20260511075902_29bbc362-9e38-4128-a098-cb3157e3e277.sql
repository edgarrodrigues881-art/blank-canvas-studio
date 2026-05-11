ALTER TABLE public.device_groups_cache ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.device_groups_cache ADD COLUMN IF NOT EXISTS image_synced_at timestamptz;
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;