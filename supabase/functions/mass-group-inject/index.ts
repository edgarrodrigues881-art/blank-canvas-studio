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
  | "unknown_failure";

interface AddAttemptResult {
  ok: boolean;
  status: number;
  body?: any;
  rawMessage: string;
  errorCode?: string;
  strategyIndex?: number; // which strategy worked
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
  "unauthorized", "blocked", "unknown_failure",
]);

const FINAL_CAMPAIGN_STATUSES = new Set(["done", "completed_with_failures", "paused", "cancelled", "failed"]);
const RETRYABLE_QUEUE_STATUSES = ["pending", "rate_limited", "api_temporary", "connection_unconfirmed", "permission_unconfirmed", "unknown_failure"] as const;
const MAX_QUEUE_RETRIES = 3;

// ── Endpoint cache: avoid trying all 5 strategies every time ──
// Maps campaignId+groupId to the strategy index that worked
const endpointCache = new Map<string, number>();

const nowIso = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
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

function buildHeaders(token: string, includeJson = false) {
  return includeJson
    ? { token, Accept: "application/json", "Content-Type": "application/json", "Cache-Control": "no-cache", Pragma: "no-cache" }
    : { token, Accept: "application/json", "Cache-Control": "no-cache", Pragma: "no-cache" };
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
      const res = await fetch(strategy.url, {
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
    const res = await fetch(`${baseUrl}/instance/status?t=${Date.now()}`, { method: "GET", headers: buildHeaders(token) });
    const { raw, body } = await readApiResponse(res);
    if (res.status === 401) return { connected: null, status: "token_invalid", detail: "Falha de autenticação." };
    if (!res.ok) return { connected: null, status: `http_${res.status}`, detail: extractProviderMessage(body, raw) || "Sem confirmação." };
    const inst = body?.instance || body?.data || body || {};
    const status = String(inst.status || body?.status || "unknown").toLowerCase();
    const pm = extractProviderMessage(body, raw).toLowerCase();
    const disconnected = ["disconnected", "closed", "close", "offline", "qr", "pairing", "not_connected"].some((v) => status.includes(v) || pm.includes(v));
    const connected = !disconnected && ["connected", "ready", "active", "open", "online", "authenticated"].some((v) => status.includes(v) || pm.includes(v));
    if (disconnected) return { connected: false, status, detail: "Instância revalidada como desconectada." };
    if (connected) return { connected: true, status, detail: "Conexão confirmada." };
    return { connected: null, status, detail: "Status não pôde ser confirmado." };
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
      const res = await fetch(ep.url, {
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

  // If we have a cached strategy, try ONLY that one first
  if (cachedStrategyIndex !== undefined && cachedStrategyIndex >= 0 && cachedStrategyIndex < strategies.length) {
    const strategy = strategies[cachedStrategyIndex];
    try {
      console.log(`addToGroup using cached strategy[${cachedStrategyIndex}]: ${strategy.method} ${strategy.url}`);
      const res = await fetch(strategy.url, { method: strategy.method, headers, body: JSON.stringify(strategy.body) });
      if (res.status !== 405) {
        const { raw, body } = await readApiResponse(res);
        const pm = extractProviderMessage(body, raw);
        const rawLower = `${raw} ${pm}`.toLowerCase();

        if (res.status === 200 || res.status === 201) {
          if (!rawLower.includes("failed") && !rawLower.includes("bad-request")) {
            return { ok: true, status: res.status, body, rawMessage: pm || raw, strategyIndex: cachedStrategyIndex };
          }
        }
        if (rawLower.includes("already") || rawLower.includes("já") || rawLower.includes("memberaddmode") || res.status === 409) {
          return { ok: false, status: 409, body, rawMessage: pm || raw, errorCode: "already_exists", strategyIndex: cachedStrategyIndex };
        }
        // Return the error from cached strategy - don't try others unless it's 405
        return { ok: false, status: res.status, body, rawMessage: pm || raw, strategyIndex: cachedStrategyIndex };
      }
      // 405 = method not allowed, fall through to discovery
    } catch (error: any) {
      return { ok: false, status: 0, rawMessage: error.message, strategyIndex: cachedStrategyIndex };
    }
  }

  // Discovery mode: try each strategy but stop at first non-405 response
  let lastError = "";
  let lastStatus = 405;

  for (let i = 0; i < strategies.length; i++) {
    const strategy = strategies[i];
    try {
      console.log(`addToGroup discovery[${i}]: ${strategy.method} ${strategy.url}`);
      const res = await fetch(strategy.url, { method: strategy.method, headers, body: JSON.stringify(strategy.body) });
      if (res.status === 405) continue; // Method not allowed, try next

      const { raw, body } = await readApiResponse(res);
      const pm = extractProviderMessage(body, raw);
      const rawLower = `${raw} ${pm}`.toLowerCase();
      lastStatus = res.status;

      if (res.status === 200 || res.status === 201) {
        if (rawLower.includes("failed") || rawLower.includes("bad-request")) {
          lastError = pm || raw.substring(0, 240);
          // This endpoint exists but returned an application-level error - DON'T try more endpoints
          // to avoid flooding. Return the error.
          return { ok: false, status: res.status, rawMessage: lastError, strategyIndex: i };
        }
        return { ok: true, status: res.status, body, rawMessage: pm || raw, strategyIndex: i };
      }

      if (rawLower.includes("already") || rawLower.includes("já") || rawLower.includes("memberaddmode") || res.status === 409) {
        return { ok: false, status: 409, body, rawMessage: pm || raw, errorCode: "already_exists", strategyIndex: i };
      }

      // Got a real response (not 405) - this is the right endpoint, return its error
      // DON'T try more endpoints
      return { ok: false, status: res.status, body, rawMessage: pm || raw, strategyIndex: i };
    } catch (error: any) {
      lastError = error.message;
      // Network error - could be any endpoint, try next
    }
  }

  return { ok: false, status: lastStatus, rawMessage: lastError || "Nenhum endpoint de adição retornou sucesso." };
}

async function confirmAlreadyInGroup(baseUrl: string, token: string, groupId: string, phone: string) {
  return participantSetHasPhone(await getGroupParticipants(baseUrl, token, groupId), phone);
}

async function executeAddWithRecovery(baseUrl: string, token: string, groupId: string, phone: string, cacheKey?: string): Promise<ExecuteResult> {
  const maxAttempts = 2; // Reduced from 3 to avoid flooding
  let adminSignals = 0;
  let lastFailure: FailureClassification | null = null;
  const cachedStrategy = cacheKey ? endpointCache.get(cacheKey) : undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const addResult = await addToGroup(baseUrl, token, groupId, phone, cachedStrategy);

    // Cache the working strategy for future contacts
    if (addResult.ok && addResult.strategyIndex !== undefined && cacheKey) {
      endpointCache.set(cacheKey, addResult.strategyIndex);
    }

    if (addResult.ok) {
      return { status: "completed", detail: attempt === 1 ? "Contato adicionado com sucesso." : `Contato adicionado após ${attempt} tentativa(s).`, attempts: attempt, workingStrategy: addResult.strategyIndex };
    }

    if (addResult.errorCode === "already_exists" || addResult.status === 409) {
      // Also cache this strategy - it's the right endpoint
      if (addResult.strategyIndex !== undefined && cacheKey) endpointCache.set(cacheKey, addResult.strategyIndex);
      return { status: "already_exists", detail: "Contato já participava do grupo.", attempts: attempt };
    }

    const providerMessage = addResult.rawMessage || "Falha sem detalhe.";
    let failure = classifyAddFailure(providerMessage, addResult.status);
    let connectionCheck: ConnectionCheckResult | null = null;

    // Only do connection revalidation on last attempt to avoid more API calls
    if (failure.status === "connection_unconfirmed" && attempt === maxAttempts) {
      connectionCheck = await checkInstanceConnection(baseUrl, token);
      if (connectionCheck.connected === true) {
        failure = { status: "api_temporary", detail: "A integração acusou desconexão, mas a instância continua conectada.", retryable: true, cooldownMs: randomBetween(15_000, 25_000) };
      } else if (connectionCheck.connected === false) {
        failure = { status: "confirmed_disconnect", detail: "Instância revalidada e está realmente desconectada.", retryable: false, pauseCampaign: true, confirmed: true };
      }
    }

    if (failure.status === "permission_unconfirmed" && attempt === maxAttempts) {
      const groupCheck = await checkGroupAccess(baseUrl, token, groupId);
      if (groupCheck.invalid) {
        failure = { status: "invalid_group", detail: groupCheck.detail, retryable: false, pauseCampaign: true, confirmed: true };
      }
    }

    lastFailure = failure;

    console.log(JSON.stringify({
      type: "mass-group-inject.attempt_failed", phone, attempt,
      providerMessage: providerMessage.substring(0, 200),
      classifiedAs: failure.status, retryable: failure.retryable,
      connectionStatus: connectionCheck?.status || null,
    }));

    if (failure.retryable && attempt < maxAttempts) {
      // Wait longer between retries to avoid flooding
      await sleep(failure.cooldownMs || randomBetween(10_000, 18_000));
      continue;
    }

    // On last attempt with unknown failure, check if contact was actually added
    if (failure.status === "unknown_failure" && attempt === maxAttempts) {
      try {
        if (await confirmAlreadyInGroup(baseUrl, token, groupId, phone)) {
          return { status: "already_exists", detail: "Contato encontrado no grupo após revalidação.", attempts: attempt };
        }
      } catch { /* ignore */ }
    }

    return { status: failure.status, detail: failure.detail, attempts: attempt, pauseCampaign: failure.pauseCampaign, cooldownMs: failure.cooldownMs };
  }

  return { status: lastFailure?.status || "unknown_failure", detail: lastFailure?.detail || "Falha não confirmada.", attempts: maxAttempts, pauseCampaign: lastFailure?.pauseCampaign, cooldownMs: lastFailure?.cooldownMs };
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

async function updateCampaignCounters(sb: any, campaign: any, status: string, pauseCampaign = false) {
  const patch: Record<string, any> = { updated_at: nowIso() };
  if (status === "completed") patch.success_count = Number(campaign.success_count || 0) + 1;
  else if (status === "already_exists") patch.already_count = Number(campaign.already_count || 0) + 1;
  else if (FAILURE_STATUSES.has(status)) patch.fail_count = Number(campaign.fail_count || 0) + 1;
  if (pauseCampaign) patch.status = "paused";
  await sb.from("mass_inject_campaigns").update(patch).eq("id", campaign.id);
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
  await sb.from("mass_inject_campaigns").update({ status: nextStatus, updated_at: nowIso(), completed_at: nowIso() }).eq("id", campaignId);
  return true;
}

async function queueCampaignRun(campaignId: string, delayMs = 0) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  if (delayMs > 0) await sleep(delayMs);
  await fetch(`${supabaseUrl}/functions/v1/mass-group-inject`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: anonKey, "x-internal-run": "true", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "run-campaign", campaignId }),
  }).catch((error) => console.error("queueCampaignRun error:", error));
}

function computeNextDelayMs(campaign: any, cooldownMs?: number) {
  // CRITICAL: enforce minimum 8s between contacts to avoid flooding Uazapi and causing disconnection
  const minDelay = Math.max(Number(campaign.min_delay || 8), 8);
  const maxDelay = Math.max(Number(campaign.max_delay || 15), minDelay);
  let nextDelay = randomBetween(minDelay, maxDelay) * 1000;
  const processed = Number(campaign.success_count || 0) + Number(campaign.fail_count || 0);
  const pauseAfter = Number(campaign.pause_after || 0);
  const pauseDuration = Math.max(Number(campaign.pause_duration || 0), 0);
  if (pauseAfter > 0 && processed > 0 && processed % pauseAfter === 0) {
    nextDelay = Math.max(nextDelay, pauseDuration * 1000);
  }
  if (cooldownMs) nextDelay = Math.max(nextDelay, cooldownMs);
  return nextDelay;
}

async function runCampaignWorker(sb: any, campaignId: string) {
  const { data: campaign } = await sb.from("mass_inject_campaigns").select("*").eq("id", campaignId).single();
  if (!campaign || FINAL_CAMPAIGN_STATUSES.has(campaign.status)) return;
  if (!["queued", "processing"].includes(campaign.status)) return;

  const deviceId = pickDeviceId(campaign);
  if (!deviceId) {
    await sb.from("mass_inject_campaigns").update({ status: "failed", updated_at: nowIso(), completed_at: nowIso() }).eq("id", campaignId);
    return;
  }

  const device = await getDeviceCredentials(sb, deviceId, campaign.user_id, true);
  if (!device) {
    await sb.from("mass_inject_campaigns").update({ status: "paused", updated_at: nowIso() }).eq("id", campaignId);
    return;
  }

  // CRITICAL FIX: Only do pre-flight connection check on first contact (queued→processing)
  // or after a previous error. NOT on every single contact — that floods the API.
  const processed = Number(campaign.success_count || 0) + Number(campaign.fail_count || 0) + Number(campaign.already_count || 0);
  const shouldCheckConnection = campaign.status === "queued" || processed === 0 || (processed > 0 && processed % 10 === 0);
  
  if (shouldCheckConnection) {
    const connectionCheck = await checkInstanceConnection(device.uazapi_base_url, device.uazapi_token);
    if (connectionCheck.connected === false) {
      console.log(`[worker] Pre-flight: instance "${device.name}" is disconnected. Pausing campaign.`);
      await sb.from("devices").update({ status: "Disconnected", updated_at: nowIso() }).eq("id", device.id);
      await sb.from("mass_inject_campaigns").update({ status: "paused", updated_at: nowIso() }).eq("id", campaignId);
      return;
    }
    // Add a small breathing room after connection check before doing work
    await sleep(2000);
  }

  if (campaign.status === "queued") {
    await sb.from("mass_inject_campaigns").update({ status: "processing", updated_at: nowIso() }).eq("id", campaignId);
  }

  const { data: contacts } = await sb
    .from("mass_inject_contacts")
    .select("id, phone, status, created_at, error_message")
    .eq("campaign_id", campaignId)
    .in("status", [...RETRYABLE_QUEUE_STATUSES])
    .order("created_at", { ascending: true })
    .limit(1);

  if (!contacts || contacts.length === 0) {
    await finalizeCampaignIfNeeded(sb, campaignId);
    return;
  }

  const contact = contacts[0];
  const retryCount = extractRetryCount(contact.error_message);

  await sb.from("mass_inject_contacts").update({
    status: "processing",
    error_message: retryCount > 0 ? `Reprocessando (${retryCount}/${MAX_QUEUE_RETRIES})...` : "Processando...",
    device_used: device.name || device.id,
  }).eq("id", contact.id);

  const cacheKey = `${campaignId}:${campaign.group_id}`;
  const result = await executeAddWithRecovery(device.uazapi_base_url, device.uazapi_token, campaign.group_id, contact.phone, cacheKey);

  if (result.status === "confirmed_disconnect") {
    await sb.from("devices").update({ status: "Disconnected", updated_at: nowIso() }).eq("id", device.id);
  }

  const isTransient = ["rate_limited", "api_temporary", "connection_unconfirmed", "permission_unconfirmed", "unknown_failure"].includes(result.status) && !result.pauseCampaign;

  if (isTransient && retryCount < MAX_QUEUE_RETRIES) {
    const nextDelayMs = computeNextDelayMs(campaign, result.cooldownMs);
    await sb.from("mass_inject_contacts").update({
      status: result.status, error_message: withRetryMeta(stripRetryMeta(result.detail), retryCount + 1),
      device_used: device.name || device.id, processed_at: nowIso(),
    }).eq("id", contact.id);
    await queueCampaignRun(campaignId, nextDelayMs || 8000);
    return;
  }

  const finalError = SUCCESS_STATUSES.has(result.status) ? null : stripRetryMeta(result.detail);
  await sb.from("mass_inject_contacts").update({
    status: result.status, error_message: finalError,
    device_used: device.name || device.id, processed_at: nowIso(),
  }).eq("id", contact.id);

  const { data: latestCampaign } = await sb.from("mass_inject_campaigns").select("*").eq("id", campaignId).single();
  if (!latestCampaign) return;
  await updateCampaignCounters(sb, latestCampaign, result.status, !!result.pauseCampaign);
  if (result.pauseCampaign) return;

  if (latestCampaign.status !== "processing") return;

  const nextDelayMs = computeNextDelayMs(latestCampaign, result.cooldownMs);

  const { data: remaining } = await sb
    .from("mass_inject_contacts")
    .select("id")
    .eq("campaign_id", campaignId)
    .in("status", [...RETRYABLE_QUEUE_STATUSES])
    .limit(1);

  if (remaining && remaining.length > 0) {
    await queueCampaignRun(campaignId, nextDelayMs || 8000);
    return;
  }

  await finalizeCampaignIfNeeded(sb, campaignId);
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
      await runCampaignWorker(sb, body.campaignId);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
      const contacts = Array.isArray(body.contacts) ? Array.from(new Set(body.contacts.map(String))) : [];
      const deviceIds = Array.isArray(body.deviceIds) ? body.deviceIds.map(String).filter(Boolean) : [];
      if (!body.groupId || deviceIds.length === 0) return new Response(JSON.stringify({ error: "Grupo e instância são obrigatórios." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const primaryDevice = await getDeviceCredentials(sb, deviceIds[0], user?.id || null, isAdmin);
      if (!primaryDevice) return new Response(JSON.stringify({ error: "Instância não encontrada." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      // Pre-flight connection check before creating campaign
      const connCheck = await checkInstanceConnection(primaryDevice.uazapi_base_url, primaryDevice.uazapi_token);
      if (connCheck.connected === false) {
        // Update device status immediately
        await sb.from("devices").update({ status: "Disconnected", updated_at: nowIso() }).eq("id", primaryDevice.id);
        return new Response(JSON.stringify({ error: "A instância está desconectada. Reconecte antes de iniciar a campanha." }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const participantResult = await getGroupParticipantsDetailed(primaryDevice.uazapi_base_url, primaryDevice.uazapi_token, body.groupId);
      if (!participantResult.confirmed) return new Response(JSON.stringify({ error: "Não foi possível confirmar participantes do grupo.", diagnostics: participantResult.diagnostics.join("; ") }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const readyContacts: string[] = [];
      const alreadyExists: string[] = [];
      for (const phone of contacts) {
        if (participantSetHasPhone(participantResult.participants, phone)) alreadyExists.push(phone);
        else readyContacts.push(phone);
      }

      const allContacts = [...readyContacts, ...alreadyExists];
      const { data: campaign, error } = await sb.from("mass_inject_campaigns").insert({
        user_id: user!.id,
        name: body.name || `Campanha ${new Date().toLocaleString("pt-BR")}`,
        group_id: body.groupId,
        group_name: body.groupName || body.groupId,
        device_ids: deviceIds,
        status: "queued",
        total_contacts: allContacts.length,
        success_count: 0,
        already_count: alreadyExists.length,
        fail_count: 0,
        min_delay: Math.max(Number(body.minDelay || 8), 8),
        max_delay: Math.max(Number(body.maxDelay || 15), Number(body.minDelay || 8), 8),
        pause_after: Math.max(Number(body.pauseAfter || 0), 0),
        pause_duration: Math.max(Number(body.pauseDuration || 30), 0),
        rotate_after: Math.max(Number(body.rotateAfter || 0), 0),
        started_at: nowIso(),
      } as any).select().single();
      if (error || !campaign) throw error || new Error("Erro ao criar campanha.");

      const rows = allContacts.map((phone) => ({ campaign_id: campaign.id, phone, status: alreadyExists.includes(phone) ? "already_exists" : "pending" }));
      for (let i = 0; i < rows.length; i += 500) {
        await sb.from("mass_inject_contacts").insert(rows.slice(i, i + 500) as any);
      }

      // CRITICAL: wait 5s before first worker run to let Uazapi session stabilize
      // after the participant check calls made above
      await queueCampaignRun(campaign.id, 5000);
      return new Response(JSON.stringify({ success: true, campaignId: campaign.id, readyCount: readyContacts.length, alreadyExistsCount: alreadyExists.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (["resume-campaign", "pause-campaign", "cancel-campaign"].includes(action)) {
      const { data: campaign } = await sb.from("mass_inject_campaigns").select("id, user_id, status").eq("id", body.campaignId).single();
      if (!campaign || (!isAdmin && campaign.user_id !== user!.id)) return new Response(JSON.stringify({ error: "Campanha não encontrada" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      if (action === "pause-campaign") {
        await sb.from("mass_inject_campaigns").update({ status: "paused", updated_at: nowIso(), completed_at: null }).eq("id", campaign.id);
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
      await queueCampaignRun(campaign.id, 0);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "add-single") {
      const device = await getDeviceCredentials(sb, body.deviceId, user?.id || null, isAdmin);
      if (!device) return new Response(JSON.stringify({ status: "unauthorized", error: "Instância não encontrada.", detail: "Sem credenciais." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const participants = await getGroupParticipants(device.uazapi_base_url, device.uazapi_token, body.groupId);
      const result = participantSetHasPhone(participants, body.phone)
        ? { status: "already_exists", detail: "Contato já participava do grupo.", attempts: 0 }
        : await executeAddWithRecovery(device.uazapi_base_url, device.uazapi_token, body.groupId, body.phone);
      return new Response(JSON.stringify({ status: result.status, detail: result.detail, error: SUCCESS_STATUSES.has(result.status) ? null : result.detail, pauseCampaign: !!result.pauseCampaign, attempts: result.attempts }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Ação desconhecida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("mass-group-inject error:", error);
    return new Response(JSON.stringify({ error: `Erro interno: ${error.message}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
