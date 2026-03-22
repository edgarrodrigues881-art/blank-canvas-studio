
CREATE TABLE public.auto_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_type text NOT NULL UNIQUE,
  label text NOT NULL,
  content text NOT NULL DEFAULT '',
  buttons jsonb NOT NULL DEFAULT '[]'::jsonb,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.auto_message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage auto_message_templates"
  ON public.auto_message_templates
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Seed default templates
INSERT INTO public.auto_message_templates (message_type, label, content) VALUES
  ('WELCOME', 'Boas-vindas', 'Olá {{nome}}! 👋

Seja bem-vindo ao DG CONTINGÊNCIA PRO.

Seu teste gratuito de 3 dias já está ativo.

📅 Vencimento: {{vencimento}}

Se precisar de ajuda, fale com nosso suporte:
📞 {{suporte}}

Bons envios! 🚀'),
  ('DUE_3_DAYS', 'Faltam 3 dias', 'Olá {{nome}}! ⏳

Seu plano {{plano}} vence em 3 dias.

Para evitar interrupção nas suas instâncias, recomendamos renovar antecipadamente.

📅 Vencimento: {{vencimento}}

Se precisar de ajuda, fale com nosso suporte:
📞 {{suporte}}'),
  ('DUE_TODAY', 'Vence hoje', 'Olá {{nome}}! ⚠️

Seu plano {{plano}} vence HOJE.

Sem renovação, suas instâncias poderão ser bloqueadas automaticamente.

📅 Vencimento: {{vencimento}}

Renove para continuar utilizando a plataforma normalmente.

Suporte:
📞 {{suporte}}'),
  ('OVERDUE_1', 'Vencido 1 dia', 'Olá {{nome}}! 🚫

Seu plano {{plano}} venceu ontem.

Suas instâncias estão temporariamente bloqueadas.

Renove para voltar a utilizá-las imediatamente.

Suporte:
📞 {{suporte}}'),
  ('OVERDUE_7', 'Vencido 7 dias', 'Olá {{nome}}! 📢

Seu plano está vencido há 7 dias.

Ainda é possível reativar sua conta e continuar utilizando suas instâncias normalmente.

Se precisar de ajuda com a renovação, fale com nosso suporte.

📞 {{suporte}}'),
  ('OVERDUE_30', 'Vencido 30 dias', 'Olá {{nome}}! 🎁

Já se passaram 30 dias desde o vencimento do seu plano.

Para você voltar a utilizar a plataforma, liberamos uma condição especial de retorno.

💸 Desconto exclusivo na renovação.

Se quiser reativar sua conta, fale com nosso suporte.

📞 {{suporte}}');
