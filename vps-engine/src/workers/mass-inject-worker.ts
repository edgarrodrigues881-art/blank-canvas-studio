// ══════════════════════════════════════════════════════════
// VPS Engine — Mass Group Inject Worker
// Continuous loop processor — replaces Edge Function self-invocation
// ══════════════════════════════════════════════════════════

import { getDb } from "../core/db";
import { createLogger } from "../core/logger";

import { DeviceLockManager } from "../core/device-lock-manager";
import { acquireGlobalSlot, releaseGlobalSlot } from "../core/global-semaphore";

const log = createLogger("mass-inject");

const API_TIMEOUT_MS = 25_000;

const MIN_DEVICE_SEND_INTERVAL_MS = 3_000;
const RETRYABLE_STATUSES = [
  "pending",
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
// Transient errors that do NOT count toward pause — just skip and continue
const TRANSIENT_FAILURE_STATUSES = new Set([
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
const DEVICE_DISCONNECTED_RECHECK_MS = 15_000; // re-check disconnected device every 15s
const DEVICE_DISCONNECT_AUTO_PAUSE_MS = 120_000; // auto-pause campaign if ALL devices disconnected for 2min
const API_FAILURE_DISCONNECT_THRESHOLD = 3; // after 3 consecutive API failures, force connection re-check

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
const PARTICIPANT_CACHE_TTL_MS = 30 * 60_000; // 30 min — trust cache heavily during a campaign
const PARTICIPANT_FAILURE_CACHE_TTL_MS = 10 * 60_000; // 10 min — even failed lookups shouldn't retry often
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
  const h: Record<string, string> = { token, Accept: "application/json", "Cache-Control": "no-cache" };
  if (json) h["Content-Type"] = "application/json";
  return h;
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

function normalizePhone(raw: string): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  const phone = digits.startsWith("55") ? digits : `55${digits}`;
  if (phone.length < 12 || phone.length > 13) return null;
  return phone;
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
    deviceConnectionState.set(deviceId, {
      status: "connected",
      lastCheckedAt: now,
      confirmedDisconnectedAt: null,
      consecutiveApiFailures: 0,
    });
    return { connected: true, detail: result.detail, shouldSkipDevice: false };
  }

  if (result.connected === false) {
    const prevState = deviceConnectionState.get(deviceId);
    deviceConnectionState.set(deviceId, {
      status: "disconnected",
      lastCheckedAt: now,
      confirmedDisconnectedAt: prevState?.confirmedDisconnectedAt || now,
      consecutiveApiFailures: prevState?.consecutiveApiFailures || 0,
    });
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
    state.consecutiveApiFailures = 0;
    state.status = "connected";
    state.confirmedDisconnectedAt = null;
    state.lastCheckedAt = Date.now();
    deviceConnectionState.set(deviceId, state);
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

function buildAddStrategies(baseUrl: string, groupId: string, phone: string) {
  const p = phone.replace(/@.*/, "");
  return [
    // Strategy 0: Most common UAZAPI endpoint (groupJid camelCase)
    { method: "POST" as const, url: `${baseUrl}/group/updateParticipants`, body: { groupJid: groupId, action: "add", participants: [p] } },
    // Strategy 1: lowercase groupjid variant
    { method: "POST" as const, url: `${baseUrl}/group/updateParticipants`, body: { groupjid: groupId, action: "add", participants: [p] } },
    // Strategy 2: PUT with query param
    { method: "PUT" as const, url: `${baseUrl}/group/updateParticipant?groupJid=${encodeURIComponent(groupId)}`, body: { action: "add", participants: [p] } },
    // Strategy 3: with @s.whatsapp.net suffix (fallback for strict APIs)
    { method: "POST" as const, url: `${baseUrl}/group/updateParticipants`, body: { groupJid: groupId, action: "add", participants: [`${p}@s.whatsapp.net`] } },
    // Strategy 4: legacy addParticipant endpoint
    { method: "POST" as const, url: `${baseUrl}/group/addParticipant`, body: { groupJid: groupId, participant: p } },
  ];
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

    const gu = body?.groupUpdated || body?.data?.groupUpdated;
    if (Array.isArray(gu) && gu.length > 0) {
      const errCode = Number(gu[0]?.Error ?? gu[0]?.error ?? -1);
      if (errCode === 0 || errCode === 200 || errCode === 201) {
        return { ok: true, alreadyExists: false, detail: "Adicionado com sucesso.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx, canTryOtherStrategy: false };
      }
      if (errCode === 409) {
        return { ok: false, alreadyExists: true, detail: "Já no grupo.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx, canTryOtherStrategy: false };
      }
      if (errCode === 403) {
        return { ok: false, alreadyExists: false, detail: "Privacidade: só aceita convite de contatos salvos.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx, canTryOtherStrategy: false, failureStatus: "failed" };
      }
      if (errCode >= 400) {
        return classifyFailure(errorMsgLower || rawLower, errCode, idx);
      }
      return { ok: true, alreadyExists: false, detail: "Adicionado com sucesso.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx, canTryOtherStrategy: false };
    }

    const groupObj = body?.group || body?.data?.group;
    if (groupObj && typeof groupObj === "object" && (groupObj.JID || groupObj.jid || groupObj.id)) {
      if ((res.status === 200 || res.status === 201) && !hasExplicitFailure(errorMsgLower)) {
        return { ok: true, alreadyExists: false, detail: "Adicionado com sucesso.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx, canTryOtherStrategy: false };
      }
    }

    if (errorMsgLower.includes("already") || errorMsgLower.includes("já") || errorMsgLower.includes("memberaddmode") || res.status === 409) {
      return { ok: false, alreadyExists: true, detail: "Já no grupo.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx, canTryOtherStrategy: false };
    }

    if ((res.status === 200 || res.status === 201) && !hasExplicitFailure(errorMsgLower)) {
      return { ok: true, alreadyExists: false, detail: "Adicionado com sucesso.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx, canTryOtherStrategy: false };
    }

    return classifyFailure(errorMsgLower || rawLower, res.status, idx);
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

  // ── DISCOVERY PATH: Try strategies in order, STOP on first non-405 response ──
  for (let i = 0; i < strategies.length; i++) {
    if (i === cachedIdx) continue; // Already tried above
    try {
      const { res, raw, body, idx } = await tryStrategy(i);
      if (res.status === 405) continue; // Endpoint not supported, try next

      const result = processResult(res, raw, body, idx);

      // Any non-405 response means this endpoint exists — cache it and return
      if (!result.canTryOtherStrategy) {
        endpointCache.set(cacheKey, idx);
        return result;
      }

      // Transient error but endpoint exists — cache it for next contacts, return the transient result
      endpointCache.set(cacheKey, idx);
      return result;
    } catch (e: any) {
      // Network/timeout error — don't cache, try next strategy
      continue;
    }
  }

  return { ok: false, alreadyExists: false, detail: "Nenhum endpoint encontrado (405).", retryable: false, pauseCampaign: true, cooldownMs: 0, canTryOtherStrategy: false, failureStatus: "failed" };
}

/** Check if the lowercase error message contains keywords that indicate a real failure even on 2xx */
function hasExplicitFailure(msg: string): boolean {
  if (!msg) return false;
  const keywords = ["blocked", "ban", "not admin", "not an admin", "not found", "unauthorized", "invalid token", "disconnected", "session disconnected", "privacidade", "saved contacts", "contatos salvos", "only allows"];
  return keywords.some((kw) => msg.includes(kw));
}

function classifyFailure(msg: string, status: number, strategyIndex: number): AddResult {
  const base = { ok: false as const, alreadyExists: false, strategyIndex, canTryOtherStrategy: false };
  if (msg.includes("rate-overlimit") || msg.includes("429") || msg.includes("too many") || status === 429)
    return { ...base, detail: "Rate limit.", retryable: true, pauseCampaign: false, cooldownMs: 8000, failureStatus: "rate_limited" };
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
  if (status === 503 || msg.includes("disconnected") || msg.includes("session disconnected") || msg.includes("socket closed"))
    return { ...base, detail: "Instância desconectada.", retryable: true, pauseCampaign: false, cooldownMs: 3000, canTryOtherStrategy: true, failureStatus: "connection_unconfirmed" };
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

// ══════════════════════════════════════════════════════════
// MAIN WORKER: processes ONE campaign in batches of BATCH_SIZE contacts
// After each batch, yields execution so the next tick can rebalance.
// ══════════════════════════════════════════════════════════
const BATCH_SIZE = 10; // contacts per batch — keeps execution short
async function processOneCampaign(sb: any, campaign: any, isRunningRef: { value: boolean }) {
  const campaignId = campaign.id;
  const counterState = {
    success_count: Number(campaign.success_count || 0),
    already_count: Number(campaign.already_count || 0),
    fail_count: Number(campaign.fail_count || 0),
    rate_limit_count: Number(campaign.rate_limit_count || 0),
    timeout_count: Number(campaign.timeout_count || 0),
    consecutive_failures: Number(campaign.consecutive_failures || 0),
    dirty: false,
  };
  let contactsSinceFlush = 0;

  const slotLabel = `mass-inject:${campaignId.slice(0, 8)}`;
  await acquireGlobalSlot(slotLabel);
  activeCampaignIds.add(campaignId);
  log.info(`Processing campaign ${campaignId.slice(0, 8)}: group=${campaign.group_id}, contacts=${campaign.total_items || "?"}`);
  try {
    // Mark as processing
    if (campaign.status === "queued") {
      await sb.from("mass_inject_campaigns").update({ status: "processing", updated_at: nowIso() }).eq("id", campaignId);
      await emitEvent(sb, campaignId, "campaign_started", "info");
    }

    const failedDeviceIds = new Map<string, number>();

    let contactsInLoop = 0;
    let cachedFreshCampaign: any = null;
    let batchProcessed = 0;
    let noNumberWarned = false; // log "no number" only once per campaign run
    // Batch summary counters (for reduced logging)
    let batchAdded = 0;
    let batchAlready = 0;
    let batchFailed = 0;
    let batchSkipped = 0;

    while (isRunningRef.value && batchProcessed < BATCH_SIZE) {
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

      // 2. Pick a device
      const deviceId = pickDeviceId(freshCampaign, failedDeviceIds);
      if (!deviceId) {
        if (failedDeviceIds.size > 0) {
          // Check if ALL devices have been disconnected for too long → auto-pause
          const allIds = parseDeviceIds(freshCampaign.device_ids);
          const allDisconnectedLong = allIds.every(id => {
            const state = deviceConnectionState.get(id);
            return state?.status === "disconnected" && state.confirmedDisconnectedAt
              && (Date.now() - state.confirmedDisconnectedAt) > DEVICE_DISCONNECT_AUTO_PAUSE_MS;
          });

          if (allDisconnectedLong) {
            const elapsed = Math.round(DEVICE_DISCONNECT_AUTO_PAUSE_MS / 1000);
            const reason = `Todas as instâncias desconectadas há mais de ${elapsed}s. Campanha pausada automaticamente.`;
            log.warn(`Campaign ${campaignId.slice(0, 8)}: ${reason}`);
            await sb.from("mass_inject_campaigns").update({
              status: "paused", updated_at: nowIso(), next_run_at: null,
              pause_reason: reason,
            }).eq("id", campaignId);
            await emitEvent(sb, campaignId, "campaign_auto_paused_disconnect", "warning", reason);
            break;
          }

          // Not long enough — wait and retry with progressive check
          const waitMs = Math.min(DEVICE_RETRY_INTERVAL_MS * 2, 15_000); // wait 12-15s
          await sb.from("mass_inject_campaigns").update({
            updated_at: nowIso(),
            next_run_at: new Date(Date.now() + waitMs).toISOString(),
            pause_reason: "Aguardando reconexão das instâncias...",
          }).eq("id", campaignId);
          await sleep(waitMs);
          failedDeviceIds.clear(); // allow re-check on next iteration
          continue;
        }

        log.warn(`Campaign ${campaignId.slice(0, 8)}: no devices available — pausing`);
        await sb.from("mass_inject_campaigns").update({
          status: "paused", updated_at: nowIso(), next_run_at: null,
          pause_reason: "Nenhuma instância conectada e válida disponível. Conecte outra conta e retome.",
        }).eq("id", campaignId);
        await emitEvent(sb, campaignId, "campaign_failed_no_devices", "warning", "Nenhuma instância disponível.");
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
          // Device confirmed disconnected — skip without consuming contact
          failedDeviceIds.set(deviceId, Date.now());

          // Check if ALL devices are down
          const allIds = parseDeviceIds(freshCampaign.device_ids);
          const allDown = allIds.every(id => {
            const s = deviceConnectionState.get(id);
            return failedDeviceIds.has(id) || (s?.status === "disconnected");
          });

          if (allDown) {
            await emitEvent(sb, campaignId, "all_sessions_dropped", "warning", "Todas as instâncias desconectadas. Aguardando reconexão...");
            await sb.from("mass_inject_campaigns").update({
              updated_at: nowIso(),
              next_run_at: new Date(Date.now() + DEVICE_DISCONNECTED_RECHECK_MS).toISOString(),
              pause_reason: "Aguardando reconexão das instâncias...",
            }).eq("id", campaignId);
            await sleep(DEVICE_DISCONNECTED_RECHECK_MS);
            failedDeviceIds.clear();
            continue;
          }
          continue; // try next device
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

      // 5. Claim next contact
      const { data: contact } = await sb.rpc("claim_next_mass_inject_contact", {
        p_campaign_id: campaignId,
        p_device_used: device.name || device.id,
        p_processing_message: "Processando...",
      });

      if (!contact?.id) {
        // No more contacts — finalize
        await finalizeCampaign(sb, campaignId);
        break;
      }

      // processed_at will be set in the final status update below — skip redundant write here

      // 6. Skip own number (admin's device number — can't add yourself)
      const groupId = contact.target_group_id || freshCampaign.group_id;
      const phone = String(contact.phone).replace(/@.*/, "");
      const deviceNumber = String(device.number || "").replace(/\D/g, "");
      if (deviceNumber && buildPhoneFingerprints(phone).some(fp => buildPhoneFingerprints(deviceNumber).some(dfp => dfp === fp))) {
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
        log.info(`Campaign ${campaignId.slice(0, 8)}: device ${device.name} busy — skipping contact ${phone}, will retry`);
        await sleep(2000);
        continue;
      }
      let result: Awaited<ReturnType<typeof addToGroup>>;
      try {
        result = await addToGroup(baseUrl, device.uazapi_token, groupId, phone);
      } finally {
        DeviceLockManager.release(deviceId, actionLockId);
      }

      // Pre-classify failure type (needed for delay logic below)
      const detailLower = result.detail.toLowerCase();
      let isRateLimit = false;
      let isTimeout = false;
      let isConnectionIssue = false;
      let failStatus = "";
      let failureDetail = result.detail;

      if (result.ok) {
        await sb.from("mass_inject_contacts").update({
          status: "completed", error_message: result.detail, processed_at: nowIso(),
        }).eq("id", contact.id);
        updateCountersLocal(counterState, "completed");
        contactsSinceFlush++;
        deviceCriticalErrors.delete(deviceId); // reset on success
        recordDeviceApiSuccess(deviceId); // mark device as healthy
        rememberParticipantInCache(baseUrl, groupId, phone);
        batchAdded++;
      } else if (result.alreadyExists) {
        await sb.from("mass_inject_contacts").update({
          status: "already_exists", error_message: result.detail, processed_at: nowIso(),
        }).eq("id", contact.id);
        updateCountersLocal(counterState, "already_exists");
        contactsSinceFlush++;
        rememberParticipantInCache(baseUrl, groupId, phone);
        deviceCriticalErrors.delete(deviceId); // reset on success
        recordDeviceApiSuccess(deviceId); // mark device as healthy
      } else {
        // Classify retryable vs permanent failure
        isRateLimit = detailLower.includes("rate limit") || result.cooldownMs >= 30000;
        isTimeout = detailLower.includes("timeout");
        isConnectionIssue = detailLower.includes("desconectada") || detailLower.includes("socket") || detailLower.includes("disconnected");
        failureDetail = result.detail;
        failStatus = result.failureStatus || (result.retryable
          ? (isRateLimit ? "rate_limited" : isTimeout ? "timeout" : isConnectionIssue ? "connection_unconfirmed" : "api_temporary")
          : "failed");

        // Track API failures for connection state
        if (isConnectionIssue || isTimeout) {
          const shouldForceRecheck = recordDeviceApiFailure(deviceId, failureDetail);
          if (shouldForceRecheck && isConnectionIssue) {
            // Connection issue confirmed by API failures — revert contact to pending (don't consume attempt)
            await sb.from("mass_inject_contacts").update({
              status: "pending", error_message: `Aguardando reconexão: ${failureDetail}`, device_used: null,
            }).eq("id", contact.id);
            failedDeviceIds.set(deviceId, Date.now());
            batchFailed++;
            // Don't count this as a campaign failure — device is the issue
            continue;
          }
        }

        if (isConnectionIssue) {
          failStatus = "api_temporary";
          failureDetail = `Oscilação temporária: ${result.detail}`.trim();
        }
        
        await sb.from("mass_inject_contacts").update({
          status: failStatus, error_message: failureDetail, processed_at: nowIso(),
        }).eq("id", contact.id);
        updateCountersLocal(counterState, failStatus);
        contactsSinceFlush++;
        batchFailed++;

        // ── Per-device consecutive critical error tracking ──
        const isCriticalError = CRITICAL_FAILURE_STATUSES.has(failStatus);
        const isTransientError = TRANSIENT_FAILURE_STATUSES.has(failStatus);

        if (isCriticalError) {
          // Increment per-device critical error counter
          const devErrors = (deviceCriticalErrors.get(deviceId) || 0) + 1;
          deviceCriticalErrors.set(deviceId, devErrors);

          if (devErrors >= DEVICE_CRITICAL_PAUSE_THRESHOLD) {
            // Confirmed critical issue — pause campaign
            const reason = `Pausada: ${devErrors} erros críticos consecutivos (${failStatus}: ${failureDetail}).`;
            log.warn(`Campaign ${campaignId.slice(0, 8)}: ${reason}`);
            await flushCounters(sb, campaignId, counterState);
            await sb.from("mass_inject_campaigns").update({
              status: "paused", updated_at: nowIso(), next_run_at: null, pause_reason: reason,
            }).eq("id", campaignId);
            await emitEvent(sb, campaignId, "campaign_paused", "warning", reason);
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

        // If result says pauseCampaign (only for truly unrecoverable like no endpoint 405)
        if (result.pauseCampaign) {
          await flushCounters(sb, campaignId, counterState);
          await sb.from("mass_inject_campaigns").update({
            status: "paused", updated_at: nowIso(), next_run_at: null,
            pause_reason: result.detail,
          }).eq("id", campaignId);
          await emitEvent(sb, campaignId, "campaign_paused", "warning", result.detail);
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
        // Transient failure — don't waste user's configured delay, just short pause
        delayMs = isRateLimit ? Math.min(result.cooldownMs || 5000, 8000) : randomBetween(2000, 4000);
      } else {
        // Success or permanent failure — apply user-configured delay
        const minDelay = Number(freshCampaign.min_delay ?? 0);
        const maxDelay = Math.max(Number(freshCampaign.max_delay ?? 0), minDelay);
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
    log.error(`Campaign ${campaignId.slice(0, 8)} crashed`, {
      error: errMessage,
      stack: err?.stack,
    });

    try {
      await sb.from("mass_inject_contacts")
        .update({
          status: "pending",
          error_message: "Reprocessando após falha interna do worker.",
          device_used: null,
        } as any)
        .eq("campaign_id", campaignId)
        .eq("status", "processing");

      await sb.from("mass_inject_campaigns").update({
        status: "paused",
        updated_at: nowIso(),
        next_run_at: null,
        pause_reason: `Erro interno no motor VPS: ${errMessage.substring(0, 180)}`,
      }).eq("id", campaignId).in("status", ["queued", "processing"]);

      await emitEvent(
        sb,
        campaignId,
        "campaign_worker_crash",
        "error",
        `Erro interno no motor VPS: ${errMessage.substring(0, 220)}`,
      );
    } catch (recoveryErr: any) {
      log.error(`Campaign ${campaignId.slice(0, 8)} crash recovery failed`, {
        error: String(recoveryErr?.message || recoveryErr || "Erro na recuperação"),
      });
    }
  } finally {
    activeCampaignIds.delete(campaignId);
    releaseGlobalSlot(slotLabel);
  }
}

// ══════════════════════════════════════════════════════════
// TICK: finds active campaigns and launches them (fire-and-forget)
// Each campaign runs independently — tick returns immediately
// so new campaigns are detected on the next interval.
// ══════════════════════════════════════════════════════════
export async function massInjectTick(isRunningRef: { value: boolean }) {
  const db = getDb();

  // 1. Reset stale processing contacts (including rows without processed_at)
  const staleThreshold = new Date(Date.now() - 3 * 60_000).toISOString();
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
