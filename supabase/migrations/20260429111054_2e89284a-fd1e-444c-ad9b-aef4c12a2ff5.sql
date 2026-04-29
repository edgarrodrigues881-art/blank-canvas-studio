-- Simplificação: qualquer contato disponível serve.
-- Prioriza nunca-usados (pra não desperdiçar), mas sem ordenação rígida.
-- Se falhar, worker chama mark_autosave_contact_invalid e tenta o próximo.

CREATE OR REPLACE FUNCTION public.claim_next_autosave_schedule_contact(
  p_user_id uuid,
  p_exclude_phones text[] DEFAULT ARRAY[]::text[]
)
RETURNS TABLE (
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
  -- 1) Tenta um contato AINDA NÃO USADO (qualquer ordem, escolhe aleatório).
  SELECT c.id, c.phone_e164, c.contact_name, c.use_count
    INTO v_contact
  FROM public.warmup_autosave_contacts c
  WHERE c.user_id = p_user_id
    AND c.is_active = true
    AND c.contact_status NOT IN ('discarded', 'invalid')
    AND c.last_used_at IS NULL
    AND (p_exclude_phones IS NULL OR NOT (c.phone_e164 = ANY(p_exclude_phones)))
  ORDER BY random()
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- 2) Se não houver "novo", pega QUALQUER contato ativo (também aleatório).
  IF NOT FOUND THEN
    v_recycled := true;
    SELECT c.id, c.phone_e164, c.contact_name, c.use_count
      INTO v_contact
    FROM public.warmup_autosave_contacts c
    WHERE c.user_id = p_user_id
      AND c.is_active = true
      AND c.contact_status NOT IN ('discarded', 'invalid')
      AND (p_exclude_phones IS NULL OR NOT (c.phone_e164 = ANY(p_exclude_phones)))
    ORDER BY random()
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  END IF;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Marca como usado atomicamente
  UPDATE public.warmup_autosave_contacts
     SET last_used_at = now(),
         use_count = COALESCE(use_count, 0) + 1,
         contact_status = CASE WHEN v_recycled THEN 'recycled' ELSE 'used' END,
         updated_at = now()
   WHERE warmup_autosave_contacts.id = v_contact.id;

  RETURN QUERY SELECT
    v_contact.id,
    v_contact.phone_e164,
    v_contact.contact_name,
    COALESCE(v_contact.use_count, 0) + 1,
    v_recycled;
END;
$$;

-- RPC: marca contato como inválido quando o envio falha (sem WhatsApp, número errado, etc)
-- Worker chama isso e logo em seguida claim_next_autosave_schedule_contact pra pegar o próximo.
CREATE OR REPLACE FUNCTION public.mark_autosave_contact_invalid(
  p_contact_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.warmup_autosave_contacts
     SET contact_status = 'invalid',
         is_active = false,
         updated_at = now()
   WHERE id = p_contact_id;
$$;

GRANT EXECUTE ON FUNCTION public.claim_next_autosave_schedule_contact(uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_autosave_contact_invalid(uuid, text) TO authenticated, service_role;