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

// Status daily caps per stage (random within range, frozen per day)
const STATUS_CAPS: Record<Stage, [number, number]> = {
  early: [1, 1],     // up to 1/day
  mid: [1, 2],       // 1–2/day
  advanced: [2, 3],  // 2–3/day
};

// Status frequency vs. regular sends. We let status occur opportunistically
// during the day with this small per-call probability — not blocking other
// actions and naturally spaced. Cap still enforced.
const STATUS_OPPORTUNITY_P: Record<Stage, number> = {
  early: 0.02,
  mid: 0.04,
  advanced: 0.06,
};

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

export interface ActionMixContext {
  instanceId: string;
  cycleKey: string;   // e.g. cycle.id (resets state on QR reconnect)
  day: number;        // 1-based
  /** Which payload types the call-site can actually dispatch right now. */
  supported?: WarmupActionType[];
}

/** Returns true if this instance still has room for a status today. */
export function canSendStatus(ctx: ActionMixContext): boolean {
  try {
    const stage = getStage(ctx.day);
    const dayKey = `${ctx.cycleKey}:${Math.max(1, Math.floor(ctx.day || 1))}`;
    const state = ensureState(ctx.instanceId, dayKey, stage);
    return state.statusSentToday < state.statusCapToday;
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
