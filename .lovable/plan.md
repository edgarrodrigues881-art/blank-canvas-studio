## Group Chat — chat dedicado aos grupos das minhas instâncias

Nova página dentro do Group CRM onde o usuário vê e conversa apenas em grupos do WhatsApp das suas instâncias. Layout estilo WhatsApp Web: lista de grupos à esquerda, chat à direita.

### 1. Rota e navegação
- Nova rota `/dashboard/group-crm/chat` (lazy) em `App.tsx`.
- Item "Chat de Grupos" na sidebar do Group CRM (`AppSidebar.tsx`), ícone `MessagesSquare`.

### 2. Lista de grupos (sidebar esquerda)
- Fonte: tabela `device_groups_cache` filtrada por `user_id = auth.uid()`.
- Mostra nome do grupo, nº de participantes, instância (device.name), última mensagem (quando houver) e horário.
- Filtro por instância (mesmo padrão das Conversas, ordenado por `created_at` da instância).
- Busca por nome do grupo.
- Realtime via Supabase channel em `group_messages` para atualizar última mensagem/contador.

### 3. Recepção de mensagens dos grupos
Hoje `webhook-conversations/parser.ts` descarta `@g.us`. Solução isolada para não impactar Conversas 1-a-1:
- Criar nova tabela `group_messages` (id, user_id, device_id, group_jid, sender_jid, sender_name, content, media_url, media_type, mime_type, direction, whatsapp_message_id, sent_at, created_at) com RLS por `user_id = auth.uid()`.
- Em `webhook-conversations/index.ts`, antes do parser atual, adicionar branch: se `remoteJid` termina em `@g.us`, persistir no `group_messages` (parser leve dedicado a grupos: extrai texto/mídia/sender) e seguir sem afetar `conversations`.
- Reaproveitar utilitários `resolveMediaType`/`resolveMediaUrl` do parser existente.

### 4. Envio de mensagens
- Reusar `chat-send` (já trata `isGroupJid`). O frontend chama `chat-send` passando `to = group_jid`, `device_id` correspondente.
- Suporte a texto, imagem, áudio, arquivo (idêntico às Conversas).
- Após sucesso, inserir registro local em `group_messages` com `direction = 'sent'` para refletir imediatamente na UI (Optimistic UI).

### 5. UI do chat (painel direito)
- Reaproveitar `MessageBubble` existente.
- Cabeçalho mostra nome do grupo + contagem de participantes + instância usada.
- Mensagens recebidas exibem o nome/telefone do remetente acima do balão (igual WhatsApp).
- Composer reaproveitado (texto + anexos + áudio).
- Realtime subscription em `group_messages WHERE group_jid = X AND device_id = Y`.

### 6. Sincronização inicial dos grupos
- A página chama o worker existente `groups-sync-worker` (VPS) ao montar para garantir cache atualizado de `device_groups_cache`. Se já houver dados recentes (<10min), pula.

### Detalhes técnicos
- Migração SQL: criar `group_messages`, índices em `(user_id, group_jid, sent_at desc)` e `(user_id, device_id)`, RLS com `user_id = auth.uid()`, realtime publication.
- Edge function `webhook-conversations`: branch isolado p/ `@g.us` gravando em `group_messages`. Sem alterar lógica de 1-a-1.
- Frontend: `src/pages/dashboard/GroupChat.tsx` + `src/hooks/group-chat/useGroupMessages.ts` + `useGroupList.ts`.
- Sem `pg_cron` novos. Sem mexer em RLS de `conversations`.

### Fora do escopo (pode vir depois)
- Histórico retroativo de mensagens dos grupos (apenas captura a partir de agora).
- Atribuição de atendentes / pipeline CRM nos grupos.
- Reações, edições e deleção via API de grupos.
