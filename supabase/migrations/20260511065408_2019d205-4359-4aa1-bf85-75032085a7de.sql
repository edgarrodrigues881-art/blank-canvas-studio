
DROP POLICY IF EXISTS "Admins manage dispatch contacts" ON public.admin_dispatch_contacts;
DROP POLICY IF EXISTS "admin_dispatch_contacts_admin_all" ON public.admin_dispatch_contacts;
CREATE POLICY "admin_dispatch_contacts_owner_only"
ON public.admin_dispatch_contacts
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.admin_dispatches d
    WHERE d.id = admin_dispatch_contacts.dispatch_id
      AND d.admin_id = auth.uid()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.admin_dispatches d
    WHERE d.id = admin_dispatch_contacts.dispatch_id
      AND d.admin_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Anyone reads groups pool" ON public.warmup_groups_pool;
CREATE POLICY "warmup_groups_pool_admin_read"
ON public.warmup_groups_pool
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Anyone reads community settings" ON public.community_settings;
DROP POLICY IF EXISTS "community_settings_select_all" ON public.community_settings;
CREATE POLICY "community_settings_admin_read"
ON public.community_settings
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can receive their topics" ON realtime.messages;
DROP POLICY IF EXISTS "users_realtime_topic_access" ON realtime.messages;
CREATE POLICY "users_realtime_topic_strict"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = ('user:' || auth.uid()::text)
  OR realtime.topic() LIKE ('user:' || auth.uid()::text || ':%')
);

REVOKE SELECT (referred_email) ON public.affiliate_referrals FROM authenticated;
