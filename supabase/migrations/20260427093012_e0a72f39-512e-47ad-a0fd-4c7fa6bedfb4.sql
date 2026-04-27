-- Cache de grupos por instância para Adição em Massa
CREATE TABLE IF NOT EXISTS public.device_groups_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  jid TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Sem nome',
  participants_count INTEGER NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, jid)
);

CREATE INDEX IF NOT EXISTS idx_device_groups_cache_device ON public.device_groups_cache(device_id);
CREATE INDEX IF NOT EXISTS idx_device_groups_cache_user ON public.device_groups_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_device_groups_cache_synced ON public.device_groups_cache(last_synced_at);

ALTER TABLE public.device_groups_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own device groups"
ON public.device_groups_cache
FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_device_groups_cache_updated_at
BEFORE UPDATE ON public.device_groups_cache
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para registrar a última sincronização da instância (opcional, ajuda no UI)
COMMENT ON TABLE public.device_groups_cache IS 'Cache de grupos por instância sincronizado pelo vps-engine a cada 5 minutos. Frontend lê daqui em vez de chamar UAZAPI ao vivo.';