
CREATE TABLE public.subscription_cycles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL,
  cycle_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  cycle_end TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + '30 days'::interval),
  cycle_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT
);

ALTER TABLE public.subscription_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view subscription cycles"
  ON public.subscription_cycles FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert subscription cycles"
  ON public.subscription_cycles FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update subscription cycles"
  ON public.subscription_cycles FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete subscription cycles"
  ON public.subscription_cycles FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own cycles"
  ON public.subscription_cycles FOR SELECT
  USING (auth.uid() = user_id);
