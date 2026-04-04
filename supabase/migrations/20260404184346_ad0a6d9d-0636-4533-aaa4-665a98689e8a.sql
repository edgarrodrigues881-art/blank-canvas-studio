
-- ══════════════════════════════════════════════════════════
-- Verify Jobs — persistent verification batches
-- ══════════════════════════════════════════════════════════
CREATE TABLE public.verify_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'Verificação',
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, running, completed, failed, canceled
  total_phones INTEGER NOT NULL DEFAULT 0,
  verified_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  no_whatsapp_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ
);

ALTER TABLE public.verify_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own verify jobs"
  ON public.verify_jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own verify jobs"
  ON public.verify_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own verify jobs"
  ON public.verify_jobs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own verify jobs"
  ON public.verify_jobs FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_verify_jobs_user_status ON public.verify_jobs (user_id, status);
CREATE INDEX idx_verify_jobs_status ON public.verify_jobs (status) WHERE status IN ('pending', 'running');

CREATE TRIGGER update_verify_jobs_updated_at
  BEFORE UPDATE ON public.verify_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for progress updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.verify_jobs;

-- ══════════════════════════════════════════════════════════
-- Verify Results — individual number results
-- ══════════════════════════════════════════════════════════
CREATE TABLE public.verify_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.verify_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, success, no_whatsapp, error
  detail TEXT,
  checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.verify_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own verify results"
  ON public.verify_results FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own verify results"
  ON public.verify_results FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own verify results"
  ON public.verify_results FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_verify_results_job_status ON public.verify_results (job_id, status);
CREATE INDEX idx_verify_results_job_id ON public.verify_results (job_id);

-- ══════════════════════════════════════════════════════════
-- Notification trigger when verify job completes
-- ══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.notify_verify_job_completed()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.user_id,
      '✅ Verificação concluída',
      'A verificação "' || NEW.name || '" foi finalizada. ' ||
        COALESCE(NEW.success_count, 0) || ' com WhatsApp, ' ||
        COALESCE(NEW.no_whatsapp_count, 0) || ' sem WhatsApp, ' ||
        COALESCE(NEW.error_count, 0) || ' erros.',
      'success'
    );
  END IF;

  IF NEW.status = 'failed' AND (OLD.status IS DISTINCT FROM 'failed') THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.user_id,
      '❌ Verificação falhou',
      'A verificação "' || NEW.name || '" apresentou erro: ' || COALESCE(NEW.last_error, 'Erro desconhecido'),
      'error'
    );
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_notify_verify_job_status
  AFTER UPDATE ON public.verify_jobs
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_verify_job_completed();
