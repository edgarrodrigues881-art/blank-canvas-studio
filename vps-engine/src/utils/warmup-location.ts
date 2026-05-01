// ══════════════════════════════════════════════════════════
// Warmup Location Policy
//
// Controls WHEN and HOW OFTEN the warmup may send a location.
// Does NOT replace `pickFakeLocation` — only gates dispatch.
//
//  - Direct chats (community) only — never groups
//  - Daily cap: 1–2 per instance per day
//  - Per-stage probability: early 1–2%, mid 3–4%, advanced 5–6%
//  - Anti-repeat: same contact at most once / 48h
//  - Curated realistic location pool
//
// In-memory only. Fail-safe (never throws).
// ══════════════════════════════════════════════════════════

type Stage = "early" | "mid" | "advanced";

export interface WarmupLocation {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

// Curated realistic Brazilian locations.
export const WARMUP_LOCATION_POOL: WarmupLocation[] = [
  { name: "Av. Paulista", address: "Av. Paulista, São Paulo - SP", latitude: -23.5616, longitude: -46.6562 },
  { name: "Maracanã", address: "Rio de Janeiro - RJ", latitude: -22.9129, longitude: -43.2302 },
  { name: "Centro BH", address: "Belo Horizonte - MG", latitude: -19.9167, longitude: -43.9345 },
  { name: "Centro Curitiba", address: "Curitiba - PR", latitude: -25.4284, longitude: -49.2733 },
  { name: "Praia de Copacabana", address: "Copacabana, Rio de Janeiro - RJ", latitude: -22.9711, longitude: -43.1822 },
  { name: "Mercado Municipal SP", address: "Centro, São Paulo - SP", latitude: -23.5419, longitude: -46.6293 },
  { name: "Centro Histórico Salvador", address: "Pelourinho, Salvador - BA", latitude: -12.9716, longitude: -38.5108 },
  { name: "Esplanada dos Ministérios", address: "Brasília - DF", latitude: -15.7997, longitude: -47.8645 },
];

// Per-stage probability (random within range, frozen per day per instance).
const STAGE_PROBABILITY: Record<Stage, [number, number]> = {
  early: [0.01, 0.02],     // 1–2%
  mid: [0.03, 0.04],       // 3–4%
  advanced: [0.05, 0.06],  // 5–6%
};

// Daily cap range (random within range, frozen per day per instance).
const DAILY_CAP: [number, number] = [1, 2];

// Anti-repeat window per (instance, contact) — 48h.
const PER_CONTACT_COOLDOWN_MS = 48 * 60 * 60 * 1000;

interface LocationState {
  dayKey: string;
  sentToday: number;
  capToday: number;
  probabilityToday: number;
}

// instanceId → state
const perInstanceLocationState = new Map<string, LocationState>();
// `${instanceId}::${contactDigits}` → lastSentAt (epoch ms)
const perContactLastSent = new Map<string, number>();

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}

function getStage(day: number): Stage {
  const d = Math.max(1, Math.floor(day || 1));
  if (d <= 3) return "early";
  if (d <= 5) return "mid";
  return "advanced";
}

function brtDayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function ensureState(instanceId: string, day: number): LocationState {
  const stage = getStage(day);
  const dayKey = `${brtDayKey()}::d${Math.max(1, Math.floor(day || 1))}`;
  const existing = perInstanceLocationState.get(instanceId);
  if (!existing || existing.dayKey !== dayKey) {
    const [pLo, pHi] = STAGE_PROBABILITY[stage];
    const fresh: LocationState = {
      dayKey,
      sentToday: 0,
      capToday: randInt(DAILY_CAP[0], DAILY_CAP[1]),
      probabilityToday: rand(pLo, pHi),
    };
    perInstanceLocationState.set(instanceId, fresh);
    return fresh;
  }
  return existing;
}

function onlyDigits(v: string): string {
  return String(v || "").replace(/\D/g, "");
}

function isGroupTarget(target: string): boolean {
  const t = String(target || "").toLowerCase();
  return t.includes("@g.us") || t.includes("@broadcast");
}

function gcContactCooldown() {
  if (perContactLastSent.size < 1000) return;
  const now = Date.now();
  for (const [k, ts] of perContactLastSent) {
    if (now - ts > PER_CONTACT_COOLDOWN_MS) perContactLastSent.delete(k);
  }
}

export interface LocationDecisionCtx {
  instanceId: string;
  day: number;
  /** Direct-chat target (community peer). Pass the raw phone or JID. */
  target: string;
  /** "community" | "group" | "autosave" — only "community" (1:1) is eligible. */
  context: "community" | "group" | "autosave" | string;
}

/**
 * Decide whether to send a location now. Fail-safe: any error → false.
 * Logs WARMUP_LOCATION_DECISION for every call.
 */
export function shouldSendLocation(ctx: LocationDecisionCtx): { allowed: boolean; location: WarmupLocation | null; reason: string } {
  try {
    // Hard rule: never in groups.
    if (ctx.context === "group" || isGroupTarget(ctx.target)) {
      const out = { allowed: false, location: null, reason: "group_blocked" };
      console.log("WARMUP_LOCATION_DECISION", { allowed: false, target: ctx.target, locationName: null, reason: out.reason });
      return out;
    }

    // Only direct 1:1 contexts (community / autosave). Spec: community only.
    if (ctx.context !== "community") {
      const out = { allowed: false, location: null, reason: "context_not_eligible" };
      console.log("WARMUP_LOCATION_DECISION", { allowed: false, target: ctx.target, locationName: null, reason: out.reason });
      return out;
    }

    const digits = onlyDigits(ctx.target);
    if (!digits) {
      const out = { allowed: false, location: null, reason: "invalid_target" };
      console.log("WARMUP_LOCATION_DECISION", { allowed: false, target: ctx.target, locationName: null, reason: out.reason });
      return out;
    }

    const state = ensureState(ctx.instanceId, ctx.day);

    // Daily cap.
    if (state.sentToday >= state.capToday) {
      console.log("WARMUP_LOCATION_DECISION", { allowed: false, target: ctx.target, locationName: null, reason: "daily_cap_reached" });
      return { allowed: false, location: null, reason: "daily_cap_reached" };
    }

    // Per-contact 48h cooldown.
    const contactKey = `${ctx.instanceId}::${digits}`;
    const last = perContactLastSent.get(contactKey);
    if (last && Date.now() - last < PER_CONTACT_COOLDOWN_MS) {
      console.log("WARMUP_LOCATION_DECISION", { allowed: false, target: ctx.target, locationName: null, reason: "contact_cooldown_48h" });
      return { allowed: false, location: null, reason: "contact_cooldown_48h" };
    }

    // Stage probability roll.
    if (Math.random() >= state.probabilityToday) {
      console.log("WARMUP_LOCATION_DECISION", { allowed: false, target: ctx.target, locationName: null, reason: "probability_roll_failed" });
      return { allowed: false, location: null, reason: "probability_roll_failed" };
    }

    // Pick a curated location.
    const location = WARMUP_LOCATION_POOL[Math.floor(Math.random() * WARMUP_LOCATION_POOL.length)];
    console.log("WARMUP_LOCATION_DECISION", {
      allowed: true,
      target: ctx.target,
      locationName: location.name,
      sentToday: state.sentToday,
      cap: state.capToday,
    });
    return { allowed: true, location, reason: "ok" };
  } catch {
    console.log("WARMUP_LOCATION_DECISION", { allowed: false, target: ctx.target, locationName: null, reason: "error" });
    return { allowed: false, location: null, reason: "error" };
  }
}

/** Mark a successful location send. Call AFTER the API succeeds. */
export function registerLocationSend(instanceId: string, target: string, day: number): void {
  try {
    const digits = onlyDigits(target);
    if (!digits) return;
    const state = ensureState(instanceId, day);
    state.sentToday += 1;
    perContactLastSent.set(`${instanceId}::${digits}`, Date.now());
    gcContactCooldown();
  } catch {
    // ignore
  }
}
