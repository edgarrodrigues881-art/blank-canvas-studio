-- Create a secure view that excludes sensitive token columns
-- This prevents any future frontend query from accidentally exposing tokens
CREATE OR REPLACE VIEW public.devices_safe
WITH (security_invoker = true)
AS
SELECT
  id,
  created_at,
  instance_type,
  last_api_call_at,
  login_type,
  name,
  number,
  profile_name,
  profile_picture,
  proxy_id,
  status,
  uazapi_base_url,
  updated_at,
  user_id
FROM public.devices;

-- Grant access to the view for authenticated users
GRANT SELECT ON public.devices_safe TO authenticated;

-- Add comment documenting the security purpose
COMMENT ON VIEW public.devices_safe IS 'Safe view of devices table excluding sensitive tokens (uazapi_token, whapi_token). Use this view for all frontend queries.';