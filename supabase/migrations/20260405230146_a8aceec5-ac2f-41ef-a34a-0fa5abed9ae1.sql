CREATE UNIQUE INDEX IF NOT EXISTS conversation_messages_wa_msg_id_unique 
ON public.conversation_messages (whatsapp_message_id) 
WHERE whatsapp_message_id IS NOT NULL;