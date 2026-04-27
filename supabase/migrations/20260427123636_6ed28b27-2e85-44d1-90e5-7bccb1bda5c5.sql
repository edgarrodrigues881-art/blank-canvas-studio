DROP INDEX IF EXISTS public.conversation_messages_wa_msg_id_unique;
DROP INDEX IF EXISTS public.idx_conv_messages_wa_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS conversation_messages_conversation_wa_id_unique
ON public.conversation_messages (conversation_id, whatsapp_message_id)
WHERE whatsapp_message_id IS NOT NULL;