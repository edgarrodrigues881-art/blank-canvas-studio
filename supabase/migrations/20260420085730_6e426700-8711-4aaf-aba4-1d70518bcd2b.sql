
-- Per-instance isolated queues with round-robin assignment.
-- Each contact gets pinned to ONE device after first claim; if assignment is null,
-- the calling worker pins it to itself. This ensures: each instance has its own
-- queue, no cross-instance contention, and round-robin distribution at insert time.

ALTER TABLE public.mass_inject_contacts
  ADD COLUMN IF NOT EXISTS assigned_device_id uuid;

CREATE INDEX IF NOT EXISTS idx_mass_inject_contacts_assigned
  ON public.mass_inject_contacts (campaign_id, assigned_device_id, status);

-- Pre-distribute pending contacts of a campaign across the device pool (round-robin).
-- Safe to call repeatedly: only assigns rows where assigned_device_id is null.
CREATE OR REPLACE FUNCTION public.distribute_mass_inject_contacts(
  p_campaign_id uuid,
  p_device_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_count integer := 0;
  v_n integer;
begin
  if p_device_ids is null or array_length(p_device_ids, 1) is null then
    return 0;
  end if;
  v_n := array_length(p_device_ids, 1);

  with to_assign as (
    select id, row_number() over (order by created_at asc, id asc) - 1 as rn
    from public.mass_inject_contacts
    where campaign_id = p_campaign_id
      and assigned_device_id is null
  )
  update public.mass_inject_contacts mic
  set assigned_device_id = p_device_ids[(ta.rn % v_n) + 1]
  from to_assign ta
  where mic.id = ta.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  return v_count;
end;
$$;

-- Per-device claim: only returns contacts assigned to the calling device,
-- OR unassigned contacts (which it then pins to itself for round-robin fallback).
CREATE OR REPLACE FUNCTION public.claim_next_mass_inject_contact_for_device(
  p_campaign_id uuid,
  p_device_id uuid,
  p_device_used text DEFAULT NULL,
  p_processing_message text DEFAULT 'Processando...'
)
RETURNS public.mass_inject_contacts
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
      device_used = coalesce(p_device_used, mic.device_used),
      assigned_device_id = p_device_id,
      attempt_count = coalesce(mic.attempt_count, 0) + 1
  where mic.id = (
    select id
    from public.mass_inject_contacts
    where campaign_id = p_campaign_id
      and coalesce(attempt_count, 0) < 3
      and (next_retry_at is null or next_retry_at <= now())
      and (assigned_device_id = p_device_id or assigned_device_id is null)
      and status = any (array[
        'pending','retrying','rate_limited','api_temporary',
        'connection_unconfirmed','session_dropped',
        'permission_unconfirmed','unknown_failure','timeout'
      ])
    order by
      -- Prefer my own queue first; fall back to unassigned
      case when assigned_device_id = p_device_id then 0 else 1 end,
      created_at asc
    limit 1
    for update skip locked
  )
  returning * into v_contact;

  return v_contact;
end;
$$;

-- Reassign contacts pinned to a failed/dead device back to the active pool.
-- Workers call this when they detect a sibling device is dead.
CREATE OR REPLACE FUNCTION public.reassign_mass_inject_contacts(
  p_campaign_id uuid,
  p_dead_device_id uuid,
  p_alive_device_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_count integer := 0;
  v_n integer;
begin
  if p_alive_device_ids is null or array_length(p_alive_device_ids, 1) is null then
    -- no one alive: just unassign so future workers can pick up
    update public.mass_inject_contacts
    set assigned_device_id = null
    where campaign_id = p_campaign_id
      and assigned_device_id = p_dead_device_id
      and status = any (array[
        'pending','retrying','rate_limited','api_temporary',
        'connection_unconfirmed','session_dropped',
        'permission_unconfirmed','unknown_failure','timeout'
      ]);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    return v_count;
  end if;

  v_n := array_length(p_alive_device_ids, 1);

  with to_reassign as (
    select id, row_number() over (order by created_at asc, id asc) - 1 as rn
    from public.mass_inject_contacts
    where campaign_id = p_campaign_id
      and assigned_device_id = p_dead_device_id
      and status = any (array[
        'pending','retrying','rate_limited','api_temporary',
        'connection_unconfirmed','session_dropped',
        'permission_unconfirmed','unknown_failure','timeout'
      ])
  )
  update public.mass_inject_contacts mic
  set assigned_device_id = p_alive_device_ids[(tr.rn % v_n) + 1]
  from to_reassign tr
  where mic.id = tr.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  return v_count;
end;
$$;
