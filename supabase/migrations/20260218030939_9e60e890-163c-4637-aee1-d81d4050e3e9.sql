
-- Add a permanent display_id column to proxies
ALTER TABLE public.proxies ADD COLUMN display_id serial;

-- Set initial values based on creation order
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM public.proxies
)
UPDATE public.proxies SET display_id = numbered.rn
FROM numbered WHERE public.proxies.id = numbered.id;
