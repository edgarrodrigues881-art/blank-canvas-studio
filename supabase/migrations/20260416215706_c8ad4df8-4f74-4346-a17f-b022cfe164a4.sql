
DO $$
DECLARE
  v_user uuid := 'f5220141-3b20-4e85-90fd-8c85695686fa';
  v_verify_job uuid := '9a1f8775-c29a-45fe-9c66-edaa775e66af';
  v_camp record;
  v_safe_device uuid;
BEGIN
  FOR v_camp IN
    WITH starts AS (
      SELECT DISTINCT ON ((meta->>'campaign_id')::uuid)
        (meta->>'campaign_id')::uuid AS campaign_id,
        regexp_replace(details, '^Campanha "(.*)" iniciada$', '\1') AS name,
        (meta->>'total_contacts')::int AS total_contacts,
        device_id, created_at AS started_at
      FROM operation_logs
      WHERE user_id = v_user
        AND event = 'campaign_started'
        AND created_at > now() - interval '14 days'
      ORDER BY (meta->>'campaign_id')::uuid, created_at ASC
    )
    SELECT * FROM starts WHERE total_contacts >= 100
  LOOP
    -- Verifica se device ainda existe
    SELECT id INTO v_safe_device FROM public.devices WHERE id = v_camp.device_id;

    INSERT INTO public.campaigns (
      id, user_id, name, message_type, message_content,
      total_contacts, sent_count, status, device_id,
      started_at, completed_at, created_at, updated_at
    )
    VALUES (
      v_camp.campaign_id, v_user,
      v_camp.name || ' (recuperada)',
      'text',
      '[Campanha restaurada via logs do sistema. Conteúdo original perdido — duplique e ajuste a mensagem antes de redisparar.]',
      v_camp.total_contacts,
      (SELECT COUNT(*) FROM operation_logs
        WHERE user_id = v_user AND event = 'campaign_message_sent'
          AND (meta->>'campaign_id')::uuid = v_camp.campaign_id),
      'completed',
      v_safe_device,
      v_camp.started_at,
      COALESCE(
        (SELECT MAX(created_at) FROM operation_logs
          WHERE user_id = v_user AND event = 'campaign_completed'
            AND (meta->>'campaign_id')::uuid = v_camp.campaign_id),
        (SELECT MAX(created_at) FROM operation_logs
          WHERE user_id = v_user AND event = 'campaign_message_sent'
            AND (meta->>'campaign_id')::uuid = v_camp.campaign_id)
      ),
      v_camp.started_at, now()
    )
    ON CONFLICT (id) DO NOTHING;

    -- Contatos ENVIADOS (deduplicado por telefone)
    INSERT INTO public.campaign_contacts (campaign_id, phone, status, sent_at, created_at)
    SELECT DISTINCT ON (meta->>'phone')
      v_camp.campaign_id,
      meta->>'phone',
      'sent',
      created_at,
      created_at
    FROM operation_logs
    WHERE user_id = v_user
      AND event = 'campaign_message_sent'
      AND (meta->>'campaign_id')::uuid = v_camp.campaign_id
      AND meta->>'phone' IS NOT NULL
    ORDER BY meta->>'phone', created_at ASC;

    -- Contatos PENDENTES (apenas para as campanhas GRUPO-ELITE)
    IF v_camp.name ILIKE '%GRUPO - ELITE%' THEN
      INSERT INTO public.campaign_contacts (campaign_id, phone, status, var1, var2, var3, var4, var5, created_at)
      SELECT DISTINCT ON (vr.phone)
        v_camp.campaign_id,
        vr.phone,
        'pending',
        vr.var1, vr.var2, vr.var3, vr.var4, vr.var5,
        now()
      FROM public.verify_results vr
      WHERE vr.job_id = v_verify_job
        AND vr.status = 'success'
        AND NOT EXISTS (
          SELECT 1 FROM public.campaign_contacts cc
          WHERE cc.campaign_id = v_camp.campaign_id AND cc.phone = vr.phone
        )
      ORDER BY vr.phone;
    END IF;

    RAISE NOTICE 'Restaurada: % (%)', v_camp.name, v_camp.campaign_id;
  END LOOP;
END $$;
