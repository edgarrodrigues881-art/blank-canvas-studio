// mass-group-inject v16.0 — human-like behavior: non-linear delays, block pauses, instance rotation, hourly limits
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-internal-run, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ContactProcessingStatus =
  | "completed"
  | "already_exists"
  | "rate_limited"
  | "api_temporary"
  | "connection_unconfirmed"
  | "session_dropped"       // NEW: transient session drop, retryable with cooldown
  | "confirmed_disconnect"  // ONLY when multiple checks confirm truly offline
  | "permission_unconfirmed"
  | "confirmed_no_admin"
  | "invalid_group"
  | "contact_not_found"
  | "unauthorized"
  | "blocked"
  | "unknown_failure"
  | "timeout";

interface AddAttemptResult {
  ok: boolean;
  status: number;
  body?: any;
  rawMessage: string;
  errorCode?: string;
  strategyIndex?: number;
}

interface FailureClassification {
  status: Exclude<ContactProcessingStatus, "completed" | "already_exists">;
  detail: string;
  retryable: boolean;
  pauseCampaign?: boolean;
  confirmed?: boolean;
  cooldownMs?: number;
}

interface ConnectionCheckResult {
  connected: boolean | null;
  status: string;
  detail: string;
}

interface GroupCheckResult {
  accessible: boolean | null;
  invalid: boolean;
  detail: string;
}

interface ExecuteResult {
  status: ContactProcessingStatus;
  detail: string;
  attempts: number;
  pauseCampaign?: boolean;
  cooldownMs?: number;
  workingStrategy?: number;
}

const SUCCESS_STATUSES = new Set(["completed", "already_exists"]);
const FAILURE_STATUSES = new Set([
  "rate_limited", "api_temporary", "connection_unconfirmed", "session_dropped", "confirmed_disconnect",
  "permission_unconfirmed", "confirmed_no_admin", "invalid_group", "contact_not_found",
  "unauthorized", "blocked", "unknown_failure", "timeout",
]);

const FINAL_CAMPAIGN_STATUSES = new Set(["done", "completed_with_failures", "paused", "cancelled", "failed"]);
const RETRYABLE_QUEUE_STATUSES = ["pending", "rate_limited", "api_temporary", "connection_unconfirmed", "session_dropped", "permission_unconfirmed", "unknown_failure", "timeout"] as const;
const MAX_QUEUE_RETRIES = 5;
const MAX_RATE_LIMIT_RETRIES = 15;
const MAX_SESSION_DROP_RETRIES = 8; // session drops get more retries since they're transient
const STALE_PROCESSING_TIMEOUT_MS = 3 * 60 * 1000;
const API_TIMEOUT_MS = 25_000;
const DISCONNECT_RECHECK_COUNT = 3; // Number of checks before confirming disconnect
const DISCONNECT_RECHECK_INTERVAL_MS = 8_000; // Interval between recheck attempts

// ── Endpoint cache: avoid trying all 5 strategies every time ──
const endpointCache = new Map<string, number>();

const nowIso = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Fetch with hard timeout — never allows infinite await */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = API_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error: any) {
    if (error.name === "AbortError") {
      throw new Error(`Timeout: API não respondeu em ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Update the next_run_at timestamp so frontend can show a precise countdown */
async function setNextRunAt(sb: any, campaignId: string, delayMs: number) {
  const nextAt = new Date(Date.now() + delayMs).toISOString();
  await sb.from("mass_inject_campaigns").update({ next_run_at: nextAt }).eq("id", campaignId);
}

/** Clear next_run_at (campaign idle / done) */
async function clearNextRunAt(sb: any, campaignId: string) {
  await sb.from("mass_inject_campaigns").update({ next_run_at: null }).eq("id", campaignId);
}
const randomBetween = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Gaussian-ish random: tends toward center of range, less predictable than uniform */
function gaussianRandom(min: number, max: number): number {
  // Box-Muller approximation using sum of randoms
  const u = (Math.random() + Math.random() + Math.random()) / 3;
  return Math.round(min + u * (max - min));
}

// Hourly usage tracking removed — not effective in serverless (resets per invocation)
// Rate limiting is handled by UAZAPI responses + exponential backoff

function extractRetryCount(message: string | null | undefined) {
  const match = String(message || "").match(/^\[retry:(\d+)\]\s*/i);
  return match ? Number(match[1]) : 0;
}

function stripRetryMeta(message: string | null | undefined) {
  return String(message || "").replace(/^\[retry:\d+\]\s*/i, "").trim();
}

function withRetryMeta(message: string, retryCount: number) {
  return `[retry:${retryCount}] ${message} Aguardando nova tentativa (${retryCount}/${MAX_QUEUE_RETRIES}).`;
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
  const add = (value: string) => { const clean = value.replace(/\D/g, ""); if (clean.length >= 10) set.add(clean); };
  add(digits); add(local);
  add(local.startsWith("55") ? local.slice(2) : local);
  add(local.length >= 10 && !local.startsWith("55") ? `55${local}` : local);
  if (local.length === 11 && local[2] === "9") { add(local.slice(0, 2) + local.slice(3)); add(`55${local.slice(0, 2) + local.slice(3)}`); }
  if (local.length === 10) { add(local.slice(0, 2) + "9" + local.slice(2)); add(`55${local.slice(0, 2) + "9" + local.slice(2)}`); }
  return Array.from(set);
}

function participantSetHasPhone(participants: Set<string>, phone: string) {
  return buildPhoneFingerprints(phone).some((fp) => participants.has(fp));
}

function hasExplicitFailureText(message: string) {
  const normalized = String(message || "").toLowerCase();
  return [
    "failed",
    "bad-request",
    "not admin",
    "not found",
    "invalid group",
    "invalid participant",
    "unauthorized",
    "blocked",
    "forbidden",
    "denied",
    "unable to add",
  ].some((token) => normalized.includes(token));
}

function buildHeaders(token: string, includeJson = false): Record<string, string> {
  const headers: Record<string, string> = {
    token,
    Accept: "application/json",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };
  if (includeJson) headers["Content-Type"] = "application/json";
  return headers;
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

function normalizeProviderConnectionState(payload: any): { state: "connected" | "disconnected" | "transitional" | "unknown"; rawStatus: string; owner: string; qrcode: string | null } {
  const inst = payload?.instance || payload?.data || payload || {};

  // DIRECT BOOLEAN CHECK: Uazapi returns { status: { connected: true, loggedIn: true } }
  // This is the most reliable signal and must be checked FIRST
  const statusObj = payload?.status;
  if (statusObj && typeof statusObj === "object" && statusObj.connected === true) {
    const owner = inst?.owner || statusObj?.jid?.split(":")[0] || "";
    return { state: "connected", rawStatus: "connected", owner, qrcode: null };
  }
  if (statusObj && typeof statusObj === "object" && statusObj.connected === false) {
    return { state: "disconnected", rawStatus: "disconnected", owner: "", qrcode: null };
  }

  const rawStatus = [
    inst?.connectionStatus,
    inst?.status,
    payload?.connectionStatus,
    payload?.state,
  ].find((value) => typeof value === "string" && value.trim())?.toLowerCase().trim() || "";

  const owner = [
    inst?.owner,
    inst?.phone,
    payload?.phone,
    payload?.owner,
  ].find((value) => typeof value === "string" && value.trim())?.trim() || "";

  const qrcode = [inst?.qrcode, payload?.qrcode].find((value) => typeof value === "string" && value.trim())?.trim() || null;

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
  const connectedSignals = ["connected", "authenticated", "open", "ready", "active", "online"];
  const disconnectedSignals = ["disconnected", "closed", "close", "offline", "logout", "logged_out", "loggedout", "not_connected"];
  const transitionalSignals = ["connecting", "pairing", "waiting", "initializing", "starting", "syncing", "qr", "qrcode", "pending"];

  if (hasSignal(connectedSignals)) return { state: "connected", rawStatus, owner, qrcode };
  if (hasSignal(disconnectedSignals)) return { state: "disconnected", rawStatus, owner, qrcode };
  if (qrcode || hasSignal(transitionalSignals)) return { state: "transitional", rawStatus, owner, qrcode };
  if (owner) return { state: "connected", rawStatus, owner, qrcode };
  return { state: "unknown", rawStatus, owner, qrcode };
}

function tryExtractParticipantPhone(value: any): string | null {
  if (!value || typeof value !== "object") return null;

  const candidates = [
    value?.PhoneNumber,
    value?.phoneNumber,
    value?.phone,
    value?.number,
    value?.Phone,
    value?.Number,
    value?.wid,
    value?.wa_id,
    value?.waId,
    value?.pn,
    value?.user,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const digits = String(candidate).replace(/@.*$/, "").replace(/[^0-9]/g, "");
    if (digits.length >= 8 && digits.length <= 15) return digits;
  }

  const nameStr = String(
    value?.DisplayName || value?.displayName || value?.name || value?.pushName || value?.notify || value?.Name || "",
  );
  const digitsFromName = nameStr.replace(/[^0-9]/g, "");
  if (digitsFromName.length >= 10 && digitsFromName.length <= 15) return digitsFromName;

  return null;
}

function collectParticipantsFromValue(value: any, participants: Set<string>) {
  if (!value) return;

  if (Array.isArray(value)) {
    value.forEach((entry) => collectParticipantsFromValue(entry, participants));
    return;
  }

  if (typeof value !== "object") return;

  const nestedParticipants = value?.Participants || value?.participants || value?.members;
  if (Array.isArray(nestedParticipants)) {
    nestedParticipants.forEach((entry: any) => collectParticipantsFromValue(entry, participants));
    return;
  }

  const primaryId = String(value?.id || value?.jid || value?.JID || value?.participant || "");
  const isLid = primaryId.includes("@lid") || primaryId.includes("@newsletter");

  if (isLid) {
    const recoveredPhone = tryExtractParticipantPhone(value);
    if (recoveredPhone) {
      for (const fp of buildPhoneFingerprints(recoveredPhone)) participants.add(fp);
    }
    return;
  }

  const candidates = [
    value?.PhoneNumber,
    value?.phoneNumber,
    value?.phone,
    value?.number,
    value?.Phone,
    value?.Number,
    value?.wid,
    value?.wa_id,
    value?.waId,
    value?.pn,
    value?.user,
    value?.participant,
    primaryId,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    for (const fp of buildPhoneFingerprints(String(candidate))) participants.add(fp);
  }

  const recoveredPhone = tryExtractParticipantPhone(value);
  if (recoveredPhone) {
    for (const fp of buildPhoneFingerprints(recoveredPhone)) participants.add(fp);
  }
}

async function getGroupParticipantsDetailed(baseUrl: string, token: string, groupId: string): Promise<{ participants: Set<string>; confirmed: boolean; diagnostics: string[] }> {
  const participants = new Set<string>();
  const diagnostics: string[] = [];

  // ── Strategy 1 (BEST): /group/list?GetParticipants=true — returns all groups with full participant lists ──
  // This is the same endpoint used by the group extractor and is the most reliable
  try {
    const listUrl = `${baseUrl}/group/list?GetParticipants=true&count=500`;
    console.log(`getGroupParticipants: trying ${listUrl}`);
    const res = await fetchWithTimeout(listUrl, { method: "GET", headers: buildHeaders(token) });
    if (res.ok) {
      const { body } = await readApiResponse(res);
      const groups = Array.isArray(body) ? body : body?.groups || body?.data || [];
      if (Array.isArray(groups)) {
        const targetGroup = groups.find((g: any) => {
          const jid = g?.JID || g?.jid || g?.id || g?.groupId || "";
          return jid === groupId;
        });
        if (targetGroup) {
          const pList = targetGroup?.Participants || targetGroup?.participants || targetGroup?.members || [];
          if (Array.isArray(pList)) {
            collectParticipantsFromValue(pList, participants);
          }
          if (participants.size > 0) {
            console.log(`getGroupParticipants: found ${participants.size} from /group/list?GetParticipants=true`);
            return { participants, confirmed: true, diagnostics };
          }
          diagnostics.push(`/group/list?GetParticipants=true: grupo encontrado mas sem participantes`);
        } else {
          diagnostics.push(`/group/list?GetParticipants=true: grupo ${groupId} não encontrado na lista (${groups.length} grupos)`);
        }
      }
    } else {
      diagnostics.push(`/group/list?GetParticipants=true: HTTP ${res.status}`);
    }
  } catch (error) {
    diagnostics.push(`/group/list?GetParticipants=true: ${error instanceof Error ? error.message : "erro"}`);
  }

  // ── Strategy 2: /group/fetchAllGroups — alternative bulk endpoint ──
  try {
    const fetchAllUrl = `${baseUrl}/group/fetchAllGroups`;
    const res = await fetchWithTimeout(fetchAllUrl, { method: "GET", headers: buildHeaders(token) });
    if (res.ok) {
      const { body } = await readApiResponse(res);
      const groups = Array.isArray(body) ? body : body?.groups || body?.data || [];
      if (Array.isArray(groups)) {
        const targetGroup = groups.find((g: any) => (g?.JID || g?.jid || g?.id || "") === groupId);
        if (targetGroup) {
          const pList = targetGroup?.Participants || targetGroup?.participants || targetGroup?.members || [];
          if (Array.isArray(pList)) {
            collectParticipantsFromValue(pList, participants);
          }
          if (participants.size > 0) {
            console.log(`getGroupParticipants: found ${participants.size} from /group/fetchAllGroups`);
            return { participants, confirmed: true, diagnostics };
          }
          diagnostics.push(`/group/fetchAllGroups: grupo encontrado mas sem participantes`);
        }
      }
    } else {
      diagnostics.push(`/group/fetchAllGroups: HTTP ${res.status}`);
    }
  } catch (error) {
    diagnostics.push(`/group/fetchAllGroups: ${error instanceof Error ? error.message : "erro"}`);
  }

  // ── Strategy 3-5: individual group info endpoints (fallback) ──
  const fallbackStrategies = [
    { method: "POST", url: `${baseUrl}/group/info`, body: { groupJid: groupId } },
    { method: "GET", url: `${baseUrl}/group/info?groupJid=${encodeURIComponent(groupId)}` },
    { method: "POST", url: `${baseUrl}/chat/info`, body: { chatId: groupId } },
  ];
  for (const strategy of fallbackStrategies) {
    try {
      const res = await fetchWithTimeout(strategy.url, {
        method: strategy.method,
        headers: strategy.body ? buildHeaders(token, true) : buildHeaders(token),
        ...(strategy.body ? { body: JSON.stringify(strategy.body) } : {}),
      });
      const { body } = await readApiResponse(res);
      if (!res.ok) { diagnostics.push(`${strategy.method} ${strategy.url}: HTTP ${res.status}`); continue; }
      const groupPayload = body?.group || body?.data?.group || body?.data || body;
      const pList = groupPayload?.Participants || groupPayload?.participants || groupPayload?.members || [];
      if (Array.isArray(pList)) {
        collectParticipantsFromValue(pList, participants);
      }
      if (participants.size > 0) {
        console.log(`getGroupParticipants: found ${participants.size} from ${strategy.url}`);
        return { participants, confirmed: true, diagnostics };
      }
      diagnostics.push(`${strategy.method} ${strategy.url}: resposta sem participantes`);
    } catch (error) {
      diagnostics.push(`${strategy.method} ${strategy.url}: ${error instanceof Error ? error.message : "erro"}`);
    }
  }
  return { participants, confirmed: false, diagnostics };
}

async function getGroupParticipants(baseUrl: string, token: string, groupId: string): Promise<Set<string>> {
  return (await getGroupParticipantsDetailed(baseUrl, token, groupId)).participants;
}

function classifyAddFailure(rawMessage: string, httpStatus: number): FailureClassification {
  const message = (rawMessage || "").toLowerCase();

  if (message.includes("rate-overlimit") || message.includes("429") || message.includes("too many requests") || httpStatus === 429) {
    // Base cooldown — actual exponential backoff is applied at batch level
    return { status: "rate_limited", detail: "Limite da API atingido — aguardando cooldown automático.", retryable: true, cooldownMs: 30_000 };
  }
  if (message.includes("websocket disconnected before info query") || message.includes("connection reset") || message.includes("socket hang up")) {
    return { status: "api_temporary", detail: "A integração interrompeu a consulta antes de concluir.", retryable: true, cooldownMs: randomBetween(10_000, 18_000) };
  }
  if (httpStatus === 503 || message.includes("whatsapp disconnected") || message.includes("session disconnected") || message.includes("socket closed")) {
    return { status: "connection_unconfirmed", detail: "Possível desconexão sinalizada. Status real será revalidado.", retryable: true, cooldownMs: randomBetween(12_000, 20_000) };
  }
  if (message.includes("not admin") || message.includes("not an admin") || message.includes("admin required")) {
    return { status: "permission_unconfirmed", detail: "Possível falta de privilégio de admin.", retryable: true, cooldownMs: randomBetween(8_000, 14_000) };
  }
  if (message.includes("info query returned status 404") || ((message.includes("number") || message.includes("participant") || message.includes("contact")) && (message.includes("not found") || message.includes("does not exist")))) {
    return { status: "contact_not_found", detail: "O número não foi encontrado no WhatsApp.", retryable: false };
  }
  if ((message.includes("group") && (message.includes("not found") || message.includes("invalid") || message.includes("does not exist"))) || message.includes("@g.us inválido")) {
    return { status: "invalid_group", detail: "Grupo inválido ou inacessível.", retryable: false, pauseCampaign: true, confirmed: true };
  }
  if (httpStatus === 401 || message.includes("unauthorized") || message.includes("invalid token") || message.includes("token invalid")) {
    return { status: "unauthorized", detail: "Falha de autenticação. Reconecte ou revise o token.", retryable: false, pauseCampaign: true, confirmed: true };
  }
  if (message.includes("blocked") || message.includes("ban")) {
    return { status: "blocked", detail: "Contato bloqueado ou restrito pelo WhatsApp.", retryable: false };
  }
  if (message.includes("full") || message.includes("limit reached")) {
    return { status: "invalid_group", detail: "Grupo atingiu limite de participantes.", retryable: false, pauseCampaign: true, confirmed: true };
  }
  if (message.includes("timeout") || message.includes("timed out") || message.includes("não respondeu") || httpStatus === 408 || httpStatus === 504) {
    return { status: "timeout", detail: "API não respondeu a tempo (timeout).", retryable: true, cooldownMs: randomBetween(15_000, 25_000) };
  }
  if (httpStatus >= 500) {
    return { status: "api_temporary", detail: `Erro de servidor Uazapi (${httpStatus}).`, retryable: true, cooldownMs: randomBetween(12_000, 20_000) };
  }
  return { status: "unknown_failure", detail: `Falha não confirmada: ${rawMessage.substring(0, 140) || `HTTP ${httpStatus}`}`, retryable: true, cooldownMs: randomBetween(10_000, 16_000) };
}

async function getDeviceCredentials(sb: any, deviceId: string, userId: string | null, bypassUserFilter: boolean) {
  const query = sb.from("devices").select("id, name, number, status, uazapi_base_url, uazapi_token, user_id").eq("id", deviceId);
  if (!bypassUserFilter && userId) query.eq("user_id", userId);
  const { data: device } = await query.single();
  if (!device?.uazapi_base_url || !device?.uazapi_token) return null;
  return { ...device, uazapi_base_url: String(device.uazapi_base_url).replace(/\/+$/, "") };
}

function isDeviceOperational(device: any) {
  const status = String(device?.status || "").toLowerCase();
  const hasNumber = !!String(device?.number || "").trim();
  return hasNumber && ["connected", "ready", "active", "authenticated", "open", "online"].includes(status);
}

async function checkInstanceConnection(baseUrl: string, token: string): Promise<ConnectionCheckResult> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/instance/status?t=${Date.now()}`, { method: "GET", headers: buildHeaders(token) });
    const { raw, body } = await readApiResponse(res);
    const normalized = normalizeProviderConnectionState(body);
    if (res.status === 401) return { connected: null, status: "token_invalid", detail: "Falha de autenticação." };
    if (!res.ok) {
      if (normalized.state === "disconnected") return { connected: false, status: normalized.rawStatus || `http_${res.status}`, detail: "Instância revalidada como desconectada." };
      if (normalized.state === "connected") return { connected: true, status: normalized.rawStatus || `http_${res.status}`, detail: "Conexão confirmada." };
      return { connected: null, status: normalized.rawStatus || `http_${res.status}`, detail: extractProviderMessage(body, raw) || "Sem confirmação." };
    }
    if (normalized.state === "disconnected") return { connected: false, status: normalized.rawStatus || "disconnected", detail: "Instância revalidada como desconectada." };
    if (normalized.state === "connected") return { connected: true, status: normalized.rawStatus || "connected", detail: "Conexão confirmada." };
    return { connected: null, status: normalized.rawStatus || "unknown", detail: "Status não pôde ser confirmado." };
  } catch (error: any) {
    return { connected: null, status: "request_failed", detail: `Não foi possível validar: ${error.message}` };
  }
}

/**
 * Multi-check revalidation: performs up to DISCONNECT_RECHECK_COUNT checks
 * with intervals between them. Only confirms disconnect if ALL checks agree.
 * Returns session_dropped (retryable) if results are inconsistent.
 */
async function checkInstanceConnectionWithRetries(
  baseUrl: string,
  token: string,
  context: string = ""
): Promise<{ finalResult: ConnectionCheckResult; checks: ConnectionCheckResult[]; confirmedDisconnect: boolean }> {
  const checks: ConnectionCheckResult[] = [];

  for (let i = 0; i < DISCONNECT_RECHECK_COUNT; i++) {
    if (i > 0) await sleep(DISCONNECT_RECHECK_INTERVAL_MS);
    const check = await checkInstanceConnection(baseUrl, token);
    checks.push(check);

    console.log(JSON.stringify({
      type: "mass-group-inject.connection_recheck",
      attempt: i + 1,
      total: DISCONNECT_RECHECK_COUNT,
      connected: check.connected,
      status: check.status,
      detail: check.detail,
      context,
      timestamp: nowIso(),
    }));

    // If any check confirms connected, the instance is alive — stop checking
    if (check.connected === true) {
      return { finalResult: check, checks, confirmedDisconnect: false };
    }
  }

  // All checks completed — analyze results
  const disconnectedCount = checks.filter(c => c.connected === false).length;
  const unknownCount = checks.filter(c => c.connected === null).length;

  // Only confirm disconnect if ALL checks returned disconnected (no unknowns)
  if (disconnectedCount === DISCONNECT_RECHECK_COUNT) {
    return {
      finalResult: { connected: false, status: "confirmed_offline", detail: `Desconexão confirmada após ${DISCONNECT_RECHECK_COUNT} verificações.` },
      checks,
      confirmedDisconnect: true,
    };
  }

  // Mixed results or all unknown — treat as transient session drop
  return {
    finalResult: { connected: null, status: "session_unstable", detail: `Sessão instável: ${disconnectedCount} offline, ${unknownCount} sem resposta de ${DISCONNECT_RECHECK_COUNT} verificações.` },
    checks,
    confirmedDisconnect: false,
  };
}

async function checkGroupAccess(baseUrl: string, token: string, groupId: string): Promise<GroupCheckResult> {
  const endpoints = [
    { method: "POST", url: `${baseUrl}/group/info`, body: { groupJid: groupId } },
    { method: "GET", url: `${baseUrl}/group/info?groupJid=${encodeURIComponent(groupId)}` },
    { method: "POST", url: `${baseUrl}/chat/info`, body: { chatId: groupId } },
  ];
  for (const ep of endpoints) {
    try {
      const res = await fetchWithTimeout(ep.url, {
        method: ep.method,
        headers: ep.body ? buildHeaders(token, true) : buildHeaders(token),
        ...(ep.body ? { body: JSON.stringify(ep.body) } : {}),
      });
      const { raw, body } = await readApiResponse(res);
      const msg = extractProviderMessage(body, raw).toLowerCase();
      const group = body?.group || body?.data || body || {};
      const jid = group?.JID || group?.jid || group?.id || group?.groupJid || group?.chatId || "";
      if (res.ok && (jid || raw.toLowerCase().includes(groupId.toLowerCase()))) return { accessible: true, invalid: false, detail: "Acesso ao grupo confirmado." };
      if (msg.includes("not found") || msg.includes("invalid") || msg.includes("does not exist") || msg.includes("not a participant")) return { accessible: false, invalid: true, detail: "Grupo não encontrado ou sem acesso." };
    } catch { /* continue */ }
  }
  return { accessible: null, invalid: false, detail: "Não foi possível confirmar acesso ao grupo." };
}

// UAZAPI groupUpdated error codes that mean SUCCESS
const UAZAPI_SUCCESS_CODES = new Set([0, 200, 201]);
// UAZAPI error codes that mean "already in group"
const UAZAPI_ALREADY_CODES = new Set([409]);

function isGroupUpdatedSuccess(gu: any[]): { success: boolean; alreadyExists: boolean; errorCode: number } {
  if (!Array.isArray(gu) || gu.length === 0) return { success: false, alreadyExists: false, errorCode: -1 };
  const entry = gu[0];
  const errorCode = Number(entry?.Error ?? entry?.error ?? -1);
  if (UAZAPI_SUCCESS_CODES.has(errorCode)) return { success: true, alreadyExists: false, errorCode };
  if (UAZAPI_ALREADY_CODES.has(errorCode)) return { success: false, alreadyExists: true, errorCode };
  return { success: false, alreadyExists: false, errorCode };
}

/** Check if the response body contains group info indicating the operation succeeded */
function responseHasGroupInfo(body: any, groupId: string): boolean {
  const group = body?.group || body?.data?.group;
  if (!group || typeof group !== "object") return false;
  const jid = group?.JID || group?.jid || group?.id || "";
  return jid === groupId || (typeof jid === "string" && jid.length > 10);
}

function processAddResponse(res: Response, body: any, raw: string, pm: string, groupId: string, strategyIndex: number): AddAttemptResult {
  const rawLower = `${raw} ${pm}`.toLowerCase();

  // 1. Check groupUpdated array (UAZAPI batch response)
  const gu = body?.groupUpdated || body?.data?.groupUpdated;
  if (Array.isArray(gu) && gu.length > 0) {
    const result = isGroupUpdatedSuccess(gu);
    if (result.success) {
      return { ok: true, status: res.status, body, rawMessage: pm || "Adicionado com sucesso.", strategyIndex };
    }
    if (result.alreadyExists) {
      return { ok: false, status: 409, body, rawMessage: pm || "Já no grupo.", errorCode: "already_exists", strategyIndex };
    }
    // Non-zero error code — but check if contact was actually added (some UAZAPI versions return weird codes)
    // If HTTP 200 and no explicit failure text, treat as potential success
    if ((res.status === 200 || res.status === 201) && !hasExplicitFailureText(rawLower)) {
      console.log(`addToGroup: groupUpdated Error=${result.errorCode} but HTTP 200 and no failure text — treating as success`);
      return { ok: true, status: res.status, body, rawMessage: pm || `Adicionado (code: ${result.errorCode}).`, strategyIndex };
    }
    return { ok: false, status: res.status, body, rawMessage: `Participant error code: ${result.errorCode}`, strategyIndex };
  }

  // 2. HTTP 200/201 with group info in response = success
  if ((res.status === 200 || res.status === 201) && responseHasGroupInfo(body, groupId) && !hasExplicitFailureText(rawLower)) {
    return { ok: true, status: res.status, body, rawMessage: pm || "Adicionado com sucesso (grupo atualizado).", strategyIndex };
  }

  // 3. Generic HTTP 200/201 without failure text
  if ((res.status === 200 || res.status === 201) && !rawLower.includes("failed") && !rawLower.includes("bad-request") && !hasExplicitFailureText(rawLower)) {
    return { ok: true, status: res.status, body, rawMessage: pm || raw, strategyIndex };
  }

  // 4. Already exists signals
  if (rawLower.includes("already") || rawLower.includes("já") || rawLower.includes("memberaddmode") || res.status === 409) {
    return { ok: false, status: 409, body, rawMessage: pm || raw, errorCode: "already_exists", strategyIndex };
  }

  return { ok: false, status: res.status, body, rawMessage: pm || raw, strategyIndex };
}

// ── CRITICAL FIX: addToGroup now uses endpoint caching to avoid flooding ──
// Instead of trying 5 strategies every time, it tries the cached one first,
// and only discovers new endpoints on the first call or if the cached one fails with 405.
function buildAddStrategies(baseUrl: string, groupId: string, phone: string) {
  const plainPhone = phone.replace(/@.*/, "");
  return [
    { method: "POST", url: `${baseUrl}/group/updateParticipants`, body: { groupJid: groupId, action: "add", participants: [plainPhone] } },
    { method: "PUT", url: `${baseUrl}/group/updateParticipant?groupJid=${encodeURIComponent(groupId)}`, body: { action: "add", participants: [plainPhone] } },
    { method: "POST", url: `${baseUrl}/group/updateParticipants`, body: { groupJid: groupId, action: "add", participants: [`${plainPhone}@s.whatsapp.net`] } },
    { method: "PUT", url: `${baseUrl}/group/updateParticipant?groupJid=${encodeURIComponent(groupId)}`, body: { action: "add", participants: [`${plainPhone}@s.whatsapp.net`] } },
    { method: "POST", url: `${baseUrl}/group/addParticipant`, body: { groupJid: groupId, participant: plainPhone } },
  ];
}

async function addToGroup(baseUrl: string, token: string, groupId: string, phone: string, cachedStrategyIndex?: number): Promise<AddAttemptResult> {
  const headers = buildHeaders(token, true);
  const strategies = buildAddStrategies(baseUrl, groupId, phone);

  // ── STRICT 1-REQUEST MODE: if cache exists, use ONLY that endpoint ──
  if (cachedStrategyIndex !== undefined && cachedStrategyIndex >= 0 && cachedStrategyIndex < strategies.length) {
    const strategy = strategies[cachedStrategyIndex];
    try {
      console.log(`addToGroup CACHED[${cachedStrategyIndex}]: ${strategy.method} ${strategy.url}`);
      const res = await fetchWithTimeout(strategy.url, { method: strategy.method, headers, body: JSON.stringify(strategy.body) });
      const { raw, body } = await readApiResponse(res);
      const pm = extractProviderMessage(body, raw);
      return processAddResponse(res, body, raw, pm, groupId, cachedStrategyIndex);
    } catch (error: any) {
      const isTimeout = error.message?.includes("Timeout");
      return { ok: false, status: isTimeout ? 408 : 0, rawMessage: error.message, strategyIndex: cachedStrategyIndex };
    }
  }

  // ── DISCOVERY MODE (first contact only): find the working endpoint ──
  for (let i = 0; i < strategies.length; i++) {
    const strategy = strategies[i];
    try {
      console.log(`addToGroup DISCOVERY[${i}]: ${strategy.method} ${strategy.url}`);
      const res = await fetchWithTimeout(strategy.url, { method: strategy.method, headers, body: JSON.stringify(strategy.body) });
      if (res.status === 405) continue;
      const { raw, body } = await readApiResponse(res);
      const pm = extractProviderMessage(body, raw);
      const result = processAddResponse(res, body, raw, pm, groupId, i);
      // For discovery: if we got a non-405 response, this is the endpoint (even if error)
      return result;
    } catch (error: any) {
      const isTimeout = error.message?.includes("Timeout");
      return { ok: false, status: isTimeout ? 408 : 0, rawMessage: error.message };
    }
  }

  return { ok: false, status: 405, rawMessage: "Nenhum endpoint de adição encontrado (todos retornaram 405)." };
}

async function confirmAlreadyInGroup(baseUrl: string, token: string, groupId: string, phone: string) {
  return participantSetHasPhone(await getGroupParticipants(baseUrl, token, groupId), phone);
}

async function executeAddWithRecovery(baseUrl: string, token: string, groupId: string, phone: string, cacheKey?: string): Promise<ExecuteResult> {
  const cachedStrategy = cacheKey ? endpointCache.get(cacheKey) : undefined;
  const addResult = await addToGroup(baseUrl, token, groupId, phone, cachedStrategy);

  if (addResult.ok) {
    if (addResult.strategyIndex !== undefined && cacheKey) {
      endpointCache.set(cacheKey, addResult.strategyIndex);
    }
    return {
      status: "completed",
      detail: "Contato adicionado com sucesso.",
      attempts: 1,
      workingStrategy: addResult.strategyIndex,
    };
  }

  if (addResult.errorCode === "already_exists" || addResult.status === 409) {
    if (addResult.strategyIndex !== undefined && cacheKey) endpointCache.set(cacheKey, addResult.strategyIndex);
    return { status: "already_exists", detail: "Contato já participava do grupo.", attempts: 1 };
  }

  // Cache the working endpoint even on failure (we know it responds)
  if (addResult.strategyIndex !== undefined && cacheKey) {
    endpointCache.set(cacheKey, addResult.strategyIndex);
  }

  const providerMessage = addResult.rawMessage || "Falha sem detalhe.";
  let failure = classifyAddFailure(providerMessage, addResult.status);
  let connectionCheck: ConnectionCheckResult | null = null;

  // ── POST-ADD VERIFICATION for unknown_failure ──
  // If the API returned an ambiguous response, check if the contact is now in the group
  if (failure.status === "unknown_failure" && addResult.status >= 200 && addResult.status < 300) {
    console.log(`executeAddWithRecovery: unknown_failure with HTTP ${addResult.status} — running post-add verification for ${phone}`);
    await sleep(2000); // Wait 2s for WhatsApp propagation
    try {
      const isInGroup = await confirmAlreadyInGroup(baseUrl, token, groupId, phone);
      if (isInGroup) {
        console.log(`executeAddWithRecovery: post-add verification CONFIRMED ${phone} is in group — marking as completed`);
        return {
          status: "completed",
          detail: "Contato adicionado com sucesso (confirmado via verificação pós-adição).",
          attempts: 1,
          workingStrategy: addResult.strategyIndex,
        };
      }
    } catch (verifyErr) {
      console.log(`executeAddWithRecovery: post-add verification failed: ${verifyErr}`);
    }
  }

  // IMPORTANT: no internal retry loop here.
  if (failure.status === "connection_unconfirmed") {
    const { finalResult: connectionCheck, checks, confirmedDisconnect } = await checkInstanceConnectionWithRetries(baseUrl, token, `add_failure:${phone}`);
    
    if (connectionCheck.connected === true) {
      failure = {
        status: "api_temporary",
        detail: "A integração acusou desconexão, mas a instância continua conectada.",
        retryable: true,
        cooldownMs: randomBetween(20_000, 35_000),
      };
    } else if (confirmedDisconnect) {
      failure = {
        status: "session_dropped",
        detail: `Sessão da API desconectada (${DISCONNECT_RECHECK_COUNT}/${DISCONNECT_RECHECK_COUNT} verificações offline). Aguardando reconexão.`,
        retryable: true,
        cooldownMs: randomBetween(30_000, 60_000),
      };
    } else {
      failure = {
        status: "session_dropped",
        detail: `Sessão instável: ${checks.filter(c => c.connected === false).length} offline de ${DISCONNECT_RECHECK_COUNT} verificações. Aguardando estabilização.`,
        retryable: true,
        cooldownMs: randomBetween(25_000, 45_000),
      };
    }
  }

  if (failure.status === "permission_unconfirmed") {
    const groupCheck = await checkGroupAccess(baseUrl, token, groupId);
    if (groupCheck.invalid) {
      failure = {
        status: "invalid_group",
        detail: groupCheck.detail,
        retryable: false,
        pauseCampaign: true,
        confirmed: true,
      };
    }
  }

  console.log(JSON.stringify({
    type: "mass-group-inject.attempt_failed",
    phone,
    attempt: 1,
    providerMessage: providerMessage.substring(0, 200),
    classifiedAs: failure.status,
    retryable: failure.retryable,
    connectionStatus: null,
  }));

  return {
    status: failure.status,
    detail: failure.detail,
    attempts: 1,
    pauseCampaign: failure.pauseCampaign,
    cooldownMs: failure.cooldownMs,
  };
}

function parseDeviceIds(value: any): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") { try { const p = JSON.parse(value); if (Array.isArray(p)) return p.map(String).filter(Boolean); } catch {} }
  return [];
}

function pickDeviceId(campaign: any) {
  return pickDeviceIdWithBlacklist(campaign);
}

/** Round-robin rotation per CONTACT (not per success block) to distribute load evenly */
function pickDeviceIdWithBlacklist(campaign: any, blacklist?: Set<string>) {
  const deviceIds = parseDeviceIds(campaign.device_ids).filter(id => !blacklist || !blacklist.has(id));
  if (deviceIds.length === 0) return null;
  if (deviceIds.length === 1) return deviceIds[0];

  const rotateAfterRaw = Number(campaign.rotate_after || 0);
  if (rotateAfterRaw <= 0) return deviceIds[0];

  // Rotate based on TOTAL processed (success + fail + already), not just success
  const totalProcessed = Number(campaign.success_count || 0) + Number(campaign.fail_count || 0) + Number(campaign.already_count || 0);
  const rotateAfter = Math.max(rotateAfterRaw, 1);
  const idx = Math.floor(totalProcessed / rotateAfter) % deviceIds.length;

  return deviceIds[idx] || deviceIds[0];
}

/** Insert an event into the events table for reliable delivery */
async function emitCampaignEvent(sb: any, campaignId: string, eventType: string, eventLevel: string = "info", message?: string) {
  await sb.from("mass_inject_events").insert({ campaign_id: campaignId, event_type: eventType, event_level: eventLevel, message: message || null });
}

// Statuses that are NOT real failures (temporary/retryable or informational)
const TEMPORARY_STATUSES = new Set(["rate_limited", "timeout", "api_temporary", "connection_unconfirmed", "session_dropped", "permission_unconfirmed", "unknown_failure"]);
// Statuses that represent REAL definitive failures — session_dropped is NOT here (it's transient)
const REAL_FAILURE_STATUSES = new Set(["confirmed_disconnect", "confirmed_no_admin", "invalid_group", "contact_not_found", "unauthorized", "blocked"]);

async function updateCampaignCounters(sb: any, campaign: any, status: string, pauseCampaign = false, pauseReason?: string) {
  const patch: Record<string, any> = { updated_at: nowIso() };
  let eventType = "";
  let eventLevel = "info";

  if (status === "completed") {
    patch.success_count = Number(campaign.success_count || 0) + 1;
    patch.consecutive_failures = 0;
    eventType = "contact_added";
    eventLevel = "success";
  } else if (status === "already_exists") {
    patch.already_count = Number(campaign.already_count || 0) + 1;
    patch.consecutive_failures = 0;
    eventType = "contact_already_exists";
    eventLevel = "info";
  } else if (status === "session_dropped") {
    patch.timeout_count = Number(campaign.timeout_count || 0) + 1;
    eventType = "session_dropped";
    eventLevel = "warning";
  } else if (status === "rate_limited") {
    patch.rate_limit_count = Number(campaign.rate_limit_count || 0) + 1;
    eventType = "rate_limited";
    eventLevel = "warning";
  } else if (status === "timeout") {
    patch.timeout_count = Number(campaign.timeout_count || 0) + 1;
    eventType = "timeout";
    eventLevel = "warning";
  } else if (status === "failed" || REAL_FAILURE_STATUSES.has(status)) {
    patch.fail_count = Number(campaign.fail_count || 0) + 1;
    patch.consecutive_failures = Number(campaign.consecutive_failures || 0) + 1;
    if (status === "contact_not_found") eventType = "contact_not_found";
    else if (status === "confirmed_disconnect") eventType = "instance_disconnected";
    else if (status === "confirmed_no_admin") eventType = "no_admin_permission";
    else eventType = "contact_error";
    eventLevel = "error";
  } else if (FAILURE_STATUSES.has(status)) {
    // Falhas transitórias não entram em "Falhas Reais"
    eventType = "contact_retryable";
    eventLevel = "warning";
  }

  if (pauseCampaign) {
    patch.status = "paused";
    patch.pause_reason = pauseReason || getPauseReason(status);
    eventType = "campaign_paused";
    eventLevel = "warning";
  }

  const { error } = await sb.from("mass_inject_campaigns").update(patch).eq("id", campaign.id);
  if (error) throw error;

  Object.assign(campaign, {
    ...campaign,
    ...patch,
    success_count: patch.success_count ?? campaign.success_count,
    already_count: patch.already_count ?? campaign.already_count,
    fail_count: patch.fail_count ?? campaign.fail_count,
    rate_limit_count: patch.rate_limit_count ?? campaign.rate_limit_count,
    timeout_count: patch.timeout_count ?? campaign.timeout_count,
    consecutive_failures: patch.consecutive_failures ?? campaign.consecutive_failures,
    status: patch.status ?? campaign.status,
    pause_reason: patch.pause_reason ?? campaign.pause_reason,
  });

  if (eventType) await emitCampaignEvent(sb, campaign.id, eventType, eventLevel, pauseReason);
}

function getPauseReason(status: string): string {
  switch (status) {
    case "confirmed_disconnect": return "Pausada por desconexão confirmada da instância";
    case "session_dropped": return "Sessão da API desconectada. Reconecte a instância e retome.";
    case "confirmed_no_admin": return "Pausada por falta de privilégio de admin no grupo";
    case "invalid_group": return "Pausada por grupo inválido ou inacessível";
    case "unauthorized": return "Pausada por falha de autenticação da instância";
    default: return "Pausada por erro crítico persistente";
  }
}

/** Set a transient event */
async function setCampaignEvent(sb: any, campaignId: string, event: string, eventType: string = "info") {
  await emitCampaignEvent(sb, campaignId, event, eventType);
}

async function finalizeCampaignIfNeeded(sb: any, campaignId: string) {
  const { count } = await sb
    .from("mass_inject_contacts")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", [...RETRYABLE_QUEUE_STATUSES, "processing"]);
  const remaining = Number(count || 0);
  if (remaining > 0) return false;
  const { data: campaign } = await sb.from("mass_inject_campaigns").select("id, status, fail_count").eq("id", campaignId).single();
  if (!campaign || FINAL_CAMPAIGN_STATUSES.has(campaign.status)) return true;
  const nextStatus = Number(campaign.fail_count || 0) > 0 ? "completed_with_failures" : "done";
  await sb.from("mass_inject_campaigns").update({
    status: nextStatus, updated_at: nowIso(), completed_at: nowIso(),
  }).eq("id", campaignId);
  await emitCampaignEvent(sb, campaignId, "campaign_completed", "success");
  return true;
}

async function queueCampaignRun(campaignId: string, delayMs = 0) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const request = fetch(`${supabaseUrl}/functions/v1/mass-group-inject`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: anonKey, "x-internal-run": "true", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "run-campaign", campaignId, initialDelayMs: delayMs }),
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`queueCampaignRun failed (${res.status}):`, body);
    }
  }).catch((error) => console.error("queueCampaignRun error:", error));

  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(request);
    return;
  }

  // Fallback for runtimes without waitUntil support: ensure dispatch is executed
  await request;
}

async function scheduleCampaignRun(sb: any, campaignId: string, delayMs: number) {
  const safeDelayMs = Math.max(0, Math.round(Number(delayMs) || 0));
  await setNextRunAt(sb, campaignId, safeDelayMs);
  await queueCampaignRun(campaignId, safeDelayMs);
  return safeDelayMs;
}

async function campaignCanKeepRunning(sb: any, campaignId: string) {
  const { data: campaign } = await sb.from("mass_inject_campaigns").select("status").eq("id", campaignId).single();
  return !!campaign && ["queued", "processing"].includes(campaign.status);
}

/**
 * Delay computation — strictly respects user-configured min/max delay.
 * Only adds block pauses and error cooldowns on top.
 */
function computeNextDelayMs(campaign: any, cooldownMs?: number, _deviceId?: string) {
  const ABSOLUTE_MIN_DELAY_SEC = 0; // User controls delay fully
  const minDelaySec = Math.max(Number(campaign.min_delay ?? 10), ABSOLUTE_MIN_DELAY_SEC);
  const maxDelaySec = Math.max(Number(campaign.max_delay ?? 30), minDelaySec);
  
  // Random delay between user's min and max — NO jitter outside this range
  const baseDelaySec = randomBetween(minDelaySec, maxDelaySec);
  let nextDelayMs = baseDelaySec * 1000;
  
  // User-configured block pauses
  const pauseAfter = Number(campaign.pause_after || 0);
  const pauseDuration = Math.max(Number(campaign.pause_duration || 0), 0);
  const processed = Number(campaign.success_count || 0) + Number(campaign.fail_count || 0) + Number(campaign.already_count || 0);
  
  if (pauseAfter > 0 && processed > 0 && processed % pauseAfter === 0) {
    nextDelayMs = Math.max(nextDelayMs, pauseDuration * 1000);
  }
  
  // Cooldown override (from error recovery)
  if (cooldownMs) nextDelayMs = Math.max(nextDelayMs, cooldownMs);
  
  return nextDelayMs;
}

// Consecutive failure tracking for auto-pause (high threshold to support 1000+ contact campaigns)
const MAX_CONSECUTIVE_FAILURES = 15;

/**
 * Lightweight worker:
 * - processes at most ONE contact per invocation
 * - schedules the next invocation with the exact configured delay
 * - avoids keeping a single Edge Function alive for the whole campaign
 */
async function runCampaignWorker(sb: any, campaignId: string, initialDelayMs = 0) {
  let lockAcquired = false;
  let nextRunScheduled = false;
  let contactsProcessedThisRun = 0;
  const workerStartedAt = Date.now();

  if (initialDelayMs > 0) {
    await setNextRunAt(sb, campaignId, initialDelayMs).catch(() => {});
    console.log(`[mass-inject] campaign=${campaignId} waiting ${initialDelayMs}ms before starting`);
    await sleep(initialDelayMs);
  }

  try {
    console.log(JSON.stringify({
      type: "mass-group-inject.worker_start",
      campaignId,
      timestamp: nowIso(),
    }));
    const { data: acquired } = await sb.rpc("try_acquire_mass_inject_run_lock", { p_campaign_id: campaignId });
    lockAcquired = !!acquired;
    if (!lockAcquired) {
      console.log(`[mass-inject] campaign=${campaignId} lock NOT acquired — another worker is running, exiting`);
      return;
    }
    console.log(`[mass-inject] campaign=${campaignId} lock acquired — starting single-step processing`);
    await clearNextRunAt(sb, campaignId).catch(() => {});

    const staleThreshold = new Date(Date.now() - STALE_PROCESSING_TIMEOUT_MS).toISOString();
    const { data: resetData } = await sb.from("mass_inject_contacts")
      .update({ status: "pending", error_message: "Reprocessando (timeout de processamento).", device_used: null } as any)
      .eq("campaign_id", campaignId)
      .eq("status", "processing")
      .lt("processed_at", staleThreshold)
      .select("id");
    const resetCount = resetData?.length || 0;
    if (resetCount > 0) {
      console.log(`[mass-inject] campaign=${campaignId} reset ${resetCount} stale processing contacts back to pending`);
    }

    const { data: campaign } = await sb.from("mass_inject_campaigns").select("*").eq("id", campaignId).single();
    if (!campaign || FINAL_CAMPAIGN_STATUSES.has(campaign.status)) {
      console.log(`[mass-inject] campaign=${campaignId} status=${campaign?.status || "not_found"} — stopping`);
      return;
    }
    if (!["queued", "processing"].includes(campaign.status)) {
      console.log(`[mass-inject] campaign=${campaignId} status=${campaign.status} — not active, stopping`);
      return;
    }

    const failedDeviceIds = new Set<string>();
    let device: any = null;
    while (!device) {
      const candidateId = pickDeviceIdWithBlacklist(campaign, failedDeviceIds);
      if (!candidateId) break;
      const candidate = await getDeviceCredentials(sb, candidateId, campaign.user_id, true);
      if (!candidate || !isDeviceOperational(candidate)) {
        console.log(`[mass-inject] campaign=${campaignId} skipping device=${candidate?.name || candidateId} status=${candidate?.status || "missing"} number=${candidate?.number || "missing"}`);
        failedDeviceIds.add(candidateId);
        continue;
      }
      device = candidate;
      break;
    }

    if (!device) {
      console.log(`[mass-inject] campaign=${campaignId} NO operational devices available — pausing campaign`);
      await sb.from("mass_inject_campaigns").update({
        status: "paused",
        updated_at: nowIso(),
        next_run_at: null,
        pause_reason: "Nenhuma instância conectada e válida disponível. Conecte outra conta e retome.",
      }).eq("id", campaignId);
      await emitCampaignEvent(sb, campaignId, "campaign_failed_no_devices", "warning", "Nenhuma instância conectada e válida disponível. Conecte outra conta e retome.");
      return;
    }

    const processed = Number(campaign.success_count || 0) + Number(campaign.fail_count || 0) + Number(campaign.already_count || 0);
    const shouldCheckConnection = processed === 0 || processed % 10 === 0;

    if (shouldCheckConnection) {
      // Use multi-check revalidation instead of single check
      const { finalResult: connCheck, confirmedDisconnect } = await checkInstanceConnectionWithRetries(
        device.uazapi_base_url, device.uazapi_token, `preflight:${device.name}`
      );
      
      if (confirmedDisconnect) {
        console.log(`[mass-inject] campaign=${campaignId} device=${device.name} SESSION DROPPED (confirmed by ${DISCONNECT_RECHECK_COUNT} checks)`);
        failedDeviceIds.add(device.id);

        let anyConnected = false;
        for (const did of parseDeviceIds(campaign.device_ids)) {
          if (failedDeviceIds.has(did)) continue;
          const altDevice = await getDeviceCredentials(sb, did, campaign.user_id, true);
          if (!altDevice || !isDeviceOperational(altDevice)) {
            failedDeviceIds.add(did);
            continue;
          }
          const altConn = await checkInstanceConnection(altDevice.uazapi_base_url, altDevice.uazapi_token);
          if (altConn.connected === true) {
            anyConnected = true;
            break;
          }
          failedDeviceIds.add(did);
        }

        if (!anyConnected) {
          console.log(`[mass-inject] campaign=${campaignId} ALL devices sessions dropped — pausing (NOT failing)`);
          await sb.from("mass_inject_campaigns").update({
            status: "paused",
            updated_at: nowIso(),
            pause_reason: "Sessão da API desconectada em todas as instâncias. Reconecte e retome.",
            next_run_at: null,
          }).eq("id", campaignId);
          await emitCampaignEvent(sb, campaignId, "all_sessions_dropped", "warning", 
            "Todas as instâncias com sessão desconectada. Reconecte as instâncias e retome a campanha.");
          return;
        }

        const retryDelay = randomBetween(300_000, 600_000);
        await emitCampaignEvent(sb, campaignId, "session_dropped", "warning", 
          `Sessão da instância ${device.name} desconectada. Recuperação em ${Math.round(retryDelay/1000/60)} min com outra instância.`);
        await scheduleCampaignRun(sb, campaignId, retryDelay);
        nextRunScheduled = true;
        return;
      } else if (connCheck.connected === null) {
        const retryDelay = randomBetween(20_000, 40_000);
        console.log(`[mass-inject] campaign=${campaignId} device=${device.name} connection unstable, retrying in ${retryDelay}ms`);
        await emitCampaignEvent(sb, campaignId, "connection_unstable", "warning",
          `Conexão da instância ${device.name} instável. Revalidando em ${Math.round(retryDelay/1000)}s.`);
        await scheduleCampaignRun(sb, campaignId, retryDelay);
        nextRunScheduled = true;
        return;
      }
    }

    if (campaign.status === "queued") {
      await sb.from("mass_inject_campaigns").update({ status: "processing", updated_at: nowIso() }).eq("id", campaignId);
      await emitCampaignEvent(sb, campaignId, "campaign_started", "info");
    }

    const globalMinIntervalMs = Math.max(Number(campaign.min_delay || 3) * 1000, 3000);
    const { data: waitMs } = await sb.rpc("claim_device_send_slot", {
      p_device_id: device.id,
      p_min_interval_ms: globalMinIntervalMs,
    });
    if (waitMs && waitMs > 0) {
      console.log(`[mass-inject] campaign=${campaignId} device=${device.name} global rate limit: requeue in ${waitMs}ms`);
      await scheduleCampaignRun(sb, campaignId, waitMs);
      nextRunScheduled = true;
      return;
    }

    // ── SINGLE-CONTACT PROCESSING: mantém o delay humano entre cada adição ──
    const BATCH_SIZE = 1;
    const batchContacts: any[] = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      const { data: contact } = await sb.rpc("claim_next_mass_inject_contact", {
        p_campaign_id: campaignId,
        p_device_used: device.name || device.id,
        p_processing_message: "Processando...",
      });
      if (!contact?.id) break;
      await sb.from("mass_inject_contacts").update({
        processed_at: nowIso(),
        device_used: device.name || device.id,
      } as any).eq("id", contact.id);
      batchContacts.push(contact);
    }

    if (batchContacts.length === 0) {
      await finalizeCampaignIfNeeded(sb, campaignId);
      return;
    }

    const { data: recheckCampaign } = await sb.from("mass_inject_campaigns").select("status").eq("id", campaignId).single();
    if (!recheckCampaign || !["queued", "processing"].includes(recheckCampaign.status)) {
      console.log(`[mass-inject] campaign=${campaignId} status changed to ${recheckCampaign?.status} after claim — releasing ${batchContacts.length} contacts`);
      for (const c of batchContacts) {
        await sb.from("mass_inject_contacts").update({
          status: "pending", error_message: null, device_used: null, processed_at: null,
        } as any).eq("id", c.id);
      }
      return;
    }

    const contactGroupId = batchContacts[0].target_group_id || campaign.group_id;
    const phones = batchContacts.map((c: any) => c.phone.replace(/@.*/, ""));
    console.log(`[mass-inject] campaign=${campaignId} processing ${phones.length} contact(s) in group=${contactGroupId}`);

    type PerContactResult = { status: ContactProcessingStatus; detail: string };
    const batchResults = new Map<string, PerContactResult>();
    let needsRefresh = false;
    let participantsBefore = new Set<string>();

    try {
      const beforeState = await getGroupParticipantsDetailed(device.uazapi_base_url, device.uazapi_token, contactGroupId);
      participantsBefore = beforeState.participants;
    } catch (error) {
      console.warn(`[mass-inject] campaign=${campaignId} failed to read participants before add`, error);
    }

    try {
      const res = await fetchWithTimeout(`${device.uazapi_base_url}/group/updateParticipants`, {
        method: "POST",
        headers: buildHeaders(device.uazapi_token, true),
        body: JSON.stringify({
          groupjid: contactGroupId,
          action: "add",
          participants: phones,
        }),
      });

      const { raw, body: respBody } = await readApiResponse(res);
      const providerMessage = extractProviderMessage(respBody, raw);

      if (!res.ok) {
        const failure = classifyAddFailure(providerMessage, res.status);
        for (const phone of phones) {
          batchResults.set(phone, { status: failure.status, detail: failure.detail });
        }

        if (failure.status === "connection_unconfirmed" || res.status === 503) {
          const { confirmedDisconnect } = await checkInstanceConnectionWithRetries(
            device.uazapi_base_url,
            device.uazapi_token,
            `batch_fail:${contactGroupId}`,
          );
          if (confirmedDisconnect) {
            for (const phone of phones) {
              batchResults.set(phone, { status: "session_dropped", detail: "Sessão da API desconectada." });
            }
          }
        }
      } else {
        const groupUpdatedList = Array.isArray(respBody?.groupUpdated || respBody?.data?.groupUpdated)
          ? (respBody?.groupUpdated || respBody?.data?.groupUpdated)
          : [];
        const groupInfo = respBody?.group || respBody?.data?.group || {};
        needsRefresh = respBody?.needs_refresh === true;
        const rawLower = `${raw} ${providerMessage}`.toLowerCase();
        const successLikeResponse = res.ok
          && !!(groupInfo?.JID || groupInfo?.jid || groupInfo?.Name || groupInfo?.name || respBody?.group || respBody?.data?.group)
          && !hasExplicitFailureText(providerMessage || rawLower);

        let currentParticipants = new Set<string>();
        collectParticipantsFromValue(groupInfo?.Participants || groupInfo?.participants || groupInfo?.members || [], currentParticipants);
        console.log(`[mass-inject] campaign=${campaignId} groupUpdated=${groupUpdatedList.length} participants_from_response=${currentParticipants.size}`);

        // Always refresh participant list for accurate verification
        try {
          const refreshedState = await getGroupParticipantsDetailed(device.uazapi_base_url, device.uazapi_token, contactGroupId);
          if (refreshedState.participants.size > 0) {
            currentParticipants = refreshedState.participants;
            console.log(`[mass-inject] campaign=${campaignId} refreshed_participants=${currentParticipants.size}`);
          }
        } catch (error) {
          console.warn(`[mass-inject] campaign=${campaignId} failed to refresh participants after add`, error);
        }

        if (groupUpdatedList.length === 0 && currentParticipants.size === 0 && successLikeResponse) {
          for (const phone of phones) {
            if (participantSetHasPhone(participantsBefore, phone)) {
              batchResults.set(phone, { status: "already_exists", detail: "Contato já participava do grupo." });
            } else {
              batchResults.set(phone, { status: "completed", detail: "Adicionado com sucesso (resposta confirmada pela API)." });
            }
          }
        }

        // If no groupUpdated but we have participant list, check directly
        if (groupUpdatedList.length === 0 && currentParticipants.size > 0) {
          for (const phone of phones) {
            if (participantSetHasPhone(currentParticipants, phone) && !participantSetHasPhone(participantsBefore, phone)) {
              batchResults.set(phone, { status: "completed", detail: "Adicionado com sucesso." });
              console.log(`[mass-inject] campaign=${campaignId} participant verified in group: ${phone}`);
            } else if (participantSetHasPhone(participantsBefore, phone)) {
              batchResults.set(phone, { status: "already_exists", detail: "Contato já participava do grupo." });
            } else if (participantSetHasPhone(currentParticipants, phone)) {
              batchResults.set(phone, { status: "completed", detail: "Adicionado com sucesso." });
            } else {
              batchResults.set(phone, { status: "failed", detail: "Não foi possível adicionar ao grupo." });
            }
          }
        }

        for (const entry of groupUpdatedList) {
          const jid = String(entry?.JID || entry?.jid || entry?.participant || "");
          const errorCode = Number(entry?.Error ?? entry?.error ?? -1);
          const entryFingerprints = buildPhoneFingerprints(jid);
          const matchedPhone = phones.find((phone) => buildPhoneFingerprints(phone).some((fp) => entryFingerprints.includes(fp)));

          if (!matchedPhone) continue;

          if (errorCode === 0) {
            batchResults.set(matchedPhone, { status: "completed", detail: "Adicionado com sucesso." });
          } else if (participantSetHasPhone(currentParticipants, matchedPhone)) {
            // API returned error but participant IS in the group — treat as success
            batchResults.set(matchedPhone, { status: "completed", detail: "Adicionado com sucesso." });
          } else if (participantSetHasPhone(participantsBefore, matchedPhone)) {
            batchResults.set(matchedPhone, { status: "already_exists", detail: "Contato já participava do grupo." });
          } else {
            const failure = classifyAddFailure(
              String(entry?.message || entry?.detail || providerMessage || `Erro ao adicionar (código: ${errorCode}).`),
              res.status,
            );
            batchResults.set(matchedPhone, { status: failure.status, detail: failure.detail });
          }
        }

        for (const phone of phones) {
          if (batchResults.has(phone)) continue;

          if (participantSetHasPhone(participantsBefore, phone)) {
            batchResults.set(phone, { status: "already_exists", detail: "Contato já participava do grupo." });
            continue;
          }

          if (participantSetHasPhone(currentParticipants, phone)) {
            batchResults.set(phone, { status: "completed", detail: "Adicionado com sucesso." });
            continue;
          }

          const rawLower = `${raw} ${providerMessage}`.toLowerCase();
          if (rawLower.includes("already") || rawLower.includes("já")) {
            batchResults.set(phone, { status: "already_exists", detail: "Contato já participava do grupo." });
            continue;
          }

          const failure = classifyAddFailure(providerMessage || raw, res.status);
          if (failure.status !== "unknown_failure" || providerMessage) {
            batchResults.set(phone, { status: failure.status, detail: failure.detail });
          } else {
            batchResults.set(phone, {
              status: "unknown_failure",
              detail: "Sem resultado individual na resposta e sem confirmação no grupo.",
            });
          }
        }

        // ── Final verification: re-check unknown_failure contacts against live group ──
        const unknownPhones = [...batchResults.entries()].filter(([_, r]) => r.status === "unknown_failure").map(([p]) => p);
        if (unknownPhones.length > 0) {
          try {
            const verificationDelays = [2500, 5000];
            for (const delayMs of verificationDelays) {
              await sleep(delayMs);
              const finalCheck = await getGroupParticipantsDetailed(device.uazapi_base_url, device.uazapi_token, contactGroupId);
              if (finalCheck.participants.size > 0) {
                for (const phone of unknownPhones) {
                  if (participantSetHasPhone(finalCheck.participants, phone)) {
                    batchResults.set(phone, { status: "completed", detail: "Adicionado com sucesso (verificação final)." });
                    console.log(`[mass-inject] campaign=${campaignId} OVERRIDE unknown_failure → completed for ${phone}`);
                  }
                }
              }

              const remainingUnknown = [...batchResults.entries()].filter(([_, r]) => r.status === "unknown_failure").length;
              if (remainingUnknown === 0) break;
            }

            if (successLikeResponse) {
              for (const phone of unknownPhones) {
                const current = batchResults.get(phone);
                if (current?.status === "unknown_failure") {
                  if (participantSetHasPhone(participantsBefore, phone)) {
                    batchResults.set(phone, { status: "already_exists", detail: "Contato já participava do grupo." });
                  } else {
                    batchResults.set(phone, { status: "completed", detail: "Adicionado com sucesso (confirmação da API)." });
                  }
                }
              }
            }
          } catch (e) {
            console.warn(`[mass-inject] campaign=${campaignId} final verification failed`, e);
          }
        }
      }
    } catch (error: any) {
      const isTimeout = error.message?.includes("Timeout");
      for (const phone of phones) {
        batchResults.set(phone, {
          status: isTimeout ? "timeout" : "api_temporary",
          detail: isTimeout ? "Tempo limite excedido na API." : `Erro de conexão: ${error.message}`,
        });
      }
    }

    // ── Process per-participant results ──
    let anySuccess = false;
    let batchHasRateLimit = false;
    let batchRateLimitCount = 0;
    let consecutiveRealFailures = Number(campaign.consecutive_failures || 0);
    let shouldAutoPause = false;
    let autoPauseReason = "";

    for (const contact of batchContacts) {
      const phone = contact.phone.replace(/@.*/, "");
      const result = batchResults.get(phone) || { status: "unknown_failure" as ContactProcessingStatus, detail: "Resultado não encontrado." };
      const retryCount = extractRetryCount(contact.error_message);
      contactsProcessedThisRun++;

      console.log(JSON.stringify({
        type: "mass-group-inject.contact_result",
        campaignId, contactPhone: contact.phone, contactId: contact.id,
        status: result.status, detail: result.detail?.substring(0, 200),
        retryCount, deviceName: device.name, timestamp: nowIso(),
      }));

      const isTransient = ["rate_limited", "api_temporary", "connection_unconfirmed", "session_dropped",
        "permission_unconfirmed", "unknown_failure", "timeout"].includes(result.status);
      if (result.status === "rate_limited") {
        batchHasRateLimit = true;
        batchRateLimitCount++;
      }
      const maxRetries = result.status === "rate_limited" ? MAX_RATE_LIMIT_RETRIES
        : result.status === "session_dropped" ? MAX_SESSION_DROP_RETRIES : MAX_QUEUE_RETRIES;

      if (isTransient && retryCount < maxRetries) {
        let cooldownDelay = randomBetween(20_000, 40_000);
        if (result.status === "rate_limited") {
          const baseBackoff = 30_000;
          const expBackoff = baseBackoff * Math.pow(2, retryCount);
          cooldownDelay = Math.min(expBackoff + randomBetween(5_000, 15_000), 600_000);
        } else if (result.status === "session_dropped") {
          cooldownDelay = Math.round(cooldownDelay * (1 + retryCount * 0.5));
        }
        await sb.from("mass_inject_contacts").update({
          status: result.status,
          error_message: withRetryMeta(stripRetryMeta(result.detail), retryCount + 1),
          device_used: device.name || device.id,
          processed_at: nowIso(),
        }).eq("id", contact.id);
      } else if (isTransient && retryCount >= maxRetries) {
        // Retries exhausted — mark as final failure so campaign can finalize
        await sb.from("mass_inject_contacts").update({
          status: "failed",
          error_message: `${stripRetryMeta(result.detail)} Tentativas esgotadas (${maxRetries}x).`,
          device_used: device.name || device.id,
          processed_at: nowIso(),
        }).eq("id", contact.id);
        consecutiveRealFailures++;
        await updateCampaignCounters(sb, campaign, "failed", true);
      } else {
        const finalError = SUCCESS_STATUSES.has(result.status) ? null : stripRetryMeta(result.detail);
        await sb.from("mass_inject_contacts").update({
          status: result.status,
          error_message: finalError,
          device_used: device.name || device.id,
          processed_at: nowIso(),
        }).eq("id", contact.id);

        if (SUCCESS_STATUSES.has(result.status)) {
          anySuccess = true;
          consecutiveRealFailures = 0;
        }

        if (REAL_FAILURE_STATUSES.has(result.status)) {
          consecutiveRealFailures++;
          if (consecutiveRealFailures >= MAX_CONSECUTIVE_FAILURES) {
            shouldAutoPause = true;
            autoPauseReason = `Pausada por ${MAX_CONSECUTIVE_FAILURES} falhas consecutivas reais`;
          }
        }

        await updateCampaignCounters(sb, campaign, result.status, false);
      }
    }

    if (anySuccess) {
      await sb.from("devices").update({ status: "Ready", updated_at: nowIso() }).eq("id", device.id);
    }

    const counterPatch: Record<string, any> = {
      consecutive_failures: consecutiveRealFailures,
      updated_at: nowIso(),
    };
    if (!batchHasRateLimit && anySuccess) {
      counterPatch.rate_limit_count = 0;
      campaign.rate_limit_count = 0;
    }
    await sb.from("mass_inject_campaigns").update(counterPatch).eq("id", campaignId);
    campaign.consecutive_failures = consecutiveRealFailures;

    if (shouldAutoPause) {
      console.log(`[mass-inject] campaign=${campaignId} AUTO-PAUSE: ${autoPauseReason}`);
      await sb.from("mass_inject_campaigns").update({
        status: "paused", pause_reason: autoPauseReason, updated_at: nowIso(), next_run_at: null,
      }).eq("id", campaignId);
      await emitCampaignEvent(sb, campaignId, "campaign_paused", "warning", autoPauseReason);
      return;
    }

    if (needsRefresh) {
      console.log(`[mass-inject] campaign=${campaignId} needs_refresh=true, adding extra delay`);
    }

    const finalized = await finalizeCampaignIfNeeded(sb, campaignId);
    if (finalized || !(await campaignCanKeepRunning(sb, campaignId))) {
      return;
    }

    let nextDelayMs = computeNextDelayMs(campaign, undefined, device.id);
    if (needsRefresh) {
      nextDelayMs = Math.max(nextDelayMs, randomBetween(30_000, 60_000));
    }

    if (batchHasRateLimit) {
      const consecutiveRL = Number(campaign.rate_limit_count || 0) + batchRateLimitCount;
      // Progressive backoff: starts at 60s, caps at 10 min — keeps campaign alive for 1000+ contacts
      const baseBackoff = 60_000;
      const expBackoff = baseBackoff * Math.pow(1.5, Math.min(consecutiveRL - 1, 8));
      const rlDelay = Math.min(expBackoff + randomBetween(10_000, 30_000), 600_000);
      nextDelayMs = Math.max(nextDelayMs, rlDelay);
      console.log(`[mass-inject] campaign=${campaignId} RATE LIMIT BACKOFF: ${consecutiveRL} consecutive 429s, next batch in ${Math.round(rlDelay / 1000)}s`);
      await emitCampaignEvent(sb, campaignId, "rate_limit_backoff", "warning",
        `Limite da API atingido (${batchRateLimitCount}/${batchContacts.length} contatos). Cooldown: ${Math.round(rlDelay / 1000)}s. A campanha continuará automaticamente.`);
    }

    console.log(`[mass-inject] campaign=${campaignId} batch done (${contactsProcessedThisRun} contacts), requeue in ${nextDelayMs}ms`);
    await scheduleCampaignRun(sb, campaignId, nextDelayMs);
    nextRunScheduled = true;
  } catch (error: any) {
    console.error(JSON.stringify({
      type: "mass-group-inject.worker_error",
      campaignId,
      error: error.message || String(error),
      contactsProcessed: contactsProcessedThisRun,
      timestamp: nowIso(),
    }));
  } finally {
    if (lockAcquired && !nextRunScheduled) {
      await clearNextRunAt(sb, campaignId).catch(() => {});
    }

    // Safety net: if worker processed contacts but didn't schedule next run, check and reschedule
    if (lockAcquired && !nextRunScheduled && contactsProcessedThisRun > 0) {
      try {
        const stillRunning = await campaignCanKeepRunning(sb, campaignId);
        if (stillRunning) {
          const { count } = await sb.from("mass_inject_contacts")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", campaignId)
            .in("status", [...RETRYABLE_QUEUE_STATUSES, "pending"]);
          if (Number(count || 0) > 0) {
            console.log(`[mass-inject] campaign=${campaignId} SAFETY NET: rescheduling after unscheduled exit`);
            await scheduleCampaignRun(sb, campaignId, randomBetween(5000, 15000));
          } else {
            await finalizeCampaignIfNeeded(sb, campaignId);
          }
        }
      } catch (safetyErr) {
        console.error(`[mass-inject] campaign=${campaignId} safety net error:`, safetyErr);
      }
    }

    if (lockAcquired) {
      try {
        await sb.rpc("release_mass_inject_run_lock", { p_campaign_id: campaignId });
      } catch (releaseError) {
        console.error(`[mass-inject] campaign=${campaignId} failed to release lock`, releaseError);
      }
    }

    const workerDurationMs = Date.now() - workerStartedAt;
    console.log(JSON.stringify({
      type: "mass-group-inject.worker_end",
      campaignId,
      contactsProcessed: contactsProcessedThisRun,
      durationMs: workerDurationMs,
      timestamp: nowIso(),
    }));
  }
}

// ── HTTP Handler ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("authorization") || "";
    const internalRun = req.headers.get("x-internal-run") === "true" && authHeader === `Bearer ${serviceKey}`;

    let user: { id: string } | null = null;
    let isAdmin = false;

    if (!internalRun) {
      const token = authHeader.replace("Bearer ", "");
      const { data: authData, error: authError } = await sb.auth.getUser(token);
      if (authError || !authData.user) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      user = authData.user;
      const { data: roleData } = await sb.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      isAdmin = !!roleData;
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === "run-campaign") {
      // Hybrid mode: keeps VPS as primary, but guarantees campaign progression
      // via Edge fallback when VPS is down/stale.
      const { data: existingCampaign } = await sb
        .from("mass_inject_campaigns")
        .select("id, status")
        .eq("id", body.campaignId)
        .maybeSingle();

      if (!existingCampaign) {
        return new Response(JSON.stringify({ error: "Campanha não encontrada" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (existingCampaign.status === "paused") {
        await sb.from("mass_inject_campaigns").update({
          status: "queued",
          updated_at: nowIso(),
          pause_reason: null,
          next_run_at: null,
        }).eq("id", body.campaignId);
      }

      const initialDelayMs = Math.max(0, Math.round(Number(body.initialDelayMs) || 0));
      const edgeRuntime = (globalThis as any).EdgeRuntime;
      const supportsWaitUntil = !!edgeRuntime?.waitUntil;

      // In runtimes without waitUntil, avoid long sleeps here to prevent timeout.
      const effectiveInitialDelayMs = supportsWaitUntil ? initialDelayMs : 0;

      const workerTask = runCampaignWorker(sb, body.campaignId, effectiveInitialDelayMs)
        .catch((error) => console.error(`[mass-inject] run-campaign fallback error campaign=${body.campaignId}`, error));

      if (supportsWaitUntil) {
        edgeRuntime.waitUntil(workerTask);
      } else {
        await workerTask;
      }

      return new Response(JSON.stringify({ success: true, engine: "hybrid" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── RECOVER STALLED: cron-triggered action to resume interrupted campaigns ──
    if (action === "recover-stalled") {
      const STALE_PROCESSING_MINUTES = 5;
      const recovered: string[] = [];

      // 1. Reset contacts stuck in "processing" for too long back to "pending"
      await sb.from("mass_inject_contacts")
        .update({ status: "pending", error_message: "Reprocessando (recuperação automática)." } as any)
        .eq("status", "processing")
        .lt("processed_at", new Date(Date.now() - STALE_PROCESSING_MINUTES * 60_000).toISOString());

      // 2. Find campaigns that should be running but have no active worker
      const { data: stalledCampaigns } = await sb
        .from("mass_inject_campaigns")
        .select("id, status, updated_at")
        .in("status", ["queued", "processing"])
        .lt("updated_at", new Date(Date.now() - STALE_PROCESSING_MINUTES * 60_000).toISOString());

      for (const campaign of stalledCampaigns || []) {
        // Check if there are still pending contacts
        const { count } = await sb
          .from("mass_inject_contacts")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
        .in("status", [...RETRYABLE_QUEUE_STATUSES]);

        if (Number(count || 0) > 0) {
          // Try to acquire lock — if it succeeds, the old worker is truly dead
          const { data: lockOk } = await sb.rpc("try_acquire_mass_inject_run_lock", { p_campaign_id: campaign.id });
          if (lockOk) {
            // Release immediately — queueCampaignRun will re-acquire
            await sb.rpc("release_mass_inject_run_lock", { p_campaign_id: campaign.id });
            console.log(`[mass-inject-recovery] Resuming stalled campaign=${campaign.id}`);
            await queueCampaignRun(campaign.id, randomBetween(2000, 5000));
            recovered.push(campaign.id);
          }
          // If lock NOT acquired, a worker is still running — do nothing
        } else {
          // No pending contacts left — finalize
          await finalizeCampaignIfNeeded(sb, campaign.id);
        }
      }

      console.log(`[mass-inject-recovery] Recovered ${recovered.length} campaigns: ${recovered.join(", ") || "none"}`);
      return new Response(JSON.stringify({ success: true, recovered }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!user && !internalRun) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "list-groups") {
      const device = await getDeviceCredentials(sb, body.deviceId, user?.id || null, isAdmin);
      if (!device) return new Response(JSON.stringify({ error: "Instância não encontrada.", groups: [], diagnostics: "device_not_found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      try {
        const allGroups: any[] = [];
        const seenIds = new Set<string>();
        let diagnostics = "";
        const addGroups = (items: any[]) => {
          for (const group of items) {
            const jid = group.id || group.jid || group.JID || group.groupId || group.chatId || "";
            if (!jid || seenIds.has(jid)) continue;
            seenIds.add(jid);
            allGroups.push({ jid, name: group.subject || group.name || group.Subject || group.Name || group.groupName || "Sem nome", participants: group.ParticipantCount || group.participants?.length || group.Participants?.length || group.size || 0 });
          }
        };

        for (let page = 0; page < 10; page++) {
          try {
            const res = await fetchWithTimeout(`${device.uazapi_base_url}/group/list?GetParticipants=false&page=${page}&count=500`, { headers: buildHeaders(device.uazapi_token) });
            if (!res.ok) { diagnostics += `group/list page ${page}: HTTP ${res.status}; `; break; }
            const data = await res.json();
            const groups = Array.isArray(data) ? data : data?.groups || data?.data || [];
            if (!Array.isArray(groups) || groups.length === 0) break;
            addGroups(groups);
            if (groups.length < 500) break;
          } catch (error: any) { diagnostics += `group/list page ${page} error: ${error.message}; `; break; }
        }

        if (allGroups.length === 0) {
          for (const endpoint of ["/group/listAll", "/group/fetchAllGroups", "/chat/list?type=group&count=500"]) {
            try {
              const res = await fetchWithTimeout(`${device.uazapi_base_url}${endpoint}`, {
                method: endpoint === "/group/fetchAllGroups" ? "POST" : "GET",
                headers: endpoint === "/group/fetchAllGroups" ? buildHeaders(device.uazapi_token, true) : buildHeaders(device.uazapi_token),
                ...(endpoint === "/group/fetchAllGroups" ? { body: JSON.stringify({}) } : {}),
              });
              if (!res.ok) { diagnostics += `${endpoint}: HTTP ${res.status}; `; continue; }
              const data = await res.json();
              const groups = Array.isArray(data) ? data : data?.groups || data?.data || data?.chats || [];
              addGroups(Array.isArray(groups) ? groups : []);
              if (allGroups.length > 0) break;
            } catch (error: any) { diagnostics += `${endpoint} error: ${error.message}; `; }
          }
        }

        const error = allGroups.length > 0 ? undefined : "A instância não retornou grupos. Verifique conexão ou use Link/JID manual.";
        return new Response(JSON.stringify({ groups: allGroups, error, diagnostics, deviceName: device.name }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (error: any) {
        return new Response(JSON.stringify({ error: `Erro ao buscar grupos: ${error.message}`, groups: [], diagnostics: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (action === "resolve-link") {
      const device = await getDeviceCredentials(sb, body.deviceId, user?.id || null, isAdmin);
      if (!device) return new Response(JSON.stringify({ error: "Instância não encontrada." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const cleanLink = String(body.link || "").trim().replace(/[,;)\]}>'"]+$/, "").split("?")[0];
      const match = cleanLink.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/);
      const inviteCode = match ? match[1] : cleanLink;
      if (!inviteCode || inviteCode.length < 10) return new Response(JSON.stringify({ error: "Link inválido." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const strategies = [
        { method: "GET", url: `${device.uazapi_base_url}/group/inviteInfo?inviteCode=${inviteCode}` },
        { method: "POST", url: `${device.uazapi_base_url}/group/join`, body: { invitecode: inviteCode } },
        { method: "POST", url: `${device.uazapi_base_url}/group/join`, body: { invitecode: cleanLink } },
        { method: "PUT", url: `${device.uazapi_base_url}/group/acceptInviteGroup`, body: { inviteCode } },
      ];
      for (const strategy of strategies) {
        try {
          const res = await fetchWithTimeout(strategy.url, {
            method: strategy.method,
            headers: strategy.body ? buildHeaders(device.uazapi_token, true) : buildHeaders(device.uazapi_token),
            ...(strategy.body ? { body: JSON.stringify(strategy.body) } : {}),
          });
          if (res.status === 405) continue;
          const { raw, body: data } = await readApiResponse(res);
          const jid = data?.group?.JID || data?.group?.jid || data?.JID || data?.jid || data?.id || data?.groupJid || data?.gid || data?.groupId || data?.data?.JID || data?.data?.jid || "";
          const name = data?.group?.Name || data?.group?.name || data?.group?.Subject || data?.group?.subject || data?.Name || data?.name || data?.Subject || data?.subject || data?.data?.Name || "";
          if (jid) return new Response(JSON.stringify({ jid, name: name || "Grupo", joined: res.ok }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          const msg = extractProviderMessage(data, raw).toLowerCase();
          if (msg.includes("already") || msg.includes("já")) return new Response(JSON.stringify({ error: "A instância já participa desse grupo. Use Meus Grupos." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch { /* continue */ }
      }
      return new Response(JSON.stringify({ error: "Não foi possível validar o link do grupo." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "validate") {
      const rawContacts = Array.isArray(body.contacts) ? body.contacts : [];
      const seen = new Set<string>();
      const valid: string[] = [];
      const invalid: string[] = [];
      const duplicates: string[] = [];
      for (const raw of rawContacts) {
        const normalized = normalizePhone(String(raw));
        if (!normalized) { invalid.push(String(raw)); continue; }
        if (seen.has(normalized)) { duplicates.push(String(raw)); continue; }
        seen.add(normalized);
        valid.push(normalized);
      }
      return new Response(JSON.stringify({ total: rawContacts.length, valid, invalid, duplicates, validCount: valid.length, invalidCount: invalid.length, duplicateCount: duplicates.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "check-participants") {
      const device = await getDeviceCredentials(sb, body.deviceId, user?.id || null, isAdmin);
      if (!device) return new Response(JSON.stringify({ error: "Instância não encontrada" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      console.log(`[check-participants] groupId=${body.groupId}, deviceId=${body.deviceId}, contacts=${(body.contacts || []).length}`);
      const participantResult = await getGroupParticipantsDetailed(device.uazapi_base_url, device.uazapi_token, body.groupId);
      console.log(`[check-participants] confirmed=${participantResult.confirmed}, participants=${participantResult.participants.size}, diagnostics=${participantResult.diagnostics.join("; ")}`);
      if (!participantResult.confirmed) {
        return new Response(JSON.stringify({ 
          error: `Não foi possível confirmar participantes do grupo. ${participantResult.diagnostics.length > 0 ? participantResult.diagnostics[participantResult.diagnostics.length - 1] : "Tente novamente."}`,
          diagnostics: participantResult.diagnostics.join("; ")
        }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const ready: string[] = [];
      const alreadyExists: string[] = [];
      for (const phone of body.contacts || []) {
        const isInGroup = participantSetHasPhone(participantResult.participants, phone);
        if (isInGroup) alreadyExists.push(phone);
        else ready.push(phone);
      }
      console.log(`[check-participants] ready=${ready.length}, alreadyExists=${alreadyExists.length}, totalParticipants=${participantResult.participants.size}`);
      return new Response(JSON.stringify({ ready, alreadyExists, readyCount: ready.length, alreadyExistsCount: alreadyExists.length, totalParticipants: participantResult.participants.size }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "create-campaign") {
      const contacts = Array.isArray(body.contacts) ? Array.from(new Set(body.contacts.map(String).filter(Boolean))) : [];
      const deviceIds = Array.isArray(body.deviceIds) ? body.deviceIds.map(String).filter(Boolean) : [];

      // Support multi-group: body.groupTargets takes priority over body.groupId
      const groupTargets: Array<{group_id: string, group_name: string}> = Array.isArray(body.groupTargets) && body.groupTargets.length > 0
        ? body.groupTargets
        : body.groupId ? [{ group_id: body.groupId, group_name: body.groupName || body.groupId }] : [];

      if (groupTargets.length === 0 || deviceIds.length === 0) {
        return new Response(JSON.stringify({ error: "Grupo e instância são obrigatórios." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (contacts.length === 0) {
        return new Response(JSON.stringify({ error: "Nenhum contato válido para enfileirar." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const primaryGroupId = groupTargets[0].group_id;
      const primaryGroupName = groupTargets[0].group_name;
      const assignmentMode = groupTargets.length > 1 ? "multi_group_round_robin" : "single";

      const primaryDevice = await getDeviceCredentials(sb, deviceIds[0], user?.id || null, isAdmin);
      if (!primaryDevice) {
        return new Response(JSON.stringify({ error: "Instância não encontrada." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── PRE-CHECK: automatically detect contacts already in each target group ──
      const groupParticipantsMap = new Map<string, Set<string>>();
      let preCheckSucceeded = false;
      try {
        for (const gt of groupTargets) {
          const result = await getGroupParticipantsDetailed(primaryDevice.uazapi_base_url, primaryDevice.uazapi_token, gt.group_id);
          if (result.confirmed && result.participants.size > 0) {
            groupParticipantsMap.set(gt.group_id, result.participants);
            preCheckSucceeded = true;
            console.log(`[create-campaign] pre-check group=${gt.group_id} participants=${result.participants.size}`);
          } else {
            console.log(`[create-campaign] pre-check group=${gt.group_id} FAILED (confirmed=${result.confirmed}, size=${result.participants.size})`);
          }
        }
      } catch (e: any) {
        console.warn(`[create-campaign] pre-check error: ${e.message}`);
      }

      const { data: campaign, error } = await sb.from("mass_inject_campaigns").insert({
        user_id: user!.id,
        name: body.name || `Campanha ${new Date().toLocaleString("pt-BR")}`,
        group_id: primaryGroupId,
        group_name: primaryGroupName,
        device_ids: deviceIds,
        group_targets: groupTargets,
        assignment_mode: assignmentMode,
        status: "queued",
        total_contacts: contacts.length,
        success_count: 0,
        already_count: 0,
        fail_count: 0,
        min_delay: Math.max(Number(body.minDelay ?? 10), 0),
        max_delay: Math.max(Number(body.maxDelay ?? 30), Number(body.minDelay ?? 10), 0),
        pause_after: Math.max(Number(body.pauseAfter ?? 0), 0),
        pause_duration: Math.max(Number(body.pauseDuration ?? 0), 0),
        rotate_after: Math.max(Number(body.rotateAfter ?? 0), 0),
        started_at: nowIso(),
      } as any).select().single();
      if (error || !campaign) throw error || new Error("Erro ao criar campanha.");

      let alreadyExistsCount = 0;
      const rows = contacts.map((phone, i) => {
        const target = groupTargets[i % groupTargets.length];
        const groupParticipants = groupParticipantsMap.get(target.group_id);
        const isAlreadyInGroup = groupParticipants ? participantSetHasPhone(groupParticipants, phone) : false;

        if (isAlreadyInGroup) {
          alreadyExistsCount++;
          return {
            campaign_id: campaign.id,
            phone,
            status: "already_exists",
            error_message: null,
            target_group_id: target.group_id,
            target_group_name: target.group_name,
            processed_at: nowIso(),
            device_used: "pre-check",
          };
        }

        return {
          campaign_id: campaign.id,
          phone,
          status: "pending",
          target_group_id: target.group_id,
          target_group_name: target.group_name,
        };
      });

      for (let i = 0; i < rows.length; i += 500) {
        await sb.from("mass_inject_contacts").insert(rows.slice(i, i + 500) as any);
      }

      // Update campaign counters with pre-check results
      if (alreadyExistsCount > 0) {
        await sb.from("mass_inject_campaigns").update({
          already_count: alreadyExistsCount,
          total_contacts: contacts.length,
        }).eq("id", campaign.id);
      }

      const readyCount = contacts.length - alreadyExistsCount;

      // If all contacts are already in the group, finalize immediately
      if (readyCount === 0) {
        await sb.from("mass_inject_campaigns").update({
          status: "done",
          completed_at: nowIso(),
          updated_at: nowIso(),
        }).eq("id", campaign.id);
        return new Response(JSON.stringify({
          success: true,
          campaignId: campaign.id,
          readyCount: 0,
          alreadyExistsCount,
          deferredParticipantCheck: false,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await queueCampaignRun(campaign.id, 0);
      return new Response(JSON.stringify({
        success: true,
        campaignId: campaign.id,
        readyCount,
        alreadyExistsCount,
        deferredParticipantCheck: !preCheckSucceeded,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (["resume-campaign", "pause-campaign", "cancel-campaign"].includes(action)) {
      const { data: campaign } = await sb.from("mass_inject_campaigns").select("id, user_id, status").eq("id", body.campaignId).single();
      if (!campaign || (!isAdmin && campaign.user_id !== user!.id)) return new Response(JSON.stringify({ error: "Campanha não encontrada" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      if (action === "pause-campaign") {
        await sb.from("mass_inject_campaigns").update({ status: "paused", updated_at: nowIso(), completed_at: null, next_run_at: null, pause_reason: "Pausada manualmente pelo usuário" }).eq("id", campaign.id);
        await emitCampaignEvent(sb, campaign.id, "campaign_paused", "warning");
        await sb.from("mass_inject_contacts").update({ status: "pending", error_message: null } as any).eq("campaign_id", campaign.id).eq("status", "processing");
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "cancel-campaign") {
        await sb.from("mass_inject_contacts").update({ status: "cancelled", error_message: "Cancelado pelo usuário.", processed_at: nowIso() } as any).eq("campaign_id", campaign.id).in("status", [...RETRYABLE_QUEUE_STATUSES, "processing"]);
        await sb.from("mass_inject_campaigns").update({ status: "cancelled", updated_at: nowIso(), completed_at: nowIso(), next_run_at: null }).eq("id", campaign.id);
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // resume — start with a recovery delay (30-60s) to avoid immediate burst after reconnect
      await sb.from("mass_inject_contacts").update({ status: "pending", error_message: null } as any).eq("campaign_id", campaign.id).eq("status", "processing");
      await sb.from("mass_inject_campaigns").update({ status: "queued", updated_at: nowIso(), completed_at: null, next_run_at: null, pause_reason: null, consecutive_failures: 0 }).eq("id", campaign.id);
      await emitCampaignEvent(sb, campaign.id, "campaign_resumed", "info");
      const resumeDelay = randomBetween(30_000, 60_000); // slow ramp-up after resume
      await queueCampaignRun(campaign.id, resumeDelay);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "add-single") {
      const device = await getDeviceCredentials(sb, body.deviceId, user?.id || null, isAdmin);
      if (!device) return new Response(JSON.stringify({ status: "unauthorized", error: "Instância não encontrada.", detail: "Sem credenciais." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const participants = await getGroupParticipants(device.uazapi_base_url, device.uazapi_token, body.groupId);
      const result = participantSetHasPhone(participants, body.phone)
        ? { status: "already_exists", detail: "Contato já participava do grupo.", attempts: 0, pauseCampaign: false }
        : await executeAddWithRecovery(device.uazapi_base_url, device.uazapi_token, body.groupId, body.phone);
      return new Response(JSON.stringify({ status: result.status, detail: result.detail, error: SUCCESS_STATUSES.has(result.status) ? null : result.detail, pauseCampaign: !!result.pauseCampaign, attempts: result.attempts }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Ação desconhecida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("mass-group-inject error:", error);
    return new Response(JSON.stringify({ error: `Erro interno: ${error.message}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
