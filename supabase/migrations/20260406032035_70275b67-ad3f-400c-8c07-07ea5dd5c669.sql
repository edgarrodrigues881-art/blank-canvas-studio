
ALTER TABLE public.team_permissions
ADD COLUMN IF NOT EXISTS perm_service_contacts BOOLEAN NOT NULL DEFAULT true;
