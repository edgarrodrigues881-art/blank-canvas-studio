
## Plano: Verificador de WhatsApp — Lotes Persistentes em Background

### Problema atual
- A verificação roda **só no navegador** — ao fechar a aba, tudo para e os resultados somem
- Não existe conceito de "campanha de verificação" — é um processo único sem histórico
- Notificações erradas de "campanha finalizada" aparecem porque não há distinção

### Solução

#### 1. Criar tabelas no banco de dados
- **`verify_jobs`** — cada lote de verificação (nome, instância, status, progresso, totais)
  - Campos: `id`, `user_id`, `device_id`, `name`, `status` (pending/running/completed/failed/canceled), `total_phones`, `verified_count`, `success_count`, `no_whatsapp_count`, `error_count`, `created_at`, `updated_at`, `completed_at`
- **`verify_results`** — resultado individual de cada número
  - Campos: `id`, `job_id`, `phone`, `status` (pending/success/no_whatsapp/error), `detail`, `checked_at`
- RLS para isolamento por usuário
- Trigger de notificação quando o job completa (título "Verificação concluída", não "Campanha")

#### 2. Novo worker no VPS Engine (`verify-worker.ts`)
- Busca jobs com `status = 'running'` a cada 15s
- Processa números `pending` em lotes de 5 (mesmo padrão atual da edge function)
- Atualiza contadores em tempo real no `verify_jobs`
- Ao finalizar, marca como `completed` e insere notificação correta
- Suporta **múltiplos jobs simultâneos** (cada um com sua instância)

#### 3. Atualizar o Frontend
- **Tela de listagem**: mostra todos os lotes (ativos, concluídos, cancelados) com progresso em tempo real
- **Botão "Nova Verificação"**: abre formulário para criar um novo lote (selecionar instância, colar/importar números, dar nome)
- **Tela de detalhe**: mostra resultados, exportação CSV/XLSX, copiar válidos
- **Ações**: pausar, cancelar, retomar lotes
- Pode rodar **vários lotes ao mesmo tempo** com instâncias diferentes

#### 4. Benefícios
- ✅ Fecha a página? Continua rodando no servidor
- ✅ Múltiplas verificações simultâneas
- ✅ Histórico completo de todas as verificações
- ✅ Notificação correta ("Verificação concluída" em vez de "Campanha")
- ✅ Progresso em tempo real via Realtime do Supabase
