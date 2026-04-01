
CREATE OR REPLACE FUNCTION public.get_sidebar_stats(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'online', (SELECT count(*) FROM public.devices WHERE user_id = p_user_id AND login_type != 'report_wa' AND status IN ('Ready', 'Connected', 'authenticated')),
    'warmup', (SELECT count(*) FROM public.warmup_cycles WHERE user_id = p_user_id AND is_running = true),
    'disconnected', (SELECT count(*) FROM public.devices WHERE user_id = p_user_id AND login_type != 'report_wa' AND status IN ('Disconnected', 'disconnected')),
    'campaigns', (SELECT count(*) FROM public.campaigns WHERE user_id = p_user_id AND status IN ('processing', 'pending', 'scheduled', 'running')),
    'unread', (SELECT count(*) FROM public.notifications WHERE user_id = p_user_id AND read = false)
  );
$$;
