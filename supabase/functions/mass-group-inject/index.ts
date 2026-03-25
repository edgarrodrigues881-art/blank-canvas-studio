// mass-group-inject v14.0 — fetch timeout + delay by result type + robust finalization
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  | "confirmed_disconnect"
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
  "rate_limited", "api_temporary", "connection_unconfirmed", "confirmed_disconnect",
  "permission_unconfirmed", "confirmed_no_admin", "invalid_group", "contact_not_found",
  "unauthorized", "blocked", "unknown_failure", "timeout",
]);

const FINAL_CAMPAIGN_STATUSES = new Set(["done", "completed_with_failures", "paused", "cancelled", "failed"]);
const RETRYABLE_QUEUE_STATUSES = ["pending", "rate_limited", "api_temporary", "connection_unconfirmed", "permission_unconfirmed", "unknown_failure", "timeout"] as const;
const MAX_QUEUE_RETRIES = 3;
const STALE_PROCESSING_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const API_TIMEOUT_MS = 25_000; // 25s timeout for all external API calls

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

function collectParticipantsFromValue(value: any, participants: Set<string>) {
  if (!value) return;
  if (Array.isArray(value)) { value.forEach((entry) => collectParticipantsFromValue(entry, participants)); return; }
  if (typeof value === "string") { for (const fp of buildPhoneFingerprints(value)) participants.add(fp); return; }
  if (typeof value === "object") {
    for (const key of ["id", "jid", "number", "phone", "participant", "user", "pn"]) {
      if (typeof value[key] === "string") { for (const fp of buildPhoneFingerprints(value[key])) participants.add(fp); }
    }
    for (const nk of ["participants", "Participants", "members", "data", "group", "memberAddMode"]) {
      if (value[nk]) collectParticipantsFromValue(value[nk], participants);
    }
  }
}

async function getGroupParticipantsDetailed(baseUrl: string, token: string, groupId: string): Promise<{ participants: Set<string>; confirmed: boolean; diagnostics: string[] }> {
  const participants = new Set<string>();
  const diagnostics: string[] = [];
  const strategies = [
    { method: "GET", url: `${baseUrl}/group/participants?groupJid=${encodeURIComponent(groupId)}` },
    { method: "GET", url: `${baseUrl}/group/participantsList?groupJid=${encodeURIComponent(groupId)}` },
    { method: "POST", url: `${baseUrl}/group/info`, body: { groupJid: groupId } },
    { method: "GET", url: `${baseUrl}/group/info?groupJid=${encodeURIComponent(groupId)}` },
    { method: "POST", url: `${baseUrl}/chat/info`, body: { chatId: groupId } },
  ];
  for (const strategy of strategies) {
    try {
      const res = await fetchWithTimeout(strategy.url, {
        method: strategy.method,
        headers: strategy.body ? buildHeaders(token, true) : buildHeaders(token),
        ...(strategy.body ? { body: JSON.stringify(strategy.body) } : {}),
      });
      const { raw, body } = await readApiResponse(res);
      if (!res.ok) { diagnostics.push(`${strategy.method} ${strategy.url}: HTTP ${res.status}`); continue; }
      collectParticipantsFromValue(body, participants);
      collectParticipantsFromValue(raw, participants);
      if (participants.size > 0) return { participants, confirmed: true, diagnostics };
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
    return { status: "rate_limited", detail: "Limite de requisições atingido. Aguardando cooldown antes de continuar.", retryable: true, cooldownMs: randomBetween(25_000, 45_000) };
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
  if (message.includes("timeout") || message.includes("timed out") || httpStatus === 408 || httpStatus === 504) {
    return { status: "api_temporary", detail: "Uazapi não respondeu a tempo.", retryable: true, cooldownMs: randomBetween(10_000, 18_000) };
  }
  if (httpStatus >= 500) {
    return { status: "api_temporary", detail: `Erro de servidor Uazapi (${httpStatus}).`, retryable: true, cooldownMs: randomBetween(12_000, 20_000) };
  }
  return { status: "unknown_failure", detail: `Falha não confirmada: ${rawMessage.substring(0, 140) || `HTTP ${httpStatus}`}`, retryable: true, cooldownMs: randomBetween(10_000, 16_000) };
}

async function getDeviceCredentials(sb: any, deviceId: string, userId: string | null, bypassUserFilter: boolean) {
  const query = sb.from("devices").select("id, name, uazapi_base_url, uazapi_token, user_id").eq("id", deviceId);
  if (!bypassUserFilter && userId) query.eq("user_id", userId);
  const { data: device } = await query.single();
  if (!device?.uazapi_base_url || !device?.uazapi_token) return null;
  return { ...device, uazapi_base_url: String(device.uazapi_base_url).replace(/\/+$/, "") };
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
      const rawLower = `${raw} ${pm}`.toLowerCase();

      if ((res.status === 200 || res.status === 201) && !rawLower.includes("failed") && !rawLower.includes("bad-request")) {
        return { ok: true, status: res.status, body, rawMessage: pm || raw, strategyIndex: cachedStrategyIndex };
      }
      if (rawLower.includes("already") || rawLower.includes("já") || rawLower.includes("memberaddmode") || res.status === 409) {
        return { ok: false, status: 409, body, rawMessage: pm || raw, errorCode: "already_exists", strategyIndex: cachedStrategyIndex };
      }
      // Any error from cached endpoint → return immediately, NEVER fallback to discovery
      return { ok: false, status: res.status, body, rawMessage: pm || raw, strategyIndex: cachedStrategyIndex };
    } catch (error: any) {
      const isTimeout = error.message?.includes("Timeout");
      return { ok: false, status: isTimeout ? 408 : 0, rawMessage: error.message, strategyIndex: cachedStrategyIndex };
    }
  }

  // ── DISCOVERY MODE (first contact only): find the working endpoint ──
  // Try strategies sequentially but STOP at the first that responds (even with error).
  // Only skip 405 (method not allowed) since that means the endpoint doesn't exist.
  for (let i = 0; i < strategies.length; i++) {
    const strategy = strategies[i];
    try {
      console.log(`addToGroup DISCOVERY[${i}]: ${strategy.method} ${strategy.url}`);
      const res = await fetch(strategy.url, { method: strategy.method, headers, body: JSON.stringify(strategy.body) });
      if (res.status === 405) continue; // Endpoint doesn't exist, try next

      const { raw, body } = await readApiResponse(res);
      const pm = extractProviderMessage(body, raw);
      const rawLower = `${raw} ${pm}`.toLowerCase();

      if ((res.status === 200 || res.status === 201) && !rawLower.includes("failed") && !rawLower.includes("bad-request")) {
        return { ok: true, status: res.status, body, rawMessage: pm || raw, strategyIndex: i };
      }
      if (rawLower.includes("already") || rawLower.includes("já") || rawLower.includes("memberaddmode") || res.status === 409) {
        return { ok: false, status: 409, body, rawMessage: pm || raw, errorCode: "already_exists", strategyIndex: i };
      }
      // Got a real response → this is the correct endpoint. Return error, do NOT try more.
      return { ok: false, status: res.status, body, rawMessage: pm || raw, strategyIndex: i };
    } catch (error: any) {
      // Network error → also STOP. Do not flood with more requests.
      return { ok: false, status: 0, rawMessage: error.message };
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

  const providerMessage = addResult.rawMessage || "Falha sem detalhe.";
  let failure = classifyAddFailure(providerMessage, addResult.status);
  let connectionCheck: ConnectionCheckResult | null = null;

  // IMPORTANT: no internal retry loop here.
  // Each worker invocation processes a single attempt and lets the queue handle retries,
  // preventing burst calls that were causing 429 + false disconnect cascades.
  if (failure.status === "connection_unconfirmed") {
    connectionCheck = await checkInstanceConnection(baseUrl, token);
    if (connectionCheck.connected === true) {
      failure = {
        status: "api_temporary",
        detail: "A integração acusou desconexão, mas a instância continua conectada.",
        retryable: true,
        cooldownMs: randomBetween(20_000, 35_000),
      };
    } else if (connectionCheck.connected === false) {
      failure = {
        status: "confirmed_disconnect",
        detail: "Instância revalidada e está realmente desconectada.",
        retryable: false,
        pauseCampaign: true,
        confirmed: true,
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
    connectionStatus: connectionCheck?.status || null,
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
  const deviceIds = parseDeviceIds(campaign.device_ids);
  if (deviceIds.length === 0) return null;
  const rotateAfter = Number(campaign.rotate_after || 0);
  if (!rotateAfter || deviceIds.length === 1) return deviceIds[0];
  const successCount = Number(campaign.success_count || 0);
  return deviceIds[Math.floor(successCount / rotateAfter) % deviceIds.length] || deviceIds[0];
}

/** Insert an event into the events table for reliable delivery */
async function emitCampaignEvent(sb: any, campaignId: string, eventType: string, eventLevel: string = "info", message?: string) {
  await sb.from("mass_inject_events").insert({ campaign_id: campaignId, event_type: eventType, event_level: eventLevel, message: message || null });
}

async function updateCampaignCounters(sb: any, campaign: any, status: string, pauseCampaign = false) {
  const patch: Record<string, any> = { updated_at: nowIso() };
  let eventType = "";
  let eventLevel = "info";
  if (status === "completed") {
    patch.success_count = Number(campaign.success_count || 0) + 1;
    eventType = "contact_added"; eventLevel = "success";
  } else if (status === "already_exists") {
    patch.already_count = Number(campaign.already_count || 0) + 1;
    eventType = "contact_already_exists"; eventLevel = "info";
  } else if (FAILURE_STATUSES.has(status)) {
    patch.fail_count = Number(campaign.fail_count || 0) + 1;
    eventLevel = "error";
    if (status === "rate_limited") { eventType = "rate_limited"; eventLevel = "warning"; }
    else if (status === "contact_not_found") eventType = "contact_not_found";
    else if (status === "confirmed_disconnect") eventType = "instance_disconnected";
    else if (status === "confirmed_no_admin") eventType = "no_admin_permission";
    else eventType = "contact_error";
  }
  if (pauseCampaign) {
    patch.status = "paused";
    eventType = "campaign_paused"; eventLevel = "warning";
  }
  await sb.from("mass_inject_campaigns").update(patch).eq("id", campaign.id);
  if (eventType) await emitCampaignEvent(sb, campaign.id, eventType, eventLevel);
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
  // Fire-and-forget: the new invocation will acquire its own lock
  fetch(`${supabaseUrl}/functions/v1/mass-group-inject`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: anonKey, "x-internal-run": "true", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "run-campaign", campaignId, initialDelayMs: delayMs }),
  }).catch((error) => console.error("queueCampaignRun error:", error));
}

function computeNextDelayMs(campaign: any, cooldownMs?: number) {
  // CRITICAL: enforce minimum 10s between contacts to avoid flooding and disconnection
  const minDelay = Math.max(Number(campaign.min_delay || 10), 10);
  const maxDelay = Math.max(Number(campaign.max_delay || 18), minDelay);
  let nextDelay = randomBetween(minDelay, maxDelay) * 1000;
  // JITTER: add 1–4s of random noise to make timing less predictable/detectable
  nextDelay += randomBetween(1000, 4000);
  const processed = Number(campaign.success_count || 0) + Number(campaign.fail_count || 0) + Number(campaign.already_count || 0);
  const pauseAfter = Number(campaign.pause_after || 0);
  const pauseDuration = Math.max(Number(campaign.pause_duration || 0), 0);
  if (pauseAfter > 0 && processed > 0 && processed % pauseAfter === 0) {
    nextDelay = Math.max(nextDelay, pauseDuration * 1000);
  }
  if (cooldownMs) nextDelay = Math.max(nextDelay, cooldownMs);
  return nextDelay;
}

// Consecutive failure tracking for auto-pause
const MAX_CONSECUTIVE_FAILURES = 5;

/**
 * Truly serial campaign worker:
 * 1. Acquires DB-level advisory lock per campaign (prevents concurrent workers)
 * 2. Loops through contacts ONE AT A TIME
 * 3. Validates instance connection BEFORE each send (every N contacts)
 * 4. Uses BLOCKING await delays between contacts
 * 5. Releases lock on exit
 */
async function runCampaignWorker(sb: any, campaignId: string, initialDelayMs = 0) {
  // ── Apply initial delay BEFORE acquiring lock (blocking) ──
  if (initialDelayMs > 0) {
    console.log(`[mass-inject] campaign=${campaignId} waiting ${initialDelayMs}ms before starting`);
    await sleep(initialDelayMs);
  }

  // ── Try to acquire advisory lock — if another worker is running, exit immediately ──
  const { data: lockAcquired } = await sb.rpc("try_acquire_mass_inject_run_lock", { p_campaign_id: campaignId });
  if (!lockAcquired) {
    console.log(`[mass-inject] campaign=${campaignId} lock NOT acquired — another worker is running, exiting`);
    return;
  }
  console.log(`[mass-inject] campaign=${campaignId} lock acquired — starting serial processing`);
  await setCampaignEvent(sb, campaignId, "campaign_started", "info");

  let consecutiveFailures = 0;
  const workerStartedAt = Date.now();
  let contactsProcessedThisRun = 0;

  try {
    console.log(JSON.stringify({
      type: "mass-group-inject.worker_start",
      campaignId,
      timestamp: nowIso(),
    }));

    // ── Main processing loop: one contact at a time ──
    while (true) {
      // 0. PROCESSING TIMEOUT: reset contacts stuck in "processing" for > 3 minutes
      const staleThreshold = new Date(Date.now() - STALE_PROCESSING_TIMEOUT_MS).toISOString();
      const { data: resetData } = await sb.from("mass_inject_contacts")
        .update({ status: "pending", error_message: "Reprocessando (timeout de processamento)." } as any)
        .eq("campaign_id", campaignId)
        .eq("status", "processing")
        .lt("processed_at", staleThreshold)
        .select("id");
      const resetCount = resetData?.length || 0;
      if (resetCount > 0) {
        console.log(`[mass-inject] campaign=${campaignId} reset ${resetCount} stale processing contacts back to pending`);
      }
      // 1. Re-fetch campaign to check for pause/cancel
      const { data: campaign } = await sb.from("mass_inject_campaigns").select("*").eq("id", campaignId).single();
      if (!campaign || FINAL_CAMPAIGN_STATUSES.has(campaign.status)) {
        console.log(`[mass-inject] campaign=${campaignId} status=${campaign?.status || 'not_found'} — stopping`);
        break;
      }
      if (!["queued", "processing"].includes(campaign.status)) {
        console.log(`[mass-inject] campaign=${campaignId} status=${campaign.status} — not active, stopping`);
        break;
      }

      // 2. Pick device
      const deviceId = pickDeviceId(campaign);
      if (!deviceId) {
        await sb.from("mass_inject_campaigns").update({ status: "failed", updated_at: nowIso(), completed_at: nowIso() }).eq("id", campaignId);
        break;
      }

      const device = await getDeviceCredentials(sb, deviceId, campaign.user_id, true);
      if (!device) {
        await sb.from("mass_inject_campaigns").update({ status: "paused", updated_at: nowIso() }).eq("id", campaignId);
        break;
      }

      // 3. Validate connection BEFORE sending (every 10 contacts or after failures)
      const processed = Number(campaign.success_count || 0) + Number(campaign.fail_count || 0) + Number(campaign.already_count || 0);
      const shouldCheckConnection = processed === 0 || processed % 10 === 0 || consecutiveFailures >= 2;
      
      if (shouldCheckConnection) {
        const connCheck = await checkInstanceConnection(device.uazapi_base_url, device.uazapi_token);
        if (connCheck.connected === false) {
          console.log(`[mass-inject] campaign=${campaignId} device=${device.name} DISCONNECTED — pausing campaign`);
          await sb.from("devices").update({ status: "Disconnected", updated_at: nowIso() }).eq("id", device.id);
          await sb.from("mass_inject_campaigns").update({ status: "paused", updated_at: nowIso() }).eq("id", campaignId);
          break;
        }
        // If connected, reset consecutive failures
        if (connCheck.connected === true && consecutiveFailures > 0) {
          console.log(`[mass-inject] campaign=${campaignId} connection confirmed after ${consecutiveFailures} failures`);
        }
      }

      // 4. Mark campaign as processing
      if (campaign.status === "queued") {
        await sb.from("mass_inject_campaigns").update({ status: "processing", updated_at: nowIso() }).eq("id", campaignId);
      }

      // 5. Claim next contact atomically (FOR UPDATE SKIP LOCKED)
      const retryMsg = consecutiveFailures > 0 ? `Processando (após ${consecutiveFailures} falha${consecutiveFailures > 1 ? 's' : ''})...` : "Processando...";
      const { data: contact } = await sb.rpc("claim_next_mass_inject_contact", {
        p_campaign_id: campaignId,
        p_device_used: device.name || device.id,
        p_processing_message: retryMsg,
      });

      if (!contact?.id) {
        // No more contacts to process
        await finalizeCampaignIfNeeded(sb, campaignId);
        break;
      }

      const retryCount = extractRetryCount(contact.error_message);

      // 6. GLOBAL PER-DEVICE RATE LIMITER: claim send slot before any API call
      const { data: waitMs } = await sb.rpc("claim_device_send_slot", {
        p_device_id: device.id,
        p_min_interval_ms: 12000, // 12s minimum between any API calls per device
      });
      if (waitMs && waitMs > 0) {
        const jitteredWait = waitMs + randomBetween(1000, 3000);
        console.log(`[mass-inject] campaign=${campaignId} device=${device.name} global rate limit: waiting ${jitteredWait}ms`);
        await setNextRunAt(sb, campaignId, jitteredWait);
        await sleep(jitteredWait);
      }

      // 7. Execute the add operation (fully awaited)
      const cacheKey = `${campaignId}:${campaign.group_id}`;
      console.log(`[mass-inject] campaign=${campaignId} processing contact=${contact.phone} (retry=${retryCount})`);
      const result = await executeAddWithRecovery(device.uazapi_base_url, device.uazapi_token, campaign.group_id, contact.phone, cacheKey);
      contactsProcessedThisRun++;

      // STRUCTURED PER-CONTACT LOG
      console.log(JSON.stringify({
        type: "mass-group-inject.contact_result",
        campaignId,
        contactPhone: contact.phone,
        contactId: contact.id,
        status: result.status,
        detail: result.detail?.substring(0, 200),
        retryCount,
        deviceName: device.name,
        timestamp: nowIso(),
      }));

      // 8. Update device status based on result
      if (result.status === "confirmed_disconnect") {
        await sb.from("devices").update({ status: "Disconnected", updated_at: nowIso() }).eq("id", device.id);
      } else if (result.status === "completed" || result.status === "already_exists") {
        await sb.from("devices").update({ status: "Ready", updated_at: nowIso() }).eq("id", device.id);
      }

      // 9. Handle transient errors with retry
      const isTransient = ["rate_limited", "api_temporary", "connection_unconfirmed", "permission_unconfirmed", "unknown_failure"].includes(result.status) && !result.pauseCampaign;

      if (isTransient && retryCount < MAX_QUEUE_RETRIES) {
        await sb.from("mass_inject_contacts").update({
          status: result.status,
          error_message: withRetryMeta(stripRetryMeta(result.detail), retryCount + 1),
          device_used: device.name || device.id,
          processed_at: nowIso(),
        }).eq("id", contact.id);
        
        consecutiveFailures++;
        
        // Auto-pause after too many consecutive failures
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.log(`[mass-inject] campaign=${campaignId} ${consecutiveFailures} consecutive failures — auto-pausing`);
          await sb.from("mass_inject_campaigns").update({ status: "paused", updated_at: nowIso() }).eq("id", campaignId);
          await emitCampaignEvent(sb, campaignId, "campaign_paused", "warning");
          break;
        }

        // Apply cooldown delay (blocking)
        const cooldownDelay = result.cooldownMs || computeNextDelayMs(campaign, result.cooldownMs);
        console.log(`[mass-inject] campaign=${campaignId} transient error, waiting ${cooldownDelay}ms before retry`);
        await setCampaignEvent(sb, campaignId, "retry_waiting", "warning");
        await setNextRunAt(sb, campaignId, cooldownDelay);
        await sleep(cooldownDelay);
        await setCampaignEvent(sb, campaignId, "retry_resumed", "info");
        continue;
      }

      // 10. Write final contact result
      const finalError = SUCCESS_STATUSES.has(result.status) ? null : stripRetryMeta(result.detail);
      await sb.from("mass_inject_contacts").update({
        status: result.status,
        error_message: finalError,
        device_used: device.name || device.id,
        processed_at: nowIso(),
      }).eq("id", contact.id);

      // 11. Update campaign counters
      const { data: latestCampaign } = await sb.from("mass_inject_campaigns").select("*").eq("id", campaignId).single();
      if (!latestCampaign) break;
      await updateCampaignCounters(sb, latestCampaign, result.status, !!result.pauseCampaign);

      if (result.pauseCampaign) {
        console.log(`[mass-inject] campaign=${campaignId} pauseCampaign flag set — stopping`);
        break;
      }

      // Track consecutive failures / reset on success
      if (SUCCESS_STATUSES.has(result.status)) {
        consecutiveFailures = 0;
      } else {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.log(`[mass-inject] campaign=${campaignId} ${consecutiveFailures} consecutive failures — auto-pausing`);
          await sb.from("mass_inject_campaigns").update({ status: "paused", updated_at: nowIso() }).eq("id", campaignId);
          await emitCampaignEvent(sb, campaignId, "campaign_paused", "warning");
          break;
        }
      }

      // 11. BLOCKING delay before next contact
      const nextDelayMs = computeNextDelayMs(latestCampaign, result.cooldownMs);
      console.log(`[mass-inject] campaign=${campaignId} waiting ${nextDelayMs}ms before next contact`);
      await setNextRunAt(sb, campaignId, nextDelayMs);
      await sleep(nextDelayMs);
    }
  } catch (error: any) {
    console.error(JSON.stringify({
      type: "mass-group-inject.worker_error",
      campaignId,
      error: error.message || String(error),
      contactsProcessed: contactsProcessedThisRun,
      timestamp: nowIso(),
    }));
  } finally {
    // ── Clear next_run_at since worker is ending ──
    await clearNextRunAt(sb, campaignId).catch(() => {});

    // ── Ensure campaign is finalized if all contacts are done ──
    try {
      await finalizeCampaignIfNeeded(sb, campaignId);
    } catch (e) {
      console.error(`[mass-inject] campaign=${campaignId} finalization check error:`, e);
    }

    // ── ALWAYS release the advisory lock ──
    await sb.rpc("release_mass_inject_run_lock", { p_campaign_id: campaignId }).catch(() => {});

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
      await runCampaignWorker(sb, body.campaignId, Number(body.initialDelayMs || 0));
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
          .in("status", ["pending", "rate_limited", "api_temporary", "connection_unconfirmed", "permission_unconfirmed", "unknown_failure"]);

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
            const res = await fetch(`${device.uazapi_base_url}/group/list?GetParticipants=false&page=${page}&count=500`, { headers: buildHeaders(device.uazapi_token) });
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
              const res = await fetch(`${device.uazapi_base_url}${endpoint}`, {
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
          const res = await fetch(strategy.url, {
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
      const participantResult = await getGroupParticipantsDetailed(device.uazapi_base_url, device.uazapi_token, body.groupId);
      if (!participantResult.confirmed) return new Response(JSON.stringify({ error: "Não foi possível confirmar participantes. Tente novamente.", diagnostics: participantResult.diagnostics.join("; ") }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const ready: string[] = [];
      const alreadyExists: string[] = [];
      for (const phone of body.contacts || []) {
        if (participantSetHasPhone(participantResult.participants, phone)) alreadyExists.push(phone);
        else ready.push(phone);
      }
      return new Response(JSON.stringify({ ready, alreadyExists, readyCount: ready.length, alreadyExistsCount: alreadyExists.length, totalParticipants: participantResult.participants.size }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "create-campaign") {
      const contacts = Array.isArray(body.contacts) ? Array.from(new Set(body.contacts.map(String).filter(Boolean))) : [];
      const deviceIds = Array.isArray(body.deviceIds) ? body.deviceIds.map(String).filter(Boolean) : [];
      if (!body.groupId || deviceIds.length === 0) {
        return new Response(JSON.stringify({ error: "Grupo e instância são obrigatórios." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (contacts.length === 0) {
        return new Response(JSON.stringify({ error: "Nenhum contato válido para enfileirar." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const primaryDevice = await getDeviceCredentials(sb, deviceIds[0], user?.id || null, isAdmin);
      if (!primaryDevice) {
        return new Response(JSON.stringify({ error: "Instância não encontrada." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: campaign, error } = await sb.from("mass_inject_campaigns").insert({
        user_id: user!.id,
        name: body.name || `Campanha ${new Date().toLocaleString("pt-BR")}`,
        group_id: body.groupId,
        group_name: body.groupName || body.groupId,
        device_ids: deviceIds,
        status: "queued",
        total_contacts: contacts.length,
        success_count: 0,
        already_count: 0,
        fail_count: 0,
        min_delay: Math.max(Number(body.minDelay || 8), 8),
        max_delay: Math.max(Number(body.maxDelay || 15), Number(body.minDelay || 8), 8),
        pause_after: Math.max(Number(body.pauseAfter || 0), 0),
        pause_duration: Math.max(Number(body.pauseDuration || 30), 0),
        rotate_after: Math.max(Number(body.rotateAfter || 0), 0),
        started_at: nowIso(),
      } as any).select().single();
      if (error || !campaign) throw error || new Error("Erro ao criar campanha.");

      const rows = contacts.map((phone) => ({ campaign_id: campaign.id, phone, status: "pending" }));
      for (let i = 0; i < rows.length; i += 500) {
        await sb.from("mass_inject_contacts").insert(rows.slice(i, i + 500) as any);
      }

      await queueCampaignRun(campaign.id, 0);
      return new Response(JSON.stringify({
        success: true,
        campaignId: campaign.id,
        readyCount: contacts.length,
        alreadyExistsCount: 0,
        deferredParticipantCheck: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (["resume-campaign", "pause-campaign", "cancel-campaign"].includes(action)) {
      const { data: campaign } = await sb.from("mass_inject_campaigns").select("id, user_id, status").eq("id", body.campaignId).single();
      if (!campaign || (!isAdmin && campaign.user_id !== user!.id)) return new Response(JSON.stringify({ error: "Campanha não encontrada" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      if (action === "pause-campaign") {
        await sb.from("mass_inject_campaigns").update({ status: "paused", updated_at: nowIso(), completed_at: null }).eq("id", campaign.id);
        await emitCampaignEvent(sb, campaign.id, "campaign_paused", "warning");
        await sb.from("mass_inject_contacts").update({ status: "pending", error_message: null } as any).eq("campaign_id", campaign.id).eq("status", "processing");
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "cancel-campaign") {
        await sb.from("mass_inject_contacts").update({ status: "cancelled", error_message: "Cancelado pelo usuário.", processed_at: nowIso() } as any).eq("campaign_id", campaign.id).in("status", [...RETRYABLE_QUEUE_STATUSES, "processing"]);
        await sb.from("mass_inject_campaigns").update({ status: "cancelled", updated_at: nowIso(), completed_at: nowIso() }).eq("id", campaign.id);
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // resume
      await sb.from("mass_inject_contacts").update({ status: "pending", error_message: null } as any).eq("campaign_id", campaign.id).eq("status", "processing");
      await sb.from("mass_inject_campaigns").update({ status: "queued", updated_at: nowIso(), completed_at: null }).eq("id", campaign.id);
      await emitCampaignEvent(sb, campaign.id, "campaign_resumed", "info");
      await queueCampaignRun(campaign.id, 0);
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
