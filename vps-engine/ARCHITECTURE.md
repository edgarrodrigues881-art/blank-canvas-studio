# Arquitetura VPS Engine

## O que roda na VPS (este projeto)

| Componente | Descrição | Intervalo |
|---|---|---|
| **Warmup Tick** | Processa jobs pendentes de aquecimento (grupo, autosave, comunitário) | 30s |
| **Campaign Scheduler** | Agenda e dispara campanhas, watchdog de campanhas travadas | 60s |
| **Group Interaction Tick** | Dispara interações em grupo agendadas | 60s |
| **Stale Lock Cleanup** | Limpa device locks órfãos | 60s |
| **Health Check** | HTTP GET /health para monitoramento | Contínuo |

## O que continua no Supabase

| Componente | Motivo |
|---|---|
| **Banco de dados** | PostgreSQL gerenciado, RLS, triggers |
| **Autenticação** | Auth do Supabase (JWT, magic link) |
| **Storage** | Mídia, imagens de aquecimento |
| **warmup-engine** | Lifecycle leve (start/pause/resume/stop) — chamado pelo frontend |
| **process-campaign** | Processamento individual de contatos (chamado pelo VPS) |
| **group-interaction** | Tick individual de interação (chamado pelo VPS) |
| **community-core** | Scheduler de 6 fases do comunitário |
| **chip-conversation** | Tick individual de conversa entre chips |
| **Webhooks leves** | autoreply-webhook, webhook-dispatch |
| **Triggers** | notify_device_status_change, upsert_warmup_daily_stat |

## Fases de migração

### Fase 1 (atual) — Proxy inteligente
- VPS assume o **scheduling** (substitui pg_cron)
- VPS faz o **watchdog** de campanhas e locks
- Jobs individuais ainda são processados via Edge Function (proxy)
- **Benefício**: elimina timeouts do pg_cron, controle de concorrência

### Fase 2 — Jobs inline
- Processar `group_interaction`, `autosave_interaction` diretamente no Node.js
- Eliminar chamadas ao warmup-tick Edge Function
- **Benefício**: sem limite de tempo de execução

### Fase 3 — Motor completo
- Portar `community-core`, `chip-conversation` para Node.js
- Portar `process-campaign` para Node.js
- **Benefício**: independência total do Supabase para processamento pesado

## Como deployar na VPS

```bash
# 1. Clonar o repositório
git clone <repo-url>
cd vps-engine

# 2. Instalar dependências
npm install

# 3. Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY

# 4. Build
npm run build

# 5. Iniciar com PM2
npm run pm2:start

# 6. Verificar
curl http://localhost:3500/health
pm2 logs vps-engine
```

## Após deploy: desativar pg_cron

Após confirmar que o VPS Engine está funcionando, desative os crons no Supabase:

```sql
-- Desativar warmup-tick cron (agora roda na VPS)
SELECT cron.unschedule('warmup-tick-every-2-min');

-- Desativar run-scheduled-campaigns cron (agora roda na VPS)
SELECT cron.unschedule('run-scheduled-campaigns-every-min');
```

## Monitoramento

- **Health check**: `GET http://<vps-ip>:3500/health`
- **Logs PM2**: `pm2 logs vps-engine`
- **Restart**: `pm2 restart vps-engine`
- **Status**: `pm2 status`
