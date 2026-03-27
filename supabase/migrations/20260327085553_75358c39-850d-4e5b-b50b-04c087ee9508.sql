
-- Add signup_ip column to profiles for audit
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_ip text;

-- Improve check_phone_available to also check profiles table
CREATE OR REPLACE FUNCTION public.check_phone_available(_phone text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _normalized text;
  _normalized_no55 text;
BEGIN
  _normalized := regexp_replace(_phone, '[^0-9]', '', 'g');
  
  -- Also check without country code 55
  _normalized_no55 := CASE 
    WHEN _normalized LIKE '55%' AND length(_normalized) >= 12 
    THEN substring(_normalized from 3)
    ELSE _normalized
  END;

  -- Check devices table
  IF EXISTS (SELECT 1 FROM public.devices WHERE number = _normalized OR number = _normalized_no55) THEN
    RETURN false;
  END IF;

  -- Check profiles table (most important for anti-abuse)
  IF EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE regexp_replace(phone, '[^0-9]', '', 'g') = _normalized
       OR regexp_replace(phone, '[^0-9]', '', 'g') = _normalized_no55
       OR '55' || regexp_replace(phone, '[^0-9]', '', 'g') = _normalized
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;
