// ══════════════════════════════════════════════════════════
// VPS Engine — Per-Instance Circuit Breaker
// Prevents hammering a UAZAPI instance that is failing,
// giving it time to recover before retrying.
// States: CLOSED (normal) → OPEN (blocked) → HALF_OPEN (probing)
// ══════════════════════════════════════════════════════════

import { createLogger } from "./logger";

const log = createLogger("circuit-breaker");

interface CircuitState {
  failures: number;
  state: "closed" | "open" | "half_open";
  openedAt: number;
  lastFailureAt: number;
  lastError: string;
}

const DEFAULT_FAILURE_THRESHOLD = 3;   // consecutive failures to open
const DEFAULT_COOLDOWN_MS = 15_000;    // 15s cooldown when open (was 120s — too aggressive)
const MAX_COOLDOWN_MS = 60_000;        // 60s max cooldown (was 600s)

const circuits = new Map<string, CircuitState>();

function getKey(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "").toLowerCase();
}

/**
 * Check if a request to this instance is allowed.
 * Returns { allowed: true } or { allowed: false, reason, retryInMs }.
 */
export function canRequest(baseUrl: string): { allowed: true } | { allowed: false; reason: string; retryInMs: number } {
  const key = getKey(baseUrl);
  const circuit = circuits.get(key);
  if (!circuit || circuit.state === "closed") return { allowed: true };

  if (circuit.state === "half_open") return { allowed: true }; // allow probe

  // State is OPEN — check if cooldown elapsed
  const cooldownMs = Math.min(
    DEFAULT_COOLDOWN_MS * Math.pow(2, Math.max(0, Math.floor(circuit.failures / DEFAULT_FAILURE_THRESHOLD) - 1)),
    MAX_COOLDOWN_MS,
  );
  const elapsed = Date.now() - circuit.openedAt;

  if (elapsed >= cooldownMs) {
    circuit.state = "half_open";
    log.info(`🔄 Circuit HALF_OPEN for ${key.slice(0, 40)}… (probing after ${Math.round(elapsed / 1000)}s cooldown)`);
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `circuit open: ${circuit.failures} failures, last: ${circuit.lastError}`,
    retryInMs: cooldownMs - elapsed,
  };
}

/**
 * Record a successful API call — resets the circuit.
 */
export function recordSuccess(baseUrl: string): void {
  const key = getKey(baseUrl);
  const circuit = circuits.get(key);
  if (!circuit) return;

  if (circuit.state === "half_open") {
    log.info(`✅ Circuit CLOSED for ${key.slice(0, 40)}… (recovered)`);
  }
  circuits.delete(key);
}

/**
 * Record a failed API call — may trip the circuit open.
 */
export function recordFailure(baseUrl: string, error: string): void {
  const key = getKey(baseUrl);
  const circuit = circuits.get(key) || {
    failures: 0,
    state: "closed" as const,
    openedAt: 0,
    lastFailureAt: 0,
    lastError: "",
  };

  circuit.failures++;
  circuit.lastFailureAt = Date.now();
  circuit.lastError = error.slice(0, 120);

  if (circuit.state === "half_open") {
    // Probe failed — back to open
    circuit.state = "open";
    circuit.openedAt = Date.now();
    log.warn(`🔴 Circuit re-OPENED for ${key.slice(0, 40)}… (probe failed: ${circuit.lastError})`);
  } else if (circuit.failures >= DEFAULT_FAILURE_THRESHOLD && circuit.state === "closed") {
    circuit.state = "open";
    circuit.openedAt = Date.now();
    log.warn(`🔴 Circuit OPENED for ${key.slice(0, 40)}… after ${circuit.failures} failures (${circuit.lastError})`);
  }

  circuits.set(key, circuit);
}

/**
 * Get status for all circuits (for health endpoint).
 */
export function getCircuitBreakerStats() {
  const stats: Array<{ instance: string; state: string; failures: number; lastError: string; cooldownRemaining?: number }> = [];
  for (const [key, circuit] of circuits) {
    if (circuit.state === "closed" && circuit.failures === 0) continue;
    const entry: any = {
      instance: key.slice(0, 50),
      state: circuit.state,
      failures: circuit.failures,
      lastError: circuit.lastError,
    };
    if (circuit.state === "open") {
      const cooldownMs = Math.min(
        DEFAULT_COOLDOWN_MS * Math.pow(2, Math.max(0, Math.floor(circuit.failures / DEFAULT_FAILURE_THRESHOLD) - 1)),
        MAX_COOLDOWN_MS,
      );
      entry.cooldownRemaining = Math.max(0, Math.round((cooldownMs - (Date.now() - circuit.openedAt)) / 1000));
    }
    stats.push(entry);
  }
  return stats;
}
