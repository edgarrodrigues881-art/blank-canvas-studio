// ══════════════════════════════════════════════════════════
// VPS Engine — Device Concurrency Manager (v3)
// Category-based concurrency: allows safe parallelism,
// blocks only conflicting heavy operations on the same device.
// ══════════════════════════════════════════════════════════

import { createLogger } from "./logger";

const log = createLogger("device-lock");

// ── Resource categories ──
export type ResourceCategory =
  | "messaging_heavy"   // campaigns, mass dispatch
  | "group_heavy"       // mass-inject, group-join
  | "group_interaction" // group interaction (lighter, per-group)
  | "chip_conversation" // chip-to-chip messaging
  | "warmup"            // warmup jobs
  | "welcome"           // welcome automation
  | "monitoring"        // heartbeats, status checks
  | "sync_light";       // device sync, queue reads

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

// ── Worker → Category mapping ──
const WORKER_CATEGORY: Record<WorkerType, ResourceCategory> = {
  campaign: "messaging_heavy",
  mass_inject: "group_heavy",
  warmup: "warmup",
  group_interaction: "group_interaction",
  chip_conversation: "chip_conversation",
  group_join: "group_heavy",
  welcome: "welcome",
  welcome_monitor: "monitoring",
  welcome_send: "messaging_heavy",
};

// ── Light categories that NEVER block and are NEVER blocked ──
const LIGHT_CATEGORIES = new Set<ResourceCategory>(["monitoring", "sync_light", "welcome", "warmup"]);

// ── Conflict matrix ──
// Only listed pairs are BLOCKED from running together on the same device.
const CONFLICTS: Array<[ResourceCategory, ResourceCategory]> = [
  // Two heavy messaging tasks conflict
  ["messaging_heavy", "messaging_heavy"],
  // Two heavy group tasks conflict
  ["group_heavy", "group_heavy"],
  // Heavy messaging + heavy group = too much API load
  ["messaging_heavy", "group_heavy"],
  // Campaign + chip conversation = both send messages aggressively
  ["messaging_heavy", "chip_conversation"],
  // Group heavy + group interaction = both hit group APIs
  ["group_heavy", "group_interaction"],
  // Group heavy + chip conversation
  ["group_heavy", "chip_conversation"],
];

// Build a fast lookup set
const conflictSet = new Set<string>();
for (const [a, b] of CONFLICTS) {
  conflictSet.add(`${a}::${b}`);
  conflictSet.add(`${b}::${a}`);
}

function categoriesConflict(a: ResourceCategory, b: ResourceCategory): boolean {
  return conflictSet.has(`${a}::${b}`);
}

// ── Lock info ──
export interface DeviceLockInfo {
  deviceId: string;
  workerType: WorkerType;
  category: ResourceCategory;
  taskId: string;
  acquiredAt: number;
  label: string;
}

// ── Worker labels (PT-BR) ──
const WORKER_LABELS: Record<WorkerType, string> = {
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

/**
 * Category-based device concurrency manager (Singleton).
 * Multiple tasks CAN run on the same device if their categories don't conflict.
 * Only truly incompatible heavy operations are blocked.
 * Light categories (monitoring, sync, warmup, welcome) are never blocked.
 */
class DeviceLockManagerImpl {
  // deviceId → Map<taskId, LockInfo>
  private locks = new Map<string, Map<string, DeviceLockInfo>>();

  /**
   * Try to acquire a slot on a device. Non-blocking.
   * Returns true if acquired (no conflicting category running).
   * Light categories always succeed.
   */
  tryAcquire(deviceId: string, workerType: WorkerType, taskId: string, label?: string): boolean {
    const category = WORKER_CATEGORY[workerType];

    if (!this.locks.has(deviceId)) this.locks.set(deviceId, new Map());
    const deviceLocks = this.locks.get(deviceId)!;

    // Idempotent: same task re-acquiring
    if (deviceLocks.has(taskId)) return true;

    // Light categories never block and are never blocked
    if (!LIGHT_CATEGORIES.has(category)) {
      // Check for conflicts with existing locks
      for (const existing of deviceLocks.values()) {
        if (LIGHT_CATEGORIES.has(existing.category)) continue; // skip light locks
        if (categoriesConflict(category, existing.category)) {
          log.warn(
            `Lock DENIED: device=${deviceId.slice(0, 8)} ${workerType}:${taskId.slice(0, 8)} [${category}] conflicts with ${existing.workerType}:${existing.taskId.slice(0, 8)} [${existing.category}]`
          );
          return false;
        }
      }
    }

    deviceLocks.set(taskId, {
      deviceId,
      workerType,
      category,
      taskId,
      acquiredAt: Date.now(),
      label: label || `${workerType}:${taskId.slice(0, 8)}`,
    });

    log.info(`Lock acquired: device=${deviceId.slice(0, 8)} by ${workerType}:${taskId.slice(0, 8)} [${category}]`);
    return true;
  }

  /**
   * Release a lock on a device.
   */
  release(deviceId: string, taskId: string): void {
    const deviceLocks = this.locks.get(deviceId);
    if (!deviceLocks) return;

    const existing = deviceLocks.get(taskId);
    if (!existing) return;

    deviceLocks.delete(taskId);
    if (deviceLocks.size === 0) this.locks.delete(deviceId);

    const elapsed = Math.round((Date.now() - existing.acquiredAt) / 1000);
    log.info(`Lock released: device=${deviceId.slice(0, 8)} by ${existing.workerType}:${taskId.slice(0, 8)} (held ${elapsed}s)`);
  }

  /**
   * Force-release all locks for a device (stale cleanup).
   */
  forceRelease(deviceId: string): void {
    const deviceLocks = this.locks.get(deviceId);
    if (!deviceLocks) return;
    for (const info of deviceLocks.values()) {
      log.warn(`Force-releasing stale lock: device=${deviceId.slice(0, 8)} by ${info.workerType}:${info.taskId.slice(0, 8)} [${info.category}] held ${Math.round((Date.now() - info.acquiredAt) / 1000)}s`);
    }
    this.locks.delete(deviceId);
  }

  /**
   * Check if a device is available for a specific worker type.
   */
  isAvailableFor(deviceId: string, workerType: WorkerType): boolean {
    const category = WORKER_CATEGORY[workerType];
    if (LIGHT_CATEGORIES.has(category)) return true;

    const deviceLocks = this.locks.get(deviceId);
    if (!deviceLocks || deviceLocks.size === 0) return true;

    for (const existing of deviceLocks.values()) {
      if (LIGHT_CATEGORIES.has(existing.category)) continue;
      if (categoriesConflict(category, existing.category)) return false;
    }
    return true;
  }

  /**
   * Check if device has any heavy locks.
   */
  isAvailable(deviceId: string): boolean {
    const deviceLocks = this.locks.get(deviceId);
    if (!deviceLocks || deviceLocks.size === 0) return true;
    // Available if only light categories are held
    for (const lock of deviceLocks.values()) {
      if (!LIGHT_CATEGORIES.has(lock.category)) return false;
    }
    return true;
  }

  /**
   * Get blocking reason string for a specific worker type.
   */
  getBlockingReason(deviceId: string, workerType: WorkerType): string | null {
    const category = WORKER_CATEGORY[workerType];
    if (LIGHT_CATEGORIES.has(category)) return null;

    const deviceLocks = this.locks.get(deviceId);
    if (!deviceLocks || deviceLocks.size === 0) return null;

    for (const existing of deviceLocks.values()) {
      if (LIGHT_CATEGORIES.has(existing.category)) continue;
      if (categoriesConflict(category, existing.category)) {
        return `${WORKER_LABELS[existing.workerType]} [${existing.category}] em execução`;
      }
    }
    return null;
  }

  /**
   * Get lock reason (any heavy lock) — backward compat.
   */
  getLockReason(deviceId: string): string | null {
    const deviceLocks = this.locks.get(deviceId);
    if (!deviceLocks || deviceLocks.size === 0) return null;
    const heavy = Array.from(deviceLocks.values()).filter(i => !LIGHT_CATEGORIES.has(i.category));
    if (heavy.length === 0) return null;
    return heavy.map(i => `${WORKER_LABELS[i.workerType]} [${i.category}]`).join(", ");
  }

  /**
   * Get all active lock infos for a device.
   */
  getLockInfo(deviceId: string): DeviceLockInfo[] {
    const deviceLocks = this.locks.get(deviceId);
    if (!deviceLocks) return [];
    return Array.from(deviceLocks.values());
  }

  /**
   * Get all active locks (for health endpoint).
   */
  getActiveLocks(): DeviceLockInfo[] {
    const all: DeviceLockInfo[] = [];
    for (const deviceLocks of this.locks.values()) {
      for (const info of deviceLocks.values()) {
        all.push(info);
      }
    }
    return all;
  }

  /**
   * Get count of locks by worker type.
   */
  getLocksByWorker(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const deviceLocks of this.locks.values()) {
      for (const lock of deviceLocks.values()) {
        counts[lock.workerType] = (counts[lock.workerType] || 0) + 1;
      }
    }
    return counts;
  }

  /**
   * Cleanup stale locks (safety net — locks held > maxAge).
   */
  cleanupStaleLocks(maxAgeMs: number = 30 * 60_000): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [deviceId, deviceLocks] of this.locks) {
      for (const [taskId, info] of deviceLocks) {
        if (now - info.acquiredAt > maxAgeMs) {
          log.warn(`Cleaning stale lock: device=${deviceId.slice(0, 8)} by ${info.workerType}:${taskId.slice(0, 8)} held ${Math.round((now - info.acquiredAt) / 1000)}s`);
          deviceLocks.delete(taskId);
          cleaned++;
        }
      }
      if (deviceLocks.size === 0) this.locks.delete(deviceId);
    }
    if (cleaned > 0) {
      log.warn(`Cleaned ${cleaned} stale device locks (maxAge=${Math.round(maxAgeMs / 60_000)}min)`);
    }
    return cleaned;
  }
}

// Singleton
export const DeviceLockManager = new DeviceLockManagerImpl();
