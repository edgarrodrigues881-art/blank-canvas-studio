-- Drop the existing unrestricted user update policy
DROP POLICY "Users update own profile" ON public.profiles;

-- Create a trigger function that prevents regular users from changing admin fields
CREATE OR REPLACE FUNCTION public.profiles_user_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If the user is an admin, allow all changes
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- For regular users, revert admin-controlled fields to their old values
  NEW.risk_flag := OLD.risk_flag;
  NEW.admin_notes := OLD.admin_notes;

  RETURN NEW;
END;
$$;

-- Attach the trigger
DROP TRIGGER IF EXISTS enforce_profile_update_guard ON public.profiles;
CREATE TRIGGER enforce_profile_update_guard
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_user_update_guard();

-- Re-create the user update policy (row-level only)
CREATE POLICY "Users update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());