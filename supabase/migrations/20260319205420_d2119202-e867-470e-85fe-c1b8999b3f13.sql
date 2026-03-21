-- Fix dead community pairs with max_turns=0 by assigning valid random max_turns
-- This fixes pairs that got stuck after conversation completion reset bug
UPDATE public.community_pairs
SET meta = jsonb_set(
  COALESCE(meta, '{}'::jsonb),
  '{max_turns}',
  to_jsonb(floor(random() * 41 + 40)::int)
)
WHERE status = 'active' 
  AND (meta->>'max_turns')::int = 0;