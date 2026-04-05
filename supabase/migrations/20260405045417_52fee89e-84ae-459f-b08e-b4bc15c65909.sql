
-- Add free_pulls_remaining column
ALTER TABLE public.prospeccao_credits
ADD COLUMN IF NOT EXISTS free_pulls_remaining integer NOT NULL DEFAULT 0;

-- Give 3 free pulls to all existing users that still have initial credits (<=20)
UPDATE public.prospeccao_credits
SET free_pulls_remaining = 3
WHERE balance <= 20;

-- Update the provision trigger function to give 3 free pulls instead of 20 credits
CREATE OR REPLACE FUNCTION public.provision_prospeccao_credits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.prospeccao_credits (user_id, balance, free_pulls_remaining)
  VALUES (NEW.id, 0, 3)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.prospeccao_credit_transactions (user_id, amount, type, description, balance_after)
  VALUES (NEW.id, 0, 'credit', '3 puxadas grátis de 20 leads', 0);

  RETURN NEW;
END;
$function$;

-- Function to consume a free pull
CREATE OR REPLACE FUNCTION public.use_free_pull(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining integer;
BEGIN
  SELECT free_pulls_remaining INTO v_remaining
  FROM public.prospeccao_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_record');
  END IF;

  IF v_remaining <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_free_pulls', 'remaining', 0);
  END IF;

  UPDATE public.prospeccao_credits
  SET free_pulls_remaining = v_remaining - 1, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.prospeccao_credit_transactions (user_id, amount, type, description, balance_after)
  VALUES (p_user_id, 0, 'debit', 'Puxada grátis utilizada (' || (v_remaining - 1) || ' restantes)', 
    (SELECT balance FROM public.prospeccao_credits WHERE user_id = p_user_id));

  RETURN jsonb_build_object('success', true, 'remaining', v_remaining - 1);
END;
$function$;
