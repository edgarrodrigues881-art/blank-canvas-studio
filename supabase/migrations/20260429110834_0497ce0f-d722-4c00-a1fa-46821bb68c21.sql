-- RPC: claim_next_autosave_schedule_contact
-- Seleciona o próximo contato para um Auto Save Schedule do usuário.
-- Estratégia: novos primeiro (last_used_at IS NULL, FIFO por created_at).
-- Quando esgotar, recicla do mais antigo (last_used_at ASC) — sem limite de reuso.
-- Já marca o contato como "claimed" (atualiza last_used_at e use_count) para evitar
-- que o mesmo número seja escolhido em paralelo por outro device do mesmo schedule.

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
  -- 1) Tenta um contato NUNCA enviado (last_used_at IS NULL), mais antigo cadastrado primeiro.
  SELECT c.id, c.phone_e164, c.contact_name, c.use_count, c.last_used_at
    INTO v_contact
  FROM public.warmup_autosave_contacts c
  WHERE c.user_id = p_user_id
    AND c.is_active = true
    AND c.contact_status NOT IN ('discarded', 'invalid')
    AND c.last_used_at IS NULL
    AND (p_exclude_phones IS NULL OR NOT (c.phone_e164 = ANY(p_exclude_phones)))
  ORDER BY c.created_at ASC, c.id ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- 2) Se não houver "novo", recicla o mais antigo já enviado (FIFO por last_used_at).
  IF NOT FOUND THEN
    v_recycled := true;
    SELECT c.id, c.phone_e164, c.contact_name, c.use_count, c.last_used_at
      INTO v_contact
    FROM public.warmup_autosave_contacts c
    WHERE c.user_id = p_user_id
      AND c.is_active = true
      AND c.contact_status NOT IN ('discarded', 'invalid')
      AND c.last_used_at IS NOT NULL
      AND (p_exclude_phones IS NULL OR NOT (c.phone_e164 = ANY(p_exclude_phones)))
    ORDER BY c.last_used_at ASC NULLS FIRST, c.use_count ASC, c.id ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  END IF;

  -- 3) Se ainda não encontrou (lista vazia), retorna nada.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- 4) Marca como usado AGORA (claim atômico) — evita corrida entre devices.
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

-- Permite que o worker (service_role) e usuários autenticados chamem
GRANT EXECUTE ON FUNCTION public.claim_next_autosave_schedule_contact(uuid, text[]) TO authenticated, service_role;

-- Índice para acelerar a busca por "novos primeiro"
CREATE INDEX IF NOT EXISTS idx_warmup_autosave_contacts_user_lastused
  ON public.warmup_autosave_contacts (user_id, last_used_at NULLS FIRST, created_at);