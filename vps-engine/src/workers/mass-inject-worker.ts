// ══════════════════════════════════════════════════════════
// VPS Engine — Mass Group Inject Worker
// Continuous loop processor — replaces Edge Function self-invocation
// ══════════════════════════════════════════════════════════

import { getDb } from "../core/db";
import { createLogger } from "../core/logger";

import { DeviceLockManager } from "../core/device-lock-manager";
import { acquireGlobalSlot, releaseGlobalSlot } from "../core/global-semaphore";
import { inspectMassInjectTarget, type MassInjectTargetInfo } from "./mass-inject-target-utils";
import { buildUazapiHeaders } from "../integrations/uazapi-headers";

const log = createLogger("mass-inject");

const API_TIMEOUT_MS = 25_000;

// Minimum spacing between two sends on the SAME device (per-instance serial queue).
// User-facing config (min_delay/max_delay) selects 3–6s by default; this is the hard floor.
const MIN_DEVICE_SEND_INTERVAL_MS = 5_000;
const MAX_DEVICE_SEND_INTERVAL_MS = 8_000;
// Hard ceiling for a single add attempt — if the API hangs longer than this we
// abandon the contact (mark as timeout/failed) and move on so the queue never
// gets stuck on one row.
const PER_CONTACT_MAX_PROCESSING_MS = 60_000;
const RETRYABLE_STATUSES = [
  "pending",
  "retrying",
  "rate_limited",
  "api_temporary",
  "connection_unconfirmed",
  "session_dropped",
  "permission_unconfirmed",
  "unknown_failure",
  "timeout",
] as const;
const DISCONNECT_CONFIRM_THRESHOLD = 2; // Must fail N consecutive checks before marking disconnected
const CONNECTED_DEVICE_STATUSES = new Set(["connected", "ready", "active", "authenticated", "open", "online"]);
// Critical errors that COUNT toward auto-pause threshold (per-device)
const CRITICAL_FAILURE_STATUSES = new Set(["confirmed_no_admin", "invalid_group", "unauthorized"]);
// Transient errors that do NOT count toward pause — just skip and continue.
// `retrying` is included so the smart-retry persisted state is treated as transient
// when the contact is re-claimed (and so per-attempt cap downgrade still works).
const TRANSIENT_FAILURE_STATUSES = new Set([
  "retrying",
  "rate_limited",
  "api_temporary",
  "connection_unconfirmed",
  "session_dropped",
  "permission_unconfirmed",
  "unknown_failure",
  "timeout",
]);
// Per-device consecutive critical error counter
const deviceCriticalErrors = new Map<string, number>();
const DEVICE_CRITICAL_PAUSE_THRESHOLD = 4; // pause only after 4 consecutive critical errors on same device
const deviceRestrictionErrors = new Map<string, number>();
const DEVICE_RESTRICTION_PAUSE_THRESHOLD = 3; // protect accounts when WhatsApp starts rejecting sequential adds

// ── Per-contact attempt cap (bounded retry) ──
// Each contact gets at most 3 attempts total (1 initial + up to 2 retries). The DB
// function `claim_next_mass_inject_contact` enforces this by refusing to re-claim
// contacts whose attempt_count has already reached MAX_CONTACT_ATTEMPTS.
const MAX_CONTACT_ATTEMPTS = 3;

// ── Exponential backoff per retry attempt (transient errors only) ──
// attempt_count after failure: 1 → 5s, 2 → 15s, 3 → 30s
function backoffMsForAttempt(attemptCount: number): number {
  if (attemptCount <= 1) return 5_000;
  if (attemptCount === 2) return 15_000;
  return 30_000;
}

// ── Consecutive add-failure circuit breaker (per worker) ──
// If an instance produces this many consecutive add failures (any kind, not just
// critical) we stop this worker so siblings can absorb the load and the campaign
// is not stuck spinning on the same broken state.
const MAX_CONSECUTIVE_ADD_FAILURES = 5;

const DEVICE_RETRY_INTERVAL_MS = 6_000; // 6s — fast retry, don't block

// ── Per-device connection state (persists across contacts) ──
interface DeviceConnectionState {
  status: "connected" | "disconnected" | "unknown";
  lastCheckedAt: number;
  confirmedDisconnectedAt: number | null; // timestamp when confirmed disconnected
  consecutiveApiFailures: number; // API call failures suggesting disconnect
}
const deviceConnectionState = new Map<string, DeviceConnectionState>();
const DEVICE_CONNECTED_CACHE_MS = 30_000; // trust "connected" for 30s
const DEVICE_DISCONNECTED_RECHECK_MS = 10_000; // auto-recover: re-check disconnected device every 10s
const DEVICE_DISCONNECT_AUTO_PAUSE_MS = 120_000; // auto-pause campaign if ALL devices disconnected for 2min
const API_FAILURE_DISCONNECT_THRESHOLD = 3; // after 3 consecutive REAL connection failures, force re-check

// ── In-memory caches (persist across contacts within same campaign run) ──
type ParticipantCacheEntry = {
  participants: Set<string>;
  fetchedAt: number;
  confirmed: boolean;
};

type ConnectionCheckResult = {
  connected: boolean | null;
  detail: string;
};

const participantCache = new Map<string, ParticipantCacheEntry>();
const endpointCache = new Map<string, number>();
const targetInfoCache = new Map<string, { info: MassInjectTargetInfo; checkedAt: number }>();
const PARTICIPANT_CACHE_TTL_MS = 30 * 60_000; // 30 min — trust cache heavily during a campaign
const PARTICIPANT_FAILURE_CACHE_TTL_MS = 10 * 60_000; // 10 min — even failed lookups shouldn't retry often
const TARGET_INFO_CACHE_TTL_MS = 10 * 60_000;
const participantEndpointCache = new Map<string, number>(); // baseUrl → winning strategy index

// ── Tracking ──
export let lastMassInjectTickAt: Date | null = null;
const activeCampaignIds = new Set<string>();


export function getMassInjectStatus() {
  return { lastTick: lastMassInjectTickAt, activeCampaigns: Array.from(activeCampaignIds) };
}

// ── Utilities ──
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const randomBetween = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const nowIso = () => new Date().toISOString();

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = API_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error: any) {
    if (error.name === "AbortError") throw new Error(`Timeout: API não respondeu em ${Math.round(timeoutMs / 1000)}s`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function buildHeaders(token: string, json = false): Record<string, string> {
  return buildUazapiHeaders(token, { json, context: "mass-inject-worker" });
}

async function readApiResponse(res: Response) {
  const raw = await res.text();
  let body: any = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = { raw }; }
  return { raw, body };
}

function extractProviderMessage(body: any, raw: string): string {
  const candidates = [
    typeof body?.error === "string" ? body.error : "",
    typeof body?.message === "string" ? body.message : "",
    typeof body?.msg === "string" ? body.msg : "",
    typeof body?.details === "string" ? body.details : "",
    typeof body?.data?.error === "string" ? body.data.error : "",
    typeof body?.data?.message === "string" ? body.data.message : "",
    raw,
  ];
  return candidates.find((v) => typeof v === "string" && v.trim().length > 0)?.trim() || "";
}

function normalizeProviderConnectionState(payload: any): "connected" | "disconnected" | "unknown" {
  const inst = payload?.instance || payload?.data || payload || {};
  const statusObj = payload?.status;

  if (statusObj && typeof statusObj === "object") {
    if (statusObj.connected === true) return "connected";
    if (statusObj.connected === false) return "disconnected";
  }

  const rawStatus = [
    inst?.connectionStatus,
    inst?.status,
    payload?.connectionStatus,
    payload?.state,
  ].find((value) => typeof value === "string" && value.trim())?.toLowerCase().trim() || "";

  const textBlob = [
    payload?.message,
    payload?.error,
    payload?.msg,
    payload?.details,
    payload?.data?.message,
    payload?.data?.error,
    inst?.message,
    inst?.error,
  ]
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .toLowerCase();

  const hasSignal = (signals: string[]) => signals.some((signal) => rawStatus.includes(signal) || textBlob.includes(signal));
  if (hasSignal(["connected", "authenticated", "open", "ready", "active", "online"])) return "connected";
  if (hasSignal(["disconnected", "closed", "close", "offline", "logout", "logged_out", "loggedout", "not_connected"])) return "disconnected";
  return "unknown";
}

function buildPhoneFingerprints(raw: string): string[] {
  const digits = String(raw || "").replace(/\D/g, "").replace(/@.*/, "");
  if (!digits) return [];
  const set = new Set<string>();
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  const add = (v: string) => { const c = v.replace(/\D/g, ""); if (c.length >= 10) set.add(c); };
  add(digits); add(local);
  add(local.startsWith("55") ? local.slice(2) : local);
  add(local.length >= 10 && !local.startsWith("55") ? `55${local}` : local);
  if (local.length === 11 && local[2] === "9") { add(local.slice(0, 2) + local.slice(3)); add(`55${local.slice(0, 2) + local.slice(3)}`); }
  if (local.length === 10) { add(local.slice(0, 2) + "9" + local.slice(2)); add(`55${local.slice(0, 2) + "9" + local.slice(2)}`); }
  return Array.from(set);
}

function participantSetHasPhone(participants: Set<string>, phone: string) {
  return buildPhoneFingerprints(phone).some(fp => participants.has(fp));
}

/**
 * In-memory cache for resolved LIDs → JID. Avoids re-calling /chat/info for
 * the same LID across contacts in a campaign run.
 * Value `null` means "already tried and failed" (negative cache).
 */
const lidResolutionCache = new Map<string, { jid: string | null; at: number }>();
const LID_CACHE_TTL_MS = 30 * 60_000;
const LID_NEGATIVE_TTL_MS = 5 * 60_000;

async function resolveLidToJid(baseUrl: string, token: string, lid: string): Promise<string | null> {
  const key = `${baseUrl}::${lid.toLowerCase()}`;
  const cached = lidResolutionCache.get(key);
  if (cached) {
    const ttl = cached.jid ? LID_CACHE_TTL_MS : LID_NEGATIVE_TTL_MS;
    if (Date.now() - cached.at < ttl) return cached.jid;
  }

  try {
    const res = await fetchWithTimeout(`${baseUrl.replace(/\/+$/, "")}/chat/info`, {
      method: "POST",
      headers: buildHeaders(token, true),
      body: JSON.stringify({ chatId: lid }),
    }, 10_000);
    const { body } = await readApiResponse(res);
    if (!res.ok) {
      lidResolutionCache.set(key, { jid: null, at: Date.now() });
      return null;
    }
    const candidates = [
      body?.jid, body?.id, body?.chat?.jid, body?.chat?.id,
      body?.data?.jid, body?.data?.id, body?.contact?.jid,
      body?.user?.jid, body?.wid, body?.phoneJid,
    ].filter((v) => typeof v === "string");
    let found = candidates.find((c: string) => c.includes("@s.whatsapp.net")) || null;
    if (!found) {
      const numCandidates = [body?.number, body?.phone, body?.contact?.number, body?.user?.number]
        .filter((v) => typeof v === "string" && /\d/.test(v));
      const num = numCandidates[0];
      if (num) {
        const digits = String(num).replace(/\D/g, "");
        if (digits.length >= 10 && digits.length <= 15) found = `${digits}@s.whatsapp.net`;
      }
    }
    lidResolutionCache.set(key, { jid: found || null, at: Date.now() });
    return found || null;
  } catch {
    lidResolutionCache.set(key, { jid: null, at: Date.now() });
    return null;
  }
}

/**
 * Normalizes a contact identifier without country/format restrictions.
 *
 * Rules:
 *   - Accepts ANY international number (no "55"/Brazil assumption).
 *   - Strips "+", spaces, "-", "(", ")" — keeps only digits.
 *   - Does NOT add country code, does NOT add/remove the 9th digit, does NOT reformat.
 *   - LIDs (xxx@lid) are resolved via UAZAPI /chat/info; the resolved digits are kept as-is.
 *   - Rejects JIDs, groups, broadcasts and newsletters (those are not valid user inputs here).
 *   - The API is the source of truth for "valid number" — we forward anything with digits.
 */
async function normalizeContactJid(
  raw: string,
  baseUrl?: string,
  token?: string,
): Promise<{ phone: string; jid: string; original: string } | null> {
  const original = String(raw || "").trim();
  const value = original.toLowerCase();
  if (!value) return null;

  // Hard reject: JID inputs are not allowed (must come from number or LID resolution).
  if (value.includes("@s.whatsapp.net") || value.includes("@c.us")) return null;
  // Hard reject: groups / broadcasts / newsletters.
  if (value.includes("@g.us") || value.includes("@broadcast") || value.includes("@newsletter")) return null;

  // LID → resolve via API. Preserve resolved digits as-is (no length/country checks).
  if (value.includes("@lid")) {
    if (!baseUrl || !token) return null;
    const resolvedJid = await resolveLidToJid(baseUrl, token, value);
    if (!resolvedJid) return null;
    const digits = resolvedJid.split("@")[0].replace(/\D/g, "");
    if (!digits) return null;
    return { phone: digits, jid: `${digits}@s.whatsapp.net`, original };
  }

  // Plain number path — any letters in non-LID input is invalid
  if (/[a-z]/i.test(value)) return null;
  // Strip "+", spaces, "-", "(", ")" and any other non-digit char.
  const digits = value.replace(/\D/g, "");
  // Minimal sanity: must contain at least one digit. No length cap (international support).
  if (!digits) return null;
  return { phone: digits, jid: `${digits}@s.whatsapp.net`, original };
}

// ── Participant fetching (with in-memory cache) ──
function collectParticipants(value: any, participants: Set<string>) {
  if (!value) return;
  if (Array.isArray(value)) { value.forEach(v => collectParticipants(v, participants)); return; }
  if (typeof value !== "object") return;

  const nested = value?.Participants || value?.participants || value?.members;
  if (Array.isArray(nested)) { nested.forEach((v: any) => collectParticipants(v, participants)); return; }

  const id = String(value?.id || value?.jid || value?.JID || value?.participant || "");
  if (id.includes("@lid") || id.includes("@newsletter")) {
    const phone = extractPhone(value);
    if (phone) buildPhoneFingerprints(phone).forEach(fp => participants.add(fp));
    return;
  }

  const candidates = [value?.PhoneNumber, value?.phoneNumber, value?.phone, value?.number, value?.wid, value?.wa_id, value?.participant, id];
  for (const c of candidates) {
    if (c) buildPhoneFingerprints(String(c)).forEach(fp => participants.add(fp));
  }
}

function extractPhone(value: any): string | null {
  const candidates = [value?.PhoneNumber, value?.phoneNumber, value?.phone, value?.number, value?.wid, value?.wa_id, value?.pn, value?.user];
  for (const c of candidates) {
    if (!c) continue;
    const digits = String(c).replace(/@.*$/, "").replace(/[^0-9]/g, "");
    if (digits.length >= 8 && digits.length <= 15) return digits;
  }
  return null;
}

async function fetchGroupParticipants(baseUrl: string, token: string, groupId: string): Promise<ParticipantCacheEntry> {
  const cacheKey = `${baseUrl}::${groupId}`;
  const cached = participantCache.get(cacheKey);
  if (cached) {
    const ttlMs = cached.confirmed ? PARTICIPANT_CACHE_TTL_MS : PARTICIPANT_FAILURE_CACHE_TTL_MS;
    if (Date.now() - cached.fetchedAt < ttlMs) {
      return cached;
    }
  }

  const participants = new Set<string>();

  // All fetch strategies in order of reliability
  const strategies = [
    { id: 0, fn: async () => {
      const res = await fetchWithTimeout(`${baseUrl}/group/list?GetParticipants=true&count=500`, { headers: buildHeaders(token) });
      if (!res.ok) return null;
      const body: any = await res.json();
      const groups = Array.isArray(body) ? body : body?.groups || body?.data || [];
      return groups.find((g: any) => (g?.JID || g?.jid || g?.id || "") === groupId) || null;
    }},
    { id: 1, fn: async () => {
      const res = await fetchWithTimeout(`${baseUrl}/group/fetchAllGroups`, { headers: buildHeaders(token) });
      if (!res.ok) return null;
      const body: any = await res.json();
      const groups = Array.isArray(body) ? body : body?.groups || body?.data || [];
      return groups.find((g: any) => (g?.JID || g?.jid || g?.id || "") === groupId) || null;
    }},
    { id: 2, fn: async () => {
      const res = await fetchWithTimeout(`${baseUrl}/group/info`, { method: "POST", headers: buildHeaders(token, true), body: JSON.stringify({ groupJid: groupId }) });
      if (!res.ok) return null;
      const body: any = await res.json();
      return body?.group || body?.data?.group || body?.data || body;
    }},
    { id: 3, fn: async () => {
      const res = await fetchWithTimeout(`${baseUrl}/group/info?groupJid=${encodeURIComponent(groupId)}`, { headers: buildHeaders(token) });
      if (!res.ok) return null;
      const body: any = await res.json();
      return body?.group || body?.data?.group || body?.data || body;
    }},
  ];

  // FAST PATH: try cached winning strategy first
  const cachedStrategyIdx = participantEndpointCache.get(baseUrl);
  if (cachedStrategyIdx !== undefined) {
    const strategy = strategies.find(s => s.id === cachedStrategyIdx);
    if (strategy) {
      try {
        const target = await strategy.fn();
        if (target) {
          collectParticipants(target?.Participants || target?.participants || target?.members || [], participants);
          if (participants.size > 0) {
            const entry = { participants, fetchedAt: Date.now(), confirmed: true };
            participantCache.set(cacheKey, entry);
            return entry;
          }
        }
      } catch { /* fall through to discovery */ }
    }
  }

  // DISCOVERY: try each strategy, stop on first success
  for (const strategy of strategies) {
    if (strategy.id === cachedStrategyIdx) continue; // already tried
    try {
      const target = await strategy.fn();
      if (!target) continue;
      collectParticipants(target?.Participants || target?.participants || target?.members || [], participants);
      if (participants.size > 0) {
        participantEndpointCache.set(baseUrl, strategy.id);
        const entry = { participants, fetchedAt: Date.now(), confirmed: true };
        participantCache.set(cacheKey, entry);
        return entry;
      }
    } catch { continue; }
  }

  const fallbackEntry = { participants, fetchedAt: Date.now(), confirmed: false };
  participantCache.set(cacheKey, fallbackEntry);
  return fallbackEntry;
}

function rememberParticipantInCache(baseUrl: string, groupId: string, phone: string) {
  const cacheKey = `${baseUrl}::${groupId}`;
  const cached = participantCache.get(cacheKey);
  if (!cached?.confirmed) return;

  for (const fp of buildPhoneFingerprints(phone)) {
    cached.participants.add(fp);
  }

  cached.fetchedAt = Date.now();
  participantCache.set(cacheKey, cached);
}

async function getMassInjectTargetInfo(baseUrl: string, token: string, groupId: string): Promise<MassInjectTargetInfo> {
  const cacheKey = `${baseUrl}::${groupId}`;
  const cached = targetInfoCache.get(cacheKey);
  if (cached && Date.now() - cached.checkedAt < TARGET_INFO_CACHE_TTL_MS) {
    return cached.info;
  }

  const info = await inspectMassInjectTarget(baseUrl, token, groupId);
  targetInfoCache.set(cacheKey, { info, checkedAt: Date.now() });
  return info;
}

// ── Connection check with confirmation ──
// Only marks as disconnected after DISCONNECT_CONFIRM_THRESHOLD consecutive negative results
const deviceDisconnectStreak = new Map<string, number>(); // deviceId → consecutive disconnect count

async function isDeviceConnected(baseUrl: string, token: string, _checks = 1): Promise<ConnectionCheckResult> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/instance/status?t=${Date.now()}`, { headers: buildHeaders(token) }, 8000);
    const { raw, body } = await readApiResponse(res);
    const normalized = normalizeProviderConnectionState(body);

    if (normalized === "connected") {
      // Reset streak on success
      const key = baseUrl;
      deviceDisconnectStreak.delete(key);
      return { connected: true, detail: "Conexão confirmada." };
    }

    if (res.status === 401) {
      return { connected: false, detail: "Falha de autenticação da instância." };
    }

    if (normalized === "disconnected") {
      // Increment streak — only confirm after threshold
      const key = baseUrl;
      const streak = (deviceDisconnectStreak.get(key) || 0) + 1;
      deviceDisconnectStreak.set(key, streak);

      if (streak >= DISCONNECT_CONFIRM_THRESHOLD) {
        log.warn(`Device ${baseUrl.slice(0, 30)} confirmed disconnected after ${streak} consecutive checks`);
        return { connected: false, detail: `Desconexão confirmada após ${streak} verificações.` };
      }

      return { connected: null, detail: `Status instável (${streak}/${DISCONNECT_CONFIRM_THRESHOLD} checks negativos).` };
    }

    return { connected: null, detail: extractProviderMessage(body, raw) || "Status incerto — prosseguindo." };
  } catch (error: any) {
    const key = baseUrl;
    const streak = (deviceDisconnectStreak.get(key) || 0) + 1;
    deviceDisconnectStreak.set(key, streak);

    if (streak >= DISCONNECT_CONFIRM_THRESHOLD) {
      return { connected: false, detail: `Falha de rede confirmada após ${streak} tentativas: ${error?.message || "erro"}` };
    }

    return { connected: null, detail: error?.message || "Falha temporária na verificação." };
  }
}

// ── Smart instance connection validator ──
// Uses cached state + live check to avoid unnecessary API calls
async function isInstanceConnected(
  deviceId: string,
  baseUrl: string,
  token: string,
  forceCheck = false,
): Promise<{ connected: boolean; detail: string; shouldSkipDevice: boolean }> {
  const now = Date.now();
  const state = deviceConnectionState.get(deviceId);

  // If we have a recent "connected" result and no force, trust the cache
  if (!forceCheck && state && state.status === "connected" && (now - state.lastCheckedAt) < DEVICE_CONNECTED_CACHE_MS) {
    return { connected: true, detail: "Cache: conectado.", shouldSkipDevice: false };
  }

  // If confirmed disconnected recently, don't bother re-checking too soon
  if (!forceCheck && state && state.status === "disconnected" && state.confirmedDisconnectedAt) {
    const sinceDisconnect = now - state.confirmedDisconnectedAt;
    if (sinceDisconnect < DEVICE_DISCONNECTED_RECHECK_MS) {
      return { connected: false, detail: `Desconectado (recheck em ${Math.round((DEVICE_DISCONNECTED_RECHECK_MS - sinceDisconnect) / 1000)}s).`, shouldSkipDevice: true };
    }
  }

  // Perform live check
  const result = await isDeviceConnected(baseUrl, token);

  if (result.connected === true) {
    const wasDisconnected = state?.status === "disconnected";
    deviceConnectionState.set(deviceId, {
      status: "connected",
      lastCheckedAt: now,
      confirmedDisconnectedAt: null,
      consecutiveApiFailures: 0,
    });
    if (wasDisconnected) {
      log.info(`STATE CHANGE [recovered] device ${deviceId.slice(0, 8)} — health check OK, instance back online.`);
    }
    return { connected: true, detail: result.detail, shouldSkipDevice: false };
  }

  if (result.connected === false) {
    const prevState = deviceConnectionState.get(deviceId);
    const wasConnected = prevState?.status !== "disconnected";
    deviceConnectionState.set(deviceId, {
      status: "disconnected",
      lastCheckedAt: now,
      confirmedDisconnectedAt: prevState?.confirmedDisconnectedAt || now,
      consecutiveApiFailures: prevState?.consecutiveApiFailures || 0,
    });
    if (wasConnected) {
      log.warn(`STATE CHANGE [disconnected] device ${deviceId.slice(0, 8)} — reason: ${result.detail}`);
    }
    return { connected: false, detail: result.detail, shouldSkipDevice: true };
  }

  // Unknown — proceed but mark as uncertain
  if (state) {
    state.lastCheckedAt = now;
    deviceConnectionState.set(deviceId, state);
  } else {
    deviceConnectionState.set(deviceId, {
      status: "unknown",
      lastCheckedAt: now,
      confirmedDisconnectedAt: null,
      consecutiveApiFailures: 0,
    });
  }
  return { connected: true, detail: result.detail, shouldSkipDevice: false };
}

// Track API failures that suggest device is disconnecting
function recordDeviceApiFailure(deviceId: string, errorDetail: string): boolean {
  const state = deviceConnectionState.get(deviceId);
  const failures = (state?.consecutiveApiFailures || 0) + 1;
  deviceConnectionState.set(deviceId, {
    status: failures >= API_FAILURE_DISCONNECT_THRESHOLD ? "disconnected" : (state?.status || "unknown"),
    lastCheckedAt: state?.lastCheckedAt || Date.now(),
    confirmedDisconnectedAt: failures >= API_FAILURE_DISCONNECT_THRESHOLD ? Date.now() : (state?.confirmedDisconnectedAt || null),
    consecutiveApiFailures: failures,
  });
  if (failures >= API_FAILURE_DISCONNECT_THRESHOLD) {
    log.warn(`Device ${deviceId.slice(0, 8)}: ${failures} consecutive API failures — marking for re-check. Last: ${errorDetail.slice(0, 80)}`);
    return true; // should force connection re-check
  }
  return false;
}

function recordDeviceApiSuccess(deviceId: string) {
  const state = deviceConnectionState.get(deviceId);
  if (state) {
    const wasDisconnected = state.status === "disconnected";
    state.consecutiveApiFailures = 0;
    state.status = "connected";
    state.confirmedDisconnectedAt = null;
    state.lastCheckedAt = Date.now();
    deviceConnectionState.set(deviceId, state);
    if (wasDisconnected) {
      log.info(`STATE CHANGE [recovered] device ${deviceId.slice(0, 8)} — successful API call confirmed instance is online.`);
    }
  }
}


// ── Add to group (with endpoint caching) ──
interface AddResult {
  ok: boolean;
  alreadyExists: boolean;
  detail: string;
  retryable: boolean;
  pauseCampaign: boolean;
  cooldownMs: number;
  strategyIndex?: number;
  canTryOtherStrategy?: boolean;
  /** Raw API response body (truncated, for diagnostics on failure). */
  rawResponse?: string;
  /** HTTP status code of the last attempt, when known. */
  httpStatus?: number;
  failureStatus?:
    | "rate_limited"
    | "api_temporary"
    | "connection_unconfirmed"
    | "session_dropped"
    | "permission_unconfirmed"
    | "confirmed_no_admin"
    | "invalid_group"
    | "contact_not_found"
    | "unauthorized"
    | "blocked"
    | "timeout"
    | "unknown_failure"
    | "failed";
}

/**
 * Strict privacy detector. We ONLY classify as a privacy restriction when the
 * API explicitly says so (explicit privacy keyword in the body or detail).
 * Generic failures — timeout, rate limit, "unknown error", connection drops —
 * must NEVER be treated as privacy errors. HTTP 403 alone is also not enough,
 * since several providers use 403 for unrelated permission issues (e.g. "not
 * admin").
 */
function isExplicitPrivacyError(result: AddResult): boolean {
  if (result.ok || result.alreadyExists) return false;
  const haystack = `${result.detail || ""} ${result.rawResponse || ""}`.toLowerCase();
  return /privacidade|saved contacts|contatos salvos|only allows.*contact|invite de contatos|only contacts can/.test(haystack);
}

function buildAddStrategies(baseUrl: string, groupId: string, phone: string) {
  const p = phone.replace(/@.*/, "");
  return [
    // Strategy 0: Most common UAZAPI endpoint (groupJid camelCase)
    { method: "POST" as const, url: `${baseUrl}/group/updateParticipants`, body: { groupJid: groupId, action: "add", participants: [p] } },
    // Strategy 1: legacy addParticipant endpoint with the leanest body
    { method: "POST" as const, url: `${baseUrl}/group/addParticipant`, body: { groupJid: groupId, participant: p } },
    // Strategy 2: PUT with query param
    { method: "PUT" as const, url: `${baseUrl}/group/updateParticipant?groupJid=${encodeURIComponent(groupId)}`, body: { action: "add", participants: [p] } },
    // Strategy 3: lowercase groupjid variant
    { method: "POST" as const, url: `${baseUrl}/group/updateParticipants`, body: { groupjid: groupId, action: "add", participants: [p] } },
    // Strategy 4: POST with full JID for stricter providers
    { method: "POST" as const, url: `${baseUrl}/group/updateParticipants`, body: { groupJid: groupId, action: "add", participants: [`${p}@s.whatsapp.net`] } },
    // Strategy 5: PUT with full JID for stricter providers
    { method: "PUT" as const, url: `${baseUrl}/group/updateParticipant?groupJid=${encodeURIComponent(groupId)}`, body: { action: "add", participants: [`${p}@s.whatsapp.net`] } },
  ];
}

// ── Ensure contact is saved on the device's WhatsApp address book ──
// WhatsApp privacy setting "only contacts" requires the inviter to have the
// invitee saved as a contact. We try multiple UAZAPI contact-save endpoints
// and ignore failures (best-effort).
const contactSavedCache = new Map<string, number>(); // key: baseUrl::phone → timestamp
const CONTACT_SAVED_TTL_MS = 6 * 60 * 60_000; // 6h

async function ensureContactSaved(
  baseUrl: string,
  token: string,
  phone: string,
  opts: { force?: boolean } = {},
): Promise<boolean> {
  const p = phone.replace(/\D/g, "").replace(/@.*/, "");
  if (!p) return false;
  const key = `${baseUrl}::${p}`;
  if (!opts.force) {
    const at = contactSavedCache.get(key);
    if (at && Date.now() - at < CONTACT_SAVED_TTL_MS) return true;
  }

  const placeholderName = `Lead ${p.slice(-4)}`;
  const headers = buildHeaders(token, true);

  const attempts: Array<{ method: "POST" | "PUT"; url: string; body: any }> = [
    { method: "POST", url: `${baseUrl}/contact/add`, body: { number: p, name: placeholderName } },
    { method: "POST", url: `${baseUrl}/contact/save`, body: { number: p, name: placeholderName } },
  ];

  for (const a of attempts) {
    try {
      const res = await fetchWithTimeout(a.url, { method: a.method, headers, body: JSON.stringify(a.body) }, 10_000);
      if (res.status === 405 || res.status === 404) continue;
      // Treat any 2xx OR "already exists"-ish responses as saved.
      if (res.ok) {
        contactSavedCache.set(key, Date.now());
        log.info(`contact_saved: ${p} via ${a.url.replace(baseUrl, "")}`);
        return true;
      }
      // Some providers return 409/200-with-error for duplicates → also OK.
      const raw = await res.text().catch(() => "");
      if (/already|exist|dupli|salvo|saved/i.test(raw)) {
        contactSavedCache.set(key, Date.now());
        log.info(`contact_saved (already): ${p}`);
        return true;
      }
    } catch {
      // try next endpoint
    }
  }
  // Best-effort: don't fail the pipeline if no endpoint worked.
  return false;
}

// ── Presence "online" before joining a group ──
// Simulates the chip "opening" the group on a real phone before issuing the
// add command, mimicking organic user behavior. Best-effort: failures are
// swallowed so they never block the actual add. Cached briefly to avoid
// hammering the presence endpoint between consecutive contacts on the same
// group.
const presenceCache = new Map<string, number>(); // key: baseUrl::tokenPrefix::groupId
const PRESENCE_TTL_MS = 12 * 60_000;

async function sendPresenceOnline(baseUrl: string, token: string, groupId: string): Promise<void> {
  const key = `${baseUrl}::${String(token).slice(0, 6)}::${groupId}`;
  const last = presenceCache.get(key);
  if (last && Date.now() - last < PRESENCE_TTL_MS) return;

  const headers = buildHeaders(token, true);
  const attempts: Array<{ method: "POST" | "PUT"; url: string; body: any }> = [
    { method: "POST", url: `${baseUrl}/chat/presence`, body: { number: groupId, presence: "available" } },
    { method: "POST", url: `${baseUrl}/sendPresence`, body: { number: groupId, presence: "available" } },
    { method: "POST", url: `${baseUrl}/instance/presence`, body: { presence: "available" } },
  ];
  for (const a of attempts) {
    try {
      const res = await fetchWithTimeout(a.url, { method: a.method, headers, body: JSON.stringify(a.body) }, 6_000);
      if (res.status === 404 || res.status === 405) continue;
      if (res.ok) {
        presenceCache.set(key, Date.now());
        return;
      }
    } catch { /* try next */ }
  }
  // No cache on failure — retry next round.
}

async function addToGroup(baseUrl: string, token: string, groupId: string, phone: string): Promise<AddResult> {
  const cacheKey = `${baseUrl}::${groupId}`;
  const cachedIdx = endpointCache.get(cacheKey);
  const strategies = buildAddStrategies(baseUrl, groupId, phone);
  const headers = buildHeaders(token, true);

  const tryStrategy = async (idx: number) => {
    const s = strategies[idx];
    const res = await fetchWithTimeout(s.url, { method: s.method, headers, body: JSON.stringify(s.body) });
    const raw = await res.text();
    let body: any;
    try { body = JSON.parse(raw); } catch { body = { raw }; }
    return { res, raw, body, idx };
  };

  const processResult = (res: Response, raw: string, body: any, idx: number): AddResult => {
    const errorMsg = [body?.error, body?.message, body?.msg, body?.details, body?.data?.error, body?.data?.message]
      .filter(v => typeof v === "string" && v.trim())
      .join(" ");
    const errorMsgLower = errorMsg.toLowerCase();
    const rawLower = raw.toLowerCase();
    const rawSnippet = raw ? raw.slice(0, 800) : "";
    const attach = (r: AddResult): AddResult => ({ ...r, rawResponse: rawSnippet, httpStatus: res.status });

    const gu = body?.groupUpdated || body?.data?.groupUpdated;
    if (Array.isArray(gu) && gu.length > 0) {
      const errCode = Number(gu[0]?.Error ?? gu[0]?.error ?? -1);
      if (errCode === 0 || errCode === 200 || errCode === 201) {
        return attach({ ok: true, alreadyExists: false, detail: "Adicionado com sucesso.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx, canTryOtherStrategy: false });
      }
      if (errCode === 409) {
        return attach({ ok: false, alreadyExists: true, detail: "Já no grupo.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx, canTryOtherStrategy: false });
      }
      if (errCode === 403) {
        // Only call it a privacy error if the message text actually says so;
        // otherwise treat as a generic 403 (e.g. "not admin").
        const looksLikePrivacy = /privacidade|saved contacts|contatos salvos|only allows.*contact|invite de contatos|only contacts can/.test(errorMsgLower || rawLower);
        if (looksLikePrivacy) {
          return attach({ ok: false, alreadyExists: false, detail: "Privacidade: só aceita convite de contatos salvos.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx, canTryOtherStrategy: false, failureStatus: "failed" });
        }
        return attach(classifyFailure(errorMsgLower || rawLower, 403, idx));
      }
      if (errCode >= 400) {
        return attach(classifyFailure(errorMsgLower || rawLower, errCode, idx));
      }
      return attach({ ok: true, alreadyExists: false, detail: "Adicionado com sucesso.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx, canTryOtherStrategy: false });
    }

    const groupObj = body?.group || body?.data?.group;
    if (groupObj && typeof groupObj === "object" && (groupObj.JID || groupObj.jid || groupObj.id)) {
      if ((res.status === 200 || res.status === 201) && !hasExplicitFailure(errorMsgLower)) {
        return attach({ ok: true, alreadyExists: false, detail: "Adicionado com sucesso.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx, canTryOtherStrategy: false });
      }
    }

    if (errorMsgLower.includes("already") || errorMsgLower.includes("já") || errorMsgLower.includes("memberaddmode") || res.status === 409) {
      return attach({ ok: false, alreadyExists: true, detail: "Já no grupo.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx, canTryOtherStrategy: false });
    }

    if ((res.status === 200 || res.status === 201) && !hasExplicitFailure(errorMsgLower)) {
      return attach({ ok: true, alreadyExists: false, detail: "Adicionado com sucesso.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx, canTryOtherStrategy: false });
    }

    return attach(classifyFailure(errorMsgLower || rawLower, res.status, idx));
  };

  // ── FAST PATH: If we have a cached winning strategy, try ONLY that first ──
  if (cachedIdx !== undefined && cachedIdx >= 0 && cachedIdx < strategies.length) {
    try {
      const { res, raw, body, idx } = await tryStrategy(cachedIdx);
      if (res.status !== 405) {
        const result = processResult(res, raw, body, idx);
        // Definitive result (success, already exists, or non-transient failure) → return immediately
        if (!result.canTryOtherStrategy) {
          endpointCache.set(cacheKey, idx);
          return result;
        }
        // Transient error on cached strategy → invalidate cache and fall through to discovery
        endpointCache.delete(cacheKey);
        log.warn(`Cached strategy ${cachedIdx} failed transiently for ${groupId.slice(0, 15)} — discovering...`);
      } else {
        // 405 on cached strategy → invalidate
        endpointCache.delete(cacheKey);
      }
    } catch (e: any) {
      endpointCache.delete(cacheKey);
      log.warn(`Cached strategy ${cachedIdx} threw for ${groupId.slice(0, 15)}: ${e.message}`);
    }
  }

  // ── DISCOVERY PATH: Try strategies in order.
  // IMPORTANT: do NOT stop on the first transient 5xx/timeout response, because
  // different UAZAPI builds often expose multiple participant endpoints and only
  // one of them actually performs the add. We only stop immediately when the
  // result is definitive (success, already exists, or a permanent failure).
  let lastTransientResult: AddResult | null = null;
  for (let i = 0; i < strategies.length; i++) {
    if (i === cachedIdx) continue; // Already tried above
    try {
      const { res, raw, body, idx } = await tryStrategy(i);
      if (res.status === 405) continue; // Endpoint not supported, try next

      const result = processResult(res, raw, body, idx);

      // Definitive result: cache this working endpoint shape and stop.
      if (!result.canTryOtherStrategy) {
        endpointCache.set(cacheKey, idx);
        return result;
      }

      // Transient result (5xx / timeout / connection wobble): keep the last one,
      // but continue discovery because another strategy may succeed.
      lastTransientResult = result;
    } catch {
      // Network/timeout error — keep trying the remaining strategies.
      continue;
    }
  }

  if (lastTransientResult) {
    return lastTransientResult;
  }

  return { ok: false, alreadyExists: false, detail: "Nenhum endpoint encontrado (405).", retryable: false, pauseCampaign: true, cooldownMs: 0, canTryOtherStrategy: false, failureStatus: "failed" };
}

async function addToCommunity(targetInfo: MassInjectTargetInfo): Promise<AddResult> {
  return {
    ok: false,
    alreadyExists: false,
    detail: targetInfo.kind === "community_root"
      ? targetInfo.detail
      : `Destino comunitário exige fluxo separado (${targetInfo.targetId}). Use grupo interno ou convite.`,
    retryable: false,
    pauseCampaign: false,
    cooldownMs: 0,
    canTryOtherStrategy: false,
    failureStatus: "failed",
  };
}

/** Check if the lowercase error message contains keywords that indicate a real failure even on 2xx */
function hasExplicitFailure(msg: string): boolean {
  if (!msg) return false;
  const keywords = ["blocked", "ban", "not admin", "not an admin", "not found", "unauthorized", "invalid token", "disconnected", "session disconnected", "privacidade", "saved contacts", "contatos salvos", "only allows"];
  return keywords.some((kw) => msg.includes(kw));
}

function classifyFailure(msg: string, status: number, strategyIndex: number): AddResult {
  const base = { ok: false as const, alreadyExists: false, strategyIndex, canTryOtherStrategy: false };
  if (msg.includes("rate-overlimit") || msg.includes("rate limit") || msg.includes("ratelimit") || msg.includes("429") || msg.includes("too many") || status === 429) {
    // Cooldown aleatório de 30–60s — evita bater na API durante o bloqueio
    const cooldown = randomBetween(30_000, 60_000);
    return { ...base, detail: `Rate limit detectado pela API. Cooldown de ${Math.round(cooldown / 1000)}s antes de retomar.`, retryable: true, pauseCampaign: false, cooldownMs: cooldown, failureStatus: "rate_limited" };
  }
  if (
    msg.includes("try again later")
    || msg.includes("wait a while")
    || msg.includes("temporarily blocked")
    || msg.includes("temporarily unavailable")
    || msg.includes("too many recent")
    || msg.includes("too many attempts")
    || msg.includes("muitas tentativas")
    || msg.includes("muito rápido")
    || msg.includes("aguarde")
    || msg.includes("temporariamente")
    || msg.includes("temporarily")
  ) {
    const cooldown = randomBetween(8 * 60_000, 15 * 60_000);
    return { ...base, detail: `Restrição temporária detectada. Cooldown de ${Math.round(cooldown / 1000)}s para evitar nova desconexão.`, retryable: true, pauseCampaign: false, cooldownMs: cooldown, failureStatus: "rate_limited" };
  }
  if (msg.includes("websocket disconnected before info query") || msg.includes("connection reset") || msg.includes("socket hang up"))
    return { ...base, detail: "A integração interrompeu a consulta antes de concluir.", retryable: true, pauseCampaign: false, cooldownMs: 3000, canTryOtherStrategy: true, failureStatus: "api_temporary" };
  if (msg.includes("privacidade") || msg.includes("saved contacts") || msg.includes("contatos salvos") || msg.includes("only allows") || msg.includes("invite de contatos"))
    return { ...base, detail: "Privacidade: só aceita convite de contatos salvos.", retryable: false, pauseCampaign: false, cooldownMs: 0, failureStatus: "failed" };
  if (msg.includes("not admin") || msg.includes("not an admin"))
    return { ...base, detail: "Sem permissão de admin.", retryable: false, pauseCampaign: false, cooldownMs: 0, failureStatus: "confirmed_no_admin" };
  if ((msg.includes("not found") && (msg.includes("group") || msg.includes("invalid group"))) || msg.includes("full") || msg.includes("limit reached"))
    return { ...base, detail: msg.includes("full") || msg.includes("limit reached") ? "Grupo atingiu limite de participantes." : "Grupo inválido.", retryable: false, pauseCampaign: false, cooldownMs: 0, failureStatus: "invalid_group" };
  if (msg.includes("blocked") || msg.includes("ban"))
    return { ...base, detail: "Contato bloqueado.", retryable: false, pauseCampaign: false, cooldownMs: 0, failureStatus: "blocked" };
  if (msg.includes("not found") && (msg.includes("number") || msg.includes("participant") || msg.includes("contact")))
    return { ...base, detail: "Número não encontrado no WhatsApp.", retryable: false, pauseCampaign: false, cooldownMs: 0, failureStatus: "contact_not_found" };
  if (status === 401 || msg.includes("unauthorized") || msg.includes("invalid token"))
    return { ...base, detail: "Token inválido.", retryable: false, pauseCampaign: false, cooldownMs: 0, failureStatus: "unauthorized" };
  if (
    status === 503
    || msg.includes("disconnected")
    || msg.includes("session disconnected")
    || msg.includes("socket closed")
    || msg.includes("instância desconectada")
    || msg.includes("instancia desconectada")
    || msg.includes("instance disconnected")
    || msg.includes("not connected")
    || msg.includes("connection closed")
    || msg.includes("websocket closed")
    || msg.includes("session dropped")
    || msg.includes("session not found")
    || msg.includes("logged out")
    || msg.includes("logout")
    || msg.includes("offline")
  )
    return { ...base, detail: "Instância desconectada.", retryable: true, pauseCampaign: false, cooldownMs: 3000, canTryOtherStrategy: true, failureStatus: "session_dropped" };
  if (msg.includes("timeout") || status === 408 || status === 504)
    return { ...base, detail: "Timeout.", retryable: true, pauseCampaign: false, cooldownMs: 3000, canTryOtherStrategy: true, failureStatus: "timeout" };
  if (status >= 500)
    return { ...base, detail: `Erro servidor (${status}).`, retryable: true, pauseCampaign: false, cooldownMs: 3000, canTryOtherStrategy: true, failureStatus: "api_temporary" };
  return { ...base, detail: msg.substring(0, 140) || `HTTP ${status}`, retryable: true, pauseCampaign: false, cooldownMs: 3000, failureStatus: "unknown_failure" };
}

// ── Device selection ──
function parseDeviceIds(raw: any): string[] {
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return []; } }
  return [];
}

function pickDeviceId(campaign: any, blacklist: Map<string, number>): string | null {
  const ids = parseDeviceIds(campaign.device_ids);
  const available = ids.filter(id => !blacklist.has(id));
  if (available.length === 0) return null;
  if (available.length === 1) return available[0];

  const rotateAfterRaw = Number(campaign.rotate_after || 0);
  if (rotateAfterRaw <= 0) return available[0];

  // Round-robin based on total processed contacts, honoring rotate_after
  const processed = Number(campaign.success_count || 0) + Number(campaign.fail_count || 0) + Number(campaign.already_count || 0);
  const rotateAfter = Math.max(rotateAfterRaw, 1);
  return available[Math.floor(processed / rotateAfter) % available.length];
}

async function claimDeviceSendSlot(sb: any, deviceId: string, minDelaySeconds: number): Promise<number> {
  try {
    const minIntervalMs = Math.max(Math.round(Number(minDelaySeconds || 0) * 1000), MIN_DEVICE_SEND_INTERVAL_MS);
    const { data, error } = await sb.rpc("claim_device_send_slot", {
      p_device_id: deviceId,
      p_min_interval_ms: minIntervalMs,
    });

    if (error) {
      log.warn(`Device slot claim failed for ${deviceId.slice(0, 8)} — proceeding without DB throttle`, {
        error: error?.message || String(error),
      });
      return 0;
    }

    return Math.max(Number(data || 0), 0);
  } catch (error: any) {
    log.warn(`Device slot claim crashed for ${deviceId.slice(0, 8)} — proceeding without DB throttle`, {
      error: error?.message || String(error),
    });
    return 0;
  }
}

// ── Emit event ──
async function emitEvent(sb: any, campaignId: string, eventType: string, level: string, message?: string) {
  try {
    await sb.from("mass_inject_events").insert({
      campaign_id: campaignId,
      event_type: eventType,
      event_level: level,
      message: message || eventType,
    });
  } catch { /* non-critical */ }
}

// ── Update campaign counters (batched — only updates in-memory, flush writes to DB) ──
const COUNTER_FLUSH_INTERVAL = 5; // flush every N contacts processed

function updateCountersLocal(
  counterState: {
    success_count: number;
    already_count: number;
    fail_count: number;
    rate_limit_count: number;
    timeout_count: number;
    consecutive_failures: number;
    dirty: boolean;
  },
  status: string,
) {
  if (status === "completed") {
    counterState.success_count += 1;
    counterState.consecutive_failures = 0;
  } else if (status === "already_exists") {
    counterState.already_count += 1;
    counterState.consecutive_failures = 0;
  } else if (status === "rate_limited") {
    counterState.rate_limit_count += 1;
  } else if (status === "timeout") {
    counterState.timeout_count += 1;
  } else if (TRANSIENT_FAILURE_STATUSES.has(status)) {
    // Retryable statuses remain in queue; no counter change
  } else {
    counterState.fail_count += 1;
    // consecutive_failures is now tracked per-device in deviceCriticalErrors
    // Keep the counter for DB persistence but don't use it for pause decisions
    if (CRITICAL_FAILURE_STATUSES.has(status)) {
      counterState.consecutive_failures += 1;
    } else {
      counterState.consecutive_failures = 0;
    }
  }
  counterState.dirty = true;
}

async function flushCounters(
  sb: any,
  campaignId: string,
  counterState: {
    success_count: number;
    already_count: number;
    fail_count: number;
    rate_limit_count: number;
    timeout_count: number;
    consecutive_failures: number;
    dirty: boolean;
  },
) {
  if (!counterState.dirty) return;
  await sb.from("mass_inject_campaigns").update({
    success_count: counterState.success_count,
    already_count: counterState.already_count,
    fail_count: counterState.fail_count,
    rate_limit_count: counterState.rate_limit_count,
    timeout_count: counterState.timeout_count,
    consecutive_failures: counterState.consecutive_failures,
    updated_at: nowIso(),
  }).eq("id", campaignId);
  counterState.dirty = false;
}

async function finalizeCampaign(sb: any, campaignId: string): Promise<boolean> {
  const { count: pendingCount } = await sb.from("mass_inject_contacts")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", RETRYABLE_STATUSES);
  if (Number(pendingCount || 0) > 0) return false;

  const { count: failCount } = await sb.from("mass_inject_contacts")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", ["failed", "rate_limited", "api_temporary", "connection_unconfirmed", "session_dropped", "permission_unconfirmed", "confirmed_no_admin", "invalid_group", "contact_not_found", "unauthorized", "blocked", "unknown_failure", "timeout"]);

  const finalStatus = Number(failCount || 0) > 0 ? "completed_with_failures" : "done";
  await sb.from("mass_inject_campaigns").update({
    status: finalStatus,
    completed_at: nowIso(),
    updated_at: nowIso(),
    next_run_at: null,
  }).eq("id", campaignId);
  await emitEvent(sb, campaignId, "campaign_completed", "info", `Campanha finalizada: ${finalStatus}`);
  log.info(`Campaign ${campaignId.slice(0, 8)} finalized as ${finalStatus}`);
  return true;
}

/**
 * When a device worker exits early (disconnected / failed), redistribute its
 * pinned queue to the still-alive siblings using round-robin. Keeps the campaign
 * progressing without waiting for the dead device.
 */
async function reassignMyQueueToSiblings(
  sb: any,
  campaignId: string,
  deadDeviceId: string,
  campaignDeviceIds: string[],
  failedDeviceIds: Map<string, number>,
): Promise<void> {
  try {
    const alive = campaignDeviceIds.filter(
      (id) => id !== deadDeviceId && !failedDeviceIds.has(id),
    );
    const { data: count, error } = await sb.rpc("reassign_mass_inject_contacts", {
      p_campaign_id: campaignId,
      p_dead_device_id: deadDeviceId,
      p_alive_device_ids: alive,
    });
    if (error) {
      log.warn(`Campaign ${campaignId.slice(0, 8)}: reassign RPC failed for dead device ${deadDeviceId.slice(0, 8)}. ${String(error.message || error)}`);
      return;
    }
    if (Number(count || 0) > 0) {
      log.info(
        `Campaign ${campaignId.slice(0, 8)}: reassigned ${count} contact(s) from dead device ${deadDeviceId.slice(0, 8)} to ${alive.length} sibling(s)`,
      );
    }
  } catch (e: any) {
    log.warn(`Campaign ${campaignId.slice(0, 8)}: reassign crashed for dead device ${deadDeviceId.slice(0, 8)}. ${String(e?.message || e)}`);
  }
}

// ══════════════════════════════════════════════════════════
// MAIN WORKER: processes ONE campaign with PARALLEL device workers
// Each device claims contacts independently from the shared queue
// (claim_next_mass_inject_contact uses FOR UPDATE SKIP LOCKED).
// → More devices = automatic acceleration
// → Failed device = remaining workers absorb the load (auto-redistribution)
// ══════════════════════════════════════════════════════════
const BATCH_SIZE = 10; // contacts per device-worker per batch
async function processOneCampaign(sb: any, campaign: any, isRunningRef: { value: boolean }) {
  const campaignId = campaign.id;
  const slotLabel = `mass-inject:${campaignId.slice(0, 8)}`;
  await acquireGlobalSlot(slotLabel);
  activeCampaignIds.add(campaignId);

  // Shared counter state across all device workers of this campaign
  const counterState = {
    success_count: Number(campaign.success_count || 0),
    already_count: Number(campaign.already_count || 0),
    fail_count: Number(campaign.fail_count || 0),
    rate_limit_count: Number(campaign.rate_limit_count || 0),
    timeout_count: Number(campaign.timeout_count || 0),
    consecutive_failures: Number(campaign.consecutive_failures || 0),
    dirty: false,
  };
  const failedDeviceIds = new Map<string, number>();
  const stopAllRef = { value: false };

  try {
    if (campaign.status === "queued") {
      await sb.from("mass_inject_campaigns").update({ status: "processing", updated_at: nowIso() }).eq("id", campaignId);
      await emitEvent(sb, campaignId, "campaign_started", "info");
    }

    const initialDeviceIds = parseDeviceIds(campaign.device_ids);
    if (initialDeviceIds.length === 0) {
      log.warn(`Campaign ${campaignId.slice(0, 8)}: no devices configured — pausing`);
      await sb.from("mass_inject_campaigns").update({
        status: "paused", updated_at: nowIso(), next_run_at: null,
        pause_reason: "Nenhuma instância configurada para esta campanha.",
      }).eq("id", campaignId);
      return;
    }

    const liveWorkersRef = { value: initialDeviceIds.length };

    // Per-instance queue isolation: pre-distribute pending contacts across the
    // device pool using round-robin. Each contact gets pinned to ONE device,
    // so workers no longer compete for the same queue. Safe to call on every
    // tick — only unassigned rows are touched.
    try {
      const { data: assignedCount, error: distErr } = await sb.rpc("distribute_mass_inject_contacts", {
        p_campaign_id: campaignId,
        p_device_ids: initialDeviceIds,
      });
      if (distErr) {
        log.warn(`Campaign ${campaignId.slice(0, 8)}: distribute RPC failed — falling back to shared queue. ${String(distErr.message || distErr)}`);
      } else if (Number(assignedCount || 0) > 0) {
        log.info(`Campaign ${campaignId.slice(0, 8)}: distributed ${assignedCount} contact(s) round-robin across ${initialDeviceIds.length} instance(s)`);
      }
    } catch (e: any) {
      log.warn(`Campaign ${campaignId.slice(0, 8)}: distribute RPC crashed — proceeding without pre-assignment. ${String(e?.message || e)}`);
    }

    log.info(`Campaign ${campaignId.slice(0, 8)} launching ${initialDeviceIds.length} parallel device worker(s) — per-instance isolated queues`);

    // Run one parallel worker per device. Each worker only claims contacts
    // assigned to its own device (or unassigned fallback). A failed instance
    // never blocks siblings — its queue is reassigned via reassign_mass_inject_contacts.
    await Promise.all(initialDeviceIds.map((did) =>
      runDeviceWorker(sb, campaign, did, counterState, failedDeviceIds, stopAllRef, isRunningRef, liveWorkersRef)
        .catch((err: any) => {
          log.error(`Campaign ${campaignId.slice(0, 8)} device ${did.slice(0, 8)} worker error: ${err?.message || err}`);
        })
        .finally(() => { liveWorkersRef.value -= 1; }),
    ));

    await flushCounters(sb, campaignId, counterState);
    if (!stopAllRef.value) {
      await finalizeCampaign(sb, campaignId);
    }
  } catch (err: any) {
    const errMessage = String(err?.message || err || "Erro interno desconhecido");
    log.error(`Campaign ${campaignId.slice(0, 8)} crashed`, { error: errMessage, stack: err?.stack });
    try {
      await sb.from("mass_inject_contacts")
        .update({ status: "pending", error_message: "Reprocessando após falha interna do worker.", device_used: null } as any)
        .eq("campaign_id", campaignId)
        .eq("status", "processing");
      await sb.from("mass_inject_campaigns").update({
        status: "paused", updated_at: nowIso(), next_run_at: null,
        pause_reason: `Erro interno no motor VPS: ${errMessage.substring(0, 180)}`,
      }).eq("id", campaignId).in("status", ["queued", "processing"]);
      await emitEvent(sb, campaignId, "campaign_worker_crash", "error", `Erro interno no motor VPS: ${errMessage.substring(0, 220)}`);
    } catch (recoveryErr: any) {
      log.error(`Campaign ${campaignId.slice(0, 8)} crash recovery failed`, { error: String(recoveryErr?.message || recoveryErr || "Erro na recuperação") });
    }
  } finally {
    activeCampaignIds.delete(campaignId);
    releaseGlobalSlot(slotLabel);
  }
}

// ══════════════════════════════════════════════════════════
// DEVICE WORKER: pinned to ONE specific device. Runs in parallel
// with siblings; redistributes load when others fail.
// ══════════════════════════════════════════════════════════
async function runDeviceWorker(
  sb: any,
  campaign: any,
  myDeviceId: string,
  counterState: any,
  failedDeviceIds: Map<string, number>,
  stopAllRef: { value: boolean },
  isRunningRef: { value: boolean },
  liveWorkersRef: { value: number },
) {
  const campaignId = campaign.id;
  let contactsSinceFlush = 0;
  let contactsInLoop = 0;
  let cachedFreshCampaign: any = null;
  let batchProcessed = 0;
  let noNumberWarned = false;
  let batchAdded = 0;
  let batchAlready = 0;
  let batchFailed = 0;
  let batchSkipped = 0;
  // Circuit breaker: stop this worker if it produces too many consecutive add failures.
  let consecutiveAddFailures = 0;

  try {
    while (isRunningRef.value && !stopAllRef.value && batchProcessed < BATCH_SIZE) {
      // Clear stale device failures
      const now = Date.now();
      for (const [did, ts] of failedDeviceIds) {
        if (now - ts > DEVICE_RETRY_INTERVAL_MS) {
          failedDeviceIds.delete(did);
        }
      }
      // 1. Check campaign status — full refresh every 10 contacts or on first iteration
      if (!cachedFreshCampaign || contactsInLoop % 10 === 0) {
        const { data: freshCampaign } = await sb.from("mass_inject_campaigns").select("status, min_delay, max_delay, pause_after, pause_duration, rotate_after, device_ids, group_id, success_count, fail_count, already_count, rate_limit_count, timeout_count, consecutive_failures").eq("id", campaignId).single();
        if (!freshCampaign || !["queued", "processing"].includes(freshCampaign.status)) {
          log.info(`Campaign ${campaignId.slice(0, 8)} status=${freshCampaign?.status} — stopping`);
          break;
        }
        cachedFreshCampaign = freshCampaign;
        counterState.success_count = Number(freshCampaign.success_count || 0);
        counterState.already_count = Number(freshCampaign.already_count || 0);
        counterState.fail_count = Number(freshCampaign.fail_count || 0);
        counterState.rate_limit_count = Number(freshCampaign.rate_limit_count || 0);
        counterState.timeout_count = Number(freshCampaign.timeout_count || 0);
        counterState.consecutive_failures = Number(freshCampaign.consecutive_failures || 0);
        // consecutiveFailures now tracked per-device in deviceCriticalErrors map
      }
      const freshCampaign = cachedFreshCampaign;

      // 2. This worker is pinned to myDeviceId. If MY device failed, exit
      //    so siblings absorb my share (auto-redistribution). If I'm the LAST
      //    one alive and I'm down, pause the campaign.
      const deviceId = myDeviceId;
      if (failedDeviceIds.has(deviceId)) {
        const onlyMeLeft = liveWorkersRef.value <= 1;
        if (onlyMeLeft) {
          // Check if disconnected long enough → auto-pause
          const myState = deviceConnectionState.get(deviceId);
          const longDisconnected = myState?.status === "disconnected" && myState.confirmedDisconnectedAt
            && (Date.now() - myState.confirmedDisconnectedAt) > DEVICE_DISCONNECT_AUTO_PAUSE_MS;
          if (longDisconnected) {
            const elapsed = Math.round(DEVICE_DISCONNECT_AUTO_PAUSE_MS / 1000);
            const reason = `Última instância desconectada há mais de ${elapsed}s. Campanha pausada automaticamente.`;
            log.warn(`Campaign ${campaignId.slice(0, 8)}: ${reason}`);
            await sb.from("mass_inject_campaigns").update({
              status: "paused", updated_at: nowIso(), next_run_at: null, pause_reason: reason,
            }).eq("id", campaignId);
            await emitEvent(sb, campaignId, "campaign_auto_paused_disconnect", "warning", reason);
            stopAllRef.value = true;
            break;
          }
          // Wait briefly and retry — maybe device reconnects
          const waitMs = Math.min(DEVICE_RETRY_INTERVAL_MS * 2, 15_000);
          await sb.from("mass_inject_campaigns").update({
            updated_at: nowIso(),
            next_run_at: new Date(Date.now() + waitMs).toISOString(),
            pause_reason: "Aguardando reconexão das instâncias...",
          }).eq("id", campaignId);
          await sleep(waitMs);
          failedDeviceIds.delete(deviceId);
          continue;
        }
        // Siblings still alive — exit this worker; reassign MY pinned queue to them.
        await reassignMyQueueToSiblings(sb, campaignId, deviceId, parseDeviceIds(freshCampaign.device_ids), failedDeviceIds);
        log.info(`Campaign ${campaignId.slice(0, 8)} device ${deviceId.slice(0, 8)} stepping out — ${liveWorkersRef.value - 1} sibling(s) absorbing load (queue reassigned)`);
        break;
      }

      // Device lock is now acquired per-action (around addToGroup), not per-campaign

      // 3. Get device credentials
      const { data: device } = await sb.from("devices")
        .select("id, name, number, status, uazapi_base_url, uazapi_token")
        .eq("id", deviceId).single();

      if (!device?.uazapi_base_url || !device?.uazapi_token) {
        failedDeviceIds.set(deviceId, Date.now());
        continue;
      }

      const baseUrl = String(device.uazapi_base_url).replace(/\/+$/, "");
      const processed = counterState.success_count + counterState.fail_count + counterState.already_count;

      // 4. Smart connection pre-validation — checks cached state first, only hits API when needed
      // Force check if: device has accumulated API failures, or DB says disconnected
      const deviceState = deviceConnectionState.get(deviceId);
      const hasApiFailures = deviceState && deviceState.consecutiveApiFailures >= API_FAILURE_DISCONNECT_THRESHOLD;
      const dbSaysDisconnected = !CONNECTED_DEVICE_STATUSES.has(String(device.status || "").toLowerCase());
      const forceCheck = hasApiFailures || (dbSaysDisconnected && processed % 5 === 0);

      const connResult = await isInstanceConnected(deviceId, baseUrl, device.uazapi_token, forceCheck || processed === 0);

      if (!connResult.connected) {
        if (connResult.shouldSkipDevice) {
          failedDeviceIds.set(deviceId, Date.now());
          const campaignDeviceIds = parseDeviceIds(freshCampaign.device_ids);
          const aliveSiblingIds = campaignDeviceIds.filter((id) => id !== deviceId && !failedDeviceIds.has(id));

          if (aliveSiblingIds.length === 0) {
            const reason = `Instância ${device.name || deviceId.slice(0, 8)} desconectada. Reconecte a conta antes de retomar a campanha.`;
            log.warn(`Campaign ${campaignId.slice(0, 8)}: ${reason}`);
            await flushCounters(sb, campaignId, counterState);
            await sb.from("mass_inject_campaigns").update({
              status: "paused",
              updated_at: nowIso(),
              next_run_at: null,
              pause_reason: reason,
            }).eq("id", campaignId).in("status", ["queued", "processing"]);
            await emitEvent(sb, campaignId, "campaign_auto_paused_disconnect", "warning", reason);
            stopAllRef.value = true;
            break;
          }

          await reassignMyQueueToSiblings(sb, campaignId, deviceId, campaignDeviceIds, failedDeviceIds);
          log.info(`Campaign ${campaignId.slice(0, 8)}: device ${deviceId.slice(0, 8)} disconnected — releasing worker (queue reassigned)`);
          break;
        }
        // Unknown status — proceed cautiously
      }

      if (!noNumberWarned && !String(device.number || "").trim()) {
        log.warn(`Campaign ${campaignId.slice(0, 8)}: device ${device.name} has no number synced — own-number guard disabled`);
        noNumberWarned = true;
      }

      const slotWaitMs = await claimDeviceSendSlot(sb, deviceId, Number(freshCampaign.min_delay || 0));
      if (slotWaitMs > 0) {
        await sb.from("mass_inject_campaigns").update({
          updated_at: nowIso(),
          next_run_at: new Date(Date.now() + slotWaitMs).toISOString(),
          pause_reason: null,
        }).eq("id", campaignId);
        await sleep(slotWaitMs);
        continue;
      }

      // 5. Claim next contact from MY OWN per-instance queue (isolation).
      //    Falls back to unassigned contacts if my queue is empty.
      const { data: contact } = await sb.rpc("claim_next_mass_inject_contact_for_device", {
        p_campaign_id: campaignId,
        p_device_id: deviceId,
        p_device_used: device.name || device.id,
        p_processing_message: "Processando...",
      });

      if (!contact?.id) {
        // My queue is empty — exit. The orchestrator finalizes once all workers done.
        break;
      }

      const currentAttempt = Number((contact as any).attempt_count || 1);
      const isLastAttempt = currentAttempt >= MAX_CONTACT_ATTEMPTS;

      // 5b. Validate JID BEFORE any API call. Invalid contacts are marked
      //     immediately as failed and never re-claimed.
      const originalInput = String(contact.phone || "");
      const normalized = await normalizeContactJid(originalInput, baseUrl, device.uazapi_token);
      if (!normalized) {
        await sb.from("mass_inject_contacts").update({
          status: "failed",
          error_message: "Contato inválido (entrada vazia ou formato não suportado) — ignorado.",
          processed_at: nowIso(),
          device_used: device.name || device.id,
          attempt_count: MAX_CONTACT_ATTEMPTS, // never retry
        } as any).eq("id", contact.id);
        updateCountersLocal(counterState, "failed");
        contactsSinceFlush++;
        batchFailed++;
        log.info(`Campaign ${campaignId.slice(0, 8)}: skipped invalid contact original_input="${originalInput.slice(0, 40)}" normalized_number="" reason=empty_or_unsupported`);
        await sleep(200);
        continue;
      }
      log.info(`Campaign ${campaignId.slice(0, 8)}: contact_normalized original_input="${originalInput.slice(0, 40)}" normalized_number="${normalized.phone}" instance_id=${deviceId}`);

      // processed_at will be set in the final status update below — skip redundant write here

      // 6. Skip own number (admin's device number — can't add yourself)
      const groupId = contact.target_group_id || freshCampaign.group_id;
      const phone = normalized.phone;
      const deviceNumber = String(device.number || "").replace(/\D/g, "");
      const targetInfo = await getMassInjectTargetInfo(baseUrl, device.uazapi_token, groupId);

      if (targetInfo.kind === "community_root") {
        const result = await addToCommunity(targetInfo);
        await sb.from("mass_inject_contacts").update({
          status: result.failureStatus || "failed",
          error_message: result.detail,
          processed_at: nowIso(),
          device_used: device.name || device.id,
        }).eq("id", contact.id);
        updateCountersLocal(counterState, result.failureStatus || "failed");
        contactsSinceFlush++;
        batchFailed++;
        deviceCriticalErrors.delete(deviceId);
        log.warn(`add_skipped reason=community_root number=${phone} instance_id=${deviceId} group_id=${groupId} detail="${(result.detail || "").slice(0, 120)}"`);
        await sleep(1000);
        continue;
      }

      if (targetInfo.kind === "invalid") {
        await sb.from("mass_inject_contacts").update({
          status: "invalid_group",
          error_message: targetInfo.detail,
          processed_at: nowIso(),
          device_used: device.name || device.id,
        }).eq("id", contact.id);
        updateCountersLocal(counterState, "invalid_group");
        contactsSinceFlush++;
        batchFailed++;
        log.warn(`add_skipped reason=invalid_group number=${phone} instance_id=${deviceId} group_id=${groupId} detail="${(targetInfo.detail || "").slice(0, 120)}"`);
        await sleep(1000);
        continue;
      }

      if (deviceNumber && buildPhoneFingerprints(phone).some(fp => buildPhoneFingerprints(deviceNumber).some(dfp => dfp === fp))) {
        log.info(`add_skipped reason=own_device_number number=${phone} instance_id=${deviceId} group_id=${groupId}`);
        await sb.from("mass_inject_contacts").update({
          status: "already_exists", error_message: "Próprio número da instância (admin) — ignorado.", processed_at: nowIso(),
        }).eq("id", contact.id);
        updateCountersLocal(counterState, "already_exists");
        contactsSinceFlush++;
        if (contactsSinceFlush >= COUNTER_FLUSH_INTERVAL) { await flushCounters(sb, campaignId, counterState); contactsSinceFlush = 0; }
        deviceCriticalErrors.delete(deviceId);
        batchSkipped++;
        // Still apply configured delay even for skipped contacts
        {
          const minD = Number(freshCampaign.min_delay || 0);
          const maxD = Math.max(Number(freshCampaign.max_delay || 0), minD);
          const skipDelay = minD === maxD ? minD * 1000 : randomBetween(minD * 1000, maxD * 1000);
          if (skipDelay > 0) await sleep(skipDelay);
          else await sleep(500);
        }
        continue;
      }

      // 7. Pre-check: is the contact already in the group? (use cache only — don't fetch if not cached)
      const cacheKey = `${baseUrl}::${groupId}`;
      const cachedParticipants = participantCache.get(cacheKey);
      const useCachedCheck = cachedParticipants && cachedParticipants.confirmed && (Date.now() - cachedParticipants.fetchedAt < PARTICIPANT_CACHE_TTL_MS);
      // Only fetch fresh on first contact or every 100 — trust cache heavily
      const shouldFetchFresh = !useCachedCheck && (processed === 0 || processed % 100 === 0);
      const participantSnapshot = shouldFetchFresh
        ? await fetchGroupParticipants(baseUrl, device.uazapi_token, groupId)
        : (useCachedCheck ? cachedParticipants! : null);

      if (participantSnapshot?.confirmed && participantSetHasPhone(participantSnapshot.participants, phone)) {
        log.info(`add_skipped reason=already_in_group number=${phone} instance_id=${deviceId} group_id=${groupId}`);
        await sb.from("mass_inject_contacts").update({
          status: "already_exists", error_message: "Contato já participava do grupo.", processed_at: nowIso(),
        }).eq("id", contact.id);
        updateCountersLocal(counterState, "already_exists");
        contactsSinceFlush++;
        if (contactsSinceFlush >= COUNTER_FLUSH_INTERVAL) { await flushCounters(sb, campaignId, counterState); contactsSinceFlush = 0; }
        deviceCriticalErrors.delete(deviceId);
        batchAlready++;
        {
          const minD = Number(freshCampaign.min_delay || 0);
          const maxD = Math.max(Number(freshCampaign.max_delay || 0), minD);
          const skipDelay = minD === maxD ? minD * 1000 : randomBetween(minD * 1000, maxD * 1000);
          if (skipDelay > 0) await sleep(skipDelay);
          else await sleep(1000);
        }
        continue;
      }

      // 8. Add to group (lock only during the API call)
      const actionLockId = `${campaignId}:${contact.id}`;
      const lockAcquired = DeviceLockManager.tryAcquire(deviceId, "mass_inject", actionLockId);
      if (!lockAcquired) {
        // Device is busy with a conflicting heavy operation — revert contact to pending and skip
        await sb.from("mass_inject_contacts").update({ status: "pending", error_message: "Instância ocupada — reagendado.", device_used: null }).eq("id", contact.id);
        log.info(`add_skipped reason=device_busy_lock number=${phone} instance_id=${deviceId} group_id=${groupId} — will retry`);
        await sleep(2000);
        continue;
      }
      let result: Awaited<ReturnType<typeof addToGroup>>;
      const contactStartedAt = Date.now();
      const startIso = new Date(contactStartedAt).toISOString();
      try {
        // Per-contact hard timeout: never let a single attempt block the queue
        // for more than PER_CONTACT_MAX_PROCESSING_MS. If the underlying API
        // hangs, we abandon the contact as `timeout` and move on.
        const withDeadline = <T>(p: Promise<T>): Promise<T> => Promise.race([
          p,
          new Promise<T>((_, reject) =>
            setTimeout(
              () => reject(new Error(`per_contact_timeout:${PER_CONTACT_MAX_PROCESSING_MS}ms`)),
              PER_CONTACT_MAX_PROCESSING_MS,
            ),
          ),
        ]);

        // Pre-step: ensure contact exists in device's address book to bypass
        // the "only saved contacts can invite" privacy restriction.
        await ensureContactSaved(baseUrl, device.uazapi_token, phone);
        await sleep(randomBetween(500, 1500));

        // Pre-step: send "online" presence so the chip looks like it actually
        // opened the group before issuing the add command. Best-effort — never
        // blocks the actual add.
        const effectiveGroupId = targetInfo.kind === "community_child" ? targetInfo.targetId : groupId;
        try {
          await sendPresenceOnline(baseUrl, device.uazapi_token, effectiveGroupId);
          await sleep(randomBetween(400, 1200));
        } catch { /* never block the add */ }


        const doAdd = async (label = "primary") => {
          // MANDATORY pre-request log — proves the API is being called and with what.
          log.info(
            `sending_add_request label=${label} number=${phone} instance_id=${deviceId} group_id=${effectiveGroupId} endpoint=${baseUrl}/group/updateParticipants`,
          );
          const r = await addToGroup(baseUrl, device.uazapi_token, effectiveGroupId, phone);
          // MANDATORY post-response log — full body (truncated) + status code.
          log.info(
            `add_response label=${label} number=${phone} instance_id=${deviceId} group_id=${effectiveGroupId} http=${r.httpStatus ?? "?"} ok=${r.ok} already=${r.alreadyExists} status=${r.failureStatus || (r.ok ? "success" : "failed")} body=${(r.rawResponse || "").slice(0, 500)}`,
          );
          return r;
        };

        result = await withDeadline(doAdd("primary"));

        // ── Privacy handling: STRICT detection.
        // Only treat as privacy when the API explicitly says so. Generic
        // failures (timeout, rate limit, "unknown error", connection drops)
        // are NEVER classified as privacy here.
        if (isExplicitPrivacyError(result)) {
          log.warn(
            `retry_after_privacy: phone=${phone} group=${groupId} instance_id=${deviceId} — forcing contact save and retrying once. body=${(result.rawResponse || "").slice(0, 200)}`,
          );
          const saved = await ensureContactSaved(baseUrl, device.uazapi_token, phone, { force: true });
          if (saved) {
            await sleep(randomBetween(800, 1500));
            result = await withDeadline(doAdd("retry_after_privacy"));
          }
          if (isExplicitPrivacyError(result)) {
            log.warn(
              `privacy_blocked_final: phone=${phone} group=${groupId} instance_id=${deviceId} status=${result.httpStatus ?? "?"} body=${(result.rawResponse || "").slice(0, 300)}`,
            );
            result = { ...result, retryable: false, pauseCampaign: false, cooldownMs: 0, failureStatus: "failed" };
          }
        }

        // ── Generic-failure retry with exponential backoff (3s → 6s).
        // Applies to non-privacy, non-success, non-permanent failures only.
        // We retry up to 2 times. Privacy, "already in group", "blocked",
        // "contact_not_found", "invalid_group", "confirmed_no_admin" and
        // "unauthorized" are NOT retried here.
        const NON_RETRY_STATUSES = new Set([
          "blocked",
          "contact_not_found",
          "invalid_group",
          "confirmed_no_admin",
          "unauthorized",
        ]);
        const shouldRetryGeneric = (r: AddResult) =>
          !r.ok
          && !r.alreadyExists
          && !isExplicitPrivacyError(r)
          && !NON_RETRY_STATUSES.has(r.failureStatus || "");

        const backoffSchedule = [3_000, 6_000];
        for (let attempt = 0; attempt < backoffSchedule.length && shouldRetryGeneric(result); attempt++) {
          const delay = backoffSchedule[attempt];
          log.warn(
            `add_generic_retry attempt=${attempt + 1}/${backoffSchedule.length} phone=${phone} group=${groupId} instance_id=${deviceId} status=${result.failureStatus || "?"} http=${result.httpStatus ?? "?"} delay_ms=${delay} body=${(result.rawResponse || "").slice(0, 200)}`,
          );
          await sleep(delay);
          try {
            result = await withDeadline(doAdd(`generic_retry_${attempt + 1}`));
          } catch (retryErr: any) {
            // Treat retry exceptions as transient unknown failure so the loop
            // can decide whether to keep retrying (it won't, after 2 tries).
            result = {
              ok: false,
              alreadyExists: false,
              detail: `Falha durante retry: ${String(retryErr?.message || retryErr).slice(0, 120)}`,
              retryable: true,
              pauseCampaign: false,
              cooldownMs: 0,
              failureStatus: "unknown_failure",
              canTryOtherStrategy: false,
            };
          }
        }

        // After all retries, if still failing for a non-privacy reason, log
        // the full raw API response with diagnostic context.
        if (!result.ok && !result.alreadyExists && !isExplicitPrivacyError(result)) {
          log.warn(
            `add_failed_final phone=${phone} group=${groupId} instance_id=${deviceId} status=${result.failureStatus || "failed"} http=${result.httpStatus ?? "?"} detail="${(result.detail || "").slice(0, 160).replace(/"/g, "'")}" raw=${(result.rawResponse || "").slice(0, 500)}`,
          );
        }
      } catch (timeoutErr: any) {
        // Catches per-contact deadline. We synthesize a failed AddResult so the
        // queue ALWAYS advances — the contact is marked failed and we move on.
        const msg = String(timeoutErr?.message || timeoutErr || "timeout");
        log.warn(`per_contact_timeout: phone=${phone} group=${groupId} instance_id=${deviceId} after ${PER_CONTACT_MAX_PROCESSING_MS}ms — auto-failing and continuing.`);
        result = {
          ok: false,
          alreadyExists: false,
          detail: `Tempo máximo de processamento (${Math.round(PER_CONTACT_MAX_PROCESSING_MS / 1000)}s) excedido — contato abandonado. ${msg.slice(0, 80)}`,
          retryable: false,
          pauseCampaign: false,
          cooldownMs: 0,
          failureStatus: "timeout",
          canTryOtherStrategy: false,
        };
      } finally {
        DeviceLockManager.release(deviceId, actionLockId);
      }
      const contactEndedAt = Date.now();
      const endIso = new Date(contactEndedAt).toISOString();
      const elapsedMs = contactEndedAt - contactStartedAt;

      // Pre-classify failure type (needed for delay logic below)
      const detailLower = result.detail.toLowerCase();
      let isRateLimit = false;
      let isTimeout = false;
      let isConnectionIssue = false;
      let failStatus = "";
      let failureDetail = result.detail;

      if (result.ok) {
        await sb.from("mass_inject_contacts").update({
          status: "completed", error_message: result.detail, processed_at: nowIso(), next_retry_at: null,
        } as any).eq("id", contact.id);
        updateCountersLocal(counterState, "completed");
        contactsSinceFlush++;
        deviceCriticalErrors.delete(deviceId); // reset on success
        deviceRestrictionErrors.delete(deviceId);
        recordDeviceApiSuccess(deviceId); // mark device as healthy
        rememberParticipantInCache(baseUrl, groupId, phone);
        batchAdded++;
        consecutiveAddFailures = 0;
      } else if (result.alreadyExists) {
        await sb.from("mass_inject_contacts").update({
          status: "already_exists", error_message: result.detail, processed_at: nowIso(), next_retry_at: null,
        } as any).eq("id", contact.id);
        updateCountersLocal(counterState, "already_exists");
        contactsSinceFlush++;
        rememberParticipantInCache(baseUrl, groupId, phone);
        deviceCriticalErrors.delete(deviceId); // reset on success
        deviceRestrictionErrors.delete(deviceId);
        recordDeviceApiSuccess(deviceId); // mark device as healthy
        consecutiveAddFailures = 0;
      } else {
        // Classify retryable vs permanent failure
        isRateLimit = (result.failureStatus === "rate_limited") || detailLower.includes("rate limit") || detailLower.includes("rate-overlimit") || detailLower.includes("too many");
        isTimeout = detailLower.includes("timeout");
        isConnectionIssue =
          result.failureStatus === "session_dropped"
          || result.failureStatus === "connection_unconfirmed"
          || detailLower.includes("desconectada")
          || detailLower.includes("desconectado")
          || detailLower.includes("socket")
          || detailLower.includes("disconnected")
          || detailLower.includes("not connected")
          || detailLower.includes("logged out")
          || detailLower.includes("logout")
          || detailLower.includes("session dropped")
          || detailLower.includes("session not found")
          || detailLower.includes("websocket closed")
          || detailLower.includes("offline");
        failureDetail = result.detail;
        failStatus = result.failureStatus || (result.retryable
          ? (isRateLimit ? "rate_limited" : isTimeout ? "timeout" : isConnectionIssue ? "session_dropped" : "api_temporary")
          : "failed");

        // ── Rate limit: NEVER mark device disconnected. Pause this device for the
        //    full cooldown (30–60s), revert contact to pending so the queue
        //    automatically resumes after cooldown, and continue with siblings.
        if (isRateLimit) {
          const cooldownMs = Math.max(result.cooldownMs || 0, randomBetween(30_000, 60_000));
          log.warn(
            `Campaign ${campaignId.slice(0, 8)}: rate limited on device ${device.name || deviceId.slice(0, 8)} — cooldown started (${Math.round(cooldownMs / 1000)}s). Will retry automatically.`,
          );
          // Persist as `retrying` with backoff so the queue auto-resumes after cooldown.
          // We refund the attempt so the rate-limit doesn't burn one of the 3 tries.
          await sb.from("mass_inject_contacts").update({
            status: "retrying",
            error_message: `Rate limit — retry em ${Math.round(cooldownMs / 1000)}s`,
            device_used: null,
            attempt_count: Math.max(0, currentAttempt - 1),
            next_retry_at: new Date(Date.now() + cooldownMs).toISOString(),
          } as any).eq("id", contact.id);
          // Mark this device as cooling down so siblings absorb load.
          failedDeviceIds.set(deviceId, Date.now() + cooldownMs);
          log.info(`Campaign ${campaignId.slice(0, 8)}: retrying device ${device.name || deviceId.slice(0, 8)} after ${Math.round(cooldownMs / 1000)}s.`);
          await sleep(cooldownMs);
          consecutiveAddFailures = 0; // rate limit is not a hard failure
          continue;
        }

        // ── Connection issue: ALWAYS return contact to pending immediately so
        //    another chip can claim it. Refund the attempt — the lead is not at
        //    fault when the chip session drops. We also unpin the contact
        //    (assigned_device_id = NULL) so it falls back into the shared pool
        //    and any sibling worker may pick it up. Then we mark THIS device as
        //    failed; the worker exits, triggering reassignMyQueueToSiblings to
        //    redistribute its remaining queue. The campaign keeps running on the
        //    healthy chips (auto-redistribution).
        if (isConnectionIssue) {
          const shouldForceRecheck = recordDeviceApiFailure(deviceId, failureDetail);

          await sb.from("mass_inject_contacts").update({
            status: "pending",
            error_message: `Sessão caiu durante adição — devolvendo à fila: ${failureDetail.slice(0, 160)}`,
            device_used: null,
            assigned_device_id: null,
            attempt_count: Math.max(0, currentAttempt - 1),
            next_retry_at: null,
          } as any).eq("id", contact.id);

          batchFailed++;
          // Connection drops are infra issues — don't burn the worker's
          // consecutive-failure budget.
          consecutiveAddFailures = 0;

          if (shouldForceRecheck) {
            const health = await isInstanceConnected(deviceId, baseUrl, device.uazapi_token, true);
            if (!health.connected) {
              // Confirmed offline → flag device and let worker exit so siblings
              // pick up its queue via reassignMyQueueToSiblings.
              failedDeviceIds.set(deviceId, Date.now());
              log.warn(
                `Campaign ${campaignId.slice(0, 8)}: device ${deviceId.slice(0, 8)} confirmed offline after ${API_FAILURE_DISCONNECT_THRESHOLD} session drops — releasing worker so siblings absorb the load.`,
              );
              continue;
            }
            log.info(`Device ${deviceId.slice(0, 8)}: health check OK after session drop — continuing on this chip.`);
          } else {
            log.info(
              `Campaign ${campaignId.slice(0, 8)}: session drop on device ${deviceId.slice(0, 8)} — contact returned to pending pool, sibling will retry.`,
            );
          }

          // Brief pause before claiming next contact to avoid hammering a
          // wobbly socket.
          await sleep(randomBetween(2000, 4000));
          continue;
        }

        // Enforce MAX_CONTACT_ATTEMPTS: if this was the last allowed try and the
        // status is retryable-transient, downgrade to terminal "failed" so the
        // DB never re-claims it. This guarantees we never loop on the same
        // contact more than MAX_CONTACT_ATTEMPTS times.
        const isTransient = TRANSIENT_FAILURE_STATUSES.has(failStatus);
        let nextRetryAt: string | null = null;
        if (isLastAttempt && isTransient) {
          failureDetail = `Limite de ${MAX_CONTACT_ATTEMPTS} tentativas atingido — ${failureDetail}`;
          failStatus = "failed";
        } else if (isTransient) {
          // Smart retry: schedule next attempt with exponential backoff.
          const backoffMs = backoffMsForAttempt(currentAttempt);
          nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
          failureDetail = `Tentativa ${currentAttempt}/${MAX_CONTACT_ATTEMPTS} — retry em ${Math.round(backoffMs / 1000)}s (${failureDetail})`;
          failStatus = "retrying";
          log.info(
            `Campaign ${campaignId.slice(0, 8)}: contact ${phone} → retrying (attempt ${currentAttempt}/${MAX_CONTACT_ATTEMPTS}, backoff ${Math.round(backoffMs / 1000)}s)`,
          );
        }

        await sb.from("mass_inject_contacts").update({
          status: failStatus,
          error_message: failureDetail,
          processed_at: nowIso(),
          next_retry_at: nextRetryAt,
        } as any).eq("id", contact.id);
        updateCountersLocal(counterState, failStatus);
        contactsSinceFlush++;
        batchFailed++;

        // ── Per-device consecutive critical error tracking ──
        const isCriticalError = CRITICAL_FAILURE_STATUSES.has(failStatus);
        const isTransientError = TRANSIENT_FAILURE_STATUSES.has(failStatus);
        const isRestrictionError = failStatus === "blocked" || (failStatus === "failed" && /privacidade|contatos salvos|only allows|invite de contatos/i.test(failureDetail));

        if (isRestrictionError) {
          const restrictionCount = (deviceRestrictionErrors.get(deviceId) || 0) + 1;
          deviceRestrictionErrors.set(deviceId, restrictionCount);

          if (restrictionCount >= DEVICE_RESTRICTION_PAUSE_THRESHOLD) {
            const reason = `Pausada para proteger a conta: ${restrictionCount} contatos seguidos rejeitados pelo WhatsApp (${failureDetail}).`;
            log.warn(`Campaign ${campaignId.slice(0, 8)}: ${reason}`);
            await flushCounters(sb, campaignId, counterState);
            await sb.from("mass_inject_campaigns").update({
              status: "paused", updated_at: nowIso(), next_run_at: null, pause_reason: reason,
            }).eq("id", campaignId);
            await emitEvent(sb, campaignId, "campaign_paused", "warning", reason);
            stopAllRef.value = true;
            break;
          }
        } else if (!isTransientError) {
          deviceRestrictionErrors.delete(deviceId);
        }

        if (isCriticalError) {
          // Increment per-device critical error counter
          const devErrors = (deviceCriticalErrors.get(deviceId) || 0) + 1;
          deviceCriticalErrors.set(deviceId, devErrors);

          if (devErrors >= DEVICE_CRITICAL_PAUSE_THRESHOLD) {
            // Confirmed critical issue — pause whole campaign (signal siblings to stop)
            const reason = `Pausada: ${devErrors} erros críticos consecutivos (${failStatus}: ${failureDetail}).`;
            log.warn(`Campaign ${campaignId.slice(0, 8)}: ${reason}`);
            await flushCounters(sb, campaignId, counterState);
            await sb.from("mass_inject_campaigns").update({
              status: "paused", updated_at: nowIso(), next_run_at: null, pause_reason: reason,
            }).eq("id", campaignId);
            await emitEvent(sb, campaignId, "campaign_paused", "warning", reason);
            stopAllRef.value = true;
            break;
          }
          // Not enough consecutive critical errors — continue with next contact
          log.info(`Campaign ${campaignId.slice(0, 8)}: critical error ${devErrors}/${DEVICE_CRITICAL_PAUSE_THRESHOLD} on device ${device.name} — continuing`);
        } else if (isTransientError) {
          // Transient errors do NOT increment critical counter — just continue
          // Don't reset critical counter either (only success/already resets it)
        } else {
          // Non-critical permanent failure (blocked, contact_not_found, etc.) — just skip contact
          deviceCriticalErrors.delete(deviceId); // reset critical counter on non-critical failure
        }

        // ── Worker-level consecutive add-failure circuit breaker ──
        // Any add failure (transient OR permanent) increments this counter.
        // If it hits MAX_CONSECUTIVE_ADD_FAILURES we stop THIS worker; siblings
        // continue. Device is NOT marked disconnected just because adds failed.
        consecutiveAddFailures += 1;
        if (consecutiveAddFailures >= MAX_CONSECUTIVE_ADD_FAILURES) {
          const reason = `Worker pausado: ${consecutiveAddFailures} falhas consecutivas no device ${device.name || deviceId.slice(0, 8)}.`;
          log.warn(`Campaign ${campaignId.slice(0, 8)}: ${reason}`);
          await flushCounters(sb, campaignId, counterState);
          await emitEvent(sb, campaignId, "device_worker_circuit_break", "warning", reason);
          // Mark this device as temporarily unavailable so siblings absorb load.
          // We do NOT touch deviceConnectionState — the device may still be online.
          failedDeviceIds.set(deviceId, Date.now());
          break;
        }

        // If result says pauseCampaign (only for truly unrecoverable like no endpoint 405)
        if (result.pauseCampaign) {
          await flushCounters(sb, campaignId, counterState);
          await sb.from("mass_inject_campaigns").update({
            status: "paused", updated_at: nowIso(), next_run_at: null,
            pause_reason: result.detail,
          }).eq("id", campaignId);
          await emitEvent(sb, campaignId, "campaign_paused", "warning", result.detail);
          stopAllRef.value = true;
          break;
        }

        // Cooldown only for rate limits — short and capped
        if (isRateLimit && result.cooldownMs > 0) {
          await sleep(Math.min(result.cooldownMs, 8000));
        } else if ((isConnectionIssue || isTimeout) && result.cooldownMs > 0) {
          await sleep(Math.min(result.cooldownMs, 3000));
        }
      }



      // 9. Apply delay — ONLY full delay for successful actions
      // Transient failures (connection, timeout, rate limit) use micro-delay to retry faster
      contactsInLoop++;
      const wasSuccess = result.ok || result.alreadyExists;
      const wasTransient = !wasSuccess && (isConnectionIssue || isTimeout || isRateLimit || TRANSIENT_FAILURE_STATUSES.has(failStatus));

      let delayMs: number;
      if (wasTransient) {
        // Transient failure (non rate-limit; rate-limit is handled above with continue)
        delayMs = randomBetween(MIN_DEVICE_SEND_INTERVAL_MS, MAX_DEVICE_SEND_INTERVAL_MS);
      } else {
        // Success or permanent failure — apply user-configured delay, but enforce 3–6s floor.
        const minDelay = Math.max(Number(freshCampaign.min_delay ?? 0), MIN_DEVICE_SEND_INTERVAL_MS / 1000);
        const maxDelay = Math.max(Number(freshCampaign.max_delay ?? 0), Math.max(minDelay, MAX_DEVICE_SEND_INTERVAL_MS / 1000));
        delayMs = minDelay === maxDelay ? minDelay * 1000 : randomBetween(minDelay * 1000, maxDelay * 1000);
      }

      // Block pause check (only on successful processing)
      if (wasSuccess) {
        const pauseAfter = Number(freshCampaign.pause_after || 0);
        const pauseDuration = Number(freshCampaign.pause_duration || 0);
        const totalProcessed = processed + 1;
        if (pauseAfter > 0 && totalProcessed > 0 && totalProcessed % pauseAfter === 0) {
          delayMs = Math.max(delayMs, pauseDuration * 1000);
          log.info(`Campaign ${campaignId.slice(0, 8)}: block pause ${pauseDuration}s after ${totalProcessed} contacts`);
        }
      }

      // Flush counters + next_run_at together (batched write)
      if (contactsSinceFlush >= COUNTER_FLUSH_INTERVAL || delayMs >= 5000) {
        try {
          await sb.from("mass_inject_campaigns").update({
            success_count: counterState.success_count,
            already_count: counterState.already_count,
            fail_count: counterState.fail_count,
            rate_limit_count: counterState.rate_limit_count,
            timeout_count: counterState.timeout_count,
            consecutive_failures: counterState.consecutive_failures,
            next_run_at: new Date(Date.now() + delayMs).toISOString(),
            updated_at: nowIso(),
            pause_reason: wasTransient ? `Falha temporária — retry rápido` : null,
          }).eq("id", campaignId);
          counterState.dirty = false;
          contactsSinceFlush = 0;
        } catch { /* non-critical */ }
      }

      // Per-contact structured log: start, end, applied delay, result
      const outcome = result.ok
        ? "added"
        : result.alreadyExists
          ? "already_in_group"
          : (failStatus || "failed");
      log.info(
        `contact_processed campaign=${campaignId.slice(0, 8)} device=${(device.name || deviceId).toString().slice(0, 16)} phone=${phone} start_time=${startIso} end_time=${endIso} elapsed_ms=${elapsedMs} delay_applied_ms=${delayMs} result=${outcome} detail="${result.detail.slice(0, 120).replace(/"/g, "'")}"`,
      );

      // Always await the inter-contact delay so per-instance pacing is respected.
      await sleep(delayMs);
      batchProcessed++;
    }

    // Flush any remaining dirty counters at end of batch
    await flushCounters(sb, campaignId, counterState);

    // Batch summary log (single line replaces all per-contact logs)
    if (batchProcessed > 0) {
      const parts = [];
      if (batchAdded) parts.push(`+${batchAdded} added`);
      if (batchAlready) parts.push(`${batchAlready} already`);
      if (batchFailed) parts.push(`${batchFailed} failed`);
      if (batchSkipped) parts.push(`${batchSkipped} skipped`);
      const total = counterState.success_count + counterState.already_count + counterState.fail_count;
      log.info(`Campaign ${campaignId.slice(0, 8)}: batch ${batchProcessed} contacts [${parts.join(", ")}] — total ${total}/${campaign.total_items || "?"}`);
    }
  } catch (err: any) {
    const errMessage = String(err?.message || err || "Erro interno desconhecido");
    log.error(`Campaign ${campaignId.slice(0, 8)} device ${myDeviceId.slice(0, 8)} worker crashed`, {
      error: errMessage,
      stack: err?.stack,
    });

    // Reset any contacts this worker had in-flight back to pending
    try {
      await sb.from("mass_inject_contacts")
        .update({ status: "pending", error_message: "Reprocessando após falha do worker.", device_used: null } as any)
        .eq("campaign_id", campaignId)
        .eq("device_used", myDeviceId)
        .eq("status", "processing");
    } catch { /* non-critical */ }

    // Re-throw so orchestrator can decide whether to pause the whole campaign
    throw err;
  }
}

// ══════════════════════════════════════════════════════════
// TICK: finds active campaigns and launches them (fire-and-forget)
// Each campaign runs independently — tick returns immediately
// so new campaigns are detected on the next interval.
// ══════════════════════════════════════════════════════════
export async function massInjectTick(isRunningRef: { value: boolean }) {
  const db = getDb();

  // 1. Reset stale processing contacts (90s — slightly above PER_CONTACT_MAX_PROCESSING_MS
  //    so any row left in `processing` after a worker crash is requeued promptly).
  const staleThreshold = new Date(Date.now() - 90_000).toISOString();
  await db.from("mass_inject_contacts")
    .update({ status: "pending", error_message: "Reprocessando (timeout VPS).", device_used: null } as any)
    .eq("status", "processing")
    .or(`processed_at.lt.${staleThreshold},processed_at.is.null`);

  // 2. Find active campaigns (skip ones already being processed)
  // ── NO LIMITS: all campaigns run freely ──
  // const MAX_GLOBAL_CONCURRENT = 30;
  // const MAX_PER_USER_CONCURRENT = 10;

  const { data: campaigns } = await db.from("mass_inject_campaigns")
    .select("*")
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: true })
    .limit(20); // fetch more to allow per-user filtering

  if (!campaigns?.length) return;

  // Filter out campaigns already running in parallel
  const newCampaigns = campaigns.filter(c => !activeCampaignIds.has(c.id));
  if (!newCampaigns.length) return;

  // Count active campaigns per user (batch query instead of N+1)
  const activePerUser = new Map<string, number>();
  const missingIds = [...activeCampaignIds].filter(id => !campaigns.find(c => c.id === id));
  if (missingIds.length > 0) {
    const { data: missingCampaigns } = await db.from("mass_inject_campaigns")
      .select("id, user_id")
      .in("id", missingIds);
    for (const mc of missingCampaigns || []) {
      if (mc.user_id) activePerUser.set(mc.user_id, (activePerUser.get(mc.user_id) || 0) + 1);
    }
  }
  for (const c of campaigns) {
    if (activeCampaignIds.has(c.id) && c.user_id) {
      activePerUser.set(c.user_id, (activePerUser.get(c.user_id) || 0) + 1);
    }
  }

  // Launch each new campaign — no per-user or global limits
  for (const campaign of newCampaigns) {
    if (!isRunningRef.value) break;

    // Check if there are pending contacts
    const { count } = await db.from("mass_inject_contacts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .in("status", RETRYABLE_STATUSES);

    if (Number(count || 0) === 0) {
      await finalizeCampaign(db, campaign.id);
      continue;
    }

    // Fire-and-forget: launch campaign processing without awaiting
    const userActive = activePerUser.get(campaign.user_id) || 0;
    activePerUser.set(campaign.user_id, userActive + 1);
    log.info(`Launching campaign ${campaign.id.slice(0, 8)} "${campaign.name}" in parallel (user: ${userActive + 1}, global: ${activeCampaignIds.size + 1})`);
    processOneCampaign(db, campaign, isRunningRef).catch((err: any) => {
      log.error(`Campaign ${campaign.id.slice(0, 8)} error: ${err.message}`);
    });
  }

  lastMassInjectTickAt = new Date();
}
