
-- Critical index for warmup_jobs processing (10k+ scale)
CREATE INDEX IF NOT EXISTS idx_warmup_jobs_pending_run_at ON public.warmup_jobs (status, run_at ASC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_warmup_jobs_cycle_status ON public.warmup_jobs (cycle_id, status);
CREATE INDEX IF NOT EXISTS idx_warmup_jobs_device_type_status ON public.warmup_jobs (device_id, job_type, status);
