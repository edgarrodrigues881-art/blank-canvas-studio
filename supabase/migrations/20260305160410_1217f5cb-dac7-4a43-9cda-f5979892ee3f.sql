
-- Community Pairs table
CREATE TABLE public.community_pairs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cycle_id UUID REFERENCES public.warmup_cycles(id) ON DELETE CASCADE NOT NULL,
  instance_id_a UUID REFERENCES public.devices(id) ON DELETE CASCADE NOT NULL,
  instance_id_b UUID REFERENCES public.devices(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  closed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.community_pairs ENABLE ROW LEVEL SECURITY;

-- Admins can manage all pairs
CREATE POLICY "Admins can manage community pairs"
  ON public.community_pairs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Users can view pairs involving their devices
CREATE POLICY "Users can view own community pairs"
  ON public.community_pairs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.devices d
      WHERE d.user_id = auth.uid()
        AND (d.id = community_pairs.instance_id_a OR d.id = community_pairs.instance_id_b)
    )
  );
