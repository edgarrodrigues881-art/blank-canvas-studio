ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS recurrence_type text NOT NULL DEFAULT 'once',
  ADD COLUMN IF NOT EXISTS recurrence_time text;

-- Validation trigger (replaces CHECK constraint)
CREATE OR REPLACE FUNCTION public.validate_campaign_recurrence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.recurrence_type IS NULL THEN
    NEW.recurrence_type := 'once';
  END IF;
  IF NEW.recurrence_type NOT IN ('once','daily') THEN
    RAISE EXCEPTION 'recurrence_type must be once or daily';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_campaign_recurrence_trg ON public.campaigns;
CREATE TRIGGER validate_campaign_recurrence_trg
BEFORE INSERT OR UPDATE OF recurrence_type ON public.campaigns
FOR EACH ROW EXECUTE FUNCTION public.validate_campaign_recurrence();