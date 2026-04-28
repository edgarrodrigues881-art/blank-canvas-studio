
-- Revoke EXECUTE from PUBLIC role (default grant) on all internal SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.check_phone_available(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_device_send_slot(uuid, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_next_mass_inject_contact(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_next_mass_inject_contact_for_device(uuid, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_scheduled_messages(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.credit_prospeccao_balance(uuid, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.debit_prospeccao_credits(uuid, integer, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.distribute_mass_inject_contacts(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_daily_log_counts(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_profile_safe(public.profiles) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_proxy_password(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_sidebar_stats(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_unread(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reassign_mass_inject_contacts(uuid, uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_mass_inject_run_lock(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_watchdog_lock() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.try_acquire_mass_inject_run_lock(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.try_acquire_watchdog_lock() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_service_contact(uuid, text, text, text, text, text, text[], jsonb, uuid, text, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.use_free_pull(uuid) FROM PUBLIC;

-- Re-grant only to authenticated where needed (frontend usage)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sidebar_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_log_counts(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_proxy_password(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.use_free_pull(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_service_contact(uuid, text, text, text, text, text, text[], jsonb, uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_unread(uuid) TO authenticated;

-- Media bucket: restrict broad SELECT to owner-only (public URLs continue working since bucket is public)
DROP POLICY IF EXISTS "Public read media" ON storage.objects;
CREATE POLICY "Media: owners can list their files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);
