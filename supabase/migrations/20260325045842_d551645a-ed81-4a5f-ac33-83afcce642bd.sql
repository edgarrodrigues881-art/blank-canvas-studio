create or replace function public.mass_inject_lock_key(p_campaign_id uuid)
returns bigint
language sql
immutable
set search_path = public
as $$
  select ('x' || substr(md5('mass_inject:' || p_campaign_id::text), 1, 16))::bit(64)::bigint;
$$;

create or replace function public.try_acquire_mass_inject_run_lock(p_campaign_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select pg_try_advisory_lock(public.mass_inject_lock_key(p_campaign_id));
$$;

create or replace function public.release_mass_inject_run_lock(p_campaign_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select pg_advisory_unlock(public.mass_inject_lock_key(p_campaign_id));
$$;

create or replace function public.claim_next_mass_inject_contact(
  p_campaign_id uuid,
  p_device_used text default null,
  p_processing_message text default 'Processando...'
)
returns public.mass_inject_contacts
language plpgsql
security definer
set search_path = public
as $$
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
      and status = any (array['pending','rate_limited','api_temporary','connection_unconfirmed','permission_unconfirmed','unknown_failure'])
    order by created_at asc
    limit 1
    for update skip locked
  )
  returning * into v_contact;

  return v_contact;
end;
$$;