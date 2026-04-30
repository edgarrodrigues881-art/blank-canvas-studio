CREATE OR REPLACE FUNCTION public.claim_next_autosave_schedule_contact(
  p_user_id uuid,
  p_exclude_phones text[] DEFAULT ARRAY[]::text[]
)
RETURNS TABLE(
  id uuid,
  phone_e164 text,
  contact_name text,
  use_count integer,
  was_recycled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact record;
  v_recycled boolean := false;
BEGIN
  SELECT c.id, c.phone_e164, c.contact_name, c.use_count
    INTO v_contact
  FROM public.warmup_autosave_contacts AS c
  WHERE c.user_id = p_user_id
    AND c.is_active = true
    AND COALESCE(c.contact_status, 'active') NOT IN ('discarded', 'invalid')
    AND c.last_used_at IS NULL
    AND (p_exclude_phones IS NULL OR NOT (c.phone_e164 = ANY(p_exclude_phones)))
  ORDER BY random()
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    v_recycled := true;

    SELECT c.id, c.phone_e164, c.contact_name, c.use_count
      INTO v_contact
    FROM public.warmup_autosave_contacts AS c
    WHERE c.user_id = p_user_id
      AND c.is_active = true
      AND COALESCE(c.contact_status, 'active') NOT IN ('discarded', 'invalid')
      AND (p_exclude_phones IS NULL OR NOT (c.phone_e164 = ANY(p_exclude_phones)))
    ORDER BY c.last_used_at ASC NULLS FIRST, c.use_count ASC, c.id ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  END IF;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.warmup_autosave_contacts AS w
     SET last_used_at = now(),
         use_count = COALESCE(w.use_count, 0) + 1,
         contact_status = CASE WHEN v_recycled THEN 'recycled' ELSE 'used' END,
         updated_at = now()
   WHERE w.id = v_contact.id;

  RETURN QUERY SELECT
    v_contact.id,
    v_contact.phone_e164,
    v_contact.contact_name,
    COALESCE(v_contact.use_count, 0) + 1,
    v_recycled;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_next_autosave_schedule_contact(uuid, text[]) TO authenticated, service_role;