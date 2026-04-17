CREATE INDEX IF NOT EXISTS idx_conv_user_status_lastmsg
ON public.conversations (user_id, status, last_message_at DESC);