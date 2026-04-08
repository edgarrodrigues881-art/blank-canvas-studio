
CREATE OR REPLACE FUNCTION public.upsert_service_contact(
  p_user_id uuid,
  p_phone text,
  p_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_company text DEFAULT NULL,
  p_origin text DEFAULT 'WhatsApp',
  p_tags text[] DEFAULT NULL,
  p_tag_scores jsonb DEFAULT '{}'::jsonb,
  p_conversation_id uuid DEFAULT NULL,
  p_last_message_content text DEFAULT NULL,
  p_message_timestamp timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_normalized_phone text;
  v_contact_id uuid;
  v_existing record;
BEGIN
  -- Normalize phone: digits only, ensure 55 prefix for BR numbers
  v_normalized_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  
  IF length(v_normalized_phone) BETWEEN 10 AND 11 THEN
    v_normalized_phone := '55' || v_normalized_phone;
  END IF;

  -- Try to find existing contact with phone variants (9th digit)
  SELECT * INTO v_existing
  FROM public.service_contacts
  WHERE user_id = p_user_id
    AND (
      phone = v_normalized_phone
      OR phone = regexp_replace(p_phone, '[^0-9]', '', 'g')
      OR (length(v_normalized_phone) = 13 AND phone = substring(v_normalized_phone, 1, 4) || substring(v_normalized_phone, 6))
      OR (length(v_normalized_phone) = 12 AND phone = substring(v_normalized_phone, 1, 4) || '9' || substring(v_normalized_phone, 5))
    )
  LIMIT 1
  FOR UPDATE;

  IF v_existing IS NOT NULL THEN
    -- UPDATE: only touch last_message fields + conversation_id
    -- NEVER overwrite name, email, company, tags, notes
    UPDATE public.service_contacts SET
      name = CASE
        WHEN (v_existing.name IS NULL OR v_existing.name = '' OR v_existing.name = v_existing.phone)
             AND p_name IS NOT NULL AND p_name != '' AND p_name != p_phone
        THEN p_name ELSE v_existing.name END,
      conversation_id = COALESCE(p_conversation_id, v_existing.conversation_id),
      last_message_at = p_message_timestamp,
      last_message_content = COALESCE(p_last_message_content, v_existing.last_message_content),
      phone = v_normalized_phone,
      updated_at = now()
    WHERE id = v_existing.id
    RETURNING id INTO v_contact_id;
  ELSE
    -- INSERT: create minimal contact
    INSERT INTO public.service_contacts (
      user_id, phone, name, origin, status,
      conversation_id, first_contact_at, last_message_at, last_message_content
    ) VALUES (
      p_user_id, v_normalized_phone,
      COALESCE(NULLIF(p_name, ''), v_normalized_phone),
      COALESCE(p_origin, 'WhatsApp'),
      'active',
      p_conversation_id,
      p_message_timestamp,
      p_message_timestamp,
      p_last_message_content
    )
    ON CONFLICT (user_id, phone) DO UPDATE SET
      last_message_at = EXCLUDED.last_message_at,
      last_message_content = EXCLUDED.last_message_content,
      conversation_id = COALESCE(EXCLUDED.conversation_id, service_contacts.conversation_id),
      updated_at = now()
    RETURNING id INTO v_contact_id;
  END IF;

  RETURN v_contact_id;
END;
$$;
