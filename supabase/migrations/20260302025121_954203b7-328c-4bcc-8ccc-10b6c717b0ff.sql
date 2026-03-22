ALTER TABLE public.payments 
  ADD COLUMN discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN fee numeric NOT NULL DEFAULT 0;