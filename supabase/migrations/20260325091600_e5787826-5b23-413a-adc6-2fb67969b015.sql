CREATE OR REPLACE FUNCTION public.claim_next_mass_inject_contact(p_campaign_id uuid, p_device_used text DEFAULT NULL::text, p_processing_message text DEFAULT 'Processando...'::text)
 RETURNS mass_inject_contacts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  v_contact public.mass_inject_contacts;
begin
  update public.mass_inject_contacts as mic
  set status = 'processing',
      error_message = p_processing_message,
      device_used = coalesce(p_device_used, mic.device_used)
  where mic.id = (
    select id
    from public.mass_inject_contacts
    where campaign_id = p_campaign_id
      and status = any (array['pending','rate_limited','api_temporary','connection_unconfirmed','session_dropped','permission_unconfirmed','unknown_failure','timeout'])
    order by created_at asc
    limit 1
    for update skip locked
  )
  returning * into v_contact;

  return v_contact;
end;
$$;