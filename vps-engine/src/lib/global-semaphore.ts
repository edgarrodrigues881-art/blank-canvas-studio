// ══════════════════════════════════════════════════════════
// VPS Engine — Global Concurrency Semaphore (Singleton)
// Shared across ALL heavy workers to prevent VPS overload.
// Complements (does NOT replace) the DeviceLockManager.
// ══════════════════════════════════════════════════════════

import { Semaphore } from "./concurrency";
import { config } from "../config";
import { createLogger } from "./logger";

const log = createLogger("global-sem");

const globalSem = new Semaphore(config.maxConcurrentDevices);

/**
 * Acquire a global slot before heavy work.
 * Logs when a task has to wait.
 */
export async function acquireGlobalSlot(label: string): Promise<void> {
  if (globalSem.active >= config.maxConcurrentDevices) {
    log.info(`⏳ ${label} — waiting for global slot (${globalSem.active}/${config.maxConcurrentDevices} active, ${globalSem.waiting} queued)`);
  }
  await globalSem.acquire();
  log.info(`✅ ${label} — global slot acquired (${globalSem.active}/${config.maxConcurrentDevices} active)`);
}

/**
 * Release a global slot after heavy work completes.
 */
export function releaseGlobalSlot(label: string): void {
  globalSem.release();
  log.info(`🔓 ${label} — global slot released (${globalSem.active}/${config.maxConcurrentDevices} active)`);
}

/**
 * Get current global concurrency stats (for health endpoint).
 */
export function getGlobalConcurrencyStats() {
  return {
    active: globalSem.active,
    waiting: globalSem.waiting,
    max: config.maxConcurrentDevices,
  };
}
