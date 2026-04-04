// ══════════════════════════════════════════════════════════
// VPS Engine — Campaign Worker
// Continuous loop processor — replaces Edge Function self-invocation
// Handles: text, media, carousel, buttons, variables, rotation, delays
// ══════════════════════════════════════════════════════════

import { getDb } from "./db";
import { createLogger } from "./lib/logger";
import { config } from "./config";
import { DeviceLockManager } from "./lib/device-lock-manager";
import { acquireGlobalSlot, releaseGlobalSlot } from "./lib/global-semaphore";

const log = createLogger("campaign");

const API_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MIN_MS = 20_000;
const RETRY_DELAY_MAX_MS = 60_000;
const CONNECTED_STATUSES = ["Ready", "Connected", "authenticated", "open", "active", "online"];

export let lastCampaignWorkerTickAt: Date | null = null;
const activeCampaigns = new Set<string>();

export function getCampaignWorkerStatus() {
  return { lastTick: lastCampaignWorkerTickAt, activeCampaigns: Array.from(activeCampaigns) };
}

// ── Utilities ──
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();

function secureRandom(): number {
  const bytes = new Uint8Array(4);
  globalThis.crypto?.getRandomValues?.(bytes) ?? (bytes[0] = Math.random() * 256, bytes[1] = Math.random() * 256, bytes[2] = Math.random() * 256, bytes[3] = Math.random() * 256);
  return ((bytes[0] << 24 | bytes[1] << 16 | bytes[2] << 8 | bytes[3]) >>> 0) / 0x100000000;
}

function randomBetween(min: number, max: number): number {
  const effectiveMin = Math.min(min, max);
  const effectiveMax = Math.max(min, max);
  return effectiveMin + secureRandom() * (effectiveMax - effectiveMin);
}

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

// ── UAZAPI Communication ──
async function uazapiRequest(baseUrl: string, token: string, endpoint: string, payload: any, method: "POST" | "GET" = "POST") {
  let url = `${baseUrl}${endpoint}`;
  const headers: Record<string, string> = { token, Accept: "application/json" };
  let fetchOptions: RequestInit;

  if (method === "GET") {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined && value !== null) params.append(key, String(value));
    }
    url += `?${params.toString()}`;
    fetchOptions = { method: "GET", headers };
  } else {
    headers["Content-Type"] = "application/json";
    fetchOptions = { method: "POST", headers, body: JSON.stringify(payload) };
  }

  const res = await fetchWithTimeout(url, fetchOptions);
  const text = await res.text();

  if (res.status === 405 && method === "POST") {
    return uazapiRequest(baseUrl, token, endpoint, payload, "GET");
  }
  if (!res.ok) {
    let errorMsg = `API error ${res.status}`;
    try { const data = JSON.parse(text); errorMsg = data?.message || data?.error || text; } catch { errorMsg = text; }
    throw new Error(errorMsg);
  }
  const parsed = JSON.parse(text);
  if (parsed?.error && typeof parsed.error === "string") throw new Error(parsed.error);
  return parsed;
}

// ── Media & message sending ──
function detectMediaType(url: string): string {
  const lower = (url || "").toLowerCase().split("?")[0];
  if (/\.(ogg|mp3|wav|m4a|aac|opus|mpeg)$/.test(lower)) return "audio";
  if (/\.(mp4|mov|avi|mkv|webm|3gp)$/.test(lower)) return "video";
  if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|csv|txt)$/.test(lower)) return "document";
  return "image";
}

async function sendCaptionedMedia(baseUrl: string, token: string, phone: string, mediaUrl: string, mediaType: string, caption: string) {
  try {
    return await uazapiRequest(baseUrl, token, "/send/media", { number: phone, file: mediaUrl, type: mediaType, caption, ...(mediaType === "image" ? { compress: false } : {}) });
  } catch {
    try {
      return await uazapiRequest(baseUrl, token, "/send/media", { number: phone, media: mediaUrl, type: mediaType, caption, ...(mediaType === "image" ? { compress: false } : {}) });
    } catch (e2) {
      if (mediaType === "image") return await uazapiRequest(baseUrl, token, "/send/image", { number: phone, image: mediaUrl, caption, viewOnce: false });
      throw e2;
    }
  }
}

interface CampaignButton { type: "reply" | "url" | "phone"; text: string; value?: string; }
interface CarouselCard { id?: string; position?: number; text?: string; mediaUrl?: string; mediaType?: string | null; buttons?: any[]; }

function buildMenuChoice(button: CampaignButton, index: number): string | null {
  const text = (button.text || "").trim();
  if (!text) return null;
  if (button.type === "url") { const url = (button.value || "").trim(); return url ? `${text}|url:${url}` : text; }
  if (button.type === "phone") { const phone = (button.value || "").trim(); return phone ? `${text}|call:${phone}` : text; }
  return `${text}|${(button.value || `btn_${index}`).trim()}`;
}

function normalizeCarouselCards(rawCards: unknown): CarouselCard[] {
  if (!Array.isArray(rawCards)) return [];
  return rawCards
    .map((raw, index) => {
      const card = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      const rawButtons = Array.isArray(card.buttons) ? card.buttons : [];
      return {
        id: typeof card.id === "string" ? card.id : `card-${index + 1}`,
        position: typeof card.position === "number" ? card.position : index,
        text: typeof card.text === "string" ? card.text : "",
        mediaUrl: typeof card.mediaUrl === "string" ? card.mediaUrl : "",
        mediaType: typeof card.mediaType === "string" ? card.mediaType : null,
        buttons: rawButtons.map((b: any) => ({ type: b?.type || "reply", text: b?.text || "", value: b?.value || "" })).filter((b: any) => b.text.trim()),
      };
    })
    .filter(c => c.text?.trim() || c.mediaUrl?.trim() || (c.buttons?.length || 0) > 0)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

function normalizeCarouselUrl(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function buildCarouselButton(button: any, index: number) {
  const text = (button.text || "").trim();
  if (!text) return null;
  const type = (button.type || "reply").toLowerCase();
  const rawValue = (button.value || "").trim();
  if (type === "url") { const url = normalizeCarouselUrl(rawValue); return url ? { id: url, label: text, text, url, type: "URL" } : null; }
  if (type === "phone" || type === "call") { return rawValue ? { id: rawValue, label: text, text, phone: rawValue, type: "CALL" } : null; }
  if (type === "copy") return { id: rawValue || text, label: text, text, type: "COPY" };
  return { id: rawValue || `card_btn_${index + 1}`, label: text, text, type: "REPLY" };
}

function buildCarouselChoice(button: any): string | null {
  const text = (button.text || "").trim();
  if (!text) return null;
  const type = (button.type || "reply").toLowerCase();
  const rawValue = (button.value || "").trim();
  if (type === "url") return rawValue ? `${text}|url:${rawValue}` : null;
  if (type === "phone" || type === "call") return rawValue ? `${text}|call:${rawValue}` : null;
  if (type === "copy") return `${text}|copy:${rawValue || text}`;
  return rawValue ? `${text}|${rawValue}` : text;
}

async function sendCarouselMessage(baseUrl: string, token: string, phone: string, body: string, cards: CarouselCard[]) {
  const normalized = normalizeCarouselCards(cards);
  if (normalized.length === 0) throw new Error("Carrossel sem cards configurados.");
  const primaryText = body?.trim() || null;

  const payload = {
    number: phone,
    ...(primaryText ? { text: primaryText } : {}),
    carousel: normalized.map(c => ({
      text: (c.text || "").trim(),
      ...(c.mediaUrl?.trim() ? { image: c.mediaUrl.trim() } : {}),
      buttons: (c.buttons || []).map((b: any, i: number) => buildCarouselButton(b, i)).filter(Boolean),
    })),
  };

  const menuChoices = normalized.flatMap((card, i) => {
    const title = card.text?.trim() || `Card ${i + 1}`;
    const lines = [`[${title}]`];
    if (card.mediaUrl?.trim()) lines.push(`{${card.mediaUrl.trim()}}`);
    lines.push(...(card.buttons || []).map(b => buildCarouselChoice(b)).filter(Boolean) as string[]);
    return lines;
  });

  try {
    return await uazapiRequest(baseUrl, token, "/send/carousel", payload);
  } catch {
    const hasUrlButtons = normalized.some(c => (c.buttons || []).some((b: any) => (b.type || "").toLowerCase() === "url"));
    return await uazapiRequest(baseUrl, token, "/send/menu", {
      number: phone,
      type: hasUrlButtons ? "list" : "carousel",
      ...(primaryText ? { text: primaryText } : {}),
      choices: menuChoices,
    });
  }
}

async function sendUazapiMessage(baseUrl: string, token: string, to: string, body: string, mediaUrl?: string | null, buttons?: CampaignButton[], messageType?: string, carouselCards?: CarouselCard[]) {
  const isLid = to.includes("@lid");
  const phone = isLid ? `${to.replace("@lid", "")}@lid` : to.replace(/\D/g, "");
  const text = typeof body === "string" ? body.trim() : "";
  const hasButtons = buttons && buttons.length > 0;
  const choices = hasButtons ? buttons.map((b, i) => buildMenuChoice(b, i)).filter(Boolean) as string[] : [];
  const normalizedCards = normalizeCarouselCards(carouselCards);

  if (messageType === "carousel") return await sendCarouselMessage(baseUrl, token, phone, text, normalizedCards);

  if (choices.length > 0) {
    if (!text) throw new Error("Mensagens com botão exigem copy/texto principal.");
    const mediaType = mediaUrl ? detectMediaType(mediaUrl) : null;
    const isAudio = mediaType === "audio";
    const hasVisual = !!mediaUrl && !isAudio;

    if (hasVisual && mediaUrl) {
      await sendCaptionedMedia(baseUrl, token, phone, mediaUrl, mediaType || "image", "");
      await sleep(1500 + Math.random() * 1500);
      await uazapiRequest(baseUrl, token, "/send/menu", { number: phone, type: "button", text, choices });
      return;
    }
    await uazapiRequest(baseUrl, token, "/send/menu", { number: phone, type: "button", text, choices });
    if (isAudio && mediaUrl) {
      await sleep(1500 + Math.random() * 1500);
      await uazapiRequest(baseUrl, token, "/send/media", { number: phone, type: "ptt", file: mediaUrl });
    }
    return;
  }

  if (mediaUrl) {
    const mediaType = detectMediaType(mediaUrl);
    if (mediaType === "audio") {
      if (text) { await uazapiRequest(baseUrl, token, "/send/text", { number: phone, text }); await sleep(1500 + Math.random() * 1500); }
      return await uazapiRequest(baseUrl, token, "/send/media", { number: phone, type: "ptt", file: mediaUrl });
    }
    return await sendCaptionedMedia(baseUrl, token, phone, mediaUrl, mediaType, text);
  }

  return await uazapiRequest(baseUrl, token, "/send/text", { number: phone, text });
}

// ── Error classification ──
function isDisconnectError(msg: string): boolean {
  const l = msg.toLowerCase();
  return ["disconnected", "not connected", "qr code", "logout", "unauthorized", "401", "session", "not authenticated", "desconectado"].some(t => l.includes(t));
}
function isTemporaryError(msg: string): boolean {
  const l = msg.toLowerCase();
  if (isDisconnectError(l)) return false;
  if (l === "not found." || l === "not found" || l.includes("not on whats") || l.includes("not registered") || l.includes("not_exists")) return false;
  return ["timeout", "timed out", "econnreset", "econnrefused", "network", "socket", "fetch failed", "503", "502", "429", "rate limit", "temporarily", "internal server error", "500"].some(t => l.includes(t));
}
function translateErrorMessage(msg: string): string {
  if (isDisconnectError(msg)) return "WhatsApp desconectado";
  if (msg.toLowerCase() === "not found." || msg.toLowerCase().includes("user not found")) return "Número não encontrado no WhatsApp";
  if (msg.includes("not on Whats") || msg.includes("not registered") || msg.includes("not_exists")) return "Número inválido";
  return msg;
}

async function sendWithRetry(baseUrl: string, token: string, to: string, body: string, mediaUrl?: string | null, buttons?: CampaignButton[], messageType?: string, carouselCards?: CarouselCard[]): Promise<{ success: boolean; attempts: number; error?: string }> {
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      await sendUazapiMessage(baseUrl, token, to, body, mediaUrl, buttons, messageType, carouselCards);
      return { success: true, attempts: attempt };
    } catch (err: any) {
      lastError = err.message || "Erro";
      if (!isTemporaryError(lastError) || attempt > MAX_RETRIES) return { success: false, attempts: attempt, error: lastError };
      await sleep(RETRY_DELAY_MIN_MS + secureRandom() * (RETRY_DELAY_MAX_MS - RETRY_DELAY_MIN_MS));
    }
  }
  return { success: false, attempts: MAX_RETRIES + 1, error: lastError };
}

async function checkNumberExists(baseUrl: string, token: string, phone: string): Promise<{ exists: boolean; error?: string }> {
  try {
    const result = await uazapiRequest(baseUrl, token, "/check/exist", { number: phone });
    if (result?.exists === false || result?.numberExists === false || result?.status === "not_exists") return { exists: false, error: "Número inválido" };
    return { exists: true };
  } catch (err: any) {
    if (isDisconnectError(err.message || "")) return { exists: false, error: "WhatsApp desconectado" };
    return { exists: true }; // Assume exists on error
  }
}

// ── Variable replacement ──
function normalizeBrazilianPhone(phone: string): string {
  const raw = phone.replace(/\D/g, "");
  if ((raw.length === 10 || raw.length === 11) && !raw.startsWith("55")) return `55${raw}`;
  return raw;
}

function generateUniqueRand4(usedSet: Set<string>): string {
  let v: string;
  do { v = String(Math.floor(secureRandom() * 10000)).padStart(4, "0"); } while (usedSet.has(v) && usedSet.size < 10000);
  usedSet.add(v); return v;
}

function generateUniqueRand3(usedSet: Set<string>): string {
  let v: string;
  do { v = Array.from({ length: 3 }, () => String.fromCharCode(97 + Math.floor(secureRandom() * 26))).join(""); } while (usedSet.has(v) && usedSet.size < 17576);
  usedSet.add(v); return v;
}

function replaceVariables(template: string, contact: any, rand4: string, rand3: string): string {
  // Se name estiver vazio/null, {{nome}} fica vazio (consistente com Edge Function)
  const contactName = (contact.name && contact.name.trim() && contact.name.trim() !== contact.phone) ? contact.name.trim() : "";
  return template
    .replace(/\{\{nome\}\}/gi, contactName)
    .replace(/\{\{numero\}\}/gi, contact.phone || "")
    .replace(/\{\{telefone\}\}/gi, contact.phone || "")
    .replace(/\{\{rand4\}\}/gi, rand4)
    .replace(/\{\{rand3\}\}/gi, rand3)
    .replace(/\{\{var1\}\}/gi, contact.var1 || "").replace(/\{\{var2\}\}/gi, contact.var2 || "")
    .replace(/\{\{var3\}\}/gi, contact.var3 || "").replace(/\{\{var4\}\}/gi, contact.var4 || "")
    .replace(/\{\{var5\}\}/gi, contact.var5 || "").replace(/\{\{var6\}\}/gi, contact.var6 || "")
    .replace(/\{\{var7\}\}/gi, contact.var7 || "").replace(/\{\{var8\}\}/gi, contact.var8 || "")
    .replace(/\{\{var9\}\}/gi, contact.var9 || "").replace(/\{\{var10\}\}/gi, contact.var10 || "");
}

// ── Operation log ──
async function oplog(sb: any, userId: string, event: string, details: string, deviceId?: string | null, meta?: any) {
  try { await sb.from("operation_logs").insert({ user_id: userId, device_id: deviceId || null, event, details, meta: meta || {} }); } catch {}
}

// ── WhatsApp alert ──
async function sendCampaignAlertToWa(sb: any, userId: string, campaignName: string, status: string, stats?: any) {
  try {
    const { data: cfg } = await sb.from("report_wa_configs").select("device_id, group_id, campaigns_group_id, toggle_campaigns").eq("user_id", userId).single();
    if (!cfg?.toggle_campaigns || !cfg?.device_id) return;
    const targetGroup = cfg.campaigns_group_id || cfg.group_id;
    if (!targetGroup) return;
    const { data: dev } = await sb.from("devices").select("uazapi_base_url, uazapi_token").eq("id", cfg.device_id).single();
    if (!dev?.uazapi_base_url || !dev?.uazapi_token) return;
    const nowBRT = new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
    const s = stats || {};
    let msg = "";
    if (status === "paused") msg = `⏸ CAMPANHA PAUSADA\n\nCampanha: ${campaignName}\n📊 Enviadas: ${s.sent || 0}/${s.total || 0}\n⏱ ${nowBRT}`;
    else if (status === "canceled") msg = `🚫 CAMPANHA CANCELADA\n\nCampanha: ${campaignName}\n👥 Total: ${s.total || 0}\n✅ Enviadas: ${s.sent || 0}\n❌ Falhas: ${s.failed || 0}\n⏱ ${nowBRT}`;
    else if (status === "completed") msg = `📣 CAMPANHA FINALIZADA\n\nCampanha: ${campaignName}\n👥 Total: ${s.total || 0}\n✅ Enviadas: ${s.sent || 0}\n📬 Entregues: ${s.delivered || 0}\n❌ Falhas: ${s.failed || 0}\n⏱ ${nowBRT}`;
    if (!msg) return;
    const res = await fetch(`${dev.uazapi_base_url}/chat/send-text`, { method: "POST", headers: { token: dev.uazapi_token, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ chatId: targetGroup, text: msg }) });
    await res.text();
  } catch {}
}

// ── Stats ──
async function getRealCampaignStats(sb: any, campaignId: string) {
  const { data } = await sb.from("campaign_contacts").select("status").eq("campaign_id", campaignId);
  const rows = data || [];
  let sent = 0, failed = 0, pending = 0;
  for (const r of rows) {
    if (r.status === "sent") sent++;
    else if (r.status === "failed") failed++;
    else if (r.status === "pending" || r.status === "processing") pending++;
  }
  return { sent, failed, delivered: sent, total: rows.length, pending };
}

// ── Lock helpers ──
async function acquireDeviceLock(sb: any, deviceId: string, campaignId: string, userId: string): Promise<boolean> {
  const { data } = await sb.rpc("acquire_device_lock", { _device_id: deviceId, _campaign_id: campaignId, _user_id: userId, _stale_seconds: 300 });
  return data === true;
}

async function releaseDeviceLock(sb: any, deviceId: string, campaignId: string) {
  await sb.from("campaign_device_locks").delete().eq("campaign_id", campaignId).eq("device_id", deviceId);
}

function getCampaignDeviceIds(campaign: any): string[] {
  if (Array.isArray(campaign.device_ids) && campaign.device_ids.length > 0) return campaign.device_ids;
  if (campaign.device_id) return [campaign.device_id];
  return [];
}

async function deriveCampaignResumeState(sb: any, campaignId: string, devices: any[], messagesPerInstance: number) {
  let currentDeviceId: string | null = devices.length > 0 ? devices[0].id : null;
  let instanceMsgCount = 0;

  try {
    // Get the last N sent messages to count the current consecutive window on the last device
    const { data: recentSent } = await sb.from("campaign_contacts")
      .select("device_id")
      .eq("campaign_id", campaignId)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(messagesPerInstance + 5);

    if (!recentSent?.length || !recentSent[0].device_id) {
      return { currentDeviceId, instanceMsgCount };
    }

    const lastDeviceId = recentSent[0].device_id;
    const lastIdx = devices.findIndex((device: any) => device.id === lastDeviceId);

    // If last device is no longer in pool, start fresh on first available device
    if (lastIdx < 0) {
      log.info(`Campaign ${campaignId.slice(0, 8)}: last device ${lastDeviceId.slice(0, 8)} no longer in pool — starting fresh`);
      return { currentDeviceId, instanceMsgCount: 0 };
    }

    // Count consecutive messages sent by the last device (current window)
    let consecutiveCount = 0;
    for (const row of recentSent) {
      if (row.device_id === lastDeviceId) consecutiveCount++;
      else break;
    }

    const shouldRotate = consecutiveCount >= messagesPerInstance;

    if (shouldRotate && devices.length > 1) {
      const nextIdx = (lastIdx + 1) % devices.length;
      currentDeviceId = devices[nextIdx].id;
      instanceMsgCount = 0;
      log.info(`Campaign ${campaignId.slice(0, 8)}: resumed — rotating to device ${devices[nextIdx]?.name} (previous device completed ${consecutiveCount} consecutive msgs)`);
    } else {
      currentDeviceId = lastDeviceId;
      instanceMsgCount = consecutiveCount;
      log.info(`Campaign ${campaignId.slice(0, 8)}: resumed on device ${devices[lastIdx]?.name} (${instanceMsgCount}/${messagesPerInstance} msgs in current window)`);
    }
  } catch (error: any) {
    log.warn(`Campaign ${campaignId.slice(0, 8)}: failed to derive resume state: ${error.message}`);
  }

  return { currentDeviceId, instanceMsgCount };
}

async function syncCampaignRuntimeDevices(
  sb: any,
  campaignId: string,
  userId: string,
  lockedDeviceIds: string[],
  desiredDeviceIds?: string[],
) {
  const targetDeviceIds = Array.isArray(desiredDeviceIds)
    ? desiredDeviceIds
    : getCampaignDeviceIds((await sb.from("campaigns").select("device_id, device_ids").eq("id", campaignId).single()).data || {});

  const desiredSet = new Set(targetDeviceIds);

  for (const lockedId of [...lockedDeviceIds]) {
    if (desiredSet.has(lockedId)) continue;

    await releaseDeviceLock(sb, lockedId, campaignId);
    DeviceLockManager.release(lockedId, campaignId);
    const idx = lockedDeviceIds.indexOf(lockedId);
    if (idx >= 0) lockedDeviceIds.splice(idx, 1);
    log.info(`Campaign ${campaignId.slice(0, 8)}: device ${lockedId.slice(0, 8)} removed from live pool`);
  }

  for (const targetId of targetDeviceIds) {
    if (lockedDeviceIds.includes(targetId)) continue;

    const acquired = DeviceLockManager.tryAcquire(targetId, "campaign", campaignId);
    if (!acquired) {
      const blockReason = DeviceLockManager.getBlockingReason(targetId, "campaign");
      log.warn(`Campaign ${campaignId.slice(0, 8)}: live add blocked for device ${targetId.slice(0, 8)} by ${blockReason}`);
      continue;
    }

    const dbLocked = await acquireDeviceLock(sb, targetId, campaignId, userId);
    if (!dbLocked) {
      DeviceLockManager.release(targetId, campaignId);
      log.warn(`Campaign ${campaignId.slice(0, 8)}: DB lock failed while adding device ${targetId.slice(0, 8)}`);
      continue;
    }

    lockedDeviceIds.push(targetId);
    log.info(`Campaign ${campaignId.slice(0, 8)}: device ${targetId.slice(0, 8)} added to live pool`);
  }

  const activeIds = targetDeviceIds.filter((id) => lockedDeviceIds.includes(id));
  if (activeIds.length === 0) return [];

  const { data: devicesRaw } = await sb.from("devices")
    .select("id, name, uazapi_token, uazapi_base_url, status")
    .in("id", activeIds);

  const deviceMap = new Map((devicesRaw || []).map((device: any) => [device.id, device]));

  return activeIds
    .map((id) => deviceMap.get(id))
    .filter((device: any) => device && device.uazapi_token && device.uazapi_base_url && CONNECTED_STATUSES.includes(device.status));
}

class RandomPicker {
  private queue: number[] = [];
  private lastPicked = -1;
  constructor(private total: number) {}

  private shuffle(): number[] {
    const arr = Array.from({ length: this.total }, (_, i) => i);
    // Fisher-Yates shuffle
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(secureRandom() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    // Ensure first item of new batch != last item of previous batch
    if (this.total > 1 && arr[0] === this.lastPicked) {
      const swapIdx = 1 + Math.floor(secureRandom() * (arr.length - 1));
      [arr[0], arr[swapIdx]] = [arr[swapIdx], arr[0]];
    }
    return arr;
  }

  next(): number {
    if (this.total <= 1) return 0;
    if (this.queue.length === 0) {
      this.queue = this.shuffle();
    }
    const picked = this.queue.shift()!;
    this.lastPicked = picked;
    return picked;
  }
}

// ══════════════════════════════════════════════════════════
// MAIN WORKER: processes ONE campaign at a time
// ══════════════════════════════════════════════════════════
async function processOneCampaign(sb: any, campaign: any, isRunningRef: { value: boolean }) {
  const campaignId = campaign.id;
  const slotLabel = `campaign:${campaignId.slice(0, 8)}`;
  await acquireGlobalSlot(slotLabel);
  activeCampaigns.add(campaignId);
  log.info(`▶ Campaign STARTED ${campaignId.slice(0, 8)}: "${campaign.name}"`);

  const deviceIds = getCampaignDeviceIds(campaign);
  if (deviceIds.length === 0) {
    log.warn(`Campaign ${campaignId.slice(0, 8)}: no devices`);
    await sb.from("campaigns").update({ status: "paused", updated_at: nowIso() }).eq("id", campaignId);
    activeCampaigns.delete(campaignId);
    releaseGlobalSlot(slotLabel);
    return;
  }

  // Acquire global device locks (cross-worker coordination)
  const lockedDeviceIds: string[] = [];
  for (const did of deviceIds) {
    const acquired = DeviceLockManager.tryAcquire(did, "campaign", campaignId);
    if (acquired) {
      lockedDeviceIds.push(did);
    } else {
      const blockReason = DeviceLockManager.getBlockingReason(did, "campaign");
      log.warn(`Campaign ${campaignId.slice(0, 8)}: device ${did.slice(0, 8)} blocked by: ${blockReason}`);
    }
  }

  if (lockedDeviceIds.length === 0) {
    log.warn(`Campaign ${campaignId.slice(0, 8)}: all devices locked by other workers — retrying later`);
    activeCampaigns.delete(campaignId);
    releaseGlobalSlot(slotLabel);
    return;
  }

  // Acquire DB locks
  for (const did of lockedDeviceIds) {
    const locked = await acquireDeviceLock(sb, did, campaignId, campaign.user_id);
    if (!locked) {
      log.warn(`Campaign ${campaignId.slice(0, 8)}: DB device lock failed for ${did}`);
      // Release global locks
      for (const id of lockedDeviceIds) DeviceLockManager.release(id, campaignId);
      await sb.from("campaigns").update({ status: "paused" }).eq("id", campaignId);
      activeCampaigns.delete(campaignId);
      releaseGlobalSlot(slotLabel);
      return;
    }
  }

  let allDevices = await syncCampaignRuntimeDevices(sb, campaignId, campaign.user_id, lockedDeviceIds, deviceIds);

  if (allDevices.length === 0) {
    log.warn(`Campaign ${campaignId.slice(0, 8)}: no connected devices`);
    await sb.from("campaign_contacts").update({ status: "pending" }).eq("campaign_id", campaignId).eq("status", "processing");
    await sb.from("campaigns").update({ status: "paused", updated_at: nowIso() }).eq("id", campaignId);
    await sb.from("campaign_device_locks").delete().eq("campaign_id", campaignId);
    activeCampaigns.delete(campaignId);
    return;
  }

  // Parse campaign settings
  const messageContent = campaign.message_content || "";
  const sendAllMode = messageContent.includes("|&&|");
  const sequentialMode = messageContent.includes("|>>|");
  const messageVariants = sendAllMode ? messageContent.split("|&&|").filter((m: string) => m.trim())
    : sequentialMode ? messageContent.split("|>>|").filter((m: string) => m.trim())
    : messageContent.includes("|||") ? messageContent.split("|||").filter((m: string) => m.trim())
    : [messageContent];

  let mediaUrl: string | null = null;
  if (campaign.media_url) {
    try { const p = JSON.parse(campaign.media_url); mediaUrl = Array.isArray(p) && p.length > 0 ? p[0].url : campaign.media_url; } catch { mediaUrl = campaign.media_url; }
  }
  const campaignButtons: CampaignButton[] = Array.isArray(campaign.buttons) ? campaign.buttons : [];
  const carouselCards = normalizeCarouselCards(campaign.carousel_cards);
  const msgType = campaign.message_type || "texto";
  const pauseOnDisconnect = campaign.pause_on_disconnect !== false;

  // Dynamic settings — re-read from DB each iteration to pick up live edits
  let messagesPerInstance = Math.max(campaign.messages_per_instance || 50, 1);
  let minDelayMs = (campaign.min_delay_seconds || 8) * 1000;
  let maxDelayMs = (campaign.max_delay_seconds || 25) * 1000;
  let pauseEveryMin = campaign.pause_every_min || 10;
  let pauseEveryMax = campaign.pause_every_max || 20;
  let pauseDurMinMs = (campaign.pause_duration_min || 30) * 1000;
  let pauseDurMaxMs = (campaign.pause_duration_max || 120) * 1000;

  const usedRand4 = new Set<string>();
  const usedRand3 = new Set<string>();
  const picker = new RandomPicker(messageVariants.length);

  const resumeState = await deriveCampaignResumeState(sb, campaignId, allDevices, messagesPerInstance);
  let currentDeviceIndex = resumeState.currentDeviceIndex;
  let instanceMsgCount = resumeState.instanceMsgCount;

  let msgsSincePause = 0;
  let pauseAfter = Math.round(randomBetween(pauseEveryMin, pauseEveryMax));
  let heartbeatCounter = 0;
  let sequentialIndex = 0;

  while (isRunningRef.value) {
    // 1. Check campaign status
    const { data: fresh } = await sb.from("campaigns").select("status, device_id, device_ids").eq("id", campaignId).single();

    // Re-read dynamic settings every 5 iterations
    if (heartbeatCounter % 5 === 0) {
      const { data: dynCfg } = await sb.from("campaigns")
        .select("min_delay_seconds, max_delay_seconds, pause_every_min, pause_every_max, pause_duration_min, pause_duration_max, messages_per_instance")
        .eq("id", campaignId).single();
      if (dynCfg) {
        const newMpi = Math.max(dynCfg.messages_per_instance || 50, 1);
        if (newMpi !== messagesPerInstance) log.info(`Campaign ${campaignId.slice(0, 8)}: messages_per_instance changed ${messagesPerInstance} → ${newMpi}`);
        messagesPerInstance = newMpi;
        minDelayMs = (dynCfg.min_delay_seconds || 8) * 1000;
        maxDelayMs = (dynCfg.max_delay_seconds || 25) * 1000;
        pauseEveryMin = dynCfg.pause_every_min || 10;
        pauseEveryMax = dynCfg.pause_every_max || 20;
        pauseDurMinMs = (dynCfg.pause_duration_min || 30) * 1000;
        pauseDurMaxMs = (dynCfg.pause_duration_max || 120) * 1000;
      }
    }

    if (!fresh || !["running"].includes(fresh.status)) {
      log.info(`Campaign ${campaignId.slice(0, 8)} status=${fresh?.status} — stopping`);
      break;
    }

    allDevices = await syncCampaignRuntimeDevices(sb, campaignId, campaign.user_id, lockedDeviceIds, getCampaignDeviceIds(fresh));
    if (allDevices.length === 0) {
      log.warn(`Campaign ${campaignId.slice(0, 8)}: no available devices after live sync — pausing`);
      const stats = await getRealCampaignStats(sb, campaignId);
      await sb.from("campaigns").update({ status: "paused", sent_count: stats.sent, delivered_count: stats.delivered, failed_count: stats.failed, total_contacts: stats.total, updated_at: nowIso() }).eq("id", campaignId);
      await sb.from("campaign_device_locks").delete().eq("campaign_id", campaignId);
      sendCampaignAlertToWa(sb, campaign.user_id, campaign.name, "paused", stats);
      break;
    }
    currentDeviceIndex = currentDeviceIndex % allDevices.length;

    // 2. Heartbeat
    heartbeatCounter++;
    if (heartbeatCounter % 10 === 0) {
      await sb.rpc("heartbeat_device_lock", { _campaign_id: campaignId }).catch(() => {});
    }

    // 3. Get next contact
    const { data: contacts } = await sb.from("campaign_contacts")
      .select("id, phone, name, status, var1, var2, var3, var4, var5, var6, var7, var8, var9, var10")
      .eq("campaign_id", campaignId).eq("status", "pending")
      .order("created_at", { ascending: true }).limit(1);

    if (!contacts?.length) {
      // Check for processing contacts
      const { count: processingCount } = await sb.from("campaign_contacts")
        .select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", "processing");
      if (processingCount && processingCount > 0) { await sleep(5000); continue; }

      // Complete
      const stats = await getRealCampaignStats(sb, campaignId);
      await sb.from("campaigns").update({ status: "completed", completed_at: nowIso(), sent_count: stats.sent, delivered_count: stats.delivered, failed_count: stats.failed, total_contacts: stats.total }).eq("id", campaignId);
      await sb.from("campaign_device_locks").delete().eq("campaign_id", campaignId);
      await oplog(sb, campaign.user_id, "campaign_completed", `Campanha "${campaign.name}" concluída`, null, { campaign_id: campaignId, ...stats });
      sendCampaignAlertToWa(sb, campaign.user_id, campaign.name, "completed", stats);
      log.info(`Campaign ${campaignId.slice(0, 8)} completed: sent=${stats.sent} failed=${stats.failed}`);
      break;
    }

    const contact = contacts[0];

    // 4. Lock contact
    const { data: locked } = await sb.from("campaign_contacts")
      .update({ status: "processing" }).eq("id", contact.id).eq("status", "pending").select("id");
    if (!locked?.length) continue;

    // 5. Pick device (rotation)
    const device = allDevices[currentDeviceIndex % allDevices.length];
    const baseUrl = (device.uazapi_base_url || "").replace(/\/+$/, "");

    // 6. Check device connectivity every 10 contacts
    if (heartbeatCounter % 10 === 0) {
      const { data: devFresh } = await sb.from("devices").select("status").eq("id", device.id).single();
      if (devFresh && !CONNECTED_STATUSES.includes(devFresh.status)) {
        allDevices = allDevices.filter((d: any) => d.id !== device.id);
        if (allDevices.length === 0) {
          if (pauseOnDisconnect) {
            await sb.from("campaign_contacts").update({ status: "pending" }).eq("id", contact.id).eq("status", "processing");
            const stats = await getRealCampaignStats(sb, campaignId);
            await sb.from("campaigns").update({ status: "paused", sent_count: stats.sent, delivered_count: stats.delivered, failed_count: stats.failed, total_contacts: stats.total, updated_at: nowIso() }).eq("id", campaignId);
            await sb.from("campaign_device_locks").delete().eq("campaign_id", campaignId);
            sendCampaignAlertToWa(sb, campaign.user_id, campaign.name, "paused", stats);
          }
          break;
        }
        await sb.from("campaign_contacts").update({ status: "pending" }).eq("id", contact.id).eq("status", "processing");
        continue;
      }
    }

    // 7. Validate number
    const isLid = contact.phone.includes("@lid");
    const phone = isLid ? contact.phone.replace("@lid", "") : contact.phone.replace(/\D/g, "");
    if (!isLid && phone.length < 10) {
      await sb.from("campaign_contacts").update({ status: "failed", error_message: "Número inválido", device_id: device.id }).eq("id", contact.id);
      continue;
    }
    const sendTo = isLid ? phone : normalizeBrazilianPhone(phone);

    if (!isLid) {
      const check = await checkNumberExists(baseUrl, device.uazapi_token, sendTo);
      if (!check.exists) {
        await sb.from("campaign_contacts").update({ status: "failed", error_message: check.error || "Número inválido", device_id: device.id }).eq("id", contact.id);
        if (check.error === "WhatsApp desconectado" && pauseOnDisconnect) {
          allDevices = allDevices.filter((d: any) => d.id !== device.id);
          if (allDevices.length === 0) break;
        }
        continue;
      }
    }

    // 8. Send message
    const rand4 = generateUniqueRand4(usedRand4);
    const rand3 = generateUniqueRand3(usedRand3);
    let success = false;
    let sendError = "";

    if (sendAllMode && messageVariants.length > 1) {
      let allOk = true;
      for (let mi = 0; mi < messageVariants.length; mi++) {
        const msg = replaceVariables(messageVariants[mi], contact, rand4, rand3);
        const result = await sendWithRetry(baseUrl, device.uazapi_token, sendTo, msg, mi === 0 ? mediaUrl : null, mi === 0 ? campaignButtons : [], msgType, mi === 0 ? carouselCards : []);
        if (!result.success) { allOk = false; sendError = result.error || "Erro"; break; }
        if (mi < messageVariants.length - 1) await sleep(randomBetween(minDelayMs, maxDelayMs));
      }
      success = allOk;
    } else {
      const chosenMsg = sequentialMode ? messageVariants[sequentialIndex++ % messageVariants.length] : messageVariants[picker.next()];
      const msg = replaceVariables(chosenMsg, contact, rand4, rand3);
      const result = await sendWithRetry(baseUrl, device.uazapi_token, sendTo, msg, mediaUrl, campaignButtons, msgType, carouselCards);
      success = result.success;
      sendError = result.error || "";
    }

    // 9. Record outcome
    if (success) {
      await sb.from("campaign_contacts").update({ status: "sent", sent_at: nowIso(), error_message: null, device_id: device.id }).eq("id", contact.id);
      instanceMsgCount++;
      msgsSincePause++;
    } else {
      const translated = translateErrorMessage(sendError);
      await sb.from("campaign_contacts").update({ status: "failed", error_message: translated, device_id: device.id }).eq("id", contact.id);
      if (isDisconnectError(sendError) && pauseOnDisconnect) {
        allDevices = allDevices.filter((d: any) => d.id !== device.id);
        if (allDevices.length === 0) {
          const stats = await getRealCampaignStats(sb, campaignId);
          await sb.from("campaigns").update({ status: "paused", sent_count: stats.sent, delivered_count: stats.delivered, failed_count: stats.failed, total_contacts: stats.total, updated_at: nowIso() }).eq("id", campaignId);
          await sb.from("campaign_device_locks").delete().eq("campaign_id", campaignId);
          sendCampaignAlertToWa(sb, campaign.user_id, campaign.name, "paused", stats);
          break;
        }
      }
    }

    // 10. Update campaign counters periodically
    if (heartbeatCounter % 5 === 0) {
      const stats = await getRealCampaignStats(sb, campaignId);
      await sb.from("campaigns").update({ sent_count: stats.sent, delivered_count: stats.delivered, failed_count: stats.failed, total_contacts: stats.total, updated_at: nowIso() }).eq("id", campaignId);
    }

    // 11. Instance rotation
    if (allDevices.length > 1 && instanceMsgCount >= messagesPerInstance) {
      currentDeviceIndex = (currentDeviceIndex + 1) % allDevices.length;
      instanceMsgCount = 0;
      log.info(`Campaign ${campaignId.slice(0, 8)}: rotated to device ${allDevices[currentDeviceIndex % allDevices.length]?.name}`);
    }

    // 12. Block pause — sleep in chunks to detect pause/cancel faster
    if (msgsSincePause >= pauseAfter) {
      const pauseMs = randomBetween(pauseDurMinMs, pauseDurMaxMs);
      log.info(`Campaign ${campaignId.slice(0, 8)}: block pause ${Math.round(pauseMs / 1000)}s`);
      msgsSincePause = 0;
      pauseAfter = Math.round(randomBetween(pauseEveryMin, pauseEveryMax));
      let remainingPause = pauseMs;
      let pauseAborted = false;
      while (remainingPause > 0 && isRunningRef.value) {
        const chunk = Math.min(remainingPause, 3000);
        await sleep(chunk);
        remainingPause -= chunk;
        const { data: pauseCheck } = await sb.from("campaigns").select("status").eq("id", campaignId).single();
        if (!pauseCheck || !["running"].includes(pauseCheck.status)) {
          log.info(`Campaign ${campaignId.slice(0, 8)}: detected ${pauseCheck?.status} during block pause — stopping`);
          pauseAborted = true;
          break;
        }
      }
      if (pauseAborted) break;
      continue;
    }

    // 13. Normal delay (random within configured range) — split into chunks to detect pause faster
    const delayMs = Math.round(randomBetween(minDelayMs, maxDelayMs));
    log.info(`Campaign ${campaignId.slice(0, 8)}: delay ${Math.round(delayMs / 1000)}s (range ${Math.round(minDelayMs / 1000)}-${Math.round(maxDelayMs / 1000)}s)`);
    // Sleep in 3s chunks, checking for pause/cancel between chunks
    let remainingDelay = delayMs;
    while (remainingDelay > 0 && isRunningRef.value) {
      const chunk = Math.min(remainingDelay, 3000);
      await sleep(chunk);
      remainingDelay -= chunk;
      if (remainingDelay > 0) {
        const { data: midCheck } = await sb.from("campaigns").select("status").eq("id", campaignId).single();
        if (!midCheck || !["running"].includes(midCheck.status)) {
          log.info(`Campaign ${campaignId.slice(0, 8)}: detected ${midCheck?.status} during delay — stopping`);
          remainingDelay = 0;
          break;
        }
      }
    }
  }

  // Release global device locks
  for (const did of lockedDeviceIds) DeviceLockManager.release(did, campaignId);
  activeCampaigns.delete(campaignId);
  releaseGlobalSlot(`campaign:${campaignId.slice(0, 8)}`);
  log.info(`■ Campaign FINISHED ${campaignId.slice(0, 8)}: "${campaign.name}"`);
}

// ══════════════════════════════════════════════════════════
// TICK: finds active campaigns and processes them IN PARALLEL
// Up to MAX_PARALLEL campaigns concurrently, respecting device conflicts.
// ══════════════════════════════════════════════════════════

// ── NO LIMIT: all campaigns run freely in parallel ──
const MAX_PARALLEL_CAMPAIGNS = 999;

export async function campaignWorkerTick(isRunningRef: { value: boolean }) {
  const db = getDb();

  // Reset stale processing contacts (use updated_at, not created_at)
  const staleThreshold = new Date(Date.now() - 5 * 60_000).toISOString();
  await db.from("campaign_contacts")
    .update({ status: "pending" })
    .eq("status", "processing")
    .lt("updated_at", staleThreshold);

  // Find running campaigns
  const { data: campaigns } = await db.from("campaigns")
    .select("*")
    .eq("status", "running")
    .order("started_at", { ascending: true })
    .limit(10);

  if (!campaigns?.length) return;

  // Filter: skip campaigns already being processed in a previous tick
  const eligible = campaigns.filter(c => !activeCampaigns.has(c.id));
  if (eligible.length === 0) {
    log.info(`All ${campaigns.length} campaigns already active — waiting`);
    return;
  }

  // Pre-check: complete campaigns with zero pending contacts quickly
  const toProcess: typeof eligible = [];
  for (const campaign of eligible) {
    const { count } = await db.from("campaign_contacts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id).eq("status", "pending");

    if (Number(count || 0) === 0) {
      const stats = await getRealCampaignStats(db, campaign.id);
      await db.from("campaigns").update({ status: "completed", completed_at: nowIso(), sent_count: stats.sent, delivered_count: stats.delivered, failed_count: stats.failed, total_contacts: stats.total }).eq("id", campaign.id);
      await db.from("campaign_device_locks").delete().eq("campaign_id", campaign.id);
      log.info(`Campaign ${campaign.id.slice(0, 8)} auto-completed (0 pending)`);
      continue;
    }
    toProcess.push(campaign);
  }

  if (toProcess.length === 0) return;

  // Determine which campaigns can run in parallel (device conflict check)
  const devicesInUse = new Set<string>();
  const batch: typeof toProcess = [];

  for (const campaign of toProcess) {
    if (batch.length >= MAX_PARALLEL_CAMPAIGNS) {
      log.info(`Campaign ${campaign.id.slice(0, 8)}: ⏳ waiting slot (max ${MAX_PARALLEL_CAMPAIGNS} parallel)`);
      break;
    }

    // ── NO DEVICE CONFLICT CHECK: allow same device in multiple campaigns ──
    const deviceIds = getCampaignDeviceIds(campaign);

    // Reserve devices for this batch
    deviceIds.forEach(did => devicesInUse.add(did));
    batch.push(campaign);
  }

  if (batch.length === 0) return;

  log.info(`▶▶ Processing ${batch.length} campaigns in parallel (of ${toProcess.length} eligible, ${campaigns!.length - eligible.length} already active)`);

  // Execute batch in parallel with per-task timing
  const results = await Promise.allSettled(
    batch.map(async (campaign) => {
      if (!isRunningRef.value) return;
      const t0 = Date.now();
      try {
        await processOneCampaign(db, campaign, isRunningRef);
        log.info(`■ Campaign ${campaign.id.slice(0, 8)} completed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      } catch (err: any) {
        log.error(`Campaign ${campaign.id.slice(0, 8)} failed after ${((Date.now() - t0) / 1000).toFixed(1)}s: ${err.message}`);
      }
    })
  );

  // Log results
  const fulfilled = results.filter(r => r.status === "fulfilled").length;
  const rejected = results.filter(r => r.status === "rejected").length;
  if (rejected > 0) log.warn(`Batch result: ${fulfilled} ok, ${rejected} failed`);

  lastCampaignWorkerTickAt = new Date();
}
