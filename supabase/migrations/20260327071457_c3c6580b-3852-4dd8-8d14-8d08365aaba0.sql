
-- Remove the UPDATE policy on mass_inject_events that allows users to modify system-generated events
DROP POLICY IF EXISTS "Users update own campaign events" ON public.mass_inject_events;
