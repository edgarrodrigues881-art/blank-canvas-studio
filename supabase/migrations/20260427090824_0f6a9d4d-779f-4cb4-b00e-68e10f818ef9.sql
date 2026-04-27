-- Fase 1 da migração de Edge Functions para VPS
-- Desativa os crons no Supabase que ficavam disparando funções a cada 1 minuto.
-- A partir de agora, esses jobs rodam dentro do vps-engine (workers internos a cada 60s).
-- As Edge Functions continuam disponíveis para uso manual / fallback.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'status-schedule-tick-every-minute') THEN
    PERFORM cron.unschedule('status-schedule-tick-every-minute');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'report-wa-cron-every-1min') THEN
    PERFORM cron.unschedule('report-wa-cron-every-1min');
  END IF;

  -- Defensive: also remove any sync-devices cron if one exists (the VPS already runs this every 10s)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-devices-cron-every-1min') THEN
    PERFORM cron.unschedule('sync-devices-cron-every-1min');
  END IF;
END $$;