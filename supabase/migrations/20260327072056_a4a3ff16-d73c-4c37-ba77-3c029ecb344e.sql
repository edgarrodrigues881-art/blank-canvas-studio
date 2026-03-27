
-- Allow system groups (is_custom=false) to have NULL user_id
ALTER TABLE public.warmup_groups ALTER COLUMN user_id DROP NOT NULL;

-- Update RLS: system groups (user_id IS NULL AND is_custom=false) visible to all
DROP POLICY IF EXISTS "Users see system and own groups" ON public.warmup_groups;
CREATE POLICY "Users see system and own groups" ON public.warmup_groups
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (is_custom = false AND user_id IS NULL));

-- Allow users to delete system groups they've "adopted" (copied to their user_id)
-- Keep existing DELETE policy (only own groups)

-- Insert system groups (DG CONTINGÊNCIA #01-#08)
INSERT INTO public.warmup_groups (name, link, is_custom, user_id, description) VALUES
  ('DG CONTINGÊNCIA #01', 'https://chat.whatsapp.com/I1gvz1bfEhrEIM9iMFsCik', false, NULL, 'Grupo do sistema para aquecimento'),
  ('DG CONTINGÊNCIA #02', 'https://chat.whatsapp.com/BZNGH9zeFxF5UOj2pD2Wbk', false, NULL, 'Grupo do sistema para aquecimento'),
  ('DG CONTINGÊNCIA #03', 'https://chat.whatsapp.com/JnIfueI6qZsFgWuoYimS85', false, NULL, 'Grupo do sistema para aquecimento'),
  ('DG CONTINGÊNCIA #04', 'https://chat.whatsapp.com/LQ6FaAJJEg28Nm2uDQ0GZx', false, NULL, 'Grupo do sistema para aquecimento'),
  ('DG CONTINGÊNCIA #05', 'https://chat.whatsapp.com/KX87z8U37C2042v2Xpw8L9', false, NULL, 'Grupo do sistema para aquecimento'),
  ('DG CONTINGÊNCIA #06', 'https://chat.whatsapp.com/JXMhmfWADCf2HIMkCQuiyj', false, NULL, 'Grupo do sistema para aquecimento'),
  ('DG CONTINGÊNCIA #07', 'https://chat.whatsapp.com/J0ZrvjhFYkNIqGCAubDWNY', false, NULL, 'Grupo do sistema para aquecimento'),
  ('DG CONTINGÊNCIA #08', 'https://chat.whatsapp.com/Hz06ObxWZ7ACLOYKCtoLoO', false, NULL, 'Grupo do sistema para aquecimento')
ON CONFLICT DO NOTHING;
