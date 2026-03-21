
CREATE OR REPLACE FUNCTION public.check_phone_available(_phone text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE phone = _phone AND _phone IS NOT NULL AND _phone != ''
  )
$$;
