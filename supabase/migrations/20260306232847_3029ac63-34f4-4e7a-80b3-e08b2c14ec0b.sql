
-- Prevent multiple devices from using the same proxy simultaneously
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_proxy_id_unique 
ON public.devices (proxy_id) 
WHERE proxy_id IS NOT NULL;
