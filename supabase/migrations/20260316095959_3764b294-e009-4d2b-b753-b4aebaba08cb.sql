
-- Drop old public-scoped policies that weren't caught

-- report_wa_configs (old public ones still exist with different names)
DO $$
DECLARE _pol record;
BEGIN
  FOR _pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='report_wa_configs' AND roles::text LIKE '%public%'
  LOOP EXECUTE format('DROP POLICY %I ON public.report_wa_configs', _pol.policyname); END LOOP;
  
  FOR _pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='warmup_groups' AND roles::text LIKE '%public%'
  LOOP EXECUTE format('DROP POLICY %I ON public.warmup_groups', _pol.policyname); END LOOP;
  
  FOR _pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='warmup_sessions' AND roles::text LIKE '%public%'
  LOOP EXECUTE format('DROP POLICY %I ON public.warmup_sessions', _pol.policyname); END LOOP;
  
  FOR _pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='warmup_logs' AND roles::text LIKE '%public%'
  LOOP EXECUTE format('DROP POLICY %I ON public.warmup_logs', _pol.policyname); END LOOP;
  
  FOR _pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='admin_costs' AND roles::text LIKE '%public%'
  LOOP EXECUTE format('DROP POLICY %I ON public.admin_costs', _pol.policyname); END LOOP;
END $$;
