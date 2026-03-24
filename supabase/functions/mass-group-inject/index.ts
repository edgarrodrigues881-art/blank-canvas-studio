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
}

const SUCCESS_STATUSES = new Set(["completed", "already_exists"]);
const FAILURE_STATUSES = new Set([
  "rate_limited",
  "api_temporary",
  "connection_unconfirmed",
  "confirmed_disconnect",
  "permission_unconfirmed",
  "confirmed_no_admin",
  "invalid_group",
  "contact_not_found",
  "unauthorized",
  "blocked",
  "unknown_failure",
]);

const FINAL_CAMPAIGN_STATUSES = new Set(["done", "completed_with_failures", "paused", "cancelled", "failed"]);

const nowIso = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const randomBetween = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

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

  const add = (value: string) => {
    const clean = value.replace(/\D/g, "");
    if (clean.length >= 10) set.add(clean);
  };

  add(digits);
  add(local);
  add(local.startsWith("55") ? local.slice(2) : local);
  add(local.length >= 10 && !local.startsWith("55") ? `55${local}` : local);

  if (local.length === 11 && local[2] === "9") {
    add(local.slice(0, 2) + local.slice(3));
    add(`55${local.slice(0, 2) + local.slice(3)}`);
  }

  if (local.length === 10) {
    add(local.slice(0, 2) + "9" + local.slice(2));
    add(`55${local.slice(0, 2) + "9" + local.slice(2)}`);
  }

  return Array.from(set);
}

function participantSetHasPhone(participants: Set<string>, phone: string) {
  return buildPhoneFingerprints(phone).some((fingerprint) => participants.has(fingerprint));
}

function buildHeaders(token: string, includeJson = false) {
  return includeJson
    ? { token, Accept: "application/json", "Content-Type": "application/json", "Cache-Control": "no-cache", Pragma: "no-cache" }
    : { token, Accept: "application/json", "Cache-Control": "no-cache", Pragma: "no-cache" };
}

async function readApiResponse(res: Response) {
  const raw = await res.text();
  let body: any = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = { raw };
  }
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

  return candidates.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() || "";
}

function collectParticipantsFromValue(value: any, participants: Set<string>) {
  if (!value) return;

  if (Array.isArray(value)) {
    value.forEach((entry) => collectParticipantsFromValue(entry, participants));
    return;
  }

  if (typeof value === "string") {
    for (const fingerprint of buildPhoneFingerprints(value)) participants.add(fingerprint);
    return;
  }

  if (typeof value === "object") {
    for (const key of ["id", "jid", "number", "phone", "participant", "user", "pn"]) {
      if (typeof value[key] === "string") {
        for (const fingerprint of buildPhoneFingerprints(value[key])) participants.add(fingerprint);
      }
    }

    for (const nestedKey of ["participants", "Participants", "members", "data", "group", "memberAddMode"]) {
      if (value[nestedKey]) collectParticipantsFromValue(value[nestedKey], participants);
    }
  }
}

async function getGroupParticipants(baseUrl: string, token: string, groupId: string): Promise<Set<string>> {
  const participants = new Set<string>();
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
      if (!res.ok) continue;
      collectParticipantsFromValue(body, participants);
      collectParticipantsFromValue(raw, participants);
      if (participants.size > 0) return participants;
    } catch (error) {
      console.error("getGroupParticipants error:", error);
    }
  }

  return participants;
}

function classifyAddFailure(rawMessage: string, httpStatus: number): FailureClassification {
  const message = (rawMessage || "").toLowerCase();

  if (message.includes("rate-overlimit") || message.includes("429") || message.includes("too many requests")) {
    return {
      status: "rate_limited",
      detail: "Limite de requisições atingido na Uazapi. O contato foi isolado e a fila seguirá após um respiro maior.",
      retryable: true,
      cooldownMs: randomBetween(18_000, 30_000),
    };
  }

  if (message.includes("websocket disconnected before info query") || message.includes("connection reset") || message.includes("socket hang up")) {
    return {
      status: "api_temporary",
      detail: "A integração interrompeu a consulta do contato antes de concluir a operação.",
      retryable: true,
      cooldownMs: randomBetween(7_000, 12_000),
    };
  }

  if (httpStatus === 503 || message.includes("whatsapp disconnected") || message.includes("session disconnected") || message.includes("socket closed")) {
    return {
      status: "connection_unconfirmed",
      detail: "A integração sinalizou possível desconexão. O status real será revalidado antes de concluir.",
      retryable: true,
      cooldownMs: randomBetween(8_000, 14_000),
    };
  }

  if (message.includes("not admin") || message.includes("not an admin") || message.includes("admin required")) {
    return {
      status: "permission_unconfirmed",
      detail: "A integração sinalizou possível falta de privilégio de admin. A permissão será revalidada.",
      retryable: true,
      cooldownMs: randomBetween(5_000, 9_000),
    };
  }

  if (message.includes("info query returned status 404") || ((message.includes("number") || message.includes("participant") || message.includes("contact")) && (message.includes("not found") || message.includes("does not exist")))) {
    return {
      status: "contact_not_found",
      detail: "O número não foi encontrado no WhatsApp.",
      retryable: false,
    };
  }

  if ((message.includes("group") && (message.includes("not found") || message.includes("invalid") || message.includes("does not exist"))) || message.includes("@g.us inválido")) {
    return {
      status: "invalid_group",
      detail: "O grupo informado é inválido ou não está acessível para esta instância.",
      retryable: false,
      pauseCampaign: true,
      confirmed: true,
    };
  }

  if (httpStatus === 401 || message.includes("unauthorized") || message.includes("invalid token") || message.includes("token invalid")) {
    return {
      status: "unauthorized",
      detail: "A autenticação da instância falhou. Reconecte ou revise o token antes de continuar.",
      retryable: false,
      pauseCampaign: true,
      confirmed: true,
    };
  }

  if (message.includes("blocked") || message.includes("ban")) {
    return {
      status: "blocked",
      detail: "O contato não pôde ser adicionado por restrição do WhatsApp.",
      retryable: false,
    };
  }

  if (message.includes("full") || message.includes("limit reached")) {
    return {
      status: "invalid_group",
      detail: "O grupo atingiu o limite de participantes permitido.",
      retryable: false,
      pauseCampaign: true,
      confirmed: true,
    };
  }

  if (message.includes("timeout") || message.includes("timed out") || httpStatus === 408 || httpStatus === 504) {
    return {
      status: "api_temporary",
      detail: "A Uazapi não respondeu a tempo nesta tentativa.",
      retryable: true,
      cooldownMs: randomBetween(7_000, 12_000),
    };
  }

  if (httpStatus >= 500) {
    return {
      status: "api_temporary",
      detail: `A Uazapi respondeu com erro de servidor (${httpStatus}).`,
      retryable: true,
      cooldownMs: randomBetween(8_000, 15_000),
    };
  }

  return {
    status: "unknown_failure",
    detail: `Falha não confirmada: ${rawMessage.substring(0, 140) || `HTTP ${httpStatus}`}`,
    retryable: true,
    cooldownMs: randomBetween(6_000, 10_000),
  };
}

async function getDeviceCredentials(sb: any, deviceId: string, userId: string | null, bypassUserFilter: boolean) {
  const query = sb.from("devices").select("id, name, uazapi_base_url, uazapi_token, user_id").eq("id", deviceId);
  if (!bypassUserFilter && userId) query.eq("user_id", userId);
  const { data: device } = await query.single();
  if (!device?.uazapi_base_url || !device?.uazapi_token) return null;
  return {
    ...device,
    uazapi_base_url: String(device.uazapi_base_url).replace(/\/+$/, ""),
  };
}

async function checkInstanceConnection(baseUrl: string, token: string): Promise<ConnectionCheckResult> {
  try {
    const res = await fetch(`${baseUrl}/instance/status?t=${Date.now()}`, {
      method: "GET",
      headers: buildHeaders(token),
    });

    const { raw, body } = await readApiResponse(res);
    if (res.status === 401) {
      return { connected: null, status: "token_invalid", detail: "Falha de autenticação ao validar a instância." };
    }

    if (!res.ok) {
      return { connected: null, status: `http_${res.status}`, detail: extractProviderMessage(body, raw) || "Sem confirmação do status da instância." };
    }

    const inst = body?.instance || body?.data || body || {};
    const status = String(inst.status || body?.status || "unknown").toLowerCase();
    const providerMessage = extractProviderMessage(body, raw).toLowerCase();
    const disconnected = ["disconnected", "closed", "close", "offline", "qr", "pairing", "not_connected"].some((value) => status.includes(value) || providerMessage.includes(value));
    const connected = !disconnected && ["connected", "ready", "active", "open", "online", "authenticated"].some((value) => status.includes(value) || providerMessage.includes(value));

    if (disconnected) return { connected: false, status, detail: "A instância foi revalidada como desconectada." };
    if (connected) return { connected: true, status, detail: "A conexão da instância foi confirmada." };

    return { connected: null, status, detail: "A instância respondeu, mas o status não pôde ser confirmado com segurança." };
  } catch (error: any) {
    return { connected: null, status: "request_failed", detail: `Não foi possível validar a conexão: ${error.message}` };
  }
}

async function checkGroupAccess(baseUrl: string, token: string, groupId: string): Promise<GroupCheckResult> {
  const endpoints = [
    { method: "POST", url: `${baseUrl}/group/info`, body: { groupJid: groupId } },
    { method: "GET", url: `${baseUrl}/group/info?groupJid=${encodeURIComponent(groupId)}` },
    { method: "POST", url: `${baseUrl}/chat/info`, body: { chatId: groupId } },
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint.url, {
        method: endpoint.method,
        headers: endpoint.body ? buildHeaders(token, true) : buildHeaders(token),
        ...(endpoint.body ? { body: JSON.stringify(endpoint.body) } : {}),
      });

      const { raw, body } = await readApiResponse(res);
      const message = extractProviderMessage(body, raw).toLowerCase();
      const group = body?.group || body?.data || body || {};
      const jid = group?.JID || group?.jid || group?.id || group?.groupJid || group?.chatId || "";

      if (res.ok && (jid || raw.toLowerCase().includes(groupId.toLowerCase()))) {
        return { accessible: true, invalid: false, detail: "Acesso ao grupo confirmado." };
      }

      if (message.includes("not found") || message.includes("invalid") || message.includes("does not exist") || message.includes("not a participant")) {
        return { accessible: false, invalid: true, detail: "O grupo não foi encontrado ou esta instância não tem acesso a ele." };
      }
    } catch (error) {
      console.error("checkGroupAccess error:", error);
    }
  }

  return { accessible: null, invalid: false, detail: "Não foi possível confirmar o acesso ao grupo nesta validação." };
}

async function addToGroup(baseUrl: string, token: string, groupId: string, phone: string): Promise<AddAttemptResult> {
  const headers = buildHeaders(token, true);
  const plainPhone = phone.replace(/@.*/, "");

  const strategies = [
    { method: "POST", url: `${baseUrl}/group/updateParticipants`, body: { groupJid: groupId, action: "add", participants: [plainPhone] } },
    { method: "PUT", url: `${baseUrl}/group/updateParticipant?groupJid=${encodeURIComponent(groupId)}`, body: { action: "add", participants: [plainPhone] } },
    { method: "POST", url: `${baseUrl}/group/updateParticipants`, body: { groupJid: groupId, action: "add", participants: [`${plainPhone}@s.whatsapp.net`] } },
    { method: "PUT", url: `${baseUrl}/group/updateParticipant?groupJid=${encodeURIComponent(groupId)}`, body: { action: "add", participants: [`${plainPhone}@s.whatsapp.net`] } },
    { method: "POST", url: `${baseUrl}/group/addParticipant`, body: { groupJid: groupId, participant: plainPhone } },
  ];

  let lastError = "";
  let lastStatus = 405;

  for (const strategy of strategies) {
    try {
      console.log(`addToGroup trying: ${strategy.method} ${strategy.url}`);
      const res = await fetch(strategy.url, {
        method: strategy.method,
        headers,
        body: JSON.stringify(strategy.body),
      });

      if (res.status === 405) continue;
      const { raw, body } = await readApiResponse(res);
      const providerMessage = extractProviderMessage(body, raw);
      const rawLower = `${raw} ${providerMessage}`.toLowerCase();
      lastStatus = res.status;

      if (res.status === 200 || res.status === 201) {
        if (rawLower.includes("failed") || rawLower.includes("bad-request")) {
          lastError = providerMessage || raw.substring(0, 240);
          continue;
        }
        return { ok: true, status: res.status, body, rawMessage: providerMessage || raw };
      }

      if (rawLower.includes("already") || rawLower.includes("já") || rawLower.includes("memberaddmode") || res.status === 409) {
        return { ok: false, status: 409, body, rawMessage: providerMessage || raw, errorCode: "already_exists" };
      }

      if (rawLower.includes("rate-overlimit") || rawLower.includes("429") || rawLower.includes("whatsapp disconnected") || rawLower.includes("not admin") || rawLower.includes("info query returned status 404") || rawLower.includes("unauthorized")) {
        return { ok: false, status: res.status, body, rawMessage: providerMessage || raw };
      }

      lastError = providerMessage || raw.substring(0, 240);
    } catch (error: any) {
      console.error("addToGroup strategy error:", error);
      lastError = error.message;
    }
  }

  return { ok: false, status: lastStatus, rawMessage: lastError || "Nenhum endpoint de adição retornou sucesso." };
}

async function confirmAlreadyInGroup(baseUrl: string, token: string, groupId: string, phone: string) {
  const participants = await getGroupParticipants(baseUrl, token, groupId);
  return participantSetHasPhone(participants, phone);
}

async function executeAddWithRecovery(baseUrl: string, token: string, groupId: string, phone: string): Promise<ExecuteResult> {
  const maxAttempts = 3;
  let adminSignals = 0;
  let lastFailure: FailureClassification | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const addResult = await addToGroup(baseUrl, token, groupId, phone);

    if (addResult.ok) {
      return { status: "completed", detail: attempt === 1 ? "Contato adicionado com sucesso." : `Contato adicionado após ${attempt} tentativa(s).`, attempts: attempt };
    }

    if (addResult.errorCode === "already_exists" || addResult.status === 409) {
      return { status: "already_exists", detail: "Contato já participava do grupo.", attempts: attempt };
    }

    const providerMessage = addResult.rawMessage || "Falha sem detalhe retornado pela integração.";
    const providerMessageLower = providerMessage.toLowerCase();
    let failure = classifyAddFailure(providerMessage, addResult.status);
    let connectionCheck: ConnectionCheckResult | null = null;
    let groupCheck: GroupCheckResult | null = null;

    if (["rate_limited", "api_temporary", "connection_unconfirmed", "permission_unconfirmed", "unknown_failure"].includes(failure.status)) {
      try {
        if (await confirmAlreadyInGroup(baseUrl, token, groupId, phone)) {
          return { status: "already_exists", detail: "O contato passou a constar no grupo após a revalidação e foi contado como sucesso.", attempts: attempt };
        }
      } catch (error) {
        console.error("confirmAlreadyInGroup error:", error);
      }
    }

    if (failure.status === "connection_unconfirmed" || providerMessageLower.includes("disconnected")) {
      connectionCheck = await checkInstanceConnection(baseUrl, token);
      if (connectionCheck.connected === true) {
        failure = { status: "api_temporary", detail: "A integração acusou desconexão, mas a instância continua conectada. A falha foi tratada como temporária.", retryable: true, cooldownMs: randomBetween(8_000, 14_000) };
      } else if (connectionCheck.connected === false) {
        failure = { status: "confirmed_disconnect", detail: "A instância foi revalidada e está realmente desconectada.", retryable: false, pauseCampaign: true, confirmed: true };
      }
    }

    if (failure.status === "permission_unconfirmed" || failure.status === "invalid_group") {
      groupCheck = await checkGroupAccess(baseUrl, token, groupId);
      if (groupCheck.invalid) {
        failure = { status: "invalid_group", detail: groupCheck.detail, retryable: false, pauseCampaign: true, confirmed: true };
      } else if (failure.status === "permission_unconfirmed") {
        if (providerMessageLower.includes("not admin") || providerMessageLower.includes("not an admin")) adminSignals += 1;
        if (adminSignals >= 2 && groupCheck.accessible === true) {
          failure = { status: "confirmed_no_admin", detail: "A integração confirmou em múltiplas tentativas que a instância não tem privilégio de admin neste grupo.", retryable: false, pauseCampaign: true, confirmed: true };
        } else {
          failure = { status: "permission_unconfirmed", detail: "Não foi possível confirmar a falta de privilégio de admin com segurança.", retryable: attempt < maxAttempts, cooldownMs: randomBetween(7_000, 12_000) };
        }
      } else if (failure.status === "invalid_group" && groupCheck.accessible === true) {
        failure = { status: "api_temporary", detail: "O grupo respondeu à revalidação; a falha foi tratada como instabilidade temporária da integração.", retryable: true, cooldownMs: randomBetween(8_000, 12_000) };
      }
    }

    lastFailure = failure;

    console.log(JSON.stringify({
      type: "mass-group-inject.attempt_failed",
      phone,
      attempt,
      providerMessage,
      classifiedAs: failure.status,
      retryable: failure.retryable,
      connectionStatus: connectionCheck?.status || null,
      groupAccessible: groupCheck?.accessible ?? null,
      groupInvalid: groupCheck?.invalid ?? false,
    }));

    if (failure.retryable && attempt < maxAttempts) {
      await sleep(failure.cooldownMs || randomBetween(5_000, 9_000));
      continue;
    }

    return {
      status: failure.status,
      detail: failure.detail,
      attempts: attempt,
      pauseCampaign: failure.pauseCampaign,
      cooldownMs: failure.cooldownMs,
    };
  }

  return {
    status: lastFailure?.status || "unknown_failure",
    detail: lastFailure?.detail || "Falha não confirmada ao adicionar contato.",
    attempts: maxAttempts,
    pauseCampaign: lastFailure?.pauseCampaign,
    cooldownMs: lastFailure?.cooldownMs,
  };
}

function parseDeviceIds(value: any): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return [];
    }
  }
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
  const { data: remaining } = await sb
    .from("mass_inject_contacts")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "processing"]);

  const remainingCount = Number((remaining as any)?.length || 0);
  if (remainingCount > 0) return false;

  const { data: campaign } = await sb
    .from("mass_inject_campaigns")
    .select("id, status, fail_count")
    .eq("id", campaignId)
    .single();

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
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: anonKey,
      "x-internal-run": "true",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "run-campaign", campaignId }),
  }).catch((error) => console.error("queueCampaignRun error:", error));
}

function computeNextDelayMs(campaign: any, cooldownMs?: number) {
  const minDelay = Math.max(Number(campaign.min_delay || 3), 1);
  const maxDelay = Math.max(Number(campaign.max_delay || 8), minDelay);
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
  if (campaign.status === "queued") {
    await sb.from("mass_inject_campaigns").update({ status: "processing", updated_at: nowIso() }).eq("id", campaignId);
  }

  const { data: contacts } = await sb
    .from("mass_inject_contacts")
    .select("id, phone, status, created_at")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(2);

  if (!contacts || contacts.length === 0) {
    await finalizeCampaignIfNeeded(sb, campaignId);
    return;
  }

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

  let participants = await getGroupParticipants(device.uazapi_base_url, device.uazapi_token, campaign.group_id);
  let nextDelayMs = 0;

  for (const contact of contacts) {
    const { data: latestCampaign } = await sb.from("mass_inject_campaigns").select("*").eq("id", campaignId).single();
    if (!latestCampaign || latestCampaign.status !== "processing") return;

    await sb.from("mass_inject_contacts").update({ status: "processing", error_message: "Verificando se o número já está no grupo...", device_used: device.name || device.id }).eq("id", contact.id);

    let result: ExecuteResult;
    if (participantSetHasPhone(participants, contact.phone)) {
      result = { status: "already_exists", detail: "Contato já participava do grupo.", attempts: 0 };
    } else {
      await sb.from("mass_inject_contacts").update({ error_message: "Enviando solicitação para a Uazapi com revalidação automática..." }).eq("id", contact.id);
      result = await executeAddWithRecovery(device.uazapi_base_url, device.uazapi_token, latestCampaign.group_id, contact.phone);
      if (SUCCESS_STATUSES.has(result.status)) {
        for (const fingerprint of buildPhoneFingerprints(contact.phone)) participants.add(fingerprint);
      }
    }

    const finalError = SUCCESS_STATUSES.has(result.status) ? null : result.detail;
    await sb.from("mass_inject_contacts").update({
      status: result.status,
      error_message: finalError,
      device_used: device.name || device.id,
      processed_at: nowIso(),
    }).eq("id", contact.id);

    await updateCampaignCounters(sb, latestCampaign, result.status, !!result.pauseCampaign);
    if (result.pauseCampaign) return;

    const { data: afterUpdateCampaign } = await sb.from("mass_inject_campaigns").select("*").eq("id", campaignId).single();
    if (!afterUpdateCampaign || afterUpdateCampaign.status !== "processing") return;

    nextDelayMs = computeNextDelayMs(afterUpdateCampaign, result.status === "rate_limited" ? result.cooldownMs : undefined);
    if (result.status === "rate_limited") break;
    if (contact.id !== contacts[contacts.length - 1].id) await sleep(nextDelayMs);
  }

  const { data: remainingPending } = await sb
    .from("mass_inject_contacts")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .limit(1);

  if (remainingPending && remainingPending.length > 0) {
    await queueCampaignRun(campaignId, nextDelayMs || 1000);
    return;
  }

  await finalizeCampaignIfNeeded(sb, campaignId);
}

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
      if (!device) {
        return new Response(JSON.stringify({ error: "Instância não encontrada ou sem credenciais configuradas.", groups: [], diagnostics: "device_not_found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

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
            if (!res.ok) {
              diagnostics += `group/list page ${page}: HTTP ${res.status}; `;
              break;
            }
            const data = await res.json();
            const groups = Array.isArray(data) ? data : data?.groups || data?.data || [];
            if (!Array.isArray(groups) || groups.length === 0) break;
            addGroups(groups);
            if (groups.length < 500) break;
          } catch (error: any) {
            diagnostics += `group/list page ${page} error: ${error.message}; `;
            break;
          }
        }

        if (allGroups.length === 0) {
          for (const endpoint of ["/group/listAll", "/group/fetchAllGroups", "/chat/list?type=group&count=500"]) {
            try {
              const res = await fetch(`${device.uazapi_base_url}${endpoint}`, {
                method: endpoint === "/group/fetchAllGroups" ? "POST" : "GET",
                headers: endpoint === "/group/fetchAllGroups" ? buildHeaders(device.uazapi_token, true) : buildHeaders(device.uazapi_token),
                ...(endpoint === "/group/fetchAllGroups" ? { body: JSON.stringify({}) } : {}),
              });
              if (!res.ok) {
                diagnostics += `${endpoint}: HTTP ${res.status}; `;
                continue;
              }
              const data = await res.json();
              const groups = Array.isArray(data) ? data : data?.groups || data?.data || data?.chats || [];
              addGroups(Array.isArray(groups) ? groups : []);
              if (allGroups.length > 0) break;
            } catch (error: any) {
              diagnostics += `${endpoint} error: ${error.message}; `;
            }
          }
        }

        const error = allGroups.length > 0 ? undefined : "A instância não retornou grupos neste momento. Verifique conexão, permissão no grupo ou use Link/JID manual.";
        return new Response(JSON.stringify({ groups: allGroups, error, diagnostics, deviceName: device.name }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (error: any) {
        return new Response(JSON.stringify({ error: `Erro ao buscar grupos: ${error.message}`, groups: [], diagnostics: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (action === "resolve-link") {
      const device = await getDeviceCredentials(sb, body.deviceId, user?.id || null, isAdmin);
      if (!device) {
        return new Response(JSON.stringify({ error: "Instância não encontrada ou sem credenciais." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const cleanLink = String(body.link || "").trim().replace(/[,;)\]}>'"]+$/, "").split("?")[0];
      const match = cleanLink.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/);
      const inviteCode = match ? match[1] : cleanLink;
      if (!inviteCode || inviteCode.length < 10) {
        return new Response(JSON.stringify({ error: "Link inválido. Use o formato https://chat.whatsapp.com/CODIGO" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

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
          if (msg.includes("already") || msg.includes("já")) {
            return new Response(JSON.stringify({ error: "A instância já participa desse grupo. Use a aba Meus Grupos para selecioná-lo." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        } catch (error) {
          console.error("resolve-link strategy error:", error);
        }
      }

      return new Response(JSON.stringify({ error: "Não foi possível validar o link do grupo com esta instância." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
      if (!device) {
        return new Response(JSON.stringify({ error: "Instância não encontrada" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const participants = await getGroupParticipants(device.uazapi_base_url, device.uazapi_token, body.groupId);
      const ready: string[] = [];
      const alreadyExists: string[] = [];
      for (const phone of body.contacts || []) {
        if (participantSetHasPhone(participants, phone)) alreadyExists.push(phone);
        else ready.push(phone);
      }
      return new Response(JSON.stringify({ ready, alreadyExists, readyCount: ready.length, alreadyExistsCount: alreadyExists.length, totalParticipants: participants.size }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "create-campaign") {
      const contacts = Array.isArray(body.contacts) ? body.contacts.map(String) : [];
      const alreadyExists = Array.isArray(body.alreadyExists) ? body.alreadyExists.map(String) : [];
      const allContacts = [...contacts, ...alreadyExists];
      const { data: campaign, error } = await sb.from("mass_inject_campaigns").insert({
        user_id: user!.id,
        name: body.name || `Campanha ${new Date().toLocaleString("pt-BR")}`,
        group_id: body.groupId,
        group_name: body.groupName || body.groupId,
        device_ids: body.deviceIds || [],
        status: "queued",
        total_contacts: allContacts.length,
        success_count: 0,
        already_count: alreadyExists.length,
        fail_count: 0,
        min_delay: Math.max(Number(body.minDelay || 3), 1),
        max_delay: Math.max(Number(body.maxDelay || 8), Number(body.minDelay || 3), 1),
        pause_after: Math.max(Number(body.pauseAfter || 0), 0),
        pause_duration: Math.max(Number(body.pauseDuration || 30), 0),
        rotate_after: Math.max(Number(body.rotateAfter || 0), 0),
        started_at: nowIso(),
      } as any).select().single();
      if (error || !campaign) throw error || new Error("Não foi possível criar a campanha.");

      const rows = allContacts.map((phone) => ({ campaign_id: campaign.id, phone, status: alreadyExists.includes(phone) ? "already_exists" : "pending" }));
      for (let index = 0; index < rows.length; index += 500) {
        await sb.from("mass_inject_contacts").insert(rows.slice(index, index + 500) as any);
      }

      await queueCampaignRun(campaign.id, 0);
      return new Response(JSON.stringify({ success: true, campaignId: campaign.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (["resume-campaign", "pause-campaign", "cancel-campaign"].includes(action)) {
      const { data: campaign } = await sb.from("mass_inject_campaigns").select("id, user_id, status").eq("id", body.campaignId).single();
      if (!campaign || (!isAdmin && campaign.user_id !== user!.id)) {
        return new Response(JSON.stringify({ error: "Campanha não encontrada" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "pause-campaign") {
        await sb.from("mass_inject_campaigns").update({ status: "paused", updated_at: nowIso(), completed_at: null }).eq("id", campaign.id);
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "cancel-campaign") {
        await sb.from("mass_inject_contacts").update({ status: "cancelled", error_message: "Processamento cancelado pelo usuário.", processed_at: nowIso() } as any).eq("campaign_id", campaign.id).eq("status", "pending");
        await sb.from("mass_inject_campaigns").update({ status: "cancelled", updated_at: nowIso(), completed_at: nowIso() }).eq("id", campaign.id);
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await sb.from("mass_inject_contacts").update({ status: "pending", error_message: null } as any).eq("campaign_id", campaign.id).eq("status", "processing");
      await sb.from("mass_inject_campaigns").update({ status: "processing", updated_at: nowIso(), completed_at: null }).eq("id", campaign.id);
      await queueCampaignRun(campaign.id, 0);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "add-single") {
      const device = await getDeviceCredentials(sb, body.deviceId, user?.id || null, isAdmin);
      if (!device) {
        return new Response(JSON.stringify({ status: "unauthorized", error: "Instância não encontrada ou sem credenciais.", detail: "Instância sem credenciais válidas." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
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
