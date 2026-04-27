ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS chat_privacy_mode text NOT NULL DEFAULT 'normal'
CHECK (chat_privacy_mode IN ('normal', 'hide_messages', 'hide_all'));