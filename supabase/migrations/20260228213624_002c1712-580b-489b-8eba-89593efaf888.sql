
-- Add delay config columns to campaigns
ALTER TABLE public.campaigns 
  ADD COLUMN IF NOT EXISTS min_delay_seconds integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS max_delay_seconds integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS pause_every_min integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS pause_every_max integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS pause_duration_min integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS pause_duration_max integer NOT NULL DEFAULT 120;

-- Enable realtime for campaigns and campaign_contacts
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_contacts;
