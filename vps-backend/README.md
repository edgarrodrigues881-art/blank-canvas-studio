# vps-backend

Backend Node.js rodando na VPS para substituir Edge Functions do Supabase.
Substitui workers em background (cron) e endpoints HTTP que hoje vivem em
`supabase/functions/`.

> **Aviso**: o projeto `vps-engine/` (TypeScript) já existe e contém
> workers de warmup, campanhas, mass-inject, sync-conversations etc.
> Este `vps-backend/` é uma estrutura nova/limpa em JavaScript pronta
> para receber a próxima leva de migrações. Avaliar consolidação.

## Stack
- Node.js 20+ (ES Modules)
- Express
- node-cron
- axios
- pino (logger)
- @supabase/supabase-js

## Estrutura
```
src/
├── server.js          # entrypoint (porta 3000)
├── workers/           # jobs em background (registrados via cron ou HTTP)
├── cron/              # node-cron schedulers
├── services/          # integrações externas (supabase, uazapi, etc.)
├── routes/            # endpoints HTTP Express
└── utils/             # logger e helpers
```

## Setup
1. `cp .env.example .env` e preencher:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `VPS_BASE_URL`
2. `npm install`
3. `npm start` (produção) ou `npm run dev` (watch mode)

## Health check
`GET /health` → `{ "status": "ok" }`

## Como adicionar um novo worker
```js
// src/workers/meu-worker.js
import { createLogger, runJob } from "../utils/logger.js";
const log = createLogger("meu-worker");
export async function meuWorkerTick() {
  return runJob("meu-worker", log, async () => {
    // ... lógica
    return { processed: 0 };
  });
}

// src/cron/index.js → dentro de registerCronJobs()
import cron from "node-cron";
import { meuWorkerTick } from "../workers/meu-worker.js";
cron.schedule("* * * * *", () => meuWorkerTick().catch(() => {}));
```

## Deploy na VPS
```bash
git pull
npm install --production
pm2 restart vps-backend  # ou: pm2 start src/server.js --name vps-backend
```
