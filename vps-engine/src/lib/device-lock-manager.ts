// ══════════════════════════════════════════════════════════
// VPS Engine — Global Device Lock Manager
// Prevents concurrent heavy operations on the same device
// across ALL workers (campaigns, mass-inject, warmup, etc.)
// ══════════════════════════════════════════════════════════

import { createLogger } from "./logger";

const log = createLogger("device-lock");

export type WorkerType =
  | "campaign"
  | "mass_inject"
  | "warmup"
  | "group_interaction"
  | "chip_conversation"
  | "group_join"
  | "welcome"
  | "welcome_monitor"
  | "welcome_send";

export interface DeviceLockInfo {
  deviceId: string;
  workerType: WorkerType;
  taskId: string;
  acquiredAt: number;
  label: string;
}

/**
 * Global in-process lock manager.
 * Ensures only ONE heavy operation runs per device at any time.
 * Light operations (status checks, heartbeats) bypass this.
 */
class DeviceLockManagerImpl {
  private locks = new Map<string, DeviceLockInfo>();
  private waiters = new Map<string, Array<{ resolve: (acquired: boolean) => void; workerType: WorkerType; taskId: string }>>();

  /**
   * Try to acquire a lock on a device. Non-blocking.
   * Returns true if lock acquired, false if device is busy.
   */
  tryAcquire(deviceId: string, workerType: WorkerType, taskId: string, label?: string): boolean {
    const existing = this.locks.get(deviceId);
    if (existing) {
      // Same task re-acquiring (idempotent)
      if (existing.taskId === taskId) return true;
      return false;
    }

    this.locks.set(deviceId, {
      deviceId,
      workerType,
      taskId,
      acquiredAt: Date.now(),
      label: label || `${workerType}:${taskId.slice(0, 8)}`,
    });

    log.info(`Lock acquired: device=${deviceId.slice(0, 8)} by ${workerType}:${taskId.slice(0, 8)}`);
    return true;
  }

  /**
   * Wait for a lock with timeout. Returns true if acquired.
   */
  async waitForLock(
    deviceId: string,
    workerType: WorkerType,
    taskId: string,
    timeoutMs: number = 60_000,
    label?: string,
  ): Promise<boolean> {
    // Try immediately
    if (this.tryAcquire(deviceId, workerType, taskId, label)) return true;

    // Wait in queue
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        // Remove from waiters
        const queue = this.waiters.get(deviceId);
        if (queue) {
          const idx = queue.findIndex((w) => w.taskId === taskId);
          if (idx >= 0) queue.splice(idx, 1);
          if (queue.length === 0) this.waiters.delete(deviceId);
        }
        resolve(false);
      }, timeoutMs);

      const waiter = {
        resolve: (acquired: boolean) => {
          clearTimeout(timer);
          resolve(acquired);
        },
        workerType,
        taskId,
      };

      if (!this.waiters.has(deviceId)) this.waiters.set(deviceId, []);
      this.waiters.get(deviceId)!.push(waiter);
    });
  }

  /**
   * Release a lock on a device and notify the next waiter.
   */
  release(deviceId: string, taskId: string): void {
    const existing = this.locks.get(deviceId);
    if (!existing) return;
    if (existing.taskId !== taskId) {
      log.warn(`Lock release mismatch: device=${deviceId.slice(0, 8)} held by ${existing.taskId.slice(0, 8)}, release from ${taskId.slice(0, 8)}`);
      return;
    }

    this.locks.delete(deviceId);
    const elapsed = Math.round((Date.now() - existing.acquiredAt) / 1000);
    log.info(`Lock released: device=${deviceId.slice(0, 8)} by ${existing.workerType}:${taskId.slice(0, 8)} (held ${elapsed}s)`);

    // Notify next waiter
    const queue = this.waiters.get(deviceId);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      if (queue.length === 0) this.waiters.delete(deviceId);

      // Try to acquire for the waiter
      if (this.tryAcquire(deviceId, next.workerType, next.taskId)) {
        next.resolve(true);
      } else {
        next.resolve(false);
      }
    }
  }

  /**
   * Force-release a lock (for cleanup of stale locks).
   */
  forceRelease(deviceId: string): void {
    const existing = this.locks.get(deviceId);
    if (!existing) return;
    log.warn(`Force-releasing stale lock: device=${deviceId.slice(0, 8)} held by ${existing.workerType}:${existing.taskId.slice(0, 8)} for ${Math.round((Date.now() - existing.acquiredAt) / 1000)}s`);
    this.locks.delete(deviceId);

    // Notify waiters
    const queue = this.waiters.get(deviceId);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      if (queue.length === 0) this.waiters.delete(deviceId);
      if (this.tryAcquire(deviceId, next.workerType, next.taskId)) {
        next.resolve(true);
      } else {
        next.resolve(false);
      }
    }
  }

  /**
   * Check if a device is locked and by whom.
   */
  getLockInfo(deviceId: string): DeviceLockInfo | null {
    return this.locks.get(deviceId) || null;
  }

  /**
   * Check if device is available for a specific worker.
   */
  isAvailable(deviceId: string): boolean {
    return !this.locks.has(deviceId);
  }

  /**
   * Get lock reason string for UI/logs.
   */
  getLockReason(deviceId: string): string | null {
    const info = this.locks.get(deviceId);
    if (!info) return null;
    const workerLabels: Record<WorkerType, string> = {
      campaign: "Campanha de disparo",
      mass_inject: "Adição em massa",
      warmup: "Aquecimento",
      group_interaction: "Interação de grupo",
      chip_conversation: "Conversa entre chips",
      group_join: "Entrada em grupos",
      welcome: "Boas-vindas",
      welcome_monitor: "Monitor de boas-vindas",
      welcome_send: "Envio de boas-vindas",
    };
    return `${workerLabels[info.workerType]} em execução (${info.label})`;
  }

  /**
   * Get all active locks (for health endpoint).
   */
  getActiveLocks(): DeviceLockInfo[] {
    return Array.from(this.locks.values());
  }

  /**
   * Get count of locks by worker type.
   */
  getLocksByWorker(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const lock of this.locks.values()) {
      counts[lock.workerType] = (counts[lock.workerType] || 0) + 1;
    }
    return counts;
  }

  /**
   * Cleanup stale locks (safety net — locks held > maxAge).
   */
  cleanupStaleLocks(maxAgeMs: number = 30 * 60_000): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [deviceId, info] of this.locks) {
      if (now - info.acquiredAt > maxAgeMs) {
        this.forceRelease(deviceId);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      log.warn(`Cleaned ${cleaned} stale device locks (maxAge=${Math.round(maxAgeMs / 60_000)}min)`);
    }
    return cleaned;
  }
}

// Singleton — shared across all workers in the same Node process
export const DeviceLockManager = new DeviceLockManagerImpl();
