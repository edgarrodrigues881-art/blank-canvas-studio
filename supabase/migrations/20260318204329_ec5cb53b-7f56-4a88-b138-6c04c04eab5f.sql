
CREATE TABLE public.feature_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL UNIQUE,
  feature_name text NOT NULL,
  feature_description text NOT NULL DEFAULT '',
  feature_icon text NOT NULL DEFAULT 'Settings',
  status text NOT NULL DEFAULT 'active',
  maintenance_message text,
  route_path text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.feature_controls ENABLE ROW LEVEL SECURITY;

-- Admins can manage
CREATE POLICY "Admins can manage feature_controls"
  ON public.feature_controls FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- All authenticated users can read
CREATE POLICY "Authenticated can view feature_controls"
  ON public.feature_controls FOR SELECT TO authenticated
  USING (true);

-- Seed all features
INSERT INTO public.feature_controls (feature_key, feature_name, feature_description, feature_icon, status, route_path) VALUES
  ('dashboard', 'Dashboard', 'Painel principal com métricas e resumo', 'LayoutDashboard', 'active', '/dashboard'),
  ('devices', 'Instâncias', 'Gerenciamento de dispositivos e conexões', 'Smartphone', 'active', '/dashboard/devices'),
  ('campaigns', 'Enviar Mensagem', 'Criação e envio de campanhas', 'Send', 'active', '/dashboard/campaigns'),
  ('campaign-list', 'Campanhas', 'Lista e monitoramento de campanhas', 'Megaphone', 'active', '/dashboard/campaign-list'),
  ('contacts', 'Meus Contatos', 'Gerenciamento de contatos e listas', 'BookUser', 'active', '/dashboard/contacts'),
  ('templates', 'Modelos', 'Templates de mensagens', 'FileText', 'active', '/dashboard/templates'),
  ('proxy', 'Proxy', 'Configuração de proxies', 'Shield', 'active', '/dashboard/proxy'),
  ('auto-reply', 'Resposta Automática', 'Automação de mensagens com fluxo interativo', 'BotMessageSquare', 'active', '/dashboard/auto-reply'),
  ('warmup', 'Aquecimento', 'Aquecimento de chips WhatsApp', 'Flame', 'active', '/dashboard/warmup-v2'),
  ('autosave', 'Auto Save', 'Salvamento automático de contatos', 'SaveAll', 'active', '/dashboard/autosave'),
  ('groups', 'Grupos', 'Captura e gerenciamento de grupos', 'UsersRound', 'active', '/dashboard/groups'),
  ('report-whatsapp', 'Relatório Via WhatsApp', 'Relatórios automatizados via WhatsApp', 'ScrollText', 'active', '/dashboard/reports/whatsapp'),
  ('community', 'Comunidade', 'Comunidade de aquecimento', 'UsersRound', 'active', '/dashboard/community'),
  ('settings', 'Configurações', 'Configurações do sistema', 'Settings', 'active', '/dashboard/settings'),
  ('my-plan', 'Meu Plano', 'Informações e gerenciamento do plano', 'CreditCard', 'active', '/dashboard/my-plan');
