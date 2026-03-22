
-- Add unique constraint on phone to prevent duplicate registrations
CREATE UNIQUE INDEX idx_profiles_phone_unique ON public.profiles (phone) WHERE phone IS NOT NULL AND phone != '';
