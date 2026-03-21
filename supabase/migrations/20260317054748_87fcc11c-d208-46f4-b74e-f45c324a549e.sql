
CREATE OR REPLACE FUNCTION public.notify_campaign_wa_instant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _config RECORD;
  _device RECORD;
  _target_group TEXT;
  _now_brt TEXT;
  _msg TEXT;
  _pending INT;
  _duration TEXT;
  _status_label TEXT;
  _icon TEXT;
  _base_url TEXT;
  _profile_status TEXT;
BEGIN
  IF NEW.status NOT IN ('completed', 'paused', 'canceled', 'failed') THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Skip if user account is suspended/cancelled (account deletion cleanup)
  SELECT status INTO _profile_status FROM public.profiles WHERE id = NEW.user_id;
  IF _profile_status IN ('suspended', 'cancelled', 'deleted') THEN
    RETURN NEW;
  END IF;

  SELECT device_id, campaigns_group_id, group_id, connection_status, toggle_campaigns
  INTO _config
  FROM public.report_wa_configs
  WHERE user_id = NEW.user_id AND device_id IS NOT NULL
  LIMIT 1;

  IF _config IS NULL OR NOT _config.toggle_campaigns THEN
    RETURN NEW;
  END IF;
  IF _config.connection_status != 'connected' THEN
    RETURN NEW;
  END IF;

  _target_group := COALESCE(NULLIF(TRIM(_config.campaigns_group_id), ''), _config.group_id);
  IF _target_group IS NULL OR _target_group = '' THEN
    RETURN NEW;
  END IF;

  SELECT uazapi_token, uazapi_base_url
  INTO _device
  FROM public.devices
  WHERE id = _config.device_id
  LIMIT 1;

  IF _device IS NULL OR _device.uazapi_token IS NULL OR _device.uazapi_base_url IS NULL THEN
    RETURN NEW;
  END IF;

  _base_url := RTRIM(_device.uazapi_base_url, '/');
  _now_brt := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI');
  _pending := GREATEST(0, COALESCE(NEW.total_contacts, 0) - COALESCE(NEW.sent_count, 0) - COALESCE(NEW.failed_count, 0));

  IF NEW.started_at IS NOT NULL AND NEW.completed_at IS NOT NULL THEN
    _duration := EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at))::INT / 60 || 'min ' || 
                 EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at))::INT % 60 || 's';
  ELSE
    _duration := 'N/A';
  END IF;

  IF NEW.status = 'completed' THEN
    _icon := '📣'; _status_label := 'FINALIZADA';
    _msg := _icon || ' CAMPANHA ' || _status_label || E'\n\nCampanha: ' || NEW.name ||
            E'\n\n📊 Resultado da campanha\n\n👥 Total de contatos: ' || COALESCE(NEW.total_contacts, 0) ||
            E'\n\n✅ Mensagens enviadas: ' || COALESCE(NEW.sent_count, 0) ||
            E'\n📬 Mensagens entregues: ' || COALESCE(NEW.delivered_count, 0) ||
            E'\n\n❌ Falhas registradas: ' || COALESCE(NEW.failed_count, 0) ||
            E'\n⏳ Pendentes: ' || _pending ||
            E'\n\n⏱ Tempo total: ' || _duration ||
            E'\n\nStatus: Concluída ✅';
  ELSIF NEW.status = 'paused' THEN
    _icon := '⏸'; _status_label := 'PAUSADA';
    _msg := _icon || ' CAMPANHA ' || _status_label || E'\n\nCampanha: ' || NEW.name ||
            E'\n\n📊 Progresso:\n✅ Enviadas: ' || COALESCE(NEW.sent_count, 0) || '/' || COALESCE(NEW.total_contacts, 0) ||
            E'\n\n⏱ Horário: ' || _now_brt ||
            E'\n\nA campanha foi pausada.';
  ELSIF NEW.status = 'canceled' THEN
    _icon := '🚫'; _status_label := 'CANCELADA';
    _msg := _icon || ' CAMPANHA ' || _status_label || E'\n\nCampanha: ' || NEW.name ||
            E'\n\n📊 Progresso:\n✅ Enviadas: ' || COALESCE(NEW.sent_count, 0) || '/' || COALESCE(NEW.total_contacts, 0) ||
            E'\n❌ Falhas: ' || COALESCE(NEW.failed_count, 0) ||
            E'\n\n⏱ Horário: ' || _now_brt ||
            E'\n\nA campanha foi cancelada.';
  ELSIF NEW.status = 'failed' THEN
    _icon := '❌'; _status_label := 'ERRO';
    _msg := _icon || ' CAMPANHA ' || _status_label || E'\n\nCampanha: ' || NEW.name ||
            E'\n\n📊 Resultado:\n✅ Enviadas: ' || COALESCE(NEW.sent_count, 0) ||
            E'\n❌ Falhas: ' || COALESCE(NEW.failed_count, 0) ||
            E'\n\n⏱ Horário: ' || _now_brt ||
            E'\n\nA campanha apresentou erro.';
  END IF;

  PERFORM net.http_post(
    url := _base_url || '/send/text',
    headers := jsonb_build_object('token', _device.uazapi_token, 'Content-Type', 'application/json'),
    body := jsonb_build_object('number', _target_group, 'text', _msg)
  );

  INSERT INTO public.report_wa_logs (user_id, level, message)
  VALUES (NEW.user_id, 'INFO', 'Campanha "' || NEW.name || '" ' || LOWER(_status_label) || ' — alerta WhatsApp instantâneo enviado');

  RETURN NEW;
END;
$function$;
