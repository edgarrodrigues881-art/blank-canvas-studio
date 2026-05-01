// ══════════════════════════════════════════════════════════
// VPS Engine — Per-instance daily volume control & ramp-up
// In-memory only. No DB writes, no schema, no scheduling changes.
// Pure pre-dispatch gate. Fail-safe → on any error, allow send.
// ══════════════════════════════════════════════════════════

export type WarmupChipKind = "novo" | "recuperado" | "fraco";

interface InstanceStats {
  // Identity / reset key (changes when QR reconnects → new cycle)
  cycleKey: string;
  // Day currently tracked for this instance
  day: number;
  // ISO timestamp when the day was first observed (informational)
  dayStartTimestamp: number;
  // Counter for current day
  sentToday: number;
  // Frozen daily limit chosen for this day (random within range, kept stable)
  dailyLimit: number;
  // Last reset timestamp (when day rolled over)
  lastReset: number;
}

const perInstanceStats = new Map<string, InstanceStats>();

// ──────────────────────────────────────────
// Chip-type mapping (cycle.chip_state → user-facing labels)
// "new" → novo
// "recovered" → recuperado
// "unstable" / "weak" → fraco
// ──────────────────────────────────────────
export function mapChipKind(chipState: string | null | undefined): WarmupChipKind {
  const s = (chipState || "new").toLowerCase();
  if (s === "recovered" || s === "recuperado") return "recuperado";
  if (s === "unstable" || s === "weak" || s === "fraco") return "fraco";
  return "novo";
}

// Daily limit ranges per chip kind, indexed by day (1-based).
// Day 1 = 0 (protection window). Day 5+ uses the day-5 range.
const LIMIT_RANGES: Record<WarmupChipKind, Array<[number, number]>> = {
  novo: [
    [0, 0],     // day 1
    [10, 15],   // day 2
    [15, 25],   // day 3
    [20, 30],   // day 4
    [25, 35],   // day 5+
  ],
  recuperado: [
    [0, 0],
    [5, 10],
    [10, 15],
    [15, 20],
    [20, 25],
  ],
  fraco: [
    [0, 0],
    [3, 5],
    [5, 8],
    [8, 12],
    [10, 15],
  ],
};

function rangeForDay(kind: WarmupChipKind, day: number): [number, number] {
  const table = LIMIT_RANGES[kind];
  const safeDay = Math.max(1, Math.floor(day || 1));
  const idx = Math.min(safeDay - 1, table.length - 1);
  return table[idx];
}

function pickLimit(kind: WarmupChipKind, day: number): number {
  const [lo, hi] = rangeForDay(kind, day);
  if (hi <= lo) return lo;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

// ──────────────────────────────────────────
// Public API
// ──────────────────────────────────────────

export interface VolumeContext {
  instanceId: string;       // device_id
  cycleKey: string;         // cycle.id (changes if QR reconnect → new cycle)
  day: number;              // cycle.day_index (1-based)
  chipState: string;        // cycle.chip_state
}

/** Compute current day from existing cycle data (already day-1 indexed). */
export function getCurrentDay(ctx: { day: number }): number {
  return Math.max(1, Math.floor(ctx.day || 1));
}

/** Returns the daily numeric limit for (chipKind, day) — randomized per-day. */
export function getDailyLimit(chipKind: WarmupChipKind, day: number): number {
  return pickLimit(chipKind, day);
}

function ensureStats(ctx: VolumeContext): InstanceStats {
  const kind = mapChipKind(ctx.chipState);
  const day = getCurrentDay(ctx);
  const existing = perInstanceStats.get(ctx.instanceId);

  // Reset triggers:
  //  - first time seeing this instance
  //  - cycleKey changed (QR reconnected → new warmup_cycles row)
  //  - day_index advanced
  if (!existing || existing.cycleKey !== ctx.cycleKey || existing.day !== day) {
    const fresh: InstanceStats = {
      cycleKey: ctx.cycleKey,
      day,
      dayStartTimestamp: Date.now(),
      sentToday: 0,
      dailyLimit: getDailyLimit(kind, day),
      lastReset: Date.now(),
    };
    perInstanceStats.set(ctx.instanceId, fresh);
    return fresh;
  }
  return existing;
}

/**
 * canSendToday(ctx) → boolean
 * Returns false when day-1 protection or daily cap reached. Fail-safe → true.
 */
export function canSendToday(ctx: VolumeContext): { allowed: boolean; sentToday: number; limit: number; day: number } {
  try {
    const stats = ensureStats(ctx);
    const allowed = stats.sentToday < stats.dailyLimit;
    return { allowed, sentToday: stats.sentToday, limit: stats.dailyLimit, day: stats.day };
  } catch {
    return { allowed: true, sentToday: 0, limit: 9999, day: ctx.day || 1 };
  }
}

/** Increments the counter after a successful send. */
export function registerDailySend(ctx: VolumeContext): void {
  try {
    const stats = ensureStats(ctx);
    stats.sentToday += 1;
  } catch {
    // ignore
  }
}
