// ══════════════════════════════════════════════════════════
// VPS Engine — Warmup Instance Health Scoring (observability only)
// Backend-only, in-memory. Does NOT block or modify send flow.
// ══════════════════════════════════════════════════════════

interface HealthData {
  success: number;
  fail: number;
  lastErrors: number[]; // 0 = success, 1 = fail (last 20)
  lastUpdate: number;
}

const instanceHealth = new Map<string, HealthData>();
const MAX_RECENT = 20;

export function registerSendResult(instanceId: string, success: boolean): void {
  if (!instanceId) return;
  if (!instanceHealth.has(instanceId)) {
    instanceHealth.set(instanceId, {
      success: 0,
      fail: 0,
      lastErrors: [],
      lastUpdate: Date.now(),
    });
  }
  const data = instanceHealth.get(instanceId)!;
  if (success) {
    data.success++;
    data.lastErrors.push(0);
  } else {
    data.fail++;
    data.lastErrors.push(1);
  }
  if (data.lastErrors.length > MAX_RECENT) {
    data.lastErrors.shift();
  }
  data.lastUpdate = Date.now();
}

export function getHealthScore(instanceId: string): number {
  const data = instanceHealth.get(instanceId);
  if (!data) return 100;
  const total = data.success + data.fail;
  if (total === 0) return 100;
  const successRate = data.success / total;
  const recentErrors = data.lastErrors.reduce((a, b) => a + b, 0);
  const penalty = recentErrors * 2;
  let score = Math.floor(successRate * 100 - penalty);
  if (score < 0) score = 0;
  if (score > 100) score = 100;
  return score;
}

export function getHealthStatus(score: number): "good" | "ok" | "warning" | "critical" {
  if (score >= 80) return "good";
  if (score >= 60) return "ok";
  if (score >= 40) return "warning";
  return "critical";
}

export function logHealth(instanceId: string): void {
  try {
    const data = instanceHealth.get(instanceId);
    const score = getHealthScore(instanceId);
    const status = getHealthStatus(score);
    const success = data?.success || 0;
    const fail = data?.fail || 0;
    const lastErrors = data?.lastErrors ? [...data.lastErrors] : [];
    const total = success + fail;
    const timestamp = Date.now();

    console.log("WARMUP_HEALTH", {
      instanceId,
      score,
      status,
      success,
      fail,
      total,
      lastErrors,
      timestamp,
    });

    if (score < 50) {
      console.log("WARMUP_HEALTH_ALERT", {
        instanceId,
        score,
        status,
      });
    }
  } catch {}
}

export function trackSendResult(instanceId: string, success: boolean): void {
  try {
    registerSendResult(instanceId, success);
    logHealth(instanceId);
  } catch {}
}
