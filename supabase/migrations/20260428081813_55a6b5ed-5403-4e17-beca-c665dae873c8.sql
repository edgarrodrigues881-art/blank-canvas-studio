
-- ============================================================
-- SECURITY HARDENING — Beta cleanup
-- ============================================================

-- 1) device_last_sent: add RLS policies (service_role only — managed by edge functions)
DROP POLICY IF EXISTS "device_last_sent service role only" ON public.device_last_sent;
CREATE POLICY "device_last_sent service role only"
ON public.device_last_sent
FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.devices d WHERE d.id = device_last_sent.device_id AND d.user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.devices d WHERE d.id = device_last_sent.device_id AND d.user_id = auth.uid())
);

-- 2) Recreate views as SECURITY INVOKER (PG 15+)
DROP VIEW IF EXISTS public.devices_safe;
CREATE VIEW public.devices_safe
WITH (security_invoker = true) AS
SELECT id, created_at, instance_type, last_api_call_at, login_type, name, number,
       profile_name, profile_picture, proxy_id, status, uazapi_base_url, updated_at, user_id
FROM public.devices;

DROP VIEW IF EXISTS public.notification_effective_device;
CREATE VIEW public.notification_effective_device
WITH (security_invoker = true) AS
SELECT cfg.user_id,
       COALESCE(cfg.whatsapp_device_id, rwa.device_id) AS device_id,
       cfg.whatsapp_target_jid,
       cfg.whatsapp_target_phone,
       cfg.whatsapp_target_label,
       cfg.notify_whatsapp,
       cfg.enabled
FROM public.ai_alerts_config cfg
LEFT JOIN public.report_wa_configs rwa ON rwa.user_id = cfg.user_id;

-- 3) Revoke EXECUTE from anon on SECURITY DEFINER functions that should not be public
-- (Trigger functions are unaffected by EXECUTE grants.)
REVOKE EXECUTE ON FUNCTION public.check_phone_available(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_device_send_slot(uuid, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_next_mass_inject_contact(uuid, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_next_mass_inject_contact_for_device(uuid, uuid, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_scheduled_messages(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_prospeccao_balance(uuid, integer, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.debit_prospeccao_credits(uuid, integer, text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.distribute_mass_inject_contacts(uuid, uuid[]) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_daily_log_counts(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_profile_safe(public.profiles) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_sidebar_stats(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_unread(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reassign_mass_inject_contacts(uuid, uuid, uuid[]) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_mass_inject_run_lock(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_watchdog_lock() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.try_acquire_mass_inject_run_lock(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.try_acquire_watchdog_lock() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_service_contact(uuid, text, text, text, text, text, text[], jsonb, uuid, text, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.use_free_pull(uuid) FROM anon;

-- 4) Avatars bucket: restrict listing to owner-only (public GET via direct URL still works because bucket is public)
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatars: owners can list their files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- 5) Proxies: restrict SELECT credentials. Create a safe view without password,
--    and a SECURITY DEFINER function (revoked from anon) for the owner to fetch creds when needed.
CREATE OR REPLACE VIEW public.proxies_safe
WITH (security_invoker = true) AS
SELECT id, user_id, display_id, type, host, port, username, status, active, created_at, updated_at
FROM public.proxies;

GRANT SELECT ON public.proxies_safe TO authenticated;

CREATE OR REPLACE FUNCTION public.get_proxy_password(_proxy_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT password FROM public.proxies
  WHERE id = _proxy_id AND user_id = auth.uid()
$$;

REVOKE EXECUTE ON FUNCTION public.get_proxy_password(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_proxy_password(uuid) TO authenticated;
