
-- ================================================================
-- 1) MIGRATE HUGO's DATA from old profile to new auth user
-- Old profile: 004c43c0-328b-4b6f-a228-ea65f211060e
-- New auth user: b18843da-77ff-415a-b30f-228181245ec1
-- ================================================================

UPDATE public.devices SET user_id = 'b18843da-77ff-415a-b30f-228181245ec1'
WHERE user_id = '004c43c0-328b-4b6f-a228-ea65f211060e';

UPDATE public.warmup_autosave_contacts SET user_id = 'b18843da-77ff-415a-b30f-228181245ec1'
WHERE user_id = '004c43c0-328b-4b6f-a228-ea65f211060e';

UPDATE public.proxies SET user_id = 'b18843da-77ff-415a-b30f-228181245ec1'
WHERE user_id = '004c43c0-328b-4b6f-a228-ea65f211060e';

UPDATE public.warmup_cycles SET user_id = 'b18843da-77ff-415a-b30f-228181245ec1'
WHERE user_id = '004c43c0-328b-4b6f-a228-ea65f211060e';

UPDATE public.warmup_community_membership SET user_id = 'b18843da-77ff-415a-b30f-228181245ec1'
WHERE user_id = '004c43c0-328b-4b6f-a228-ea65f211060e';

UPDATE public.warmup_jobs SET user_id = 'b18843da-77ff-415a-b30f-228181245ec1'
WHERE user_id = '004c43c0-328b-4b6f-a228-ea65f211060e';

UPDATE public.warmup_audit_logs SET user_id = 'b18843da-77ff-415a-b30f-228181245ec1'
WHERE user_id = '004c43c0-328b-4b6f-a228-ea65f211060e';

UPDATE public.warmup_folders SET user_id = 'b18843da-77ff-415a-b30f-228181245ec1'
WHERE user_id = '004c43c0-328b-4b6f-a228-ea65f211060e';

UPDATE public.warmup_folder_devices SET user_id = 'b18843da-77ff-415a-b30f-228181245ec1'
WHERE user_id = '004c43c0-328b-4b6f-a228-ea65f211060e';

UPDATE public.user_api_tokens SET user_id = 'b18843da-77ff-415a-b30f-228181245ec1'
WHERE user_id = '004c43c0-328b-4b6f-a228-ea65f211060e';

UPDATE public.alerts SET user_id = 'b18843da-77ff-415a-b30f-228181245ec1'
WHERE user_id = '004c43c0-328b-4b6f-a228-ea65f211060e';

UPDATE public.notifications SET user_id = 'b18843da-77ff-415a-b30f-228181245ec1'
WHERE user_id = '004c43c0-328b-4b6f-a228-ea65f211060e';

UPDATE public.campaigns SET user_id = 'b18843da-77ff-415a-b30f-228181245ec1'
WHERE user_id = '004c43c0-328b-4b6f-a228-ea65f211060e';

UPDATE public.contacts SET user_id = 'b18843da-77ff-415a-b30f-228181245ec1'
WHERE user_id = '004c43c0-328b-4b6f-a228-ea65f211060e';

UPDATE public.templates SET user_id = 'b18843da-77ff-415a-b30f-228181245ec1'
WHERE user_id = '004c43c0-328b-4b6f-a228-ea65f211060e';

UPDATE public.delay_profiles SET user_id = 'b18843da-77ff-415a-b30f-228181245ec1'
WHERE user_id = '004c43c0-328b-4b6f-a228-ea65f211060e';

UPDATE public.report_wa_configs SET user_id = 'b18843da-77ff-415a-b30f-228181245ec1'
WHERE user_id = '004c43c0-328b-4b6f-a228-ea65f211060e';

UPDATE public.subscription_cycles SET user_id = 'b18843da-77ff-415a-b30f-228181245ec1'
WHERE user_id = '004c43c0-328b-4b6f-a228-ea65f211060e';

UPDATE public.operation_logs SET user_id = 'b18843da-77ff-415a-b30f-228181245ec1'
WHERE user_id = '004c43c0-328b-4b6f-a228-ea65f211060e';

DELETE FROM public.profiles WHERE id = '004c43c0-328b-4b6f-a228-ea65f211060e';

-- ================================================================
-- 2) FIX CASCADE DELETES - Change to SET NULL
-- ================================================================

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_device_id_fkey;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_device_id_fkey 
  FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE SET NULL;

ALTER TABLE public.campaign_contacts DROP CONSTRAINT IF EXISTS campaign_contacts_device_id_fkey;
ALTER TABLE public.campaign_contacts ADD CONSTRAINT campaign_contacts_device_id_fkey 
  FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE SET NULL;

ALTER TABLE public.group_interactions DROP CONSTRAINT IF EXISTS group_interactions_device_id_fkey;
ALTER TABLE public.group_interactions ADD CONSTRAINT group_interactions_device_id_fkey 
  FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE SET NULL;

ALTER TABLE public.autoreply_flows DROP CONSTRAINT IF EXISTS autoreply_flows_device_id_fkey;
ALTER TABLE public.autoreply_flows ADD CONSTRAINT autoreply_flows_device_id_fkey 
  FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE SET NULL;

ALTER TABLE public.report_wa_configs DROP CONSTRAINT IF EXISTS report_wa_configs_device_id_fkey;
ALTER TABLE public.report_wa_configs ADD CONSTRAINT report_wa_configs_device_id_fkey 
  FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE SET NULL;

-- ================================================================
-- 3) FIX phone matching trigger (country code 55 prefix mismatch)
-- ================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _phone text;
  _full_name text;
  _company text;
  _existing_profile_id uuid;
  _old_full_name text;
  _normalized_phone text;
  _normalized_phone_no55 text;
BEGIN
  _phone := COALESCE(NEW.raw_user_meta_data->>'phone', '');
  _full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  _company := COALESCE(NEW.raw_user_meta_data->>'company', '');

  _normalized_phone := regexp_replace(_phone, '[^0-9]', '', 'g');
  
  -- Version without leading 55 (Brazil country code)
  _normalized_phone_no55 := CASE 
    WHEN _normalized_phone LIKE '55%' AND length(_normalized_phone) >= 12 
    THEN substring(_normalized_phone from 3)
    ELSE _normalized_phone
  END;

  IF _normalized_phone <> '' THEN
    SELECT id, full_name INTO _existing_profile_id, _old_full_name
    FROM public.profiles
    WHERE id NOT IN (SELECT au.id FROM auth.users au)
      AND (
        regexp_replace(phone, '[^0-9]', '', 'g') = _normalized_phone
        OR regexp_replace(phone, '[^0-9]', '', 'g') = _normalized_phone_no55
        OR '55' || regexp_replace(phone, '[^0-9]', '', 'g') = _normalized_phone
      )
    LIMIT 1;
  END IF;

  IF _existing_profile_id IS NOT NULL THEN
    UPDATE public.devices SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.subscriptions SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.subscription_cycles SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.campaigns SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.contacts SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.templates SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.proxies SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.delay_profiles SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.user_api_tokens SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.warmup_autosave_contacts SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.notifications SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.alerts SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.operation_logs SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.warmup_cycles SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.warmup_community_membership SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.community_warmup_configs SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.warmup_audit_logs SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.warmup_jobs SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.warmup_folders SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.warmup_folder_devices SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    UPDATE public.report_wa_configs SET user_id = NEW.id WHERE user_id = _existing_profile_id;
    DELETE FROM public.profiles WHERE id = _existing_profile_id;
    INSERT INTO public.profiles (id, full_name, phone, company, client_type, status, created_at, updated_at)
    VALUES (NEW.id, COALESCE(NULLIF(_full_name, ''), _old_full_name), _phone, _company, 'normal', 'active', now(), now());
  ELSE
    INSERT INTO public.profiles (id, full_name, phone, company, client_type, status, created_at, updated_at)
    VALUES (NEW.id, _full_name, _phone, _company, 'normal', 'active', now(), now())
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
