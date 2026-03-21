
-- Índices para alta escala (10k+ devices)

-- devices: busca por user_id + status (usado no sync e listagem)
CREATE INDEX IF NOT EXISTS idx_devices_user_status ON public.devices (user_id, status);

-- devices: busca por user_id + login_type (filtro report_wa)
CREATE INDEX IF NOT EXISTS idx_devices_user_login_type ON public.devices (user_id, login_type);

-- warmup_cycles: busca por device_id + phase (ciclos ativos)
CREATE INDEX IF NOT EXISTS idx_warmup_cycles_device_phase ON public.warmup_cycles (device_id, phase);

-- warmup_cycles: busca por user_id + is_running
CREATE INDEX IF NOT EXISTS idx_warmup_cycles_user_running ON public.warmup_cycles (user_id, is_running);

-- warmup_audit_logs: busca por device_id + created_at (logs recentes)
CREATE INDEX IF NOT EXISTS idx_warmup_audit_device_created ON public.warmup_audit_logs (device_id, created_at DESC);

-- warmup_daily_stats: busca por user_id + device_id + stat_date
CREATE INDEX IF NOT EXISTS idx_warmup_daily_stats_lookup ON public.warmup_daily_stats (user_id, device_id, stat_date DESC);

-- operation_logs: busca por device_id + event + created_at (strike system)
CREATE INDEX IF NOT EXISTS idx_operation_logs_device_event ON public.operation_logs (device_id, event, created_at DESC);

-- user_api_tokens: busca por device_id + status
CREATE INDEX IF NOT EXISTS idx_user_api_tokens_device_status ON public.user_api_tokens (device_id, status);

-- warmup_community_membership: busca por device_id + is_enabled
CREATE INDEX IF NOT EXISTS idx_community_membership_device ON public.warmup_community_membership (device_id, is_enabled);

-- community_pairs: busca por cycle_id + status
CREATE INDEX IF NOT EXISTS idx_community_pairs_cycle_status ON public.community_pairs (cycle_id, status);

-- warmup_folder_devices: busca por user_id + folder_id
CREATE INDEX IF NOT EXISTS idx_folder_devices_user_folder ON public.warmup_folder_devices (user_id, folder_id);
