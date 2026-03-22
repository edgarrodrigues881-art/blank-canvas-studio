import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CampaignButton {
  type: "reply" | "url" | "phone";
  text: string;
  value?: string;
}

function buildMenuChoice(button: CampaignButton, index: number): string | null {
  const text = (button.text || "").trim();
  if (!text) return null;
  if (button.type === "url") {
    const url = (button.value || "").trim();
    return url ? `${text}|url:${url}` : text;
  }
  if (button.type === "phone") {
    const phone = (button.value || "").trim();
    return phone ? `${text}|call:${phone}` : text;
  }
  const replyId = (button.value || `btn_${index}`).trim();
  return `${text}|${replyId}`;
}

async function oplog(client: any, userId: string, event: string, details: string, deviceId?: string | null, meta?: any) {
  try { await client.from("operation_logs").insert({ user_id: userId, device_id: deviceId || null, event, details, meta: meta || {} }); } catch (_e) { /* ignore */ }
}

// Get real-time stats from campaign_contacts (source of truth) — single query
async function getRealCampaignStats(serviceClient: any, campaignId: string) {
  const { data } = await serviceClient
    .from("campaign_contacts")
    .select("status")
    .eq("campaign_id", campaignId);

  const rows = data || [];
  let sent = 0, failed = 0, pending = 0, processing = 0;
  for (const r of rows) {
    if (r.status === "sent") sent++;
    else if (r.status === "failed") failed++;
    else if (r.status === "pending") pending++;
    else if (r.status === "processing") processing++;
  }
  return { sent, failed, delivered: sent, total: rows.length, pending: pending + processing };
}

// Instant WhatsApp alert for campaign status changes (bypass cron delay)
async function sendCampaignAlertToWa(serviceClient: any, userId: string, campaignName: string, status: string, stats?: { sent?: number; total?: number; delivered?: number; failed?: number }) {
  try {
    const { data: config } = await serviceClient
      .from("report_wa_configs")
      .select("device_id, group_id, campaigns_group_id, toggle_campaigns, connected_phone, connection_status")
      .eq("user_id", userId)
      .single();
    if (!config?.toggle_campaigns || !config?.device_id) return;

    // Use campaigns-specific group, fallback to general group
    const targetGroup = config.campaigns_group_id || config.group_id;
    if (!targetGroup) return;

    const { data: dev } = await serviceClient
      .from("devices")
      .select("uazapi_base_url, uazapi_token")
      .eq("id", config.device_id)
      .single();
    if (!dev?.uazapi_base_url || !dev?.uazapi_token) return;

    const now = new Date();
    const nowBRT = now.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
    const s = stats || {};
    let msg = "";
    if (status === "paused") {
      msg = `⏸ CAMPANHA PAUSADA\n\nCampanha: ${campaignName}\n\n📊 Progresso:\n✅ Enviadas: ${s.sent || 0}/${s.total || 0}\n\n⏱ Horário: ${nowBRT}\n\nA campanha foi pausada.`;
    } else if (status === "canceled") {
      const pending = Math.max(0, (s.total || 0) - (s.sent || 0) - (s.failed || 0));
      msg = `🚫 CAMPANHA CANCELADA\n\nCampanha: ${campaignName}\n\n📊 Resultado da campanha\n\n👥 Total de contatos: ${s.total || 0}\n✅ Enviadas: ${s.sent || 0}\n❌ Falhas: ${s.failed || 0}\n⏳ Pendentes: ${pending}\n\n⏱ Horário: ${nowBRT}`;
    } else if (status === "completed") {
      msg = `📣 CAMPANHA FINALIZADA\n\nCampanha: ${campaignName}\n\n📊 Resultado da campanha\n\n👥 Total de contatos: ${s.total || 0}\n✅ Enviadas: ${s.sent || 0}\n📬 Entregues: ${s.delivered || 0}\n❌ Falhas: ${s.failed || 0}\n\n⏱ Horário: ${nowBRT}`;
    }
    if (!msg) return;

    const headers: Record<string, string> = { token: dev.uazapi_token, Accept: "application/json", "Content-Type": "application/json" };
    const res = await fetch(`${dev.uazapi_base_url}/chat/send-text`, {
      method: "POST",
      headers,
      body: JSON.stringify({ chatId: targetGroup, text: msg }),
    });
    await res.text(); // consume body
    if (res.ok) {
      await serviceClient.from("report_wa_logs").insert({ user_id: userId, level: "INFO", message: `Campanha "${campaignName}" ${status} — alerta instantâneo enviado` });
    }
  } catch (e) {
    console.log(`Failed to send instant campaign alert: ${e.message}`);
  }
}

const API_TIMEOUT_MS = 30_000;

async function uazapiRequest(baseUrl: string, token: string, endpoint: string, payload: any, method: "POST" | "GET" = "POST") {
  let url = `${baseUrl}${endpoint}`;
  const headers: Record<string, string> = { "token": token, "Accept": "application/json" };
  let fetchOptions: RequestInit;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  if (method === "GET") {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined && value !== null) params.append(key, String(value));
    }
    url += `?${params.toString()}`;
    fetchOptions = { method: "GET", headers, signal: controller.signal };
  } else {
    headers["Content-Type"] = "application/json";
    fetchOptions = { method: "POST", headers, body: JSON.stringify(payload), signal: controller.signal };
  }

  let res: Response;
  try {
    res = await fetch(url, fetchOptions);
  } catch (fetchErr) {
    clearTimeout(timeoutId);
    if (fetchErr?.name === "AbortError") {
      throw new Error(`Timeout após ${API_TIMEOUT_MS / 1000}s aguardando resposta da API`);
    }
    throw fetchErr;
  }
  clearTimeout(timeoutId);

  const text = await res.text();
  if (res.status === 405 && method === "POST") {
    return uazapiRequest(baseUrl, token, endpoint, payload, "GET");
  }
  if (!res.ok) {
    let errorMsg = `API error ${res.status}`;
    try { const data = JSON.parse(text); errorMsg = data?.message || data?.error || text; } catch (_e) { errorMsg = text; }
    throw new Error(errorMsg);
  }
  const parsed = JSON.parse(text);
  if (parsed?.error && typeof parsed.error === "string") {
    throw new Error(parsed.error);
  }
  return parsed;
}

function detectMediaType(url: string): string {
  const lower = (url || "").toLowerCase().split("?")[0];
  if (/\.(ogg|mp3|wav|m4a|aac|opus|mpeg)$/.test(lower)) return "audio";
  if (/\.(mp4|mov|avi|mkv|webm|3gp)$/.test(lower)) return "video";
  if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|csv|txt)$/.test(lower)) return "document";
  return "image";
}

async function sendCaptionedMedia(baseUrl: string, token: string, phone: string, mediaUrl: string, mediaType: string, caption: string) {
  const normalizedCaption = typeof caption === "string" ? caption.trim() : "";

  const primaryPayload: Record<string, unknown> = {
    number: phone,
    file: mediaUrl,
    type: mediaType,
    caption: normalizedCaption,
  };

  if (mediaType === "image") {
    primaryPayload.compress = false;
  }

  try {
    return await uazapiRequest(baseUrl, token, "/send/media", primaryPayload);
  } catch (error) {
    console.warn(`Primary /send/media failed for ${phone}: ${error instanceof Error ? error.message : String(error)}`);

    try {
      return await uazapiRequest(baseUrl, token, "/send/media", {
        number: phone,
        media: mediaUrl,
        type: mediaType,
        caption: normalizedCaption,
        ...(mediaType === "image" ? { compress: false } : {}),
      });
    } catch (fallbackError) {
      if (mediaType === "image") {
        return await uazapiRequest(baseUrl, token, "/send/image", {
          number: phone,
          image: mediaUrl,
          caption: normalizedCaption,
          viewOnce: false,
        });
      }
      throw fallbackError;
    }
  }
}

async function sendUazapiMessage(baseUrl: string, token: string, to: string, body: string, mediaUrl?: string | null, buttons?: CampaignButton[], messageType?: string) {
  const phone = to.replace(/\D/g, "");
  const text = typeof body === "string" ? body.trim() : "";
  const hasButtons = buttons && buttons.length > 0;
  const choices = hasButtons ? buttons.map((b, i) => buildMenuChoice(b, i)).filter((choice): choice is string => Boolean(choice)) : [];

  console.log(JSON.stringify({
    event: "payload_built",
    origin: "campaign",
    messageType: messageType || null,
    hasMedia: Boolean(mediaUrl),
    hasButtons,
    buttonCount: choices.length,
    textLength: text.length,
    textPreview: text.substring(0, 80),
  }));

  if (choices.length > 0) {
    const mediaType = mediaUrl ? detectMediaType(mediaUrl) : null;
    const isAudioMedia = mediaType === "audio";
    const hasVisualMedia = !!mediaUrl && !isAudioMedia;

    if (!text) {
      console.log(JSON.stringify({ event: "fallback_text_applied", prevented: true, reason: "missing_primary_text_with_buttons" }));
      throw new Error("Mensagens com botão exigem copy/texto principal. O sistema não envia mais 'Escolha uma opção' automaticamente.");
    }

    // IMAGE + BUTTONS: Always send as two separate messages.
    // Uazapi's /send/menu does NOT support imageButton — sending it creates
    // messages that show as "incompatible" on WhatsApp mobile.
    // Strategy: 1) image with caption (copy), 2) delay, 3) buttons with same text.
    if (hasVisualMedia && mediaUrl) {
      console.log(JSON.stringify({
        event: "template_import_normalized",
        origin: "campaign",
        strategy: "split_media_then_buttons",
        buttonCount: choices.length,
        hasMedia: true,
        captionLength: text.length,
      }));

      // Step 1: Send image WITH caption (the user's copy)
      await sendCaptionedMedia(baseUrl, token, phone, mediaUrl, mediaType || "image", text);

      // Step 2: Small humanized delay between messages
      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));

      // Step 3: Send buttons as a separate text+button message
      // Use a short contextual intro instead of repeating the full copy
      await uazapiRequest(baseUrl, token, "/send/menu", {
        number: phone,
        type: "button",
        text: "👇 Escolha uma opção:",
        choices,
      });
      return;
    }

    // TEXT-ONLY BUTTONS (no image)
    await uazapiRequest(baseUrl, token, "/send/menu", {
      number: phone,
      type: "button",
      text,
      choices,
    });

    if (isAudioMedia && mediaUrl) {
      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
      await uazapiRequest(baseUrl, token, "/send/media", {
        number: phone,
        type: "ptt",
        file: mediaUrl,
      });
    }
    return;
  }

  // NO BUTTONS — just media or text
  if (mediaUrl) {
    const mediaType = detectMediaType(mediaUrl);
    if (mediaType === "audio") {
      if (text) {
        await uazapiRequest(baseUrl, token, "/send/text", { number: phone, text });
        await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
      }
      return await uazapiRequest(baseUrl, token, "/send/media", {
        number: phone,
        type: "ptt",
        file: mediaUrl,
      });
    }

    return await sendCaptionedMedia(baseUrl, token, phone, mediaUrl, mediaType, text);
  }

  return await uazapiRequest(baseUrl, token, "/send/text", { number: phone, text });
}

function isDisconnectError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return lower.includes("disconnected") || lower.includes("not connected") || lower.includes("qr code") ||
    lower.includes("logout") || lower.includes("unauthorized") || lower.includes("401") ||
    lower.includes("session") || lower.includes("not authenticated") || lower.includes("desconectado");
}

function isTemporaryError(msg: string): boolean {
  const lower = msg.toLowerCase();
  if (isDisconnectError(lower)) return false;
  if (lower.includes("not on whats") || lower.includes("not registered") || lower.includes("not_exists") || lower.includes("número inválido")) return false;
  return lower.includes("timeout") || lower.includes("timed out") || lower.includes("econnreset") ||
    lower.includes("econnrefused") || lower.includes("network") || lower.includes("socket") ||
    lower.includes("fetch failed") || lower.includes("503") || lower.includes("502") ||
    lower.includes("429") || lower.includes("rate limit") || lower.includes("temporarily") ||
    lower.includes("internal server error") || lower.includes("500") ||
    lower.includes("aguardando resposta") || lower.includes("aborterror");
}

function translateErrorMessage(msg: string): string {
  if (isDisconnectError(msg)) return "WhatsApp desconectado";
  if (msg.includes("not on Whats") || msg.includes("not registered") || msg.includes("not_exists") || msg.includes("não está no WhatsApp")) return "Número inválido";
  return msg;
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MIN_MS = 20_000;
const RETRY_DELAY_MAX_MS = 60_000;

async function sendWithRetry(
  baseUrl: string, token: string, to: string, body: string,
  mediaUrl?: string | null, buttons?: CampaignButton[], messageType?: string
): Promise<{ success: boolean; attempts: number; error?: string }> {
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      await sendUazapiMessage(baseUrl, token, to, body, mediaUrl, buttons, messageType);
      if (attempt > 1) console.log(`✅ Retry ${attempt - 1} succeeded for ${to}`);
      return { success: true, attempts: attempt };
    } catch (err) {
      lastError = err.message || "Erro";
      if (!isTemporaryError(lastError) || attempt > MAX_RETRIES) {
        return { success: false, attempts: attempt, error: lastError };
      }
      const retryDelay = RETRY_DELAY_MIN_MS + secureRandom() * (RETRY_DELAY_MAX_MS - RETRY_DELAY_MIN_MS);
      console.log(`⚠️ Attempt ${attempt} failed for ${to}: ${lastError} | retrying in ${Math.round(retryDelay / 1000)}s`);
      await new Promise(r => setTimeout(r, retryDelay));
    }
  }
  return { success: false, attempts: MAX_RETRIES + 1, error: lastError };
}

async function checkNumberExists(baseUrl: string, token: string, phone: string): Promise<{ exists: boolean; error?: string }> {
  try {
    const result = await uazapiRequest(baseUrl, token, "/check/exist", { number: phone });
    if (result?.exists === false || result?.numberExists === false || result?.status === "not_exists") {
      return { exists: false, error: "Número inválido" };
    }
    return { exists: true };
  } catch (err) {
    const msg = err.message || "";
    if (isDisconnectError(msg)) {
      return { exists: false, error: "WhatsApp desconectado" };
    }
    if (msg.includes("not on Whats") || msg.includes("not registered") || msg.includes("not_exists")) {
      return { exists: false, error: "Número inválido" };
    }
    return { exists: true };
  }
}

function normalizeBrazilianPhone(phone: string): string {
  const raw = phone.replace(/\D/g, "");
  if ((raw.length === 10 || raw.length === 11) && !raw.startsWith("55")) return `55${raw}`;
  return raw;
}

function generateUniqueRand4(usedSet: Set<string>): string {
  let value: string;
  do { value = String(Math.floor(secureRandom() * 10000)).padStart(4, "0"); } while (usedSet.has(value) && usedSet.size < 10000);
  usedSet.add(value);
  return value;
}

function generateUniqueRand3(usedSet: Set<string>): string {
  let value: string;
  do { value = Array.from({ length: 3 }, () => String.fromCharCode(97 + Math.floor(secureRandom() * 26))).join(""); } while (usedSet.has(value) && usedSet.size < 17576);
  usedSet.add(value);
  return value;
}

function replaceVariables(template: string, contact: any, rand4: string, rand3: string): string {
  return template
    .replace(/\{\{nome\}\}/gi, contact.name || "")
    .replace(/\{\{numero\}\}/gi, contact.phone || "")
    .replace(/\{\{telefone\}\}/gi, contact.phone || "")
    .replace(/\{\{rand4\}\}/gi, rand4)
    .replace(/\{\{rand3\}\}/gi, rand3)
    .replace(/\{\{var1\}\}/gi, contact.var1 || "")
    .replace(/\{\{var2\}\}/gi, contact.var2 || "")
    .replace(/\{\{var3\}\}/gi, contact.var3 || "")
    .replace(/\{\{var4\}\}/gi, contact.var4 || "")
    .replace(/\{\{var5\}\}/gi, contact.var5 || "")
    .replace(/\{\{var6\}\}/gi, contact.var6 || "")
    .replace(/\{\{var7\}\}/gi, contact.var7 || "")
    .replace(/\{\{var8\}\}/gi, contact.var8 || "")
    .replace(/\{\{var9\}\}/gi, contact.var9 || "")
    .replace(/\{\{var10\}\}/gi, contact.var10 || "");
}

// Crypto-grade random for better distribution
function secureRandom(): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] / (0xFFFFFFFF + 1);
}

function randomBetween(min: number, max: number): number {
  const effectiveMin = Math.min(min, max);
  const effectiveMax = Math.max(min, max);
  if (effectiveMax - effectiveMin < 1) {
    const jitter = Math.max(effectiveMin * 0.2, 0.5);
    return Math.max(0, (effectiveMin - jitter) + secureRandom() * (jitter * 2));
  }
  return effectiveMin + secureRandom() * (effectiveMax - effectiveMin);
}

class RandomPicker {
  private lastPicked: number = -1;
  private total: number;
  constructor(totalVariants: number) { this.total = totalVariants; }
  next(): number {
    if (this.total <= 1) return 0;
    let picked: number;
    do { picked = Math.floor(secureRandom() * this.total); } while (picked === this.lastPicked && this.total > 1);
    this.lastPicked = picked;
    return picked;
  }
}

const MAX_EXECUTION_MS = 45_000;

// ─── LOCK HELPERS ───
async function acquireDeviceLocks(serviceClient: any, deviceIds: string[], campaignId: string, userId: string): Promise<{ acquired: boolean; lockedBy?: string }> {
  const LOCK_BATCH_SIZE = 50;
  for (let i = 0; i < deviceIds.length; i += LOCK_BATCH_SIZE) {
    const batch = deviceIds.slice(i, i + LOCK_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(deviceId =>
        serviceClient.rpc("acquire_device_lock", {
          _device_id: deviceId,
          _campaign_id: campaignId,
          _user_id: userId,
          _stale_seconds: 300,
        })
      )
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "rejected" || (r.status === "fulfilled" && (r.value.error || r.value.data !== true))) {
        const { data: lock } = await serviceClient
          .from("campaign_device_locks")
          .select("campaign_id")
          .eq("device_id", batch[j])
          .single();
        return { acquired: false, lockedBy: lock?.campaign_id || "unknown" };
      }
    }
  }
  return { acquired: true };
}

async function releaseDeviceLocks(serviceClient: any, deviceIds: string[], campaignId: string) {
  const RELEASE_BATCH = 50;
  for (let i = 0; i < deviceIds.length; i += RELEASE_BATCH) {
    const batch = deviceIds.slice(i, i + RELEASE_BATCH);
    await Promise.allSettled(
      batch.map(deviceId =>
        serviceClient.rpc("release_device_lock", { _device_id: deviceId, _campaign_id: campaignId })
      )
    );
  }
}

async function startNextQueuedCampaigns(serviceClient: any, deviceIds: string[], supabaseUrl: string, serviceRoleKey: string) {
  try {
    const { data: queued } = await serviceClient
      .from("campaigns")
      .select("id, user_id, device_id, device_ids")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(10);

    if (!queued || queued.length === 0) return;

    const deviceSet = new Set(deviceIds);
    const match = queued.find((c: any) => {
      const ids: string[] = Array.isArray(c.device_ids) && c.device_ids.length > 0
        ? c.device_ids : c.device_id ? [c.device_id] : [];
      return ids.some(id => deviceSet.has(id));
    });

    if (match) {
      const matchDeviceIds: string[] = Array.isArray(match.device_ids) && match.device_ids.length > 0
        ? match.device_ids : match.device_id ? [match.device_id] : [];
      const firstDevice = matchDeviceIds[0];
      console.log(`🚀 Auto-starting queued campaign ${match.id}`);
      await serviceClient.from("campaigns").update({ status: "running", started_at: new Date().toISOString() }).eq("id", match.id).eq("status", "queued");
      const lockResult = await acquireDeviceLocks(serviceClient, [firstDevice], match.id, match.user_id);
      if (lockResult.acquired) {
        await oplog(serviceClient, match.user_id, "campaign_auto_started", `Campanha auto-iniciada da fila`, null, { campaign_id: match.id });
        selfContinue(supabaseUrl, serviceRoleKey, match.id, firstDevice, { batchSent: 0, currentDeviceIndex: 0, instanceMsgCount: 0, msgsSincePause: 0 });
      } else {
        await serviceClient.from("campaigns").update({ status: "queued" }).eq("id", match.id);
      }
    }
  } catch (err) {
    console.error(`Error starting next queued campaign: ${err.message}`);
  }
}

async function heartbeatLock(serviceClient: any, campaignId: string) {
  await serviceClient.rpc("heartbeat_device_lock", { _campaign_id: campaignId });
}

async function handleDisconnectPause(serviceClient: any, campaignId: string, deviceIds: string[], _failedCount: number, campaignName?: string, userId?: string, pauseOnDisconnect: boolean = true) {
  if (!pauseOnDisconnect) {
    console.log(`⚠️ Disconnect detected for campaign ${campaignId}, but pause_on_disconnect=false — continuing`);
    return false; // signal: don't break the loop
  }
  console.log(`⚠️ Disconnect detected for campaign ${campaignId}, pausing to preserve contacts`);
  await serviceClient.from("campaign_contacts").update({ status: "pending" }).eq("campaign_id", campaignId).eq("status", "processing");
  const realStats = await getRealCampaignStats(serviceClient, campaignId);
  await serviceClient.from("campaigns").update({
    status: "paused",
    sent_count: realStats.sent,
    delivered_count: realStats.delivered,
    failed_count: realStats.failed,
    total_contacts: realStats.total,
    updated_at: new Date().toISOString(),
  }).eq("id", campaignId);
  await releaseDeviceLocks(serviceClient, deviceIds, campaignId);
  if (userId) {
    sendCampaignAlertToWa(serviceClient, userId, campaignName || "", "paused", realStats);
  }
  return true; // signal: campaign was paused, break the loop
}

// Sync campaign counters from source of truth (campaign_contacts table)
async function syncCampaignCounters(serviceClient: any, campaignId: string) {
  const stats = await getRealCampaignStats(serviceClient, campaignId);
  await serviceClient.from("campaigns").update({
    sent_count: stats.sent,
    delivered_count: stats.delivered,
    failed_count: stats.failed,
    total_contacts: stats.total,
  }).eq("id", campaignId);
  return stats;
}

interface BatchState {
  batchSent?: number;
  currentDeviceIndex?: number;
  instanceMsgCount?: number;
  msgsSincePause?: number;
  pauseAfter?: number;
  pendingPauseMs?: number;
}

async function selfContinue(supabaseUrl: string, serviceRoleKey: string, campaignId: string, deviceId?: string, batchState?: BatchState) {
  console.log(`Self-continuing campaign ${campaignId}...`, batchState ? JSON.stringify(batchState) : '');
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/process-campaign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ action: "continue", campaignId, deviceId, ...batchState }),
    });
    await res.text(); // consume body to prevent resource leak
  } catch (err) {
    console.error(`Self-continue failed: ${err.message}`);
  }
}

// Extract device IDs from campaign data
function getCampaignDeviceIds(campaign: any, fallbackDeviceId?: string): string[] {
  if (Array.isArray(campaign.device_ids) && campaign.device_ids.length > 0) return campaign.device_ids;
  if (fallbackDeviceId) return [fallbackDeviceId];
  if (campaign.device_id) return [campaign.device_id];
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const token = authHeader.replace("Bearer ", "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const isServiceRole = token === serviceRoleKey;

  const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  let userId: string;
  let isAdmin = false;

  const body = await req.json();
  const { action, campaignId, deviceId } = body;

  if (isServiceRole) {
    const { data: camp } = await serviceClient.from("campaigns").select("user_id").eq("id", campaignId).single();
    if (!camp) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    userId = camp.user_id;
    isAdmin = true; // service role calls are from admin/cron
  } else {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    userId = user.id;
    // Check if caller is admin
    const { data: roleData } = await serviceClient.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    isAdmin = !!roleData;
  }

  // ─── PLAN CHECK HELPER (skipped for admins) ───
  async function checkActivePlan(uid: string): Promise<string | null> {
    if (isAdmin) return null; // Admin bypasses plan checks
    const { data: sub } = await serviceClient
      .from("subscriptions")
      .select("expires_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sub || new Date(sub.expires_at) < new Date()) return "Plano inativo. Ative um plano para continuar.";
    const { data: prof } = await serviceClient.from("profiles").select("status").eq("id", uid).maybeSingle();
    if (prof?.status === "suspended" || prof?.status === "cancelled") return "Conta suspensa. Ative um plano para continuar.";
    return null;
  }

  try {
    // ─── PAUSE ───
    if (action === "pause") {
      const { data: campData } = await serviceClient.from("campaigns").select("name, device_id, device_ids").eq("id", campaignId).single();
      const pauseStats = await syncCampaignCounters(serviceClient, campaignId);
      const pauseFilter = serviceClient.from("campaigns").update({ status: "paused" }).eq("id", campaignId);
      if (!isAdmin) pauseFilter.eq("user_id", userId);
      await pauseFilter;
      if (campData) {
        const ids = getCampaignDeviceIds(campData);
        await releaseDeviceLocks(serviceClient, ids, campaignId);
      }
      sendCampaignAlertToWa(serviceClient, userId, campData?.name || "", "paused", pauseStats);
      return new Response(JSON.stringify({ success: true, status: "paused" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── CANCEL ───
    if (action === "cancel") {
      const { data: campDataC } = await serviceClient.from("campaigns").select("name, device_id, device_ids").eq("id", campaignId).single();
      await serviceClient.from("campaign_contacts").update({ status: "failed", error_message: "Campanha cancelada" }).eq("campaign_id", campaignId).eq("status", "pending");
      await serviceClient.from("campaign_contacts").update({ status: "failed", error_message: "Campanha cancelada" }).eq("campaign_id", campaignId).eq("status", "processing");
      const cancelStats = await syncCampaignCounters(serviceClient, campaignId);
      const cancelFilter = serviceClient.from("campaigns").update({
        status: "canceled",
        completed_at: new Date().toISOString(),
      }).eq("id", campaignId);
      if (!isAdmin) cancelFilter.eq("user_id", userId);
      await cancelFilter;
      if (campDataC) {
        const ids = getCampaignDeviceIds(campDataC);
        await releaseDeviceLocks(serviceClient, ids, campaignId);
        startNextQueuedCampaigns(serviceClient, ids, supabaseUrl, serviceRoleKey);
      }
      sendCampaignAlertToWa(serviceClient, userId, campDataC?.name || "", "canceled", cancelStats);
      return new Response(JSON.stringify({ success: true, status: "canceled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── RESUME ───
    if (action === "resume") {
      const planErr = await checkActivePlan(userId);
      if (planErr) return new Response(JSON.stringify({ error: planErr }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      // FIX: Acquire device locks before resuming to prevent race conditions
      const { data: campResume } = await serviceClient.from("campaigns").select("device_id, device_ids, name").eq("id", campaignId).single();
      if (campResume) {
        const resumeDeviceIds = getCampaignDeviceIds(campResume, deviceId);
        if (resumeDeviceIds.length > 0) {
          const lockResult = await acquireDeviceLocks(serviceClient, resumeDeviceIds, campaignId, userId);
          if (!lockResult.acquired) {
            return new Response(JSON.stringify({
              error: "Instância em uso por outra campanha. Aguarde a conclusão ou pause a outra campanha.",
              lockedBy: lockResult.lockedBy,
            }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }
      }

      const resumeFilter = serviceClient.from("campaigns").update({ status: "running" }).eq("id", campaignId);
      if (!isAdmin) resumeFilter.eq("user_id", userId);
      await resumeFilter;
      selfContinue(supabaseUrl, serviceRoleKey, campaignId, deviceId, { batchSent: 0, currentDeviceIndex: 0, instanceMsgCount: 0, msgsSincePause: 0 });
      return new Response(JSON.stringify({ success: true, status: "running" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── START ───
    if (action === "start") {
      const planErr = await checkActivePlan(userId);
      if (planErr) return new Response(JSON.stringify({ error: planErr }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      // FIX: Select 'name' field for oplog
      const { data: campaign } = await serviceClient.from("campaigns").select("id, user_id, name, device_id, device_ids, started_at, total_contacts").eq("id", campaignId).single();
      if (!campaign) {
        return new Response(JSON.stringify({ error: "Campanha não encontrada" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const campaignDeviceIds = getCampaignDeviceIds(campaign, deviceId);

      if (campaignDeviceIds.length > 0) {
        const lockResult = await acquireDeviceLocks(serviceClient, campaignDeviceIds, campaignId, campaign.user_id);
        if (!lockResult.acquired) {
          console.log(`Campaign ${campaignId} queued: device locked by campaign ${lockResult.lockedBy}`);
          await serviceClient.from("campaigns").update({ status: "queued", updated_at: new Date().toISOString() }).eq("id", campaignId);
          await oplog(serviceClient, userId, "campaign_queued", `Campanha enfileirada — instância em uso por outra campanha`, null, { campaign_id: campaignId, locked_by: lockResult.lockedBy });
          return new Response(JSON.stringify({
            success: true,
            status: "queued",
            message: "Instância em uso. A campanha iniciará automaticamente quando a instância for liberada.",
            lockedBy: lockResult.lockedBy,
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      await serviceClient.from("campaigns").update({ status: "running", started_at: campaign.started_at || new Date().toISOString() }).eq("id", campaignId);
      await oplog(serviceClient, userId, "campaign_started", `Campanha "${campaign.name}" iniciada`, deviceId, { campaign_id: campaignId, total_contacts: campaign.total_contacts });
      selfContinue(supabaseUrl, serviceRoleKey, campaignId, deviceId, { batchSent: 0, currentDeviceIndex: 0, instanceMsgCount: 0, msgsSincePause: 0 });
      return new Response(JSON.stringify({ success: true, status: "running" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── CONTINUE (internal batch processing) ───
    if (action === "continue") {
      const planErr = await checkActivePlan(userId);
      if (planErr) {
        console.log(`⚠️ Plan inactive for user ${userId}, pausing campaign ${campaignId}`);
        await serviceClient.from("campaigns").update({ status: "paused", updated_at: new Date().toISOString() }).eq("id", campaignId);
        const { data: camp } = await serviceClient.from("campaigns").select("device_id, device_ids").eq("id", campaignId).single();
        if (camp) {
          const ids = getCampaignDeviceIds(camp);
          await releaseDeviceLocks(serviceClient, ids, campaignId);
        }
        return new Response(JSON.stringify({ error: planErr }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const startTime = Date.now();

      const { data: campaign, error: campErr } = await serviceClient.from("campaigns").select("id, user_id, name, status, message_type, message_content, media_url, buttons, device_id, device_ids, messages_per_instance, min_delay_seconds, max_delay_seconds, pause_every_min, pause_every_max, pause_duration_min, pause_duration_max, sent_count, failed_count, started_at, total_contacts, pause_on_disconnect").eq("id", campaignId).single();
      if (campErr || !campaign) {
        return new Response(JSON.stringify({ error: "Campanha não encontrada" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (campaign.status !== "running") {
        console.log(`Campaign ${campaignId} is ${campaign.status}, not processing.`);
        return new Response(JSON.stringify({ success: true, status: campaign.status }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const deviceIds = getCampaignDeviceIds(campaign, deviceId);
      const messagesPerInstance = campaign.messages_per_instance || 0;

      let allDevices: any[] = [];
      if (deviceIds.length > 0) {
        const PAGE_SIZE = 500;
        const allDevData: any[] = [];
        for (let i = 0; i < deviceIds.length; i += PAGE_SIZE) {
          const batch = deviceIds.slice(i, i + PAGE_SIZE);
          const { data: devs } = await serviceClient.from("devices").select("id, name, uazapi_token, uazapi_base_url, status").eq("user_id", campaign.user_id).in("id", batch);
          if (devs) allDevData.push(...devs);
        }
        const devMap = new Map(allDevData.map(d => [d.id, d]));
        allDevices = deviceIds.map(id => devMap.get(id)).filter((d): d is any => !!d && !!d.uazapi_token && !!d.uazapi_base_url);
      }

      if (allDevices.length === 0) {
        console.log(`⚠️ No valid devices found for campaign ${campaignId}, pausing`);
        await serviceClient.from("campaign_contacts").update({ status: "pending" }).eq("campaign_id", campaignId).eq("status", "processing");
        await serviceClient.from("campaigns").update({ status: "paused", updated_at: new Date().toISOString() }).eq("id", campaignId);
        await releaseDeviceLocks(serviceClient, deviceIds, campaignId);
        return new Response(JSON.stringify({ success: true, status: "paused", reason: "no_valid_devices" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // PRE-FLIGHT: Check device connectivity
      const connectedStatuses = ["Ready", "Connected", "authenticated"];
      const disconnectedDevices = allDevices.filter(d => !connectedStatuses.includes(d.status));
      if (disconnectedDevices.length === allDevices.length) {
        console.log(`⚠️ All devices disconnected for campaign ${campaignId}, pausing`);
        await serviceClient.from("campaign_contacts").update({ status: "pending" }).eq("campaign_id", campaignId).eq("status", "processing");
        await serviceClient.from("campaigns").update({ status: "paused", updated_at: new Date().toISOString() }).eq("id", campaignId);
        await releaseDeviceLocks(serviceClient, deviceIds, campaignId);
        return new Response(JSON.stringify({ success: true, status: "paused", reason: "all_devices_disconnected" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (disconnectedDevices.length > 0) {
        console.log(`⚠️ ${disconnectedDevices.length} device(s) disconnected, using ${allDevices.length - disconnectedDevices.length} remaining`);
        allDevices = allDevices.filter(d => connectedStatuses.includes(d.status));
      }

      // Acquire/refresh locks
      const lockResult = await acquireDeviceLocks(serviceClient, deviceIds, campaignId, campaign.user_id);
      if (!lockResult.acquired) {
        console.log(`Campaign ${campaignId} lost device lock to ${lockResult.lockedBy}, stopping.`);
        await serviceClient.from("campaigns").update({ status: "paused" }).eq("id", campaignId);
        return new Response(JSON.stringify({ error: "Device lock lost", lockedBy: lockResult.lockedBy }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const device = allDevices[0];
      console.log(`Campaign ${campaignId} using device: ${device.name} (${device.id})${allDevices.length > 1 ? `, total: ${allDevices.length}` : ''}`);

      const minDelayMs = (campaign.min_delay_seconds || 8) * 1000;
      const maxDelayMs = (campaign.max_delay_seconds || 25) * 1000;
      const pauseEveryMin = campaign.pause_every_min || 10;
      const pauseEveryMax = campaign.pause_every_max || 20;
      const pauseDurMinMs = (campaign.pause_duration_min || 30) * 1000;
      const pauseDurMaxMs = (campaign.pause_duration_max || 120) * 1000;

      let batchSent = body.batchSent || 0;
      let currentDeviceIndex = body.currentDeviceIndex || 0;
      let instanceMsgCount = body.instanceMsgCount || 0;
      let pauseAfter = body.pauseAfter || Math.round(randomBetween(pauseEveryMin, pauseEveryMax));
      let msgsSincePause = body.msgsSincePause || 0;
      let pendingPauseMs = body.pendingPauseMs || 0;

      const useRotation = messagesPerInstance > 0 && allDevices.length > 1;
      const useParallel = messagesPerInstance === -1 && allDevices.length > 1;

      const dynamicBatchSize = Math.min(1000, Math.max(100, allDevices.length * 3));
      const { data: contacts, error: contactsErr } = await serviceClient
        .from("campaign_contacts")
        .select("id, phone, name, status, campaign_id, var1, var2, var3, var4, var5, var6, var7, var8, var9, var10")
        .eq("campaign_id", campaignId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(dynamicBatchSize);

      if (contactsErr) throw contactsErr;

      if (!contacts || contacts.length === 0) {
        const { count: processingCount } = await serviceClient
          .from("campaign_contacts")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaignId)
          .eq("status", "processing");

        if (processingCount && processingCount > 0) {
          console.log(`${processingCount} contacts still processing, will retry`);
          selfContinue(supabaseUrl, serviceRoleKey, campaignId, deviceId, { batchSent: 0, currentDeviceIndex: 0, instanceMsgCount: 0, msgsSincePause: 0 });
          return new Response(JSON.stringify({ success: true, status: "running" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Complete — use real stats for accuracy
        const completedStats = await syncCampaignCounters(serviceClient, campaignId);
        await serviceClient.from("campaigns").update({
          status: "completed",
          completed_at: new Date().toISOString(),
        }).eq("id", campaignId);
        await releaseDeviceLocks(serviceClient, deviceIds, campaignId);
        await oplog(serviceClient, campaign.user_id, "campaign_completed", `Campanha "${campaign.name}" concluída`, null, { campaign_id: campaignId, sent: completedStats.sent, failed: completedStats.failed });
        console.log(`Campaign ${campaignId} completed! Sent: ${completedStats.sent}, Failed: ${completedStats.failed}. Locks released.`);
        sendCampaignAlertToWa(serviceClient, campaign.user_id, campaign.name, "completed", completedStats);
        startNextQueuedCampaigns(serviceClient, deviceIds, supabaseUrl, serviceRoleKey);
        return new Response(JSON.stringify({ success: true, status: "completed" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // FIX: Use real counters from DB instead of stale local vars
      let sentCount = campaign.sent_count || 0;
      let failedCount = campaign.failed_count || 0;
      const messageContent = campaign.message_content || "";
      const sendAllMode = messageContent.includes("|&&|");
      const sequentialMode = messageContent.includes("|>>|");
      const messageVariants = sendAllMode
        ? messageContent.split("|&&|").filter((m: string) => m.trim())
        : sequentialMode
          ? messageContent.split("|>>|").filter((m: string) => m.trim())
          : messageContent.includes("|||")
            ? messageContent.split("|||").filter((m: string) => m.trim())
            : [messageContent];
      console.log(`Message mode: ${sendAllMode ? 'ALL (|&&|)' : sequentialMode ? 'SEQUENTIAL (|>>|)' : messageContent.includes('|||') ? 'RANDOM (|||)' : 'SINGLE'}, variants: ${messageVariants.length}`);
      // Parse media_url — may be a JSON array from templates or a plain URL
      let mediaUrl: string | null = null;
      if (campaign.media_url) {
        try {
          const parsed = JSON.parse(campaign.media_url);
          if (Array.isArray(parsed) && parsed.length > 0) {
            mediaUrl = parsed[0].url || null;
          } else {
            mediaUrl = campaign.media_url;
          }
        } catch {
          mediaUrl = campaign.media_url;
        }
      }
      const campaignButtons: CampaignButton[] = Array.isArray(campaign.buttons) ? campaign.buttons : [];
      const msgType = campaign.message_type || "texto";
      const pauseOnDisconnect = campaign.pause_on_disconnect !== false;
      const usedRand4 = new Set<string>();
      const usedRand3 = new Set<string>();
      const randomPicker = new RandomPicker(messageVariants.length);
      let sequentialIndex = 0;
      let needsContinue = false;
      let heartbeatCounter = 0;

      // ─── PARALLEL MODE ───
      if (useParallel) {
        const chunks: any[][] = allDevices.map(() => [] as any[]);
        contacts.forEach((c, i) => chunks[i % allDevices.length].push(c));

        const DEVICE_WAVE_SIZE = 30;
        const allResults: { sent: number; failed: number }[] = [];

        for (let wave = 0; wave < allDevices.length; wave += DEVICE_WAVE_SIZE) {
          const waveDevices = allDevices.slice(wave, wave + DEVICE_WAVE_SIZE);
          const waveChunks = waveDevices.map((_, wi) => chunks[wave + wi] || []);

          const waveResults = await Promise.allSettled(waveDevices.map(async (dev, devIdx) => {
            const chunk = waveChunks[devIdx];
            if (!chunk || chunk.length === 0) return { sent: 0, failed: 0 };
            const devToken = dev.uazapi_token;
            const devBaseUrl = (dev.uazapi_base_url || "").replace(/\/+$/, "");
            let devSent = 0, devFailed = 0;
            let devHeartbeat = 0;
            let cancelled = false;
            const devUsedRand4 = new Set<string>();
            const devUsedRand3 = new Set<string>();
            const devRandomPicker = new RandomPicker(messageVariants.length);

            for (const contact of chunk) {
              if (cancelled || Date.now() - startTime > MAX_EXECUTION_MS) { needsContinue = true; break; }

              const { data: locked } = await serviceClient
                .from("campaign_contacts")
                .update({ status: "processing" })
                .eq("id", contact.id)
                .eq("status", "pending")
                .select("id");
              if (!locked || locked.length === 0) continue;

              devHeartbeat++;
              if (devHeartbeat % 25 === 0) {
                await heartbeatLock(serviceClient, campaignId);
              }

              if (devHeartbeat % 20 === 1) {
                const { data: fresh } = await serviceClient.from("campaigns").select("status").eq("id", campaignId).single();
                if (fresh && (fresh.status === "paused" || fresh.status === "canceled")) {
                  await serviceClient.from("campaign_contacts").update({ status: "pending" }).eq("id", contact.id).eq("status", "processing");
                  cancelled = true;
                  break;
                }
              }

              const phone = contact.phone.replace(/\D/g, "");
              if (phone.length < 10) {
                await serviceClient.from("campaign_contacts").update({ status: "failed", error_message: "Número inválido", device_id: dev.id }).eq("id", contact.id);
                devFailed++;
                continue;
              }
              try {
                const pSendStart = Date.now();
                const rand4 = generateUniqueRand4(devUsedRand4);
                const rand3 = generateUniqueRand3(devUsedRand3);
                const chosenMessage = messageVariants[devRandomPicker.next()];
                const msg = replaceVariables(chosenMessage, contact, rand4, rand3);
                const normalized = normalizeBrazilianPhone(phone);
                const check = await checkNumberExists(devBaseUrl, devToken, normalized);
                if (!check.exists) {
                  await serviceClient.from("campaign_contacts").update({ status: "failed", error_message: check.error || "Número inválido", device_id: dev.id }).eq("id", contact.id);
                  devFailed++;
                  if (check.error === "WhatsApp desconectado") {
                    // Revert remaining contacts in this device's chunk
                    const idx = chunk.indexOf(contact);
                    const remainingIds = chunk.slice(idx + 1).map((c: any) => c.id);
                    if (remainingIds.length > 0) {
                      await serviceClient.from("campaign_contacts").update({ status: "pending" }).eq("campaign_id", campaignId).in("id", remainingIds);
                    }
                    break;
                  }
                  console.log(`Number ${normalized} invalid, skipping`);
                  continue;
                }
                if (sendAllMode && messageVariants.length > 1) {
                  let allSendFailed = false;
                  let lastSendError = "";
                  for (let mi = 0; mi < messageVariants.length; mi++) {
                    const allMsg = replaceVariables(messageVariants[mi], contact, rand4, rand3);
                    const result = await sendWithRetry(devBaseUrl, devToken, normalized, allMsg, mi === 0 ? mediaUrl : null, mi === 0 ? campaignButtons : [], msgType);
                    if (!result.success) {
                      allSendFailed = true;
                      lastSendError = result.error || "";
                      const translated = translateErrorMessage(lastSendError);
                      await serviceClient.from("campaign_contacts").update({ status: "failed", error_message: `${translated} (${result.attempts} tentativas)`, device_id: dev.id }).eq("id", contact.id);
                      devFailed++;
                      if (isDisconnectError(lastSendError)) {
                        const idx = chunk.indexOf(contact);
                        const remainingIds = chunk.slice(idx + 1).map((c: any) => c.id);
                        if (remainingIds.length > 0) {
                          await serviceClient.from("campaign_contacts").update({ status: "pending" }).eq("campaign_id", campaignId).in("id", remainingIds);
                        }
                      }
                      break;
                    }
                    if (mi < messageVariants.length - 1) {
                      await new Promise(r => setTimeout(r, randomBetween(minDelayMs, maxDelayMs)));
                    }
                  }
                  if (allSendFailed) {
                    // FIX: Check actual error instead of isDisconnectError("")
                    if (isDisconnectError(lastSendError)) break;
                    continue;
                  }
                } else {
                  const result = await sendWithRetry(devBaseUrl, devToken, normalized, msg, mediaUrl, campaignButtons, msgType);
                  if (!result.success) {
                    const translated = translateErrorMessage(result.error || "Erro");
                    await serviceClient.from("campaign_contacts").update({ status: "failed", error_message: `${translated} (${result.attempts} tentativas)`, device_id: dev.id }).eq("id", contact.id);
                    devFailed++;
                    if (isDisconnectError(result.error || "")) {
                      const idx = chunk.indexOf(contact);
                      const remainingIds = chunk.slice(idx + 1).map((c: any) => c.id);
                      if (remainingIds.length > 0) {
                        await serviceClient.from("campaign_contacts").update({ status: "pending" }).eq("campaign_id", campaignId).in("id", remainingIds);
                      }
                      break;
                    }
                    continue;
                  }
                }
                await serviceClient.from("campaign_contacts").update({ status: "sent", sent_at: new Date().toISOString(), device_id: dev.id }).eq("id", contact.id);
                devSent++;

                const isLastInChunk = chunk.indexOf(contact) === chunk.length - 1;
                if (!isLastInChunk) {
                  const pApiElapsed = Date.now() - pSendStart;
                  const pTargetDelay = randomBetween(minDelayMs, maxDelayMs);
                  const pActualDelay = Math.max(500, pTargetDelay - pApiElapsed);
                  await new Promise(r => setTimeout(r, pActualDelay));
                }
              } catch (err) {
                const translated = translateErrorMessage(err.message || "Erro");
                await serviceClient.from("campaign_contacts").update({ status: "failed", error_message: translated, device_id: dev.id }).eq("id", contact.id);
                devFailed++;
                if (isDisconnectError(err.message || "")) {
                  const idx = chunk.indexOf(contact);
                  const remainingIds = chunk.slice(idx + 1).map((c: any) => c.id);
                  if (remainingIds.length > 0) {
                    await serviceClient.from("campaign_contacts").update({ status: "pending" }).eq("campaign_id", campaignId).in("id", remainingIds);
                  }
                  break;
                }
              }
            }
            return { sent: devSent, failed: devFailed };
          }));

          for (const r of waveResults) {
            if (r.status === "fulfilled") allResults.push(r.value);
          }
        }

        for (const r of allResults) {
          sentCount += r.sent;
          failedCount += r.failed;
        }
        await serviceClient.from("campaigns").update({ sent_count: sentCount, delivered_count: sentCount, failed_count: failedCount }).eq("id", campaignId);

        // Check if disconnect occurred
        const { count: stillPending } = await serviceClient.from("campaign_contacts").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", "pending");
        if (stillPending && stillPending > 0) {
          const { data: devStatuses } = await serviceClient.from("devices").select("id, status").in("id", deviceIds);
          const allDisconnected = devStatuses?.every(d => !connectedStatuses.includes(d.status));
          if (allDisconnected) {
            const didPause = await handleDisconnectPause(serviceClient, campaignId, deviceIds, failedCount, campaign.name, campaign.user_id, pauseOnDisconnect);
            if (!didPause) { needsContinue = true; }
          }
        }

      } else {
        // ─── SEQUENTIAL / ROTATION MODE ───
        if (pendingPauseMs > 0) {
          console.log(`Applying deferred pause of ${Math.round(pendingPauseMs / 1000)}s`);
          if (pendingPauseMs > MAX_EXECUTION_MS - 5000) {
            const waitNow = MAX_EXECUTION_MS - 10000;
            const remaining = pendingPauseMs - waitNow;
            await new Promise(resolve => setTimeout(resolve, waitNow));
            await heartbeatLock(serviceClient, campaignId);
            selfContinue(supabaseUrl, serviceRoleKey, campaignId, deviceId, { batchSent, currentDeviceIndex, instanceMsgCount, msgsSincePause: 0, pauseAfter, pendingPauseMs: remaining });
            return new Response(JSON.stringify({ success: true, status: "running", waitingPause: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          await new Promise(resolve => setTimeout(resolve, pendingPauseMs));
          pendingPauseMs = 0;
          msgsSincePause = 0;
          pauseAfter = Math.round(randomBetween(pauseEveryMin, pauseEveryMax));
        }

        for (const contact of contacts) {
          const { data: locked } = await serviceClient
            .from("campaign_contacts")
            .update({ status: "processing" })
            .eq("id", contact.id)
            .eq("status", "pending")
            .select("id");

          if (!locked || locked.length === 0) continue;

          if (Date.now() - startTime > MAX_EXECUTION_MS) {
            await serviceClient.from("campaign_contacts").update({ status: "pending" }).eq("id", contact.id).eq("status", "processing");
            needsContinue = true;
            break;
          }

          heartbeatCounter++;
          if (heartbeatCounter % 20 === 0) {
            await heartbeatLock(serviceClient, campaignId);
          }

          if (heartbeatCounter % 15 === 1) {
            const { data: freshCampaign } = await serviceClient.from("campaigns").select("status").eq("id", campaignId).single();
            if (freshCampaign && (freshCampaign.status === "paused" || freshCampaign.status === "canceled")) {
              await serviceClient.from("campaign_contacts").update({ status: "pending" }).eq("id", contact.id).eq("status", "processing");
              break;
            }
          }

          if (useRotation && instanceMsgCount >= messagesPerInstance) {
            currentDeviceIndex = (currentDeviceIndex + 1) % allDevices.length;
            instanceMsgCount = 0;
            console.log(`Rotating to device ${allDevices[currentDeviceIndex].name}`);
          }
          const activeDevice = useRotation ? allDevices[currentDeviceIndex] : device;
          const activeToken = activeDevice.uazapi_token;
          const activeBaseUrl = (activeDevice.uazapi_base_url || "").replace(/\/+$/, "");

          const phone = contact.phone.replace(/\D/g, "");
          if (phone.length < 10) {
            await serviceClient.from("campaign_contacts").update({ status: "failed", error_message: "Número inválido", device_id: activeDevice.id }).eq("id", contact.id);
            failedCount++;
            if (failedCount % 5 === 0) await serviceClient.from("campaigns").update({ failed_count: failedCount }).eq("id", campaignId);
            continue;
          }

          try {
            const sendStartTime = Date.now();
            const rand4 = generateUniqueRand4(usedRand4);
            const rand3 = generateUniqueRand3(usedRand3);
            const msgIndex = sequentialMode ? sequentialIndex : randomPicker.next();
            const chosenMessage = messageVariants[msgIndex % messageVariants.length];
            if (sequentialMode) sequentialIndex = (sequentialIndex + 1) % messageVariants.length;
            const personalizedMessage = replaceVariables(chosenMessage, contact, rand4, rand3);
            const normalizedPhone = normalizeBrazilianPhone(phone);

            if (heartbeatCounter % 10 === 1) {
              const { data: deviceStatus } = await serviceClient.from("devices").select("status").eq("id", activeDevice.id).single();
              if (deviceStatus && !connectedStatuses.includes(deviceStatus.status)) {
                console.log(`⚠️ Device ${activeDevice.name} is ${deviceStatus.status}, pausing`);
                await serviceClient.from("campaign_contacts").update({ status: "pending" }).eq("id", contact.id).eq("status", "processing");
                await serviceClient.from("campaigns").update({ status: "paused", updated_at: new Date().toISOString() }).eq("id", campaignId);
                await releaseDeviceLocks(serviceClient, deviceIds, campaignId);
                break;
              }
            }

            const check = await checkNumberExists(activeBaseUrl, activeToken, normalizedPhone);
            if (!check.exists) {
              await serviceClient.from("campaign_contacts").update({ status: "failed", error_message: check.error || "Número inválido", device_id: activeDevice.id }).eq("id", contact.id);
              failedCount++;
              if (failedCount % 5 === 0) await serviceClient.from("campaigns").update({ failed_count: failedCount }).eq("id", campaignId);
              if (check.error === "WhatsApp desconectado") {
                const didPause = await handleDisconnectPause(serviceClient, campaignId, deviceIds, failedCount, campaign.name, campaign.user_id, pauseOnDisconnect);
                if (didPause) break;
                // If not paused, just skip this contact and continue
              }
              continue;
            }

            if (sendAllMode && messageVariants.length > 1) {
              let allSendFailed = false;
              let lastSendError = "";
              for (let mi = 0; mi < messageVariants.length; mi++) {
                const allMsg = replaceVariables(messageVariants[mi], contact, rand4, rand3);
                const result = await sendWithRetry(activeBaseUrl, activeToken, normalizedPhone, allMsg, mi === 0 ? mediaUrl : null, mi === 0 ? campaignButtons : [], msgType);
                if (!result.success) {
                  allSendFailed = true;
                  lastSendError = result.error || "";
                  const translated = translateErrorMessage(lastSendError);
                  await serviceClient.from("campaign_contacts").update({ status: "failed", error_message: `${translated} (${result.attempts} tentativas)`, device_id: activeDevice.id }).eq("id", contact.id);
                  failedCount++;
                  if (failedCount % 5 === 0) await serviceClient.from("campaigns").update({ failed_count: failedCount }).eq("id", campaignId);
                  if (isDisconnectError(lastSendError)) {
                    const didPause = await handleDisconnectPause(serviceClient, campaignId, deviceIds, failedCount, campaign.name, campaign.user_id, pauseOnDisconnect);
                    if (didPause) break;
                  }
                  break;
                }
                if (mi < messageVariants.length - 1) {
                  await new Promise(r => setTimeout(r, randomBetween(minDelayMs, maxDelayMs)));
                }
              }
              if (allSendFailed) {
                // FIX: Check actual error instead of dead isDisconnectError("")
                if (isDisconnectError(lastSendError)) break;
                continue;
              }
            } else {
              const result = await sendWithRetry(activeBaseUrl, activeToken, normalizedPhone, personalizedMessage, mediaUrl, campaignButtons, msgType);
              if (!result.success) {
                const translated = translateErrorMessage(result.error || "Erro");
                await serviceClient.from("campaign_contacts").update({ status: "failed", error_message: `${translated} (${result.attempts} tentativas)`, device_id: activeDevice.id }).eq("id", contact.id);
                failedCount++;
                if (failedCount % 5 === 0) await serviceClient.from("campaigns").update({ failed_count: failedCount }).eq("id", campaignId);
                if (isDisconnectError(result.error || "")) {
                  const didPause = await handleDisconnectPause(serviceClient, campaignId, deviceIds, failedCount, campaign.name, campaign.user_id, pauseOnDisconnect);
                  if (didPause) break;
                }
                continue;
              }
            }
            await serviceClient.from("campaign_contacts").update({ status: "sent", sent_at: new Date().toISOString(), device_id: activeDevice.id }).eq("id", contact.id);
            sentCount++;
            batchSent++;
            instanceMsgCount++;
            msgsSincePause++;
            if (batchSent % 5 === 0) await serviceClient.from("campaigns").update({ sent_count: sentCount, delivered_count: sentCount, failed_count: failedCount }).eq("id", campaignId);

            const isLastContact = contacts.indexOf(contact) === contacts.length - 1;
            if (!isLastContact) {
              const apiElapsed = Date.now() - sendStartTime;
              const targetDelay = randomBetween(minDelayMs, maxDelayMs);
              const actualDelay = Math.max(500, targetDelay - apiElapsed);
              console.log(`✅ Sent to ${phone} via ${activeDevice.name} | batch=${batchSent} sincePause=${msgsSincePause}/${pauseAfter} | wait=${Math.round(actualDelay / 1000)}s`);
              await new Promise(resolve => setTimeout(resolve, actualDelay));
            }

            if (msgsSincePause >= pauseAfter) {
              const pauseDuration = randomBetween(pauseDurMinMs, pauseDurMaxMs);
              console.log(`Pausing for ${Math.round(pauseDuration / 1000)}s after ${msgsSincePause} msgs`);

              if (Date.now() - startTime + pauseDuration > MAX_EXECUTION_MS) {
                needsContinue = true;
                pendingPauseMs = pauseDuration;
                msgsSincePause = 0;
                pauseAfter = Math.round(randomBetween(pauseEveryMin, pauseEveryMax));
                break;
              }

              await new Promise(resolve => setTimeout(resolve, pauseDuration));
              await heartbeatLock(serviceClient, campaignId);
              msgsSincePause = 0;
              pauseAfter = Math.round(randomBetween(pauseEveryMin, pauseEveryMax));
            }
          } catch (err) {
            const translated = translateErrorMessage(err.message || "Erro");
            await serviceClient.from("campaign_contacts").update({ status: "failed", error_message: translated }).eq("id", contact.id);
            failedCount++;
            await serviceClient.from("campaigns").update({ failed_count: failedCount }).eq("id", campaignId);
            if (isDisconnectError(err.message || "")) {
              const didPause = await handleDisconnectPause(serviceClient, campaignId, deviceIds, failedCount, campaign.name, campaign.user_id, pauseOnDisconnect);
              if (didPause) break;
            }
          }
        }
      }

      // Check continuation
      const { data: finalCampaign } = await serviceClient.from("campaigns").select("status").eq("id", campaignId).single();

      if (finalCampaign && finalCampaign.status === "running") {
        const { count } = await serviceClient.from("campaign_contacts").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", "pending");

        if ((count || 0) > 0) {
          console.log(`${count} contacts remaining, self-continuing`);
          await heartbeatLock(serviceClient, campaignId);
          selfContinue(supabaseUrl, serviceRoleKey, campaignId, deviceId, { batchSent, currentDeviceIndex, instanceMsgCount, msgsSincePause, pauseAfter, pendingPauseMs });
        } else {
          // FIX: Use real stats from DB for final completion (not stale local counters)
          const finalStats = await syncCampaignCounters(serviceClient, campaignId);
          await serviceClient.from("campaigns").update({
            status: "completed",
            completed_at: new Date().toISOString(),
          }).eq("id", campaignId);
          await releaseDeviceLocks(serviceClient, deviceIds, campaignId);
          await oplog(serviceClient, campaign.user_id, "campaign_completed", `Campanha "${campaign.name}" concluída`, null, { campaign_id: campaignId, sent: finalStats.sent, failed: finalStats.failed });
          console.log(`Campaign ${campaignId} completed! Sent: ${finalStats.sent}, Failed: ${finalStats.failed}. Locks released.`);
          sendCampaignAlertToWa(serviceClient, campaign.user_id, campaign.name, "completed", finalStats);
          startNextQueuedCampaigns(serviceClient, deviceIds, supabaseUrl, serviceRoleKey);
        }
      } else if (finalCampaign && (finalCampaign.status === "paused" || finalCampaign.status === "canceled" || finalCampaign.status === "failed")) {
        await releaseDeviceLocks(serviceClient, deviceIds, campaignId);
        startNextQueuedCampaigns(serviceClient, deviceIds, supabaseUrl, serviceRoleKey);
      }

      return new Response(JSON.stringify({
        success: true,
        sent: sentCount,
        failed: failedCount,
        status: finalCampaign?.status || "running",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── STATUS ───
    if (action === "status") {
      const { data: campaign } = await supabase.from("campaigns").select("id, name, status, message_type, total_contacts, sent_count, delivered_count, failed_count, started_at, completed_at, created_at, updated_at, device_id").eq("id", campaignId).single();
      const { data: contacts } = await supabase.from("campaign_contacts").select("id, phone, name, status, sent_at, error_message").eq("campaign_id", campaignId);
      return new Response(JSON.stringify({ campaign, contacts }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const translated = translateErrorMessage(err.message || "Erro interno");
    console.error("Process campaign error:", translated);
    return new Response(JSON.stringify({ error: translated }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
