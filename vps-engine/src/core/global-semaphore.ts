// ══════════════════════════════════════════════════════════
// VPS Engine — Global Concurrency Semaphore (v2)
// Limits total concurrent heavy operations across all devices.
// Prevents API overload while allowing parallelism between devices.
// ══════════════════════════════════════════════════════════

import { createLogger } from "./logger";

const log = createLogger("global-semaphore");

const MAX_CONCURRENT = 3; // max heavy operations running at once
const WAIT_POLL_MS = 1_000; // poll interval when waiting for a slot
const MAX_WAIT_MS = 60_000; // give up after 60s waiting

let activeCount = 0;
let waitingCount = 0;
const activeLabels = new Set<string>();

/**
 * Acquire a global slot. Waits if all slots are taken.
 * Only heavy operations should call this (campaigns, mass-inject, group-join).
 */
export async function acquireGlobalSlot(label: string): Promise<void> {
  if (activeCount < MAX_CONCURRENT) {
    activeCount++;
    activeLabels.add(label);
    log.info(`Slot acquired: "${label}" (${activeCount}/${MAX_CONCURRENT} active)`);
    return;
  }

  // Wait for a slot to free up
  waitingCount++;
  log.info(`Slot full — "${label}" waiting (${waitingCount} in queue, ${activeCount}/${MAX_CONCURRENT} active)`);
  const start = Date.now();

  while (activeCount >= MAX_CONCURRENT) {
    if (Date.now() - start > MAX_WAIT_MS) {
      waitingCount--;
      log.warn(`Slot wait timeout for "${label}" after ${MAX_WAIT_MS / 1000}s — proceeding anyway`);
      // Still acquire to avoid deadlock — just log the overflow
      activeCount++;
      activeLabels.add(label);
      return;
    }
    await new Promise(r => setTimeout(r, WAIT_POLL_MS));
  }

  waitingCount--;
  activeCount++;
  activeLabels.add(label);
  log.info(`Slot acquired after wait: "${label}" (${activeCount}/${MAX_CONCURRENT} active, waited ${Math.round((Date.now() - start) / 1000)}s)`);
}

/**
 * Release a global slot.
 */
export function releaseGlobalSlot(label: string): void {
  if (activeCount > 0) activeCount--;
  activeLabels.delete(label);
  log.info(`Slot released: "${label}" (${activeCount}/${MAX_CONCURRENT} active, ${waitingCount} waiting)`);
}

/**
 * Get current semaphore stats (for health endpoint).
 */
export function getGlobalConcurrencyStats() {
  return {
    active: activeCount,
    waiting: waitingCount,
    max: MAX_CONCURRENT,
    labels: Array.from(activeLabels),
  };
}
