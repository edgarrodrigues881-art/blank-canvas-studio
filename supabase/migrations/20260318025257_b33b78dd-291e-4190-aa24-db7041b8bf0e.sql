
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _group_id TEXT;
  _device_id TEXT;
  _device RECORD;
  _base_url TEXT;
  _msg TEXT;
  _full_name TEXT;
  _email TEXT;
  _phone TEXT;
  _company TEXT;
  _now_brt TEXT;
BEGIN
  _full_name := NEW.raw_user_meta_data ->> 'full_name';
  _email := NEW.email;
  _phone := NEW.raw_user_meta_data ->> 'phone';
  _company := NEW.raw_user_meta_data ->> 'company';

  INSERT INTO public.profiles (id, full_name, phone, company)
  VALUES (NEW.id, _full_name, _phone, _company);

  INSERT INTO public.subscriptions (user_id, plan_name, plan_price, max_instances, started_at, expires_at)
  VALUES (NEW.id, 'Trial', 0, 3, now(), now() + interval '3 days');

  INSERT INTO public.subscription_cycles (user_id, plan_name, cycle_amount, cycle_start, cycle_end, status)
  VALUES (NEW.id, 'Trial', 0, now(), now() + interval '3 days', 'paid');

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.admin_logs (admin_id, target_user_id, action, details)
  VALUES (NEW.id, NEW.id, 'auto-trial', 'Trial automático criado: 3 instâncias por 3 dias');

  BEGIN
    SELECT value INTO _group_id FROM public.community_settings WHERE key = 'wa_report_group_id' LIMIT 1;
    SELECT value INTO _device_id FROM public.community_settings WHERE key = 'wa_report_device_id' LIMIT 1;
    
    IF _group_id IS NOT NULL AND _device_id IS NOT NULL THEN
      SELECT uazapi_token, uazapi_base_url INTO _device
      FROM public.devices WHERE id = _device_id::uuid LIMIT 1;
      
      IF _device.uazapi_token IS NOT NULL AND _device.uazapi_base_url IS NOT NULL THEN
        _base_url := RTRIM(_device.uazapi_base_url, '/');
        _now_brt := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
        
        _msg := '🆕 NOVO CADASTRO' || E'\n\n'
          || '👤 Nome: ' || COALESCE(_full_name, 'N/A') || E'\n'
          || '📧 Email: ' || COALESCE(_email, 'N/A') || E'\n'
          || '📱 Telefone: ' || COALESCE(_phone, 'N/A') || E'\n'
          || '🏢 Empresa: ' || COALESCE(_company, 'N/A') || E'\n\n'
          || '📋 Plano: Trial (3 dias)' || E'\n'
          || '⏱ Data: ' || _now_brt;
        
        PERFORM net.http_post(
          url := _base_url || '/send/text',
          headers := jsonb_build_object('token', _device.uazapi_token, 'Content-Type', 'application/json'),
          body := jsonb_build_object('number', _group_id, 'text', _msg)
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$function$;
