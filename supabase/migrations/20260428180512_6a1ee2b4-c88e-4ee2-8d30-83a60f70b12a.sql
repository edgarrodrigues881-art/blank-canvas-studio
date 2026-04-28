-- Operação de manutenção: liberar slots de conexão zumbi do PostgREST
-- Cria função temporária com SECURITY DEFINER pra ter permissão de terminar
DO $$
DECLARE
  killed_count int := 0;
  rec record;
BEGIN
  FOR rec IN
    SELECT pid
    FROM pg_stat_activity
    WHERE state = 'idle'
      AND application_name = 'postgrest'
      AND state_change < now() - interval '2 minutes'
      AND pid <> pg_backend_pid()
  LOOP
    BEGIN
      PERFORM pg_terminate_backend(rec.pid);
      killed_count := killed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- ignora se não tiver permissão em algum pid específico
      NULL;
    END;
  END LOOP;
  RAISE NOTICE 'Terminadas % conexoes idle do postgrest', killed_count;
END $$;