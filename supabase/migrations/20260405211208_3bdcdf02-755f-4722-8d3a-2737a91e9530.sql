
DROP POLICY "Service role full access conversations" ON public.conversations;
DROP POLICY "Service role full access messages" ON public.conversation_messages;

-- Recreate as role-based (service_role bypasses RLS by default, so these aren't needed)
-- The service_role key automatically bypasses RLS in Supabase
