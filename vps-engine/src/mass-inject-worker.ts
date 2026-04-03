// ══════════════════════════════════════════════════════════
// VPS Engine — Mass Group Inject Worker
// Continuous loop processor — replaces Edge Function self-invocation
// ══════════════════════════════════════════════════════════

import { getDb } from "./db";
import { createLogger } from "./lib/logger";
import { config } from "./config";
import { DeviceLockManager } from "./lib/device-lock-manager";
import { acquireGlobalSlot, releaseGlobalSlot } from "./lib/global-semaphore";

const log = createLogger("mass-inject");

const API_TIMEOUT_MS = 25_000;
const MAX_CONSECUTIVE_FAILURES = 25;
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
const DISCONNECT_RECHECK_INTERVAL_MS = 2_000;
const CONNECTED_DEVICE_STATUSES = new Set(["connected", "ready", "active", "authenticated", "open", "online"]);
const FINAL_FAILURE_STATUSES = new Set([
  "failed",
  "confirmed_no_admin",
  "invalid_group",
  "contact_not_found",
  "unauthorized",
  "blocked",
]);
const AUTO_PAUSE_FAILURE_STATUSES = new Set(["confirmed_no_admin", "invalid_group", "unauthorized"]);
const TRANSIENT_FAILURE_STATUSES = new Set([
  "rate_limited",
  "api_temporary",
  "connection_unconfirmed",
  "session_dropped",
  "permission_unconfirmed",
  "unknown_failure",
  "timeout",
]);

const DEVICE_RETRY_INTERVAL_MS = 6_000; // 6s — fast retry, don't block

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
const PARTICIPANT_CACHE_TTL_MS = 10 * 60_000; // 10 min — less refetching
const PARTICIPANT_FAILURE_CACHE_TTL_MS = 3 * 60_000; // 3 min

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
  // Check cache first
  const cacheKey = `${baseUrl}::${groupId}`;
  const cached = participantCache.get(cacheKey);
  if (cached) {
    const ttlMs = cached.confirmed ? PARTICIPANT_CACHE_TTL_MS : PARTICIPANT_FAILURE_CACHE_TTL_MS;
    if (Date.now() - cached.fetchedAt < ttlMs) {
      return cached;
    }
  }

  const participants = new Set<string>();

  // Strategy 1: /group/list with participants
  try {
    const res = await fetchWithTimeout(`${baseUrl}/group/list?GetParticipants=true&count=500`, { headers: buildHeaders(token) });
    if (res.ok) {
      const body: any = await res.json();
      const groups = Array.isArray(body) ? body : body?.groups || body?.data || [];
      const target = groups.find((g: any) => (g?.JID || g?.jid || g?.id || "") === groupId);
      if (target) {
        collectParticipants(target?.Participants || target?.participants || target?.members || [], participants);
        if (participants.size > 0) {
            const entry = { participants, fetchedAt: Date.now(), confirmed: true };
            participantCache.set(cacheKey, entry);
            return entry;
        }
      }
    }
  } catch (e) { /* fallback */ }

  // Strategy 2: /group/fetchAllGroups
  try {
    const res = await fetchWithTimeout(`${baseUrl}/group/fetchAllGroups`, { headers: buildHeaders(token) });
    if (res.ok) {
      const body: any = await res.json();
      const groups = Array.isArray(body) ? body : body?.groups || body?.data || [];
      const target = groups.find((g: any) => (g?.JID || g?.jid || g?.id || "") === groupId);
      if (target) {
        collectParticipants(target?.Participants || target?.participants || target?.members || [], participants);
        if (participants.size > 0) {
          const entry = { participants, fetchedAt: Date.now(), confirmed: true };
          participantCache.set(cacheKey, entry);
          return entry;
        }
      }
    }
  } catch (e) { /* fallback */ }

  // Strategy 3-5: individual endpoints
  const fallbacks = [
    { method: "POST" as const, url: `${baseUrl}/group/info`, body: { groupJid: groupId } },
    { method: "GET" as const, url: `${baseUrl}/group/info?groupJid=${encodeURIComponent(groupId)}` },
    { method: "POST" as const, url: `${baseUrl}/chat/info`, body: { chatId: groupId } },
  ];
  for (const fb of fallbacks) {
    try {
      const res = await fetchWithTimeout(fb.url, {
        method: fb.method,
        headers: fb.body ? buildHeaders(token, true) : buildHeaders(token),
        ...(fb.body ? { body: JSON.stringify(fb.body) } : {}),
      });
      if (!res.ok) continue;
      const body: any = await res.json();
      const gp = body?.group || body?.data?.group || body?.data || body;
      collectParticipants(gp?.Participants || gp?.participants || gp?.members || [], participants);
      if (participants.size > 0) {
        const entry = { participants, fetchedAt: Date.now(), confirmed: true };
        participantCache.set(cacheKey, entry);
        return entry;
      }
    } catch { /* continue */ }
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

      // Not yet confirmed — treat as uncertain, retry on next cycle
      log.info(`Device ${baseUrl.slice(0, 30)} reported disconnected (streak ${streak}/${DISCONNECT_CONFIRM_THRESHOLD}) — not blocking yet`);
      return { connected: null, detail: `Status instável (${streak}/${DISCONNECT_CONFIRM_THRESHOLD} checks negativos).` };
    }

    // "unknown" — don't block, just proceed
    log.info(`Device ${baseUrl.slice(0, 30)} status unknown — proceeding normally`);
    return { connected: null, detail: extractProviderMessage(body, raw) || "Status incerto — prosseguindo." };
  } catch (error: any) {
    // Network error / timeout — don't immediately mark as disconnected
    const key = baseUrl;
    const streak = (deviceDisconnectStreak.get(key) || 0) + 1;
    deviceDisconnectStreak.set(key, streak);

    if (streak >= DISCONNECT_CONFIRM_THRESHOLD) {
      return { connected: false, detail: `Falha de rede confirmada após ${streak} tentativas: ${error?.message || "erro"}` };
    }

    log.info(`Device ${baseUrl.slice(0, 30)} check failed (streak ${streak}/${DISCONNECT_CONFIRM_THRESHOLD}): ${error?.message} — not blocking`);
    return { connected: null, detail: error?.message || "Falha temporária na verificação." };
  }
}
    }
  }

  if (results.length > 0 && results.every((entry) => entry.connected === false)) {
    return { connected: false, detail: `Desconexão confirmada após ${Math.max(1, checks)} verificações.` };
  }

  return results[results.length - 1] || { connected: null, detail: "Não foi possível validar a conexão da instância." };
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
    { method: "POST" as const, url: `${baseUrl}/group/updateParticipants`, body: { groupJid: groupId, action: "add", participants: [p] } },
    { method: "POST" as const, url: `${baseUrl}/group/updateParticipants`, body: { groupjid: groupId, action: "add", participants: [p] } },
    { method: "PUT" as const, url: `${baseUrl}/group/updateParticipant?groupJid=${encodeURIComponent(groupId)}`, body: { action: "add", participants: [p] } },
    { method: "POST" as const, url: `${baseUrl}/group/updateParticipants`, body: { groupJid: groupId, action: "add", participants: [`${p}@s.whatsapp.net`] } },
    { method: "POST" as const, url: `${baseUrl}/group/updateParticipants`, body: { groupjid: groupId, action: "add", participants: [`${p}@s.whatsapp.net`] } },
    { method: "PUT" as const, url: `${baseUrl}/group/updateParticipant?groupJid=${encodeURIComponent(groupId)}`, body: { action: "add", participants: [`${p}@s.whatsapp.net`] } },
    { method: "POST" as const, url: `${baseUrl}/group/addParticipant`, body: { groupJid: groupId, participant: p } },
  ];
}

function hasExplicitFailure(errorFields: string) {
  // ONLY check error/message fields — NOT the full response body which may contain group/participant data
  const n = errorFields.toLowerCase();
  return ["failed", "bad-request", "not admin", "not found", "invalid group", "invalid participant", "unauthorized", "blocked", "forbidden", "denied", "unable to add"].some(t => n.includes(t));
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
    // Extract ONLY error/message fields for failure detection — NOT the entire response
    const errorMsg = [body?.error, body?.message, body?.msg, body?.details, body?.data?.error, body?.data?.message]
      .filter(v => typeof v === "string" && v.trim())
      .join(" ");
    const errorMsgLower = errorMsg.toLowerCase();
    const rawLower = raw.toLowerCase();

    // groupUpdated array — most reliable success indicator from UAZAPI
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
      // groupUpdated exists with no error code or code < 400 — success
      return { ok: true, alreadyExists: false, detail: "Adicionado com sucesso.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx, canTryOtherStrategy: false };
    }

    // SUCCESS PATTERN: API returns the updated group object { group: { JID: ... } }
    // This is the standard updateParticipants response when addition succeeds
    const groupObj = body?.group || body?.data?.group;
    if (groupObj && typeof groupObj === "object" && (groupObj.JID || groupObj.jid || groupObj.id)) {
      if ((res.status === 200 || res.status === 201) && !hasExplicitFailure(errorMsgLower)) {
        return { ok: true, alreadyExists: false, detail: "Adicionado com sucesso.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx, canTryOtherStrategy: false };
      }
    }

    // Already exists — check error fields and status code only
    if (errorMsgLower.includes("already") || errorMsgLower.includes("já") || errorMsgLower.includes("memberaddmode") || res.status === 409) {
      return { ok: false, alreadyExists: true, detail: "Já no grupo.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx, canTryOtherStrategy: false };
    }

    // Generic success for 200/201 with no error fields
    if ((res.status === 200 || res.status === 201) && !hasExplicitFailure(errorMsgLower)) {
      return { ok: true, alreadyExists: false, detail: "Adicionado com sucesso.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx, canTryOtherStrategy: false };
    }

    // Classify failure using error message fields only
    return classifyFailure(errorMsgLower || rawLower, res.status, idx);
  };

  const orderedStrategyIndexes = cachedIdx !== undefined && cachedIdx >= 0 && cachedIdx < strategies.length
    ? [cachedIdx, ...Array.from({ length: strategies.length }, (_, i) => i).filter((i) => i !== cachedIdx)]
    : Array.from({ length: strategies.length }, (_, i) => i);

  let lastTransientResult: AddResult | null = null;

  for (const i of orderedStrategyIndexes) {
    try {
      const { res, raw, body, idx } = await tryStrategy(i);
      if (res.status === 405) continue;
      const result = processResult(res, raw, body, idx);

      if (result.canTryOtherStrategy) {
        if (cachedIdx === idx) {
          endpointCache.delete(cacheKey);
          log.warn(`Mass inject fallback: cached add strategy ${idx} failed temporarily for group ${groupId}`, {
            detail: result.detail,
          });
        }
        lastTransientResult = result;
        continue;
      }

      endpointCache.set(cacheKey, idx);
      return result;
    } catch (e: any) {
      if (cachedIdx === i) {
        endpointCache.delete(cacheKey);
      }
      lastTransientResult = {
        ok: false,
        alreadyExists: false,
        detail: e.message,
        retryable: true,
        pauseCampaign: false,
        cooldownMs: 3000,
        strategyIndex: i,
        canTryOtherStrategy: true,
        failureStatus: "api_temporary",
      };
    }
  }

  if (lastTransientResult) return lastTransientResult;

  return { ok: false, alreadyExists: false, detail: "Nenhum endpoint encontrado (405).", retryable: false, pauseCampaign: true, cooldownMs: 0, canTryOtherStrategy: false, failureStatus: "failed" };
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
    return { ...base, detail: "Sem permissão de admin.", retryable: false, pauseCampaign: true, cooldownMs: 0, failureStatus: "confirmed_no_admin" };
  if ((msg.includes("not found") && (msg.includes("group") || msg.includes("invalid group"))) || msg.includes("full") || msg.includes("limit reached"))
    return { ...base, detail: msg.includes("full") || msg.includes("limit reached") ? "Grupo atingiu limite de participantes." : "Grupo inválido.", retryable: false, pauseCampaign: true, cooldownMs: 0, failureStatus: "invalid_group" };
  if (msg.includes("blocked") || msg.includes("ban"))
    return { ...base, detail: "Contato bloqueado.", retryable: false, pauseCampaign: false, cooldownMs: 0, failureStatus: "blocked" };
  if (msg.includes("not found") && (msg.includes("number") || msg.includes("participant") || msg.includes("contact")))
    return { ...base, detail: "Número não encontrado no WhatsApp.", retryable: false, pauseCampaign: false, cooldownMs: 0, failureStatus: "contact_not_found" };
  if (status === 401 || msg.includes("unauthorized") || msg.includes("invalid token"))
    return { ...base, detail: "Token inválido.", retryable: false, pauseCampaign: true, cooldownMs: 0, failureStatus: "unauthorized" };
  if (status === 503 || msg.includes("disconnected") || msg.includes("session disconnected") || msg.includes("socket closed"))
    return { ...base, detail: "Instância desconectada.", retryable: true, pauseCampaign: false, cooldownMs: 5000, canTryOtherStrategy: true, failureStatus: "connection_unconfirmed" };
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

// ── Update campaign counters ──
async function updateCounters(
  sb: any,
  campaignId: string,
  counterState: {
    success_count: number;
    already_count: number;
    fail_count: number;
    rate_limit_count: number;
    timeout_count: number;
    consecutive_failures: number;
  },
  status: string,
) {
  const updates: Record<string, any> = { updated_at: nowIso() };
  if (status === "completed") {
    counterState.success_count += 1;
    updates.success_count = counterState.success_count;
    counterState.consecutive_failures = 0;
    updates.consecutive_failures = 0;
  } else if (status === "already_exists") {
    counterState.already_count += 1;
    updates.already_count = counterState.already_count;
    counterState.consecutive_failures = 0;
    updates.consecutive_failures = 0;
  } else if (status === "rate_limited") {
    counterState.rate_limit_count += 1;
    updates.rate_limit_count = counterState.rate_limit_count;
  } else if (status === "timeout") {
    counterState.timeout_count += 1;
    updates.timeout_count = counterState.timeout_count;
  } else if (TRANSIENT_FAILURE_STATUSES.has(status)) {
    // Retryable statuses remain in queue; they should not count as final failures.
  } else {
    counterState.fail_count += 1;
    updates.fail_count = counterState.fail_count;

    if (AUTO_PAUSE_FAILURE_STATUSES.has(status)) {
      counterState.consecutive_failures += 1;
      updates.consecutive_failures = counterState.consecutive_failures;
    } else {
      counterState.consecutive_failures = 0;
      updates.consecutive_failures = 0;
    }
  }

  await sb.from("mass_inject_campaigns").update(updates).eq("id", campaignId);
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
// MAIN WORKER: processes ONE campaign at a time, all contacts in sequence
// ══════════════════════════════════════════════════════════
async function processOneCampaign(sb: any, campaign: any, isRunningRef: { value: boolean }) {
  const campaignId = campaign.id;
  const counterState = {
    success_count: Number(campaign.success_count || 0),
    already_count: Number(campaign.already_count || 0),
    fail_count: Number(campaign.fail_count || 0),
    rate_limit_count: Number(campaign.rate_limit_count || 0),
    timeout_count: Number(campaign.timeout_count || 0),
    consecutive_failures: Number(campaign.consecutive_failures || 0),
  };

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
    let consecutiveFailures = Number(campaign.consecutive_failures || 0);

    let contactsInLoop = 0;
    let cachedFreshCampaign: any = null;

    while (isRunningRef.value) {
      // Clear stale device failures — give devices a chance to reconnect
      const now = Date.now();
      for (const [did, ts] of failedDeviceIds) {
        if (now - ts > DEVICE_RETRY_INTERVAL_MS) {
          failedDeviceIds.delete(did);
          log.info(`Campaign ${campaignId.slice(0, 8)}: clearing failed flag for device ${did.slice(0, 8)} — retrying`);
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
        consecutiveFailures = counterState.consecutive_failures;
      }
      const freshCampaign = cachedFreshCampaign;

      // 2. Pick a device
      const deviceId = pickDeviceId(freshCampaign, failedDeviceIds);
      if (!deviceId) {
        if (failedDeviceIds.size > 0) {
          log.warn(`Campaign ${campaignId.slice(0, 8)}: all devices cooling down — waiting ${DEVICE_RETRY_INTERVAL_MS / 1000}s`);
          await sb.from("mass_inject_campaigns").update({
            updated_at: nowIso(),
            next_run_at: new Date(Date.now() + DEVICE_RETRY_INTERVAL_MS).toISOString(),
            pause_reason: "Aguardando reconexão das instâncias...",
          }).eq("id", campaignId);
          await sleep(DEVICE_RETRY_INTERVAL_MS);
          failedDeviceIds.clear();
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
      const statusHint = String(device.status || "").toLowerCase();
      const processed = counterState.success_count + counterState.fail_count + counterState.already_count;
      // Check connection less often: first contact, then every 50, or if DB says disconnected
      const shouldCheckConnection = processed === 0 || processed % 50 === 0 || (!CONNECTED_DEVICE_STATUSES.has(statusHint) && processed % 10 === 0);

      // 4. Connection check — single fast check, no multi-retry
      if (shouldCheckConnection) {
        const liveConnection = await isDeviceConnected(
          baseUrl,
          device.uazapi_token,
          1, // Always single check — less delay, less paranoia
        );

        if (liveConnection.connected === false) {
          log.warn(`Campaign ${campaignId.slice(0, 8)}: device ${device.name} disconnected`);
          failedDeviceIds.set(deviceId, Date.now());

          // Check if ALL devices are down
          const allIds = parseDeviceIds(freshCampaign.device_ids);
          if (allIds.every(id => failedDeviceIds.has(id))) {
            // Wait 30s and clear all failures to give devices a chance to reconnect
            log.warn(`Campaign ${campaignId.slice(0, 8)}: all devices disconnected — waiting 30s before retrying`);
            await emitEvent(sb, campaignId, "all_sessions_dropped", "warning", "Todas as instâncias desconectadas. Aguardando reconexão automática...");
            await sb.from("mass_inject_campaigns").update({
              updated_at: nowIso(),
              next_run_at: new Date(Date.now() + DEVICE_RETRY_INTERVAL_MS).toISOString(),
              pause_reason: "Aguardando reconexão das instâncias...",
            }).eq("id", campaignId);
            await sleep(DEVICE_RETRY_INTERVAL_MS);
            
            // Clear all failures and retry
            failedDeviceIds.clear();
            
            // Don't pause immediately — just continue the loop and retry
            // The loop will re-check on next iteration
            log.info(`Campaign ${campaignId.slice(0, 8)}: retrying after cooldown — not pausing yet`);
            continue;
          }
          continue;
        }

        // If connection is unknown/null, just proceed — don't block
        if (liveConnection.connected === null && !CONNECTED_DEVICE_STATUSES.has(statusHint)) {
          log.info(`Campaign ${campaignId.slice(0, 8)}: device ${device.name} status uncertain — proceeding anyway`);
        }
      }

      if (!String(device.number || "").trim()) {
        log.warn(`Campaign ${campaignId.slice(0, 8)}: device ${device.name} has no number synced in DB — proceeding without own-number guard`);
      }

      const slotWaitMs = await claimDeviceSendSlot(sb, deviceId, Number(freshCampaign.min_delay || 0));
      if (slotWaitMs > 0) {
        log.info(`Campaign ${campaignId.slice(0, 8)}: device ${device.name} is cooling down for ${Math.round(slotWaitMs / 1000)}s before next add`);
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

      await sb.from("mass_inject_contacts").update({ processed_at: nowIso(), device_used: device.name || device.id }).eq("id", contact.id);

      // 6. Skip own number (admin's device number — can't add yourself)
      const groupId = contact.target_group_id || freshCampaign.group_id;
      const phone = String(contact.phone).replace(/@.*/, "");
      const deviceNumber = String(device.number || "").replace(/\D/g, "");
      if (deviceNumber && buildPhoneFingerprints(phone).some(fp => buildPhoneFingerprints(deviceNumber).some(dfp => dfp === fp))) {
        await sb.from("mass_inject_contacts").update({
          status: "already_exists", error_message: "Próprio número da instância (admin) — ignorado.", processed_at: nowIso(),
        }).eq("id", contact.id);
        await updateCounters(sb, campaignId, counterState, "already_exists");
        consecutiveFailures = 0;
        log.info(`Campaign ${campaignId.slice(0, 8)}: ${phone} is the device's own number — skipped`);
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
      // Only fetch fresh participants on first contact or every 50 — rely on cache more
      const shouldFetchFresh = !useCachedCheck && (processed === 0 || processed % 50 === 0);
      const participantSnapshot = shouldFetchFresh
        ? await fetchGroupParticipants(baseUrl, device.uazapi_token, groupId)
        : (useCachedCheck ? cachedParticipants! : null);

      if (participantSnapshot?.confirmed && participantSetHasPhone(participantSnapshot.participants, phone)) {
        await sb.from("mass_inject_contacts").update({
          status: "already_exists", error_message: "Contato já participava do grupo.", processed_at: nowIso(),
        }).eq("id", contact.id);
        await updateCounters(sb, campaignId, counterState, "already_exists");
        consecutiveFailures = 0;
        log.info(`Campaign ${campaignId.slice(0, 8)}: ${phone} already in group`);
        // Apply configured delay even for already-existing contacts
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
      DeviceLockManager.tryAcquire(deviceId, "mass_inject", actionLockId);
      let result: Awaited<ReturnType<typeof addToGroup>>;
      try {
        result = await addToGroup(baseUrl, device.uazapi_token, groupId, phone);
      } finally {
        DeviceLockManager.release(deviceId, actionLockId);
      }

      if (result.ok) {
        await sb.from("mass_inject_contacts").update({
          status: "completed", error_message: result.detail, processed_at: nowIso(),
        }).eq("id", contact.id);
        await updateCounters(sb, campaignId, counterState, "completed");
        consecutiveFailures = 0;
        rememberParticipantInCache(baseUrl, groupId, phone);
        log.info(`Campaign ${campaignId.slice(0, 8)}: ${phone} added successfully`);
      } else if (result.alreadyExists) {
        await sb.from("mass_inject_contacts").update({
          status: "already_exists", error_message: result.detail, processed_at: nowIso(),
        }).eq("id", contact.id);
        await updateCounters(sb, campaignId, counterState, "already_exists");
        rememberParticipantInCache(baseUrl, groupId, phone);
        consecutiveFailures = 0;
      } else {
        // Classify retryable vs permanent failure
        const isRateLimit = result.detail.toLowerCase().includes("rate limit") || result.cooldownMs >= 30000;
        const isTimeout = result.detail.toLowerCase().includes("timeout");
        const isConnectionIssue = result.detail.toLowerCase().includes("desconectada") || result.detail.toLowerCase().includes("socket");
        let failureDetail = result.detail;
        let failStatus = result.failureStatus || (result.retryable
          ? (isRateLimit ? "rate_limited" : isTimeout ? "timeout" : isConnectionIssue ? "connection_unconfirmed" : "api_temporary")
          : "failed");

        if (isConnectionIssue) {
          // Don't do extra connection checks after add failure — just mark as retryable
          // and let the normal flow retry. This avoids the cascade of "all disconnected" pauses.
          failStatus = "api_temporary";
          failureDetail = `Oscilação temporária: ${result.detail}`.trim();
          log.info(`Campaign ${campaignId.slice(0, 8)}: connection issue on add — treating as temporary, will retry`);
        }
        
        await sb.from("mass_inject_contacts").update({
          status: failStatus, error_message: failureDetail, processed_at: nowIso(),
        }).eq("id", contact.id);
        await updateCounters(sb, campaignId, counterState, failStatus);

        consecutiveFailures = AUTO_PAUSE_FAILURE_STATUSES.has(failStatus)
          ? counterState.consecutive_failures
          : 0;
        log.warn(`Campaign ${campaignId.slice(0, 8)}: ${phone} ${FINAL_FAILURE_STATUSES.has(failStatus) ? "failed" : "retryable"} — ${failureDetail}${consecutiveFailures > 0 ? ` (consecutive: ${consecutiveFailures})` : ""}`);

        if (result.pauseCampaign) {
          await sb.from("mass_inject_campaigns").update({
            status: "paused", updated_at: nowIso(), next_run_at: null,
            pause_reason: result.detail,
          }).eq("id", campaignId);
          await emitEvent(sb, campaignId, "campaign_paused", "warning", result.detail);
          break;
        }

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          const reason = `Pausada por ${MAX_CONSECUTIVE_FAILURES} falhas consecutivas.`;
          await sb.from("mass_inject_campaigns").update({
            status: "paused", updated_at: nowIso(), next_run_at: null, pause_reason: reason,
          }).eq("id", campaignId);
          await emitEvent(sb, campaignId, "campaign_paused", "warning", reason);
          break;
        }

        // Cooldown only for rate limits — short and capped
        if (isRateLimit && result.cooldownMs > 0) {
          const cooldown = Math.min(result.cooldownMs, 8000);
          log.info(`Campaign ${campaignId.slice(0, 8)}: rate limit cooldown ${Math.round(cooldown / 1000)}s`);
          await sleep(cooldown);
        } else if ((isConnectionIssue || isTimeout) && result.cooldownMs > 0) {
          const cooldown = Math.min(result.cooldownMs, 3000);
          log.info(`Campaign ${campaignId.slice(0, 8)}: transient error cooldown ${Math.round(cooldown / 1000)}s`);
          await sleep(cooldown);
        }
      }

      // 9. Apply delay — use EXACTLY what the user configured (no forced minimums)
      contactsInLoop++;
      const minDelay = Number(freshCampaign.min_delay ?? 0);
      const maxDelay = Math.max(Number(freshCampaign.max_delay ?? 0), minDelay);
      let delayMs = minDelay === maxDelay ? minDelay * 1000 : randomBetween(minDelay * 1000, maxDelay * 1000);
      log.info(`Campaign ${campaignId.slice(0, 8)}: delay ${Math.round(delayMs / 1000)}s (range ${minDelay}-${maxDelay}s)`);

      // Block pause check
      const pauseAfter = Number(freshCampaign.pause_after || 0);
      const pauseDuration = Number(freshCampaign.pause_duration || 0);
      const totalProcessed = processed + 1;
      if (pauseAfter > 0 && totalProcessed > 0 && totalProcessed % pauseAfter === 0) {
        delayMs = Math.max(delayMs, pauseDuration * 1000);
        log.info(`Campaign ${campaignId.slice(0, 8)}: block pause ${pauseDuration}s after ${totalProcessed} contacts`);
      }

      // Update next_run_at for frontend countdown
      try {
        await sb.from("mass_inject_campaigns").update({
          next_run_at: new Date(Date.now() + delayMs).toISOString(),
          updated_at: nowIso(),
        }).eq("id", campaignId);
      } catch { /* non-critical */ }

      await sleep(delayMs);
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
