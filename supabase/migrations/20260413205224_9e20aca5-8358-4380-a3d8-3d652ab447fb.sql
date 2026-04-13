ALTER TABLE public.ai_lead_memory ADD COLUMN IF NOT EXISTS product_cited TEXT;
ALTER TABLE public.ai_lead_memory ADD COLUMN IF NOT EXISTS last_message_preview TEXT;