
CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_messages_wa_id_unique 
ON public.conversation_messages(whatsapp_message_id) 
WHERE whatsapp_message_id IS NOT NULL;
