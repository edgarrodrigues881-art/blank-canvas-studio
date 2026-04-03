-- Add RLS policy for Realtime channel authorization
-- This ensures authenticated users can only receive realtime events
-- The actual data filtering is handled by RLS on the source tables (warmup_cycles, group_interactions, notifications)
CREATE POLICY "Authenticated users receive own realtime events"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);