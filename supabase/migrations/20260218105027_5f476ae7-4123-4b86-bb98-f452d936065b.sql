-- Add whapi_token column to devices table for Whapi API integration
ALTER TABLE public.devices ADD COLUMN whapi_token TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.devices.whapi_token IS 'Whapi.cloud channel API token for this device';