
-- Credits balance table
CREATE TABLE public.prospeccao_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.prospeccao_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credits" ON public.prospeccao_credits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage credits" ON public.prospeccao_credits
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Transactions history
CREATE TABLE public.prospeccao_credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  type text NOT NULL CHECK (type IN ('credit', 'debit')),
  description text,
  campaign_id uuid REFERENCES public.prospeccao_campaigns(id),
  balance_after integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.prospeccao_credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions" ON public.prospeccao_credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role inserts transactions" ON public.prospeccao_credit_transactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Atomic debit function (called by edge function with service role)
CREATE OR REPLACE FUNCTION public.debit_prospeccao_credits(
  p_user_id uuid,
  p_amount integer,
  p_description text DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current integer;
  v_new_balance integer;
BEGIN
  SELECT balance INTO v_current
  FROM public.prospeccao_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_credits_record');
  END IF;

  IF v_current < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits', 'balance', v_current, 'required', p_amount);
  END IF;

  v_new_balance := v_current - p_amount;

  UPDATE public.prospeccao_credits SET balance = v_new_balance, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.prospeccao_credit_transactions (user_id, amount, type, description, campaign_id, balance_after)
  VALUES (p_user_id, p_amount, 'debit', p_description, p_campaign_id, v_new_balance);

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance, 'debited', p_amount);
END;
$$;

-- Add credits function (admin use)
CREATE OR REPLACE FUNCTION public.credit_prospeccao_balance(
  p_user_id uuid,
  p_amount integer,
  p_description text DEFAULT 'Créditos adicionados'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance integer;
BEGIN
  INSERT INTO public.prospeccao_credits (user_id, balance)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE SET balance = prospeccao_credits.balance + p_amount, updated_at = now()
  RETURNING balance INTO v_new_balance;

  INSERT INTO public.prospeccao_credit_transactions (user_id, amount, type, description, balance_after)
  VALUES (p_user_id, p_amount, 'credit', p_description, v_new_balance);

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance);
END;
$$;
