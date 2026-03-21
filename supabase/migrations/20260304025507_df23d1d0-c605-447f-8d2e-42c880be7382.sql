
-- Create a secure view that hides sensitive admin fields from regular users
-- Users see their own profile but admin_notes and whatsapp_monitor_token are nullified
-- Admins see everything

CREATE OR REPLACE FUNCTION public.get_profile_safe(profile_row profiles)
RETURNS profiles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If the caller is an admin, return the full row
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN profile_row;
  END IF;
  -- Otherwise, null out sensitive fields
  profile_row.admin_notes := NULL;
  profile_row.whatsapp_monitor_token := NULL;
  RETURN profile_row;
END;
$$;

-- Add RLS policy so admins can view ALL profiles (for backoffice)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Admins can view all profiles'
  ) THEN
    CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- Add RLS policy so admins can update ALL profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Admins can update all profiles'
  ) THEN
    CREATE POLICY "Admins can update all profiles" ON public.profiles
    FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;
