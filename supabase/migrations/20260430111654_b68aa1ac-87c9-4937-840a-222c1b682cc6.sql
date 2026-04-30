
-- 1) Humaniza logs antigos do auto save com erros técnicos da UAZAPI
UPDATE public.autosave_schedule_logs
   SET error_message = 'Número sem WhatsApp ativo — contato desativado automaticamente'
 WHERE status = 'failed'
   AND (
     error_message ~* '\m(405|404|400)\M.*\/message\/sendtext'
     OR error_message ILIKE '%not_in_whatsapp%'
     OR error_message ILIKE '%not in whatsapp%'
     OR error_message ILIKE '%invalid number%'
     OR error_message ILIKE '%jid does not exist%'
     OR error_message ILIKE '%no whatsapp%'
   );

UPDATE public.autosave_schedule_logs
   SET error_message = 'Muitas mensagens em pouco tempo — tente reduzir o ritmo'
 WHERE status = 'failed'
   AND (error_message ~* '\m429\M' OR error_message ILIKE '%rate limit%')
   AND error_message NOT LIKE 'Número sem WhatsApp%';

UPDATE public.autosave_schedule_logs
   SET error_message = 'Token da instância inválido ou expirado'
 WHERE status = 'failed'
   AND (error_message ~* '\m(401|403)\M' OR error_message ILIKE '%unauthorized%')
   AND error_message NOT LIKE 'Número sem WhatsApp%';

UPDATE public.autosave_schedule_logs
   SET error_message = 'Servidor WhatsApp indisponível no momento'
 WHERE status = 'failed'
   AND (error_message ~* '\m5\d\d\M' OR error_message ILIKE '%timeout%' OR error_message ILIKE '%econn%')
   AND error_message NOT LIKE 'Número sem WhatsApp%';

-- 2) Desativa retroativamente contatos que falharam por número inválido
UPDATE public.warmup_autosave_contacts w
   SET is_active = false,
       contact_status = 'invalid',
       updated_at = now()
  FROM (
    SELECT DISTINCT contact_phone, user_id
      FROM public.autosave_schedule_logs
     WHERE status = 'failed'
       AND error_message = 'Número sem WhatsApp ativo — contato desativado automaticamente'
  ) bad
 WHERE w.user_id = bad.user_id
   AND w.phone_e164 = bad.contact_phone
   AND (w.is_active = true OR COALESCE(w.contact_status, 'active') NOT IN ('invalid', 'discarded'));
