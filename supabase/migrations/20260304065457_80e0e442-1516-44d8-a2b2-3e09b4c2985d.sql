
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS instance_type text NOT NULL DEFAULT 'principal';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notificacao_liberada boolean NOT NULL DEFAULT false;
