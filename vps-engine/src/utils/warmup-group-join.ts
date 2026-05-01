// ══════════════════════════════════════════════════════════
// Group Join-Grace Tracker
//
// Defers the FIRST message after a group join by a random
// 2–10 minutes window to avoid the "join → immediate message"
// bot pattern. Subsequent messages are NOT delayed.
//
// In-memory only. Fail-safe (any error → allow send).
// ══════════════════════════════════════════════════════════

const MIN_GRACE_MS = 2 * 60 * 1000;   // 2 min
const MAX_GRACE_MS = 10 * 60 * 1000;  // 10 min

interface JoinState {
  /** Joined-at epoch ms (DB joined_at preferred; falls back to first-seen) */
  joinedAt: number;
  /** Random grace window picked once per (instance, group) */
  graceMs: number;
  /** True after the first warmup message has been successfully sent */
  initialized: boolean;
}

// Key: `${instanceId}::${groupId}` (groupId is stable; group_jid may be empty)
const joinState = new Map<string, JoinState>();

function rand(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function keyOf(instanceId: string, groupId: string): string {
  return `${instanceId}::${groupId}`;
}

function ensureState(instanceId: string, groupId: string, joinedAtIso?: string | null): JoinState {
  const k = keyOf(instanceId, groupId);
  const existing = joinState.get(k);
  if (existing) return existing;
  let joinedAt = Date.now();
  if (joinedAtIso) {
    const parsed = Date.parse(joinedAtIso);
    if (!isNaN(parsed)) joinedAt = parsed;
  }
  const fresh: JoinState = {
    joinedAt,
    graceMs: rand(MIN_GRACE_MS, MAX_GRACE_MS),
    initialized: false,
  };
  joinState.set(k, fresh);
  return fresh;
}

export interface JoinGraceCheck {
  allowed: boolean;
  waitMs: number;
  reason: "first_msg_grace" | "already_initialized" | "grace_elapsed" | "error";
}

/**
 * Check whether the FIRST message can be sent now to this (instance, group).
 *  - If never initialized AND time since join < grace window → block, return waitMs.
 *  - Otherwise → allow.
 *
 * Always logs WARMUP_GROUP_JOIN_DELAY when a wait is required.
 * Fail-safe: never throws.
 */
export function checkGroupJoinGrace(params: {
  instanceId: string;
  groupId: string;
  joinedAtIso?: string | null;
}): JoinGraceCheck {
  try {
    const state = ensureState(params.instanceId, params.groupId, params.joinedAtIso);
    if (state.initialized) {
      return { allowed: true, waitMs: 0, reason: "already_initialized" };
    }
    const elapsed = Date.now() - state.joinedAt;
    if (elapsed >= state.graceMs) {
      return { allowed: true, waitMs: 0, reason: "grace_elapsed" };
    }
    const waitMs = state.graceMs - elapsed;
    console.log("WARMUP_GROUP_JOIN_DELAY", { groupId: params.groupId, instanceId: params.instanceId, waitMs });
    return { allowed: false, waitMs, reason: "first_msg_grace" };
  } catch {
    return { allowed: true, waitMs: 0, reason: "error" };
  }
}

/** Mark the first message as sent — disables further grace checks. */
export function markGroupInitialized(instanceId: string, groupId: string): void {
  try {
    const k = keyOf(instanceId, groupId);
    const s = joinState.get(k);
    if (s) {
      s.initialized = true;
    } else {
      joinState.set(k, { joinedAt: Date.now(), graceMs: 0, initialized: true });
    }
  } catch {
    // ignore
  }
}
