
-- Drop restrictive policies on devices
DROP POLICY IF EXISTS "Users can delete their own devices" ON public.devices;
DROP POLICY IF EXISTS "Users can insert their own devices" ON public.devices;
DROP POLICY IF EXISTS "Users can update their own devices" ON public.devices;
DROP POLICY IF EXISTS "Users can view their own devices" ON public.devices;

-- Recreate as PERMISSIVE policies
CREATE POLICY "Users can view their own devices"
  ON public.devices FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own devices"
  ON public.devices FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own devices"
  ON public.devices FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own devices"
  ON public.devices FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Fix same issue on all other tables

-- contacts
DROP POLICY IF EXISTS "Users can delete their own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can insert their own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can update their own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can view their own contacts" ON public.contacts;

CREATE POLICY "Users can view their own contacts"
  ON public.contacts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own contacts"
  ON public.contacts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own contacts"
  ON public.contacts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own contacts"
  ON public.contacts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- templates
DROP POLICY IF EXISTS "Users can delete their own templates" ON public.templates;
DROP POLICY IF EXISTS "Users can insert their own templates" ON public.templates;
DROP POLICY IF EXISTS "Users can update their own templates" ON public.templates;
DROP POLICY IF EXISTS "Users can view their own templates" ON public.templates;

CREATE POLICY "Users can view their own templates"
  ON public.templates FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own templates"
  ON public.templates FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own templates"
  ON public.templates FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own templates"
  ON public.templates FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- campaigns
DROP POLICY IF EXISTS "Users can delete their own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can insert their own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can update their own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can view their own campaigns" ON public.campaigns;

CREATE POLICY "Users can view their own campaigns"
  ON public.campaigns FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own campaigns"
  ON public.campaigns FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own campaigns"
  ON public.campaigns FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own campaigns"
  ON public.campaigns FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- campaign_contacts
DROP POLICY IF EXISTS "Users can delete their campaign contacts" ON public.campaign_contacts;
DROP POLICY IF EXISTS "Users can insert their campaign contacts" ON public.campaign_contacts;
DROP POLICY IF EXISTS "Users can update their campaign contacts" ON public.campaign_contacts;
DROP POLICY IF EXISTS "Users can view their campaign contacts" ON public.campaign_contacts;

CREATE POLICY "Users can view their campaign contacts"
  ON public.campaign_contacts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM campaigns WHERE campaigns.id = campaign_contacts.campaign_id AND campaigns.user_id = auth.uid()));
CREATE POLICY "Users can insert their campaign contacts"
  ON public.campaign_contacts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM campaigns WHERE campaigns.id = campaign_contacts.campaign_id AND campaigns.user_id = auth.uid()));
CREATE POLICY "Users can update their campaign contacts"
  ON public.campaign_contacts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM campaigns WHERE campaigns.id = campaign_contacts.campaign_id AND campaigns.user_id = auth.uid()));
CREATE POLICY "Users can delete their campaign contacts"
  ON public.campaign_contacts FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM campaigns WHERE campaigns.id = campaign_contacts.campaign_id AND campaigns.user_id = auth.uid()));

-- proxies
DROP POLICY IF EXISTS "Users can create their own proxies" ON public.proxies;
DROP POLICY IF EXISTS "Users can delete their own proxies" ON public.proxies;
DROP POLICY IF EXISTS "Users can update their own proxies" ON public.proxies;
DROP POLICY IF EXISTS "Users can view their own proxies" ON public.proxies;

CREATE POLICY "Users can view their own proxies"
  ON public.proxies FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own proxies"
  ON public.proxies FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own proxies"
  ON public.proxies FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own proxies"
  ON public.proxies FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- profiles
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());
