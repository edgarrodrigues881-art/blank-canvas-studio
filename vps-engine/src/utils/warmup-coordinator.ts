// ══════════════════════════════════════════════════════════
// VPS Engine — Warmup cross-instance coordinator (in-memory)
// Avoids simultaneous sends across chips and repeated target
// patterns. Pure best-effort: any failure → allow the send.
// No DB, no schema changes, no scheduling changes.
// ══════════════════════════════════════════════════════════

const activeSenders = new Map<string, number>();        // instanceId → lastSendAt
const recentGlobalTargets = new Map<string, number>();  // jid/phone → lastUsedAt

// Per-instance spacing window: random 5–12s between any two sends globally
const MIN_SEND_GAP_MS = 5_000;
const MAX_SEND_GAP_MS = 12_000;

// Target reuse window: random 10–20 minutes
const MIN_TARGET_REUSE_MS = 10 * 60 * 1000;
const MAX_TARGET_REUSE_MS = 20 * 60 * 1000;

// Hard expiration sweeps
const SENDER_EXPIRATION_MS = 60 * 1000;       // 1min
const TARGET_EXPIRATION_MS = 30 * 60 * 1000;  // 30min
const SWEEP_INTERVAL_MS = 60 * 1000;

let lastSweepAt = 0;

function maybeSweep(now: number) {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  for (const [k, t] of activeSenders) {
    if (now - t > SENDER_EXPIRATION_MS) activeSenders.delete(k);
  }
  for (const [k, t] of recentGlobalTargets) {
    if (now - t > TARGET_EXPIRATION_MS) recentGlobalTargets.delete(k);
  }
}

function randBetween(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min));
}

/**
 * canSendNow(instanceId)
 * Returns false if ANY instance fired a send within the last 5–12s window.
 * The window is randomized per-check to avoid detectable cadence.
 * Fail-safe: on any error, return true.
 */
export function canSendNow(instanceId: string): boolean {
  try {
    const now = Date.now();
    maybeSweep(now);

    const window = randBetween(MIN_SEND_GAP_MS, MAX_SEND_GAP_MS);
    let mostRecent = 0;
    for (const t of activeSenders.values()) {
      if (t > mostRecent) mostRecent = t;
    }

    if (mostRecent > 0 && now - mostRecent < window) {
      return false;
    }
    return true;
  } catch {
    return true; // fail-safe
  }
}

/**
 * registerSend(instanceId, jid)
 * Marks the instance as having just sent, and the target as recently used.
 */
export function registerSend(instanceId: string, jid: string): void {
  try {
    const now = Date.now();
    activeSenders.set(instanceId, now);
    if (jid) recentGlobalTargets.set(jid, now);
  } catch {
    // ignore
  }
}

/**
 * isTargetRecentlyUsed(jid)
 * Returns true if jid was used by ANY instance within last 10–20min.
 * Window is randomized per-check. Fail-safe: on error → false (allow).
 */
export function isTargetRecentlyUsed(jid: string): boolean {
  try {
    if (!jid) return false;
    const now = Date.now();
    maybeSweep(now);

    const last = recentGlobalTargets.get(jid);
    if (!last) return false;

    const window = randBetween(MIN_TARGET_REUSE_MS, MAX_TARGET_REUSE_MS);
    return now - last < window;
  } catch {
    return false;
  }
}
