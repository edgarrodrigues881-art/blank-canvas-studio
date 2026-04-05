
-- Adicionar 20 créditos e zerar puxadas grátis para Edgar Rodrigues
UPDATE public.prospeccao_credits 
SET balance = 20, free_pulls_remaining = 0, updated_at = now()
WHERE user_id = 'f5220141-3b20-4e85-90fd-8c85695686fa';

INSERT INTO public.prospeccao_credit_transactions (user_id, amount, type, description, balance_after)
VALUES ('f5220141-3b20-4e85-90fd-8c85695686fa', 20, 'credit', 'Créditos de teste — 20 adicionados, puxadas grátis removidas', 20);
