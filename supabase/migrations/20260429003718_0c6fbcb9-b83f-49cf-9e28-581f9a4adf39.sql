-- ============================================
-- SISTEMA DE AFILIADOS (Pix único trimestral)
-- ============================================

-- 1. CUPONS DE AFILIADO (admin cria manualmente e atribui ao afiliado)
CREATE TABLE public.affiliate_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  affiliate_user_id uuid NOT NULL,
  discount_percent numeric(5,2) NOT NULL DEFAULT 10 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  plan_name text,
  max_uses integer,
  uses_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_affiliate_coupons_affiliate ON public.affiliate_coupons(affiliate_user_id);
CREATE INDEX idx_affiliate_coupons_code_active ON public.affiliate_coupons(code) WHERE is_active = true;

ALTER TABLE public.affiliate_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Affiliates view own coupons"
  ON public.affiliate_coupons FOR SELECT
  USING (affiliate_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin manages coupons"
  ON public.affiliate_coupons FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER tg_affiliate_coupons_updated
  BEFORE UPDATE ON public.affiliate_coupons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. INDICAÇÕES (1 cliente indicado = 1 registro)
CREATE TABLE public.affiliate_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_user_id uuid NOT NULL,
  referred_user_id uuid,
  referred_email text,
  referred_name text,
  coupon_id uuid REFERENCES public.affiliate_coupons(id) ON DELETE SET NULL,
  coupon_code text,
  plan_name text NOT NULL,
  plan_price numeric(10,2) NOT NULL,
  discount_amount numeric(10,2) NOT NULL DEFAULT 0,
  paid_amount numeric(10,2) NOT NULL,
  commission_percent numeric(5,2) NOT NULL DEFAULT 30,
  commission_total numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'completed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_affiliate_referrals_affiliate ON public.affiliate_referrals(affiliate_user_id, created_at DESC);
CREATE INDEX idx_affiliate_referrals_referred ON public.affiliate_referrals(referred_user_id);

ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Affiliates view own referrals"
  ON public.affiliate_referrals FOR SELECT
  USING (affiliate_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin manages referrals"
  ON public.affiliate_referrals FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER tg_affiliate_referrals_updated
  BEFORE UPDATE ON public.affiliate_referrals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. PAGAMENTOS DOS 3 MESES (1 indicação = 3 cobranças Pix)
CREATE TABLE public.affiliate_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid NOT NULL REFERENCES public.affiliate_referrals(id) ON DELETE CASCADE,
  affiliate_user_id uuid NOT NULL,
  month_number integer NOT NULL CHECK (month_number BETWEEN 1 AND 3),
  amount numeric(10,2) NOT NULL,
  commission_amount numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  due_date date,
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referral_id, month_number)
);

CREATE INDEX idx_affiliate_payments_affiliate ON public.affiliate_payments(affiliate_user_id, status);
CREATE INDEX idx_affiliate_payments_referral ON public.affiliate_payments(referral_id);

ALTER TABLE public.affiliate_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Affiliates view own payments"
  ON public.affiliate_payments FOR SELECT
  USING (affiliate_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin manages payments"
  ON public.affiliate_payments FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER tg_affiliate_payments_updated
  BEFORE UPDATE ON public.affiliate_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. SAQUES SOLICITADOS PELOS AFILIADOS
CREATE TABLE public.affiliate_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_user_id uuid NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  pix_key text NOT NULL,
  pix_key_type text,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'paid', 'rejected')),
  admin_notes text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_affiliate_payouts_affiliate ON public.affiliate_payouts(affiliate_user_id, created_at DESC);

ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Affiliates view own payouts"
  ON public.affiliate_payouts FOR SELECT
  USING (affiliate_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Affiliates request own payouts"
  ON public.affiliate_payouts FOR INSERT
  WITH CHECK (affiliate_user_id = auth.uid());

CREATE POLICY "Admin updates payouts"
  ON public.affiliate_payouts FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin deletes payouts"
  ON public.affiliate_payouts FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER tg_affiliate_payouts_updated
  BEFORE UPDATE ON public.affiliate_payouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. FUNÇÃO PÚBLICA: validar cupom no checkout (security definer)
CREATE OR REPLACE FUNCTION public.validate_affiliate_coupon(_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _coupon record;
BEGIN
  SELECT id, code, affiliate_user_id, discount_percent, plan_name, max_uses, uses_count, is_active
  INTO _coupon
  FROM public.affiliate_coupons
  WHERE upper(code) = upper(trim(_code))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;

  IF NOT _coupon.is_active THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'inactive');
  END IF;

  IF _coupon.max_uses IS NOT NULL AND _coupon.uses_count >= _coupon.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'limit_reached');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'coupon_id', _coupon.id,
    'code', _coupon.code,
    'discount_percent', _coupon.discount_percent,
    'plan_name', _coupon.plan_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_affiliate_coupon(text) TO anon, authenticated;