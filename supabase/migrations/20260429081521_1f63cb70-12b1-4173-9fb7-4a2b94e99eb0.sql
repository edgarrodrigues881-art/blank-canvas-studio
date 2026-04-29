-- Suprime as notificações de "Instância desconectou" e "Instância reconectou" do feed do cliente.
-- O trigger continua existindo (para manter compatibilidade), mas agora simplesmente
-- ignora mudanças de status connect/disconnect e NÃO insere mais nada em public.notifications.
-- Todo o resto do monitoramento (warmup auto-pause, alertas WhatsApp, operation_logs) é
-- INDEPENDENTE deste trigger e continua funcionando normalmente.

CREATE OR REPLACE FUNCTION public.notify_device_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Notificações de desconexão/reconexão de instância foram suprimidas a pedido.
  -- O monitoramento interno continua via sync-devices-worker e operation_logs.
  RETURN NEW;
END;
$function$;