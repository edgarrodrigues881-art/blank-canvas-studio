CREATE TABLE public.admin_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  category TEXT NOT NULL DEFAULT 'Outros',
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  cost_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view costs" ON public.admin_costs FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert costs" ON public.admin_costs FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update costs" ON public.admin_costs FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete costs" ON public.admin_costs FOR DELETE USING (public.has_role(auth.uid(), 'admin'));