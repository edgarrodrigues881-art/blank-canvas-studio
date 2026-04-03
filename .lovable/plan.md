
## Diagnóstico

O sistema **já tem** muita coisa boa implementada:
- ✅ Workers separados por responsabilidade (7 workers)
- ✅ Semaphore para concorrência
- ✅ Device mutex no mass-inject
- ✅ campaign_device_locks no banco
- ✅ claim_device_send_slot para throttling
- ✅ Limites per-user (10) e global (30) no mass-inject
- ✅ Retry com backoff no warmup

### O PROBLEMA REAL (raiz de tudo)

**Não existe coordenação ENTRE workers.** Cada worker age independentemente:
- O **campaign-worker** pode usar o device X ao mesmo tempo que o **mass-inject-worker**
- O **warmup** pode disparar interações no device X enquanto uma campanha roda nele
- O **group-interaction** pode usar o device X simultaneamente

Isso causa: conflitos de API, rate limits, desconexões, comportamento errático.

## Plano de Implementação (3 fases)

### Fase 1: Device Lock Global (CRÍTICO — resolve 80% dos problemas)

Criar um **mapa de locks global no processo Node** que TODOS os workers consultam antes de usar um device:

```
DeviceLockManager:
  - acquireLock(deviceId, workerType, taskId) → boolean
  - releaseLock(deviceId, taskId)
  - isLocked(deviceId) → { locked: boolean, by: string }
  - getActiveDevices() → Map
```

**Regras:**
- 1 tarefa pesada por device por vez (campanha, mass-inject, warmup-interaction)
- Tarefas leves (status check, heartbeat) sempre passam
- Worker que não consegue lock → agenda retry em 30s

**Impacto:** Zero mudança no frontend, zero mudança no banco, zero risco de quebrar algo.

### Fase 2: Campaign Worker Multi-Campaign

Hoje o campaign-worker processa **1 campanha por vez** sequencialmente. Mudar para:
- Processar até 5 campanhas em paralelo (desde que em devices diferentes)
- Usar o DeviceLockManager da Fase 1
- Quando 2 campanhas usam o mesmo device → uma espera

### Fase 3: Melhorar Status e Logs

- Adicionar status "waiting_device_lock" nas campanhas e mass-inject
- Mostrar no frontend: "Aguardando: device X está sendo usado pelo aquecimento"
- Log estruturado com motivo exato de cada espera/falha

## O que NÃO fazer agora

- ❌ Criar nova tabela de jobs genérica (já existe warmup_jobs + campaign_contacts + mass_inject_contacts — cada um com suas especificidades)
- ❌ Reescrever tudo do zero (o código atual é funcional, só falta coordenação entre workers)
- ❌ Mudar a arquitetura de polling (funciona bem para a escala atual)
