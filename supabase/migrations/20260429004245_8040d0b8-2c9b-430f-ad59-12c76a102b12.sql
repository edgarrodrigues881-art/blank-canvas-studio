
ALTER TABLE public.affiliate_payments
  ADD COLUMN IF NOT EXISTS released_at timestamptz;

-- Backfill: pagamentos já marcados como pagos liberam 7 dias após paid_at
UPDATE public.affiliate_payments
   SET released_at = paid_at + interval '7 days'
 WHERE status = 'paid' AND paid_at IS NOT NULL AND released_at IS NULL;

-- Trigger: ao marcar como paid, define released_at automaticamente (paid_at + 7 dias)
CREATE OR REPLACE FUNCTION public.set_affiliate_payment_release()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' AND NEW.paid_at IS NOT NULL THEN
    NEW.released_at := COALESCE(NEW.released_at, NEW.paid_at + interval '7 days');
  ELSIF NEW.status <> 'paid' THEN
    NEW.released_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_affiliate_payment_release ON public.affiliate_payments;
CREATE TRIGGER trg_set_affiliate_payment_release
BEFORE INSERT OR UPDATE OF status, paid_at ON public.affiliate_payments
FOR EACH ROW EXECUTE FUNCTION public.set_affiliate_payment_release();
