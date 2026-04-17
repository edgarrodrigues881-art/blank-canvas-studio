CREATE OR REPLACE FUNCTION public.increment_unread(p_conv_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.conversations
  SET unread_count = COALESCE(unread_count, 0) + 1,
      updated_at = now()
  WHERE id = p_conv_id;
$$;