-- Fix warmup folder/device association integrity and RLS
-- 1) Ensure one device can belong to only one folder
ALTER TABLE public.warmup_folder_devices
  DROP CONSTRAINT IF EXISTS warmup_folder_devices_folder_id_device_id_key;

ALTER TABLE public.warmup_folder_devices
  DROP CONSTRAINT IF EXISTS warmup_folder_devices_device_id_key;

ALTER TABLE public.warmup_folder_devices
  ADD CONSTRAINT warmup_folder_devices_device_id_key UNIQUE (device_id);

-- 2) Helpful index for folder listings
CREATE INDEX IF NOT EXISTS idx_warmup_folder_devices_folder_id
  ON public.warmup_folder_devices(folder_id);

-- 3) Replace broken policy set with explicit policies including WITH CHECK for inserts/updates
DROP POLICY IF EXISTS "Users manage own folder devices" ON public.warmup_folder_devices;
DROP POLICY IF EXISTS "Users see own folder devices" ON public.warmup_folder_devices;
DROP POLICY IF EXISTS "Users insert own folder devices" ON public.warmup_folder_devices;
DROP POLICY IF EXISTS "Users update own folder devices" ON public.warmup_folder_devices;
DROP POLICY IF EXISTS "Users delete own folder devices" ON public.warmup_folder_devices;

CREATE POLICY "Users see own folder devices"
ON public.warmup_folder_devices
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.warmup_folders f
    WHERE f.id = warmup_folder_devices.folder_id
      AND f.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.devices d
    WHERE d.id = warmup_folder_devices.device_id
      AND d.user_id = auth.uid()
  )
);

CREATE POLICY "Users insert own folder devices"
ON public.warmup_folder_devices
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.warmup_folders f
    WHERE f.id = warmup_folder_devices.folder_id
      AND f.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.devices d
    WHERE d.id = warmup_folder_devices.device_id
      AND d.user_id = auth.uid()
  )
);

CREATE POLICY "Users update own folder devices"
ON public.warmup_folder_devices
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
)
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.warmup_folders f
    WHERE f.id = warmup_folder_devices.folder_id
      AND f.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.devices d
    WHERE d.id = warmup_folder_devices.device_id
      AND d.user_id = auth.uid()
  )
);

CREATE POLICY "Users delete own folder devices"
ON public.warmup_folder_devices
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
);

-- 4) Normalize existing rows to current folder owners when possible
UPDATE public.warmup_folder_devices fd
SET user_id = f.user_id
FROM public.warmup_folders f
WHERE f.id = fd.folder_id
  AND fd.user_id IS DISTINCT FROM f.user_id;