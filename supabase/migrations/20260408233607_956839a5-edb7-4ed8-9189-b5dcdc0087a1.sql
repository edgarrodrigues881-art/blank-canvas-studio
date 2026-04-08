-- Add lead_score column
ALTER TABLE public.service_contacts
  ADD COLUMN IF NOT EXISTS lead_score integer DEFAULT 0;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_service_contacts_phone ON public.service_contacts (phone);
CREATE INDEX IF NOT EXISTS idx_service_contacts_last_message ON public.service_contacts (last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_service_contacts_tags ON public.service_contacts USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_service_contacts_lead_score ON public.service_contacts (lead_score DESC);

-- Atomic upsert function for lead capture
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
  v_merged_tags text[];
  v_new_score integer;
BEGIN
  -- Normalize phone: digits only, ensure +55 prefix for BR numbers
  v_normalized_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  
  -- If starts with 55 and has 12-13 digits, it's already BR format
  -- If 10-11 digits without country code, prepend 55
  IF length(v_normalized_phone) BETWEEN 10 AND 11 THEN
    v_normalized_phone := '55' || v_normalized_phone;
  END IF;

  -- Try to find existing contact with phone variants
  SELECT * INTO v_existing
  FROM public.service_contacts
  WHERE user_id = p_user_id
    AND (
      phone = v_normalized_phone
      OR phone = regexp_replace(p_phone, '[^0-9]', '', 'g')
      -- BR 9th digit variants
      OR (length(v_normalized_phone) = 13 AND phone = substring(v_normalized_phone, 1, 4) || substring(v_normalized_phone, 6))
      OR (length(v_normalized_phone) = 12 AND phone = substring(v_normalized_phone, 1, 4) || '9' || substring(v_normalized_phone, 5))
    )
  LIMIT 1
  FOR UPDATE;

  -- Calculate lead_score from tag_scores
  v_new_score := 0;
  IF p_tag_scores IS NOT NULL AND p_tag_scores != '{}'::jsonb THEN
    SELECT COALESCE(sum((value)::integer), 0) INTO v_new_score
    FROM jsonb_each_text(p_tag_scores);
  END IF;

  IF v_existing IS NOT NULL THEN
    -- Merge tags
    v_merged_tags := v_existing.tags;
    IF p_tags IS NOT NULL AND array_length(p_tags, 1) > 0 THEN
      SELECT array_agg(DISTINCT t) INTO v_merged_tags
      FROM unnest(COALESCE(v_existing.tags, ARRAY[]::text[]) || p_tags) AS t;
    END IF;

    UPDATE public.service_contacts SET
      name = CASE
        WHEN p_name IS NOT NULL AND p_name != '' AND p_name != p_phone
             AND (v_existing.name IS NULL OR v_existing.name = '' OR v_existing.name = v_existing.phone)
        THEN p_name ELSE v_existing.name END,
      email = CASE
        WHEN p_email IS NOT NULL AND p_email != '' AND v_existing.email IS NULL
        THEN p_email ELSE v_existing.email END,
      company = CASE
        WHEN p_company IS NOT NULL AND p_company != '' AND v_existing.company IS NULL
        THEN p_company ELSE v_existing.company END,
      tags = v_merged_tags,
      lead_score = GREATEST(COALESCE(v_existing.lead_score, 0), v_new_score),
      conversation_id = COALESCE(p_conversation_id, v_existing.conversation_id),
      last_message_at = p_message_timestamp,
      last_message_content = COALESCE(p_last_message_content, v_existing.last_message_content),
      phone = v_normalized_phone,
      updated_at = now()
    WHERE id = v_existing.id
    RETURNING id INTO v_contact_id;
  ELSE
    INSERT INTO public.service_contacts (
      user_id, phone, name, email, company, origin, tags, lead_score,
      status, conversation_id, first_contact_at, last_message_at, last_message_content
    ) VALUES (
      p_user_id, v_normalized_phone,
      COALESCE(NULLIF(p_name, ''), v_normalized_phone),
      NULLIF(p_email, ''),
      NULLIF(p_company, ''),
      COALESCE(p_origin, 'WhatsApp'),
      COALESCE(p_tags, ARRAY['novo contato']::text[]),
      v_new_score,
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