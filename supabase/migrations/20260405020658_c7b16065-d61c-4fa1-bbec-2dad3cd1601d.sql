
DROP POLICY "Service role insert campaign logs" ON public.prospeccao_campaign_logs;
DROP POLICY "Service role insert campaign leads" ON public.prospeccao_campaign_leads;

CREATE POLICY "Authenticated insert campaign logs"
  ON public.prospeccao_campaign_logs FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.prospeccao_campaigns c
    WHERE c.id = campaign_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Authenticated insert campaign leads"
  ON public.prospeccao_campaign_leads FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.prospeccao_campaigns c
    WHERE c.id = campaign_id AND c.user_id = auth.uid()
  ));
