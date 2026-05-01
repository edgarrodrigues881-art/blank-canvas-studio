// ══════════════════════════════════════════════════════════
// VPS Engine — Warmup action mix (human-like distribution)
// In-memory only. Influences WHICH action type is selected
// before dispatch. Does NOT touch scheduling, payload shape,
// or the decision engine's structure. Fail-safe → text.
// ══════════════════════════════════════════════════════════

export type WarmupActionType =
  | "text"
  | "image"
  | "audio"
  | "sticker"
  | "vcard"
  | "location"
  | "status";

type Stage = "early" | "mid" | "advanced";

interface ActionState {
  // Stable per-day key (e.g. cycleId:day)
  dayKey: string;
  // Last 3 actions for anti-repeat
  lastActions: WarmupActionType[];
  // Status sends so far today
  statusSentToday: number;
  // Cap chosen for status today (random within the stage range)
  statusCapToday: number;
  // Per-instance anti-burst spacing (ms epoch)
  lastStatusAt: number;
  // Required gap between status posts, frozen per day (ms)
  statusGapMs: number;
}

const perInstanceActionState = new Map<string, ActionState>();

function getStage(day: number): Stage {
  const d = Math.max(1, Math.floor(day || 1));
  if (d <= 3) return "early";
  if (d <= 5) return "mid";
  return "advanced";
}

// Weights per stage (status excluded — handled separately)
const WEIGHTS: Record<Stage, Array<[Exclude<WarmupActionType, "status">, number]>> = {
  early: [
    ["text", 60],
    ["image", 20],
    ["audio", 10],
    ["sticker", 10],
    ["vcard", 0],
    ["location", 0],
  ],
  mid: [
    ["text", 40],
    ["image", 25],
    ["audio", 15],
    ["sticker", 10],
    ["vcard", 5],
    ["location", 5],
  ],
  advanced: [
    ["text", 30],
    ["image", 25],
    ["audio", 15],
    ["sticker", 10],
    ["vcard", 10],
    ["location", 10],
  ],
};

// Status daily caps per stage — random within range, frozen per day.
// Spec: max 2–3 status per instance per day overall.
const STATUS_CAPS: Record<Stage, [number, number]> = {
  early: [1, 2],     // 1–2/day
  mid: [2, 2],       // 2/day
  advanced: [2, 3],  // 2–3/day
};

// Per-call probability of injecting a status during a regular tick.
// Spec: early 3%, mid 6%, advanced 10%.
const STATUS_OPPORTUNITY_P: Record<Stage, number> = {
  early: 0.03,
  mid: 0.06,
  advanced: 0.10,
};

// Anti-burst minimum gap between two status posts (ms).
const STATUS_MIN_GAP_MS = 90 * 60 * 1000;   // 90 min
const STATUS_MAX_GAP_MS = 180 * 60 * 1000;  // 180 min

// Allowed BRT time window for posting status.
const STATUS_WINDOW_START_HOUR = 7;     // 07:00
const STATUS_WINDOW_END_HOUR = 22;
const STATUS_WINDOW_END_MINUTE = 30;    // 22:30


function randInRange(lo: number, hi: number): number {
  if (hi <= lo) return lo;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function weightedPick<T extends string>(table: Array<[T, number]>): T {
  const total = table.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return table[0][0];
  let r = Math.random() * total;
  for (const [k, w] of table) {
    r -= w;
    if (r <= 0) return k;
  }
  return table[0][0];
}

function ensureState(instanceId: string, dayKey: string, stage: Stage): ActionState {
  const existing = perInstanceActionState.get(instanceId);
  if (!existing || existing.dayKey !== dayKey) {
    const [lo, hi] = STATUS_CAPS[stage];
    const fresh: ActionState = {
      dayKey,
      lastActions: [],
      statusSentToday: 0,
      statusCapToday: randInRange(lo, hi),
      lastStatusAt: 0,
      statusGapMs: randInRange(STATUS_MIN_GAP_MS, STATUS_MAX_GAP_MS),
    };
    perInstanceActionState.set(instanceId, fresh);
    return fresh;
  }
  return existing;
}

function isRepeating(state: ActionState, candidate: WarmupActionType): boolean {
  const last = state.lastActions;
  if (last.length < 2) return false;
  // Repeating 3x in a row → block (last 2 are the same as candidate)
  return last[last.length - 1] === candidate && last[last.length - 2] === candidate;
}

// Current BRT minutes-of-day (0..1439). Self-contained to keep this util pure.
function brtMinutesOfDay(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const m = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}

function isInsideStatusWindow(): boolean {
  const mins = brtMinutesOfDay();
  const startMin = STATUS_WINDOW_START_HOUR * 60;
  const endMin = STATUS_WINDOW_END_HOUR * 60 + STATUS_WINDOW_END_MINUTE;
  return mins >= startMin && mins <= endMin;
}

/**
 * Combined eligibility for posting a status NOW.
 * Returns the decision plus reason and (when blocked by spacing) the next allowed timestamp.
 */
function evaluateStatusEligibility(state: ActionState): {
  allowed: boolean;
  reason: string;
  nextAllowedAt: number | null;
} {
  if (!isInsideStatusWindow()) {
    return { allowed: false, reason: "outside_window_07_22h30_brt", nextAllowedAt: null };
  }
  if (state.statusSentToday >= state.statusCapToday) {
    return { allowed: false, reason: "daily_cap_reached", nextAllowedAt: null };
  }
  const now = Date.now();
  if (state.lastStatusAt > 0 && now - state.lastStatusAt < state.statusGapMs) {
    return {
      allowed: false,
      reason: "min_gap_not_elapsed",
      nextAllowedAt: state.lastStatusAt + state.statusGapMs,
    };
  }
  return { allowed: true, reason: "ok", nextAllowedAt: null };
}

export interface ActionMixContext {
  instanceId: string;
  cycleKey: string;   // e.g. cycle.id (resets state on QR reconnect)
  day: number;        // 1-based
  /** Which payload types the call-site can actually dispatch right now. */
  supported?: WarmupActionType[];
}

/** Returns true if this instance still has room for a status today AND respects spacing/window. */
export function canSendStatus(ctx: ActionMixContext): boolean {
  try {
    const stage = getStage(ctx.day);
    const dayKey = `${ctx.cycleKey}:${Math.max(1, Math.floor(ctx.day || 1))}`;
    const state = ensureState(ctx.instanceId, dayKey, stage);
    const ev = evaluateStatusEligibility(state);
    console.log("WARMUP_STATUS_DECISION", {
      instanceId: ctx.instanceId,
      allowed: ev.allowed,
      reason: ev.reason,
      nextAllowedAt: ev.nextAllowedAt,
      sentToday: state.statusSentToday,
      cap: state.statusCapToday,
    });
    return ev.allowed;
  } catch {
    return false;
  }
}

/** Marks a status send (call after a successful status dispatch). */
export function registerStatusSend(ctx: ActionMixContext): void {
  try {
    const stage = getStage(ctx.day);
    const dayKey = `${ctx.cycleKey}:${Math.max(1, Math.floor(ctx.day || 1))}`;
    const state = ensureState(ctx.instanceId, dayKey, stage);
    state.statusSentToday += 1;
    state.lastStatusAt = Date.now();
  } catch {
    // ignore
  }
}

/**
 * pickActionType(instance, day) — weighted random by stage with:
 *  - status injected opportunistically when under daily cap
 *  - last-3 anti-repeat (no same type 3x in a row)
 *  - filter by `supported` list (call-site capability) → fallback "text"
 */
export function pickActionType(ctx: ActionMixContext): WarmupActionType {
  try {
    const stage = getStage(ctx.day);
    const day = Math.max(1, Math.floor(ctx.day || 1));
    const dayKey = `${ctx.cycleKey}:${day}`;
    const state = ensureState(ctx.instanceId, dayKey, stage);

    const supported = new Set<WarmupActionType>(
      ctx.supported && ctx.supported.length > 0
        ? ctx.supported
        : ["text", "image", "audio", "sticker", "vcard", "location", "status"]
    );

    // 1) Opportunistic status injection (does NOT block regular actions)
    if (
      supported.has("status") &&
      state.statusSentToday < state.statusCapToday &&
      Math.random() < STATUS_OPPORTUNITY_P[stage] &&
      !isRepeating(state, "status")
    ) {
      pushHistory(state, "status");
      return "status";
    }

    // 2) Weighted pick from stage table, filtered by supported + non-repeat
    const table = WEIGHTS[stage]
      .filter(([k, w]) => w > 0 && supported.has(k) && !isRepeating(state, k));

    let chosen: WarmupActionType;
    if (table.length > 0) {
      chosen = weightedPick(table) as WarmupActionType;
    } else {
      // No valid weighted candidate (everything filtered) → safe default
      chosen = supported.has("text") ? "text" : Array.from(supported)[0] || "text";
    }

    pushHistory(state, chosen);
    return chosen;
  } catch {
    return "text";
  }
}

function pushHistory(state: ActionState, action: WarmupActionType) {
  state.lastActions.push(action);
  if (state.lastActions.length > 3) state.lastActions.shift();
}
