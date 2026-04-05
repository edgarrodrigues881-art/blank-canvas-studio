ALTER TABLE public.prospeccao_campaign_leads
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS facebook text,
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS faixa_preco text;