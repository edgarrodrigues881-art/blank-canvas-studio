ALTER TABLE public.mass_inject_contacts
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

GRANT EXECUTE ON FUNCTION public.claim_next_mass_inject_contact_for_device(UUID, UUID, TEXT, TEXT) TO anon, authenticated, service_role;