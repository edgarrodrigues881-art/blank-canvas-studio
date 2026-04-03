// ══════════════════════════════════════════════════════════
// VPS Engine — Global Concurrency Semaphore (NO-OP)
// All restrictions removed — operations run freely in parallel.
// Functions kept as no-ops to avoid breaking callers.
// ══════════════════════════════════════════════════════════

let activeCount = 0;

/** No-op — always resolves immediately. */
export async function acquireGlobalSlot(_label: string): Promise<void> {
  activeCount++;
}

/** No-op — just decrements the counter for stats. */
export function releaseGlobalSlot(_label: string): void {
  if (activeCount > 0) activeCount--;
}

/** Stats only — no enforcement. */
export function getGlobalConcurrencyStats() {
  return {
    active: activeCount,
    waiting: 0,
    max: Infinity,
  };
}
