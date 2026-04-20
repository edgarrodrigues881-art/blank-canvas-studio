-- Smart retry system: bump max retries per contact to 3 and add backoff tracking
-- Update claim function so the same contact can be re-claimed up to 3 times.
CREATE OR REPLACE FUNCTION public.claim_next_mass_inject_contact(
  p_campaign_id uuid,
  p_device_used text DEFAULT NULL::text,
  p_processing_message text DEFAULT 'Processando...'::text
)
RETURNS public.mass_inject_contacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_contact public.mass_inject_contacts;
begin
  update public.mass_inject_contacts as mic
  set status = 'processing',
      error_message = p_processing_message,
      device_used = coalesce(p_device_used, mic.device_used),
      attempt_count = coalesce(mic.attempt_count, 0) + 1
  where mic.id = (
    select id
    from public.mass_inject_contacts
    where campaign_id = p_campaign_id
      and coalesce(attempt_count, 0) < 3
      -- Only claim contacts whose backoff window has elapsed (if set)
      and (next_retry_at is null or next_retry_at <= now())
      and status = any (array[
        'pending','retrying','rate_limited','api_temporary',
        'connection_unconfirmed','session_dropped',
        'permission_unconfirmed','unknown_failure','timeout'
      ])
    order by created_at asc
    limit 1
    for update skip locked
  )
  returning * into v_contact;

  return v_contact;
end;
$function$;

-- Add backoff timestamp column (idempotent)
ALTER TABLE public.mass_inject_contacts
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_mass_inject_contacts_next_retry_at
  ON public.mass_inject_contacts (campaign_id, next_retry_at)
  WHERE next_retry_at IS NOT NULL;