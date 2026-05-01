// ══════════════════════════════════════════════════════════
// VPS Engine — Warmup Instance Recovery Tracker (observability)
// In-memory only. Tracks streaks of stable/improving health scores
// to allow gradual relaxation of throttle/defer when conditions improve.
// Fully fail-safe: any error → behaves as "not recovered".
// ══════════════════════════════════════════════════════════

import { getHealthScore } from "./warmup-health";

interface RecoveryState {
  lastScore: number;
  stableCount: number;
  lastUpdate: number;
}

const recoveryState = new Map<string, RecoveryState>();

const STABLE_THRESHOLD = 5;
const MIN_RECOVERED_SCORE = 60;

export function trackRecovery(instanceId: string): RecoveryState | null {
  try {
    if (!instanceId) return null;
    const score = getHealthScore(instanceId);

    if (!recoveryState.has(instanceId)) {
      recoveryState.set(instanceId, {
        lastScore: score,
        stableCount: 0,
        lastUpdate: Date.now(),
      });
    }

    const state = recoveryState.get(instanceId)!;

    if (score >= state.lastScore) {
      state.stableCount++;
    } else {
      state.stableCount = 0;
    }

    state.lastScore = score;
    state.lastUpdate = Date.now();

    return state;
  } catch {
    return null;
  }
}

export function isRecovered(instanceId: string): boolean {
  try {
    const state = recoveryState.get(instanceId);
    if (!state) return false;
    return state.stableCount >= STABLE_THRESHOLD && state.lastScore >= MIN_RECOVERED_SCORE;
  } catch {
    return false;
  }
}

export function logRecovery(instanceId: string): void {
  try {
    console.log("WARMUP_RECOVERY", {
      instanceId,
      score: getHealthScore(instanceId),
      recovered: isRecovered(instanceId),
    });
  } catch {}
}
