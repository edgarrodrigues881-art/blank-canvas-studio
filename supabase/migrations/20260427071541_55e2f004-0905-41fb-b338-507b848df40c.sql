
-- Remove possíveis duplicatas e mantém apenas o plano Pro de 30 instâncias para a conta DG
DELETE FROM public.subscriptions
WHERE user_id = 'f5220141-3b20-4e85-90fd-8c85695686fa'
  AND plan_name <> 'Pro';

-- Garante 1 plano Pro ativo com 30 instâncias por 30 dias
INSERT INTO public.subscriptions (user_id, plan_name, plan_price, max_instances, started_at, expires_at)
SELECT 'f5220141-3b20-4e85-90fd-8c85695686fa', 'Pro', 397, 30, now(), now() + interval '30 days'
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscriptions WHERE user_id = 'f5220141-3b20-4e85-90fd-8c85695686fa'
);

UPDATE public.subscriptions
SET plan_name = 'Pro',
    plan_price = 397,
    max_instances = 30,
    started_at = now(),
    expires_at = GREATEST(COALESCE(expires_at, now()), now() + interval '30 days'),
    updated_at = now()
WHERE user_id = 'f5220141-3b20-4e85-90fd-8c85695686fa';

INSERT INTO public.notifications (user_id, title, message, type)
VALUES (
  'f5220141-3b20-4e85-90fd-8c85695686fa',
  'Plano atualizado! 🎉',
  'Seu plano Pro foi configurado com 30 instâncias.',
  'success'
);
