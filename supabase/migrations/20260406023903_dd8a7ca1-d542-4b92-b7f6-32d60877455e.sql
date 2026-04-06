
-- Permissions table for team members
CREATE TABLE public.team_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  team_owner_id UUID NOT NULL,

  -- Permission mode: 'lock' (show with lock icon) or 'hide' (hide completely)
  permission_mode TEXT NOT NULL DEFAULT 'lock',

  -- CONEXÕES
  perm_dashboard BOOLEAN NOT NULL DEFAULT true,
  perm_instances BOOLEAN NOT NULL DEFAULT true,
  perm_send_message BOOLEAN NOT NULL DEFAULT true,
  perm_campaigns BOOLEAN NOT NULL DEFAULT true,
  perm_templates BOOLEAN NOT NULL DEFAULT true,
  perm_carousel_templates BOOLEAN NOT NULL DEFAULT true,

  -- AQUECIMENTO
  perm_warmup BOOLEAN NOT NULL DEFAULT true,
  perm_proxy BOOLEAN NOT NULL DEFAULT true,
  perm_chip_conversation BOOLEAN NOT NULL DEFAULT true,
  perm_group_interaction BOOLEAN NOT NULL DEFAULT true,

  -- CENTRAL DE ATENDIMENTO
  perm_conversations BOOLEAN NOT NULL DEFAULT true,
  perm_team BOOLEAN NOT NULL DEFAULT true,
  perm_ai_settings BOOLEAN NOT NULL DEFAULT true,

  -- FERRAMENTAS
  perm_contacts BOOLEAN NOT NULL DEFAULT true,
  perm_group_extractor BOOLEAN NOT NULL DEFAULT true,
  perm_whatsapp_verifier BOOLEAN NOT NULL DEFAULT true,
  perm_prospection BOOLEAN NOT NULL DEFAULT true,
  perm_group_join BOOLEAN NOT NULL DEFAULT true,
  perm_mass_inject BOOLEAN NOT NULL DEFAULT true,
  perm_welcome BOOLEAN NOT NULL DEFAULT true,
  perm_groups BOOLEAN NOT NULL DEFAULT true,
  perm_autosave BOOLEAN NOT NULL DEFAULT true,
  perm_report_wa BOOLEAN NOT NULL DEFAULT true,

  -- SUPORTE
  perm_my_plan BOOLEAN NOT NULL DEFAULT true,
  perm_community BOOLEAN NOT NULL DEFAULT true,
  perm_help BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, team_owner_id)
);

ALTER TABLE public.team_permissions ENABLE ROW LEVEL SECURITY;

-- Team owner can manage permissions for their members
CREATE POLICY "Team owner can view member permissions"
  ON public.team_permissions FOR SELECT
  USING (auth.uid() = team_owner_id OR auth.uid() = user_id);

CREATE POLICY "Team owner can insert member permissions"
  ON public.team_permissions FOR INSERT
  WITH CHECK (auth.uid() = team_owner_id);

CREATE POLICY "Team owner can update member permissions"
  ON public.team_permissions FOR UPDATE
  USING (auth.uid() = team_owner_id);

CREATE POLICY "Team owner can delete member permissions"
  ON public.team_permissions FOR DELETE
  USING (auth.uid() = team_owner_id);

CREATE TRIGGER update_team_permissions_updated_at
  BEFORE UPDATE ON public.team_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Permission presets table
CREATE TABLE public.permission_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  permissions JSONB NOT NULL DEFAULT '{}',
  owner_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.permission_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view system presets"
  ON public.permission_presets FOR SELECT
  USING (is_system = true OR auth.uid() = owner_id);

CREATE POLICY "Users can manage own presets"
  ON public.permission_presets FOR INSERT
  WITH CHECK (auth.uid() = owner_id AND is_system = false);

CREATE POLICY "Users can update own presets"
  ON public.permission_presets FOR UPDATE
  USING (auth.uid() = owner_id AND is_system = false);

CREATE POLICY "Users can delete own presets"
  ON public.permission_presets FOR DELETE
  USING (auth.uid() = owner_id AND is_system = false);

-- Insert system presets
INSERT INTO public.permission_presets (name, description, is_system, permissions) VALUES
(
  'Atendimento',
  'Acesso apenas a Conversas e Contatos',
  true,
  '{"perm_dashboard":true,"perm_instances":false,"perm_send_message":false,"perm_campaigns":false,"perm_templates":false,"perm_carousel_templates":false,"perm_warmup":false,"perm_proxy":false,"perm_chip_conversation":false,"perm_group_interaction":false,"perm_conversations":true,"perm_team":false,"perm_ai_settings":false,"perm_contacts":true,"perm_group_extractor":false,"perm_whatsapp_verifier":false,"perm_prospection":false,"perm_group_join":false,"perm_mass_inject":false,"perm_welcome":false,"perm_groups":false,"perm_autosave":false,"perm_report_wa":false,"perm_my_plan":false,"perm_community":false,"perm_help":true}'
),
(
  'Marketing',
  'Acesso a Campanhas, Disparos e Templates',
  true,
  '{"perm_dashboard":true,"perm_instances":true,"perm_send_message":true,"perm_campaigns":true,"perm_templates":true,"perm_carousel_templates":true,"perm_warmup":false,"perm_proxy":false,"perm_chip_conversation":false,"perm_group_interaction":false,"perm_conversations":false,"perm_team":false,"perm_ai_settings":false,"perm_contacts":true,"perm_group_extractor":true,"perm_whatsapp_verifier":true,"perm_prospection":true,"perm_group_join":true,"perm_mass_inject":true,"perm_welcome":false,"perm_groups":false,"perm_autosave":false,"perm_report_wa":false,"perm_my_plan":false,"perm_community":false,"perm_help":true}'
),
(
  'Completo',
  'Acesso a quase todas as funcionalidades',
  true,
  '{"perm_dashboard":true,"perm_instances":true,"perm_send_message":true,"perm_campaigns":true,"perm_templates":true,"perm_carousel_templates":true,"perm_warmup":true,"perm_proxy":true,"perm_chip_conversation":true,"perm_group_interaction":true,"perm_conversations":true,"perm_team":false,"perm_ai_settings":true,"perm_contacts":true,"perm_group_extractor":true,"perm_whatsapp_verifier":true,"perm_prospection":true,"perm_group_join":true,"perm_mass_inject":true,"perm_welcome":true,"perm_groups":true,"perm_autosave":true,"perm_report_wa":true,"perm_my_plan":true,"perm_community":true,"perm_help":true}'
);
