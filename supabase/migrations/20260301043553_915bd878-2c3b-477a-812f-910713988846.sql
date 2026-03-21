
-- Payment history table for manual financial tracking
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'manual',
  notes TEXT,
  paid_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  admin_id UUID NOT NULL
);

-- Enable RLS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Only admins can manage payments
CREATE POLICY "Admins can view payments" ON public.payments
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert payments" ON public.payments
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update payments" ON public.payments
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete payments" ON public.payments
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Add client_type to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS client_type TEXT NOT NULL DEFAULT 'normal';

-- Add server capacity config constant (can be updated by admin)
-- We'll use a simple approach: hardcoded in the frontend for now
