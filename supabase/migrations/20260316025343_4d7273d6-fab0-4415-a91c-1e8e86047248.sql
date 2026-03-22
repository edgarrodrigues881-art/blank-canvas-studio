
-- Drop existing FK constraints and re-create with CASCADE for cleanup tables
-- Keep warmup_audit_logs WITHOUT cascade so dashboard counts persist

-- warmup_cycles
ALTER TABLE public.warmup_cycles DROP CONSTRAINT IF EXISTS warmup_cycles_device_id_fkey;
ALTER TABLE public.warmup_cycles ADD CONSTRAINT warmup_cycles_device_id_fkey 
  FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE CASCADE;

-- warmup_jobs
ALTER TABLE public.warmup_jobs DROP CONSTRAINT IF EXISTS warmup_jobs_device_id_fkey;
ALTER TABLE public.warmup_jobs ADD CONSTRAINT warmup_jobs_device_id_fkey 
  FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE CASCADE;

-- warmup_instance_groups
ALTER TABLE public.warmup_instance_groups DROP CONSTRAINT IF EXISTS warmup_instance_groups_device_id_fkey;
ALTER TABLE public.warmup_instance_groups ADD CONSTRAINT warmup_instance_groups_device_id_fkey 
  FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE CASCADE;

-- warmup_folder_devices
ALTER TABLE public.warmup_folder_devices DROP CONSTRAINT IF EXISTS warmup_folder_devices_device_id_fkey;
ALTER TABLE public.warmup_folder_devices ADD CONSTRAINT warmup_folder_devices_device_id_fkey 
  FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE CASCADE;

-- warmup_community_membership
ALTER TABLE public.warmup_community_membership DROP CONSTRAINT IF EXISTS warmup_community_membership_device_id_fkey;
ALTER TABLE public.warmup_community_membership ADD CONSTRAINT warmup_community_membership_device_id_fkey 
  FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE CASCADE;

-- community_pairs (both sides)
ALTER TABLE public.community_pairs DROP CONSTRAINT IF EXISTS community_pairs_instance_id_a_fkey;
ALTER TABLE public.community_pairs ADD CONSTRAINT community_pairs_instance_id_a_fkey 
  FOREIGN KEY (instance_id_a) REFERENCES public.devices(id) ON DELETE CASCADE;

ALTER TABLE public.community_pairs DROP CONSTRAINT IF EXISTS community_pairs_instance_id_b_fkey;
ALTER TABLE public.community_pairs ADD CONSTRAINT community_pairs_instance_id_b_fkey 
  FOREIGN KEY (instance_id_b) REFERENCES public.devices(id) ON DELETE CASCADE;

-- warmup_sessions
ALTER TABLE public.warmup_sessions DROP CONSTRAINT IF EXISTS warmup_sessions_device_id_fkey;
ALTER TABLE public.warmup_sessions ADD CONSTRAINT warmup_sessions_device_id_fkey 
  FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE CASCADE;

-- warmup_logs (old table) - cascade
ALTER TABLE public.warmup_logs DROP CONSTRAINT IF EXISTS warmup_logs_device_id_fkey;

-- user_api_tokens - set null so token returns to pool
ALTER TABLE public.user_api_tokens DROP CONSTRAINT IF EXISTS user_api_tokens_device_id_fkey;
ALTER TABLE public.user_api_tokens ADD CONSTRAINT user_api_tokens_device_id_fkey 
  FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE SET NULL;

-- alerts - set null to preserve alert history
ALTER TABLE public.alerts DROP CONSTRAINT IF EXISTS alerts_instance_id_fkey;
ALTER TABLE public.alerts ADD CONSTRAINT alerts_instance_id_fkey 
  FOREIGN KEY (instance_id) REFERENCES public.devices(id) ON DELETE SET NULL;
