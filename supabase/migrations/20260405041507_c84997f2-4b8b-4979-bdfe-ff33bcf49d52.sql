
-- Auto-provision 20 credits for new users
CREATE OR REPLACE FUNCTION public.provision_prospeccao_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.prospeccao_credits (user_id, balance)
  VALUES (NEW.id, 20)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.prospeccao_credit_transactions (user_id, amount, type, description, balance_after)
  VALUES (NEW.id, 20, 'credit', 'Créditos iniciais de teste', 20);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_provision_prospeccao_credits
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.provision_prospeccao_credits();

-- Provision existing users that don't have credits yet
INSERT INTO public.prospeccao_credits (user_id, balance)
SELECT id, 20 FROM public.profiles
WHERE id NOT IN (SELECT user_id FROM public.prospeccao_credits)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.prospeccao_credit_transactions (user_id, amount, type, description, balance_after)
SELECT id, 20, 'credit', 'Créditos iniciais de teste', 20 FROM public.profiles
WHERE id NOT IN (SELECT DISTINCT user_id FROM public.prospeccao_credit_transactions);
