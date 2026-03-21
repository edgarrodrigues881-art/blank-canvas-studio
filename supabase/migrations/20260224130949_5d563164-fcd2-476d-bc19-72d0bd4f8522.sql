ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS uazapi_token text DEFAULT NULL;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS uazapi_base_url text DEFAULT NULL;