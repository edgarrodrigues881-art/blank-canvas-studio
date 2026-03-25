
CREATE TABLE public.group_interaction_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  interaction_id uuid REFERENCES public.group_interactions(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('text', 'image', 'video', 'file', 'sticker')),
  content text NOT NULL DEFAULT '',
  file_url text,
  file_name text,
  category text DEFAULT 'geral',
  is_active boolean DEFAULT true,
  is_favorite boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.group_interaction_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own media" ON public.group_interaction_media
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.group_interactions
  ADD COLUMN IF NOT EXISTS content_types jsonb DEFAULT '{"text": true, "image": false, "video": false, "file": false, "sticker": false}'::jsonb,
  ADD COLUMN IF NOT EXISTS content_weights jsonb DEFAULT '{"text": 50, "image": 20, "video": 10, "file": 10, "sticker": 10}'::jsonb,
  ADD COLUMN IF NOT EXISTS preset_name text DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS last_group_used text,
  ADD COLUMN IF NOT EXISTS last_content_sent text,
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_action_at timestamptz,
  ADD COLUMN IF NOT EXISTS today_count integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_gi_media_user ON public.group_interaction_media(user_id);
CREATE INDEX IF NOT EXISTS idx_gi_media_interaction ON public.group_interaction_media(interaction_id);
CREATE INDEX IF NOT EXISTS idx_gi_media_type ON public.group_interaction_media(media_type, is_active);
