
-- 1. Update the profiles guard trigger to protect ALL admin-controlled fields
CREATE OR REPLACE FUNCTION public.profiles_user_update_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- If the user is an admin, allow all changes
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- For regular users, revert admin-controlled fields to their old values
  NEW.risk_flag := OLD.risk_flag;
  NEW.admin_notes := OLD.admin_notes;
  NEW.status := OLD.status;
  NEW.instance_override := OLD.instance_override;
  NEW.client_type := OLD.client_type;
  NEW.notificacao_liberada := OLD.notificacao_liberada;

  RETURN NEW;
END;
$function$;

-- 2. Fix Realtime policy to scope by user ownership
-- Drop the existing overly-permissive policy
DROP POLICY IF EXISTS "Authenticated users can receive realtime messages" ON realtime.messages;

-- Create a scoped policy that only allows users to receive their own data
CREATE POLICY "Users receive only their own realtime messages"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM auth.users WHERE users.id = auth.uid()
  )
  AND (
    -- Allow if topic contains the user's own ID (covers postgres_changes filters)
    topic LIKE '%' || auth.uid()::text || '%'
    -- Or system-wide broadcast channels (no user data)
    OR topic = 'system'
  )
);
