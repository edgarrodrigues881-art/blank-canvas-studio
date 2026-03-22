
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS messages_per_instance integer DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS device_ids jsonb DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.campaigns.messages_per_instance IS 'Number of messages to send per instance before rotating. 0 means no rotation.';
COMMENT ON COLUMN public.campaigns.device_ids IS 'Array of device UUIDs for multi-instance rotation.';
