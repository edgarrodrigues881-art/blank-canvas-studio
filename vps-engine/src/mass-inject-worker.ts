// ══════════════════════════════════════════════════════════
// VPS Engine — Mass Group Inject Worker
// Continuous loop processor — replaces Edge Function self-invocation
// ══════════════════════════════════════════════════════════

import { getDb } from "./db";
import { createLogger } from "./lib/logger";
import { config } from "./config";

const log = createLogger("mass-inject");

const API_TIMEOUT_MS = 25_000;
const MAX_CONSECUTIVE_FAILURES = 15;
const MAX_RETRIES = 1; // Try once — if it fails, mark as failed and move on
const RETRYABLE_STATUSES = ["pending"];

// ── In-memory caches (persist across contacts within same campaign run) ──
type ParticipantCacheEntry = {
  participants: Set<string>;
  fetchedAt: number;
  confirmed: boolean;
};

const participantCache = new Map<string, ParticipantCacheEntry>();
const endpointCache = new Map<string, number>();
const PARTICIPANT_CACHE_TTL_MS = 5 * 60_000; // 5 min
const PARTICIPANT_FAILURE_CACHE_TTL_MS = 60_000; // 1 min

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

// ── Connection check (single, fast) ──
async function isDeviceConnected(baseUrl: string, token: string): Promise<boolean | null> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/instance/status?t=${Date.now()}`, { headers: buildHeaders(token) }, 8000);
    const body: any = await res.json().catch(() => ({}));
    const statusObj = body?.status;
    if (statusObj && typeof statusObj === "object") {
      if (statusObj.connected === true) return true;
      if (statusObj.connected === false) return false;
    }
    const raw = JSON.stringify(body).toLowerCase();
    if (["connected", "authenticated", "open", "ready"].some(s => raw.includes(s))) return true;
    if (["disconnected", "closed", "close", "offline"].some(s => raw.includes(s))) return false;
    return null;
  } catch {
    return null;
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
}

function buildAddStrategies(baseUrl: string, groupId: string, phone: string) {
  const p = phone.replace(/@.*/, "");
  return [
    { method: "POST" as const, url: `${baseUrl}/group/updateParticipants`, body: { groupJid: groupId, action: "add", participants: [p] } },
    { method: "PUT" as const, url: `${baseUrl}/group/updateParticipant?groupJid=${encodeURIComponent(groupId)}`, body: { action: "add", participants: [p] } },
    { method: "POST" as const, url: `${baseUrl}/group/updateParticipants`, body: { groupJid: groupId, action: "add", participants: [`${p}@s.whatsapp.net`] } },
    { method: "PUT" as const, url: `${baseUrl}/group/updateParticipant?groupJid=${encodeURIComponent(groupId)}`, body: { action: "add", participants: [`${p}@s.whatsapp.net`] } },
    { method: "POST" as const, url: `${baseUrl}/group/addParticipant`, body: { groupJid: groupId, participant: p } },
  ];
}

function hasExplicitFailure(msg: string) {
  const n = msg.toLowerCase();
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
    const rawLower = raw.toLowerCase();
    const msg = body?.error || body?.message || body?.msg || body?.details || body?.data?.error || body?.data?.message || "";
    const msgStr = String(msg).toLowerCase();
    const fullText = `${rawLower} ${msgStr}`;

    // groupUpdated array
    const gu = body?.groupUpdated || body?.data?.groupUpdated;
    if (Array.isArray(gu) && gu.length > 0) {
      const errCode = Number(gu[0]?.Error ?? gu[0]?.error ?? -1);
      if (errCode === 0 || errCode === 200 || errCode === 201) {
        endpointCache.set(cacheKey, idx);
        return { ok: true, alreadyExists: false, detail: "Adicionado com sucesso.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx };
      }
      if (errCode === 409) {
        endpointCache.set(cacheKey, idx);
        return { ok: false, alreadyExists: true, detail: "Já no grupo.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx };
      }
      // 403 = privacy restriction — contact only allows being added by saved contacts
      if (errCode === 403) {
        endpointCache.set(cacheKey, idx);
        return { ok: false, alreadyExists: false, detail: "Privacidade: só aceita convite de contatos salvos.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx };
      }
      // Other known error codes — classify as failure
      if (errCode >= 400) {
        endpointCache.set(cacheKey, idx);
        return classifyFailure(fullText, errCode, idx);
      }
      if ((res.status === 200 || res.status === 201) && !hasExplicitFailure(fullText)) {
        endpointCache.set(cacheKey, idx);
        return { ok: true, alreadyExists: false, detail: "Adicionado com sucesso.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx };
      }
    }

    // Already exists
    if (fullText.includes("already") || fullText.includes("já") || fullText.includes("memberaddmode") || res.status === 409) {
      endpointCache.set(cacheKey, idx);
      return { ok: false, alreadyExists: true, detail: "Já no grupo.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx };
    }

    // Success
    if ((res.status === 200 || res.status === 201) && !hasExplicitFailure(fullText)) {
      endpointCache.set(cacheKey, idx);
      return { ok: true, alreadyExists: false, detail: "Adicionado com sucesso.", retryable: false, pauseCampaign: false, cooldownMs: 0, strategyIndex: idx };
    }

    // Classify failure
    endpointCache.set(cacheKey, idx);
    return classifyFailure(fullText, res.status, idx);
  };

  // Try cached endpoint first
  if (cachedIdx !== undefined && cachedIdx >= 0 && cachedIdx < strategies.length) {
    try {
      const { res, raw, body, idx } = await tryStrategy(cachedIdx);
      return processResult(res, raw, body, idx);
    } catch (e: any) {
      return { ok: false, alreadyExists: false, detail: e.message, retryable: true, pauseCampaign: false, cooldownMs: 15000 };
    }
  }

  // Discovery mode
  for (let i = 0; i < strategies.length; i++) {
    try {
      const { res, raw, body, idx } = await tryStrategy(i);
      if (res.status === 405) continue;
      return processResult(res, raw, body, idx);
    } catch (e: any) {
      return { ok: false, alreadyExists: false, detail: e.message, retryable: true, pauseCampaign: false, cooldownMs: 15000 };
    }
  }

  return { ok: false, alreadyExists: false, detail: "Nenhum endpoint encontrado (405).", retryable: false, pauseCampaign: true, cooldownMs: 0 };
}

function classifyFailure(msg: string, status: number, strategyIndex: number): AddResult {
  const base = { ok: false as const, alreadyExists: false, strategyIndex };
  if (msg.includes("rate-overlimit") || msg.includes("429") || msg.includes("too many") || status === 429)
    return { ...base, detail: "Rate limit.", retryable: true, pauseCampaign: false, cooldownMs: 30000 };
  if (msg.includes("not admin") || msg.includes("not an admin"))
    return { ...base, detail: "Sem permissão de admin.", retryable: false, pauseCampaign: true, cooldownMs: 0 };
  if (msg.includes("not found") && (msg.includes("group") || msg.includes("invalid group")))
    return { ...base, detail: "Grupo inválido.", retryable: false, pauseCampaign: true, cooldownMs: 0 };
  if (msg.includes("blocked") || msg.includes("ban"))
    return { ...base, detail: "Contato bloqueado.", retryable: false, pauseCampaign: false, cooldownMs: 0 };
  if (msg.includes("not found") && (msg.includes("number") || msg.includes("participant") || msg.includes("contact")))
    return { ...base, detail: "Número não encontrado no WhatsApp.", retryable: false, pauseCampaign: false, cooldownMs: 0 };
  if (status === 401 || msg.includes("unauthorized") || msg.includes("invalid token"))
    return { ...base, detail: "Token inválido.", retryable: false, pauseCampaign: true, cooldownMs: 0 };
  if (status === 503 || msg.includes("disconnected") || msg.includes("socket"))
    return { ...base, detail: "Instância desconectada.", retryable: true, pauseCampaign: false, cooldownMs: 20000 };
  if (msg.includes("timeout") || status === 408 || status === 504)
    return { ...base, detail: "Timeout.", retryable: true, pauseCampaign: false, cooldownMs: 15000 };
  if (status >= 500)
    return { ...base, detail: `Erro servidor (${status}).`, retryable: true, pauseCampaign: false, cooldownMs: 15000 };
  return { ...base, detail: msg.substring(0, 140) || `HTTP ${status}`, retryable: true, pauseCampaign: false, cooldownMs: 10000 };
}

// ── Device selection ──
function parseDeviceIds(raw: any): string[] {
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return []; } }
  return [];
}

function pickDeviceId(campaign: any, blacklist: Set<string>): string | null {
  const ids = parseDeviceIds(campaign.device_ids);
  const available = ids.filter(id => !blacklist.has(id));
  if (available.length === 0) return null;
  if (available.length === 1) return available[0];
  // Round-robin based on processed count
  const processed = Number(campaign.success_count || 0) + Number(campaign.fail_count || 0) + Number(campaign.already_count || 0);
  return available[processed % available.length];
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
  counterState: { success_count: number; already_count: number; fail_count: number },
  status: string,
) {
  const updates: Record<string, any> = { updated_at: nowIso() };
  if (status === "completed") {
    counterState.success_count += 1;
    updates.success_count = counterState.success_count;
  } else if (status === "already_exists") {
    counterState.already_count += 1;
    updates.already_count = counterState.already_count;
  } else {
    counterState.fail_count += 1;
    updates.fail_count = counterState.fail_count;
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
  };

  activeCampaignIds.add(campaignId);
  log.info(`Processing campaign ${campaignId.slice(0, 8)}: group=${campaign.group_id}, contacts=${campaign.total_items || "?"}`);

  try {
    // Mark as processing
    if (campaign.status === "queued") {
      await sb.from("mass_inject_campaigns").update({ status: "processing", updated_at: nowIso() }).eq("id", campaignId);
      await emitEvent(sb, campaignId, "campaign_started", "info");
    }

    const failedDeviceIds = new Set<string>();
    let consecutiveFailures = 0;

    while (isRunningRef.value) {
      // 1. Check campaign status (was it paused/cancelled externally?)
      const { data: freshCampaign } = await sb.from("mass_inject_campaigns").select("status, min_delay, max_delay, pause_after, pause_duration, device_ids, group_id, success_count, fail_count, already_count, rate_limit_count").eq("id", campaignId).single();
      if (!freshCampaign || !["queued", "processing"].includes(freshCampaign.status)) {
        log.info(`Campaign ${campaignId.slice(0, 8)} status=${freshCampaign?.status} — stopping`);
        break;
      }

      counterState.success_count = Number(freshCampaign.success_count || 0);
      counterState.already_count = Number(freshCampaign.already_count || 0);
      counterState.fail_count = Number(freshCampaign.fail_count || 0);

      // 2. Pick a device
      const deviceId = pickDeviceId(freshCampaign, failedDeviceIds);
      if (!deviceId) {
        log.warn(`Campaign ${campaignId.slice(0, 8)}: no devices available — pausing`);
        await sb.from("mass_inject_campaigns").update({
          status: "paused", updated_at: nowIso(), next_run_at: null,
          pause_reason: "Nenhuma instância conectada e válida disponível. Conecte outra conta e retome.",
        }).eq("id", campaignId);
        await emitEvent(sb, campaignId, "campaign_failed_no_devices", "warning", "Nenhuma instância disponível.");
        break;
      }

      // 3. Get device credentials
      const { data: device } = await sb.from("devices")
        .select("id, name, number, status, uazapi_base_url, uazapi_token")
        .eq("id", deviceId).single();

      if (!device?.uazapi_base_url || !device?.uazapi_token) {
        failedDeviceIds.add(deviceId);
        continue;
      }

      const isOperational = !!device.number && ["connected", "ready", "active", "authenticated", "open", "online"].includes(String(device.status).toLowerCase());
      if (!isOperational) {
        failedDeviceIds.add(deviceId);
        continue;
      }

      const baseUrl = String(device.uazapi_base_url).replace(/\/+$/, "");

      // 4. Connection check (only every 10 contacts or at start)
      const processed = counterState.success_count + counterState.fail_count + counterState.already_count;
      if (processed === 0 || processed % 10 === 0) {
        const connected = await isDeviceConnected(baseUrl, device.uazapi_token);
        if (connected === false) {
          log.warn(`Campaign ${campaignId.slice(0, 8)}: device ${device.name} disconnected`);
          failedDeviceIds.add(deviceId);

          // Check if ALL devices are down
          const allIds = parseDeviceIds(freshCampaign.device_ids);
          if (allIds.every(id => failedDeviceIds.has(id))) {
            await sb.from("mass_inject_campaigns").update({
              status: "paused", updated_at: nowIso(), next_run_at: null,
              pause_reason: "Todas as instâncias desconectadas. Reconecte e retome.",
            }).eq("id", campaignId);
            await emitEvent(sb, campaignId, "all_sessions_dropped", "warning", "Todas as instâncias desconectadas.");
            break;
          }
          continue;
        }
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

      // 7. Pre-check: is the contact already in the group?
      const participantSnapshot = await fetchGroupParticipants(baseUrl, device.uazapi_token, groupId);

      if (participantSnapshot.confirmed && participantSetHasPhone(participantSnapshot.participants, phone)) {
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

      // 8. Add to group
      const result = await addToGroup(baseUrl, device.uazapi_token, groupId, phone);

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
        // Failure — single attempt, mark as failed immediately (no retries)
        await sb.from("mass_inject_contacts").update({
          status: "failed", error_message: result.detail, processed_at: nowIso(),
        }).eq("id", contact.id);
        await updateCounters(sb, campaignId, counterState, "failed");

        consecutiveFailures++;
        log.warn(`Campaign ${campaignId.slice(0, 8)}: ${phone} failed — ${result.detail} (consecutive: ${consecutiveFailures})`);

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
      }

      // 9. Apply delay — use EXACTLY what the user configured (no forced minimums)
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
  const { data: campaigns } = await db.from("mass_inject_campaigns")
    .select("*")
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: true })
    .limit(10);

  if (!campaigns?.length) return;

  // Filter out campaigns already running in parallel
  const newCampaigns = campaigns.filter(c => !activeCampaignIds.has(c.id));
  if (!newCampaigns.length) return;

  // Launch each new campaign as fire-and-forget (don't await)
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
    log.info(`Launching campaign ${campaign.id.slice(0, 8)} "${campaign.name}" in parallel`);
    processOneCampaign(db, campaign, isRunningRef).catch((err: any) => {
      log.error(`Campaign ${campaign.id.slice(0, 8)} error: ${err.message}`);
    });
  }

  lastMassInjectTickAt = new Date();
}
