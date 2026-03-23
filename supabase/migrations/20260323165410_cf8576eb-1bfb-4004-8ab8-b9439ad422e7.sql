-- Add deduplication to handle_new_user trigger to prevent plan doubling
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

    -- DEDUPLICATION: Remove duplicate subscriptions after migration
    -- Keep only the subscription with the highest max_instances per plan_name
    DELETE FROM public.subscriptions s1
    WHERE s1.user_id = NEW.id
      AND EXISTS (
        SELECT 1 FROM public.subscriptions s2
        WHERE s2.user_id = NEW.id
          AND s2.plan_name = s1.plan_name
          AND (s2.max_instances > s1.max_instances OR (s2.max_instances = s1.max_instances AND s2.created_at > s1.created_at))
      );

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
