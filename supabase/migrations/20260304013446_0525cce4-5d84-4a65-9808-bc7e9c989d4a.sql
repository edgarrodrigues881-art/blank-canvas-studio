
ALTER TABLE public.user_api_tokens 
ADD COLUMN IF NOT EXISTS healthy boolean DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_checked_at timestamp with time zone DEFAULT NULL;
