// ══════════════════════════════════════════════════════════
// VPS Engine — Welcome Message Worker
// Monitors groups for new participants and sends welcome messages
// Supports: text, buttons, carousel
// ══════════════════════════════════════════════════════════

import { getDb } from "./db";
import { createLogger } from "./lib/logger";
import { DeviceLockManager } from "./lib/device-lock-manager";

const log = createLogger("welcome");
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const randomBetween = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const nowIso = () => new Date().toISOString();

// ── Tracking ──
export let lastWelcomeTickAt: Date | null = null;
let isProcessing = false;

export function getWelcomeStatus() {
  return { lastTick: lastWelcomeTickAt, isProcessing };
}

// ── In-memory cache for group participants ──
const participantSnapshots = new Map<string, { participants: Set<string>; fetchedAt: number }>();
const SNAPSHOT_TTL_MS = 60_000;

// ── Known participants per automation (to detect NEW members only) ──
const knownParticipants = new Map<string, Set<string>>();

const API_TIMEOUT_MS = 20_000;

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = API_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error: any) {
    if (error.name === "AbortError") throw new Error(`Timeout: ${Math.round(timeoutMs / 1000)}s`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function buildHeaders(token: string): Record<string, string> {
  return { token, Accept: "application/json", "Content-Type": "application/json", "Cache-Control": "no-cache" };
}

function extractParticipantPhones(data: any): Set<string> {
  const phones = new Set<string>();
  const items = Array.isArray(data) ? data : data?.Participants || data?.participants || data?.members || [];
  if (!Array.isArray(items)) return phones;
  for (const item of items) {
    const raw = item?.id || item?.jid || item?.JID || item?.PhoneNumber || item?.phoneNumber || item?.phone || item?.number || item?.wid || "";
    const digits = String(raw).replace(/@.*$/, "").replace(/[^0-9]/g, "");
    if (digits.length >= 10 && digits.length <= 15) phones.add(digits);
  }
  return phones;
}

async function fetchGroupParticipants(baseUrl: string, token: string, groupId: string): Promise<Set<string>> {
  const cacheKey = `${baseUrl}::${groupId}`;
  const cached = participantSnapshots.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < SNAPSHOT_TTL_MS) return cached.participants;

  const participants = new Set<string>();

  // Strategy 1: group/list
  try {
    const res = await fetchWithTimeout(`${baseUrl}/group/list?GetParticipants=true&count=500`, { headers: buildHeaders(token) });
    if (res.ok) {
      const body: any = await res.json();
      const groups = Array.isArray(body) ? body : body?.groups || body?.data || [];
      const target = groups.find((g: any) => (g?.JID || g?.jid || g?.id || "") === groupId);
      if (target) {
        const extracted = extractParticipantPhones(target);
        extracted.forEach(p => participants.add(p));
      }
    }
  } catch { /* fallback */ }

  if (participants.size === 0) {
    // Strategy 2: group info
    try {
      const res = await fetchWithTimeout(`${baseUrl}/group/info`, {
        method: "POST",
        headers: buildHeaders(token),
        body: JSON.stringify({ groupJid: groupId }),
      });
      if (res.ok) {
        const body: any = await res.json();
        const extracted = extractParticipantPhones(body?.group || body?.data || body);
        extracted.forEach(p => participants.add(p));
      }
    } catch { /* continue */ }
  }

  if (participants.size > 0) {
    participantSnapshots.set(cacheKey, { participants, fetchedAt: Date.now() });
  }
  return participants;
}

// ══════════════════════════════════════════════════════════
// UAZAPI Communication (reused patterns from campaign-worker)
// ══════════════════════════════════════════════════════════

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

// ── Button message sending ──
function buildMenuChoice(button: any, index: number): string | null {
  const text = (button.text || "").trim();
  if (!text) return null;
  const action = (button.action || button.type || "link").toLowerCase();
  const url = (button.url || button.value || "").trim();
  if (action === "link" || action === "url") {
    const normalizedUrl = url ? (url.startsWith("http") ? url : `https://${url}`) : "";
    return normalizedUrl ? `${text}|url:${normalizedUrl}` : text;
  }
  if (action === "phone" || action === "call" || action === "whatsapp") {
    return url ? `${text}|call:${url}` : text;
  }
  // reply / quick_reply
  return `${text}|${url || `btn_${index}`}`;
}

async function sendButtonMessage(baseUrl: string, token: string, phone: string, text: string, buttons: any[]): Promise<void> {
  const choices = buttons.map((b, i) => buildMenuChoice(b, i)).filter(Boolean) as string[];
  if (choices.length === 0) {
    // Fallback to text if no valid buttons
    await uazapiRequest(baseUrl, token, "/send/text", { number: phone, text });
    return;
  }
  await uazapiRequest(baseUrl, token, "/send/menu", { number: phone, type: "button", text, choices });
}

// ── Carousel message sending ──
function normalizeCarouselUrl(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function buildCarouselButton(button: any, index: number) {
  const text = (button.text || "").trim();
  if (!text) return null;
  const action = (button.action || button.type || "link").toLowerCase();
  const rawValue = (button.url || button.value || "").trim();
  if (action === "url" || action === "link") {
    const url = normalizeCarouselUrl(rawValue);
    return url ? { id: url, label: text, text, url, type: "URL" } : null;
  }
  if (action === "phone" || action === "call" || action === "whatsapp") {
    return rawValue ? { id: rawValue, label: text, text, phone: rawValue, type: "CALL" } : null;
  }
  return { id: rawValue || `card_btn_${index + 1}`, label: text, text, type: "REPLY" };
}

function buildCarouselChoice(button: any): string | null {
  const text = (button.text || "").trim();
  if (!text) return null;
  const action = (button.action || button.type || "link").toLowerCase();
  const rawValue = (button.url || button.value || "").trim();
  if (action === "url" || action === "link") return rawValue ? `${text}|url:${rawValue}` : null;
  if (action === "phone" || action === "call" || action === "whatsapp") return rawValue ? `${text}|call:${rawValue}` : null;
  return rawValue ? `${text}|${rawValue}` : text;
}

async function sendCarouselMessage(baseUrl: string, token: string, phone: string, body: string, cards: any[]): Promise<void> {
  if (cards.length === 0) {
    await uazapiRequest(baseUrl, token, "/send/text", { number: phone, text: body || "Olá!" });
    return;
  }

  const primaryText = body?.trim() || null;

  const payload = {
    number: phone,
    ...(primaryText ? { text: primaryText } : {}),
    carousel: cards.map(c => ({
      text: (c.title || c.description || "").trim(),
      ...(c.image_url?.trim() ? { image: c.image_url.trim() } : {}),
      buttons: (c.buttons || []).map((b: any, i: number) => buildCarouselButton(b, i)).filter(Boolean),
    })),
  };

  const menuChoices = cards.flatMap((card, i) => {
    const title = card.title?.trim() || `Card ${i + 1}`;
    const lines = [`[${title}]`];
    if (card.image_url?.trim()) lines.push(`{${card.image_url.trim()}}`);
    lines.push(...(card.buttons || []).map((b: any) => buildCarouselChoice(b)).filter(Boolean) as string[]);
    return lines;
  });

  try {
    await uazapiRequest(baseUrl, token, "/send/carousel", payload);
  } catch {
    const hasUrlButtons = cards.some((c: any) => (c.buttons || []).some((b: any) => {
      const action = (b.action || b.type || "").toLowerCase();
      return action === "url" || action === "link";
    }));
    await uazapiRequest(baseUrl, token, "/send/menu", {
      number: phone,
      type: hasUrlButtons ? "list" : "carousel",
      ...(primaryText ? { text: primaryText } : {}),
      choices: menuChoices,
    });
  }
}

// ══════════════════════════════════════════════════════════
// Send message — dispatches by type (text, buttons, carousel)
// ══════════════════════════════════════════════════════════

async function sendWelcomeMessage(
  baseUrl: string,
  token: string,
  phone: string,
  message: string,
  messageType: string,
  buttons: any[],
  carouselCards: any[],
): Promise<{ ok: boolean; detail: string }> {
  try {
    const recipient = phone.includes("@") ? phone : `${phone}@s.whatsapp.net`;
    const cleanPhone = phone.replace(/\D/g, "");
    const type = (messageType || "text").toLowerCase();

    if (type === "carousel" && carouselCards.length > 0) {
      await sendCarouselMessage(baseUrl, token, cleanPhone, message, carouselCards);
      return { ok: true, detail: "Carrossel enviado com sucesso" };
    }

    if ((type === "buttons" || type === "button") && buttons.length > 0) {
      await sendButtonMessage(baseUrl, token, cleanPhone, message, buttons);
      return { ok: true, detail: "Mensagem com botões enviada com sucesso" };
    }

    // Default: text
    const res = await fetchWithTimeout(`${baseUrl}/chat/send/text`, {
      method: "POST",
      headers: buildHeaders(token),
      body: JSON.stringify({ chatId: recipient, message }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (res.ok && !String(body?.error || "").toLowerCase().includes("fail")) {
      return { ok: true, detail: "Enviado com sucesso" };
    }
    return { ok: false, detail: body?.error || body?.message || `HTTP ${res.status}` };
  } catch (err: any) {
    return { ok: false, detail: err.message || "Erro desconhecido" };
  }
}

// ── Build personalized message (supports both {var} and {{var}} formats) ──
function buildMessage(template: string, vars: { nome?: string; numero?: string; grupo?: string }): string {
  const now = new Date();
  const nome = vars.nome || "participante";
  const numero = vars.numero || "";
  const grupo = vars.grupo || "";
  const data = now.toLocaleDateString("pt-BR");
  const hora = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return template
    // Support both {var} and {{var}} formats
    .replace(/\{\{?nome\}?\}/gi, nome)
    .replace(/\{\{?numero\}?\}/gi, numero)
    .replace(/\{\{?grupo\}?\}/gi, grupo)
    .replace(/\{\{?data\}?\}/gi, data)
    .replace(/\{\{?hora\}?\}/gi, hora);
}

// ── Apply variables to carousel cards ──
function buildCarouselCardsWithVars(cards: any[], vars: { nome?: string; numero?: string; grupo?: string }): any[] {
  return cards.map(card => ({
    ...card,
    title: card.title ? buildMessage(card.title, vars) : card.title,
    description: card.description ? buildMessage(card.description, vars) : card.description,
    buttons: (card.buttons || []).map((b: any) => ({
      ...b,
      text: b.text ? buildMessage(b.text, vars) : b.text,
    })),
  }));
}

// ── Deduplication hash ──
function buildDedupeHash(rule: string, phone: string, groupId: string, automationId: string): string {
  if (rule === "any_group") return `welcome:${automationId}:${phone}`;
  return `welcome:${automationId}:${groupId}:${phone}`;
}

// ── Check if within sending window (BRT) ──
function isWithinSendWindow(startHour: string, endHour: string): boolean {
  const now = new Date();
  const brtOffset = -3 * 60;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const brtMinutes = ((utcMinutes + brtOffset) % 1440 + 1440) % 1440;
  const [sh, sm] = startHour.split(":").map(Number);
  const [eh, em] = endHour.split(":").map(Number);
  const startMin = sh * 60 + (sm || 0);
  const endMin = eh * 60 + (em || 0);
  return brtMinutes >= startMin && brtMinutes <= endMin;
}

// ── PHASE 1: Monitor groups for new participants ──
async function monitorPhase() {
  const db = getDb();

  // Get active automations
  const { data: automations, error } = await db
    .from("welcome_automations")
    .select("*, welcome_automation_groups(*), welcome_automation_senders(*)")
    .eq("status", "active");
  if (error || !automations?.length) return;

  for (const automation of automations) {
    const groups = automation.welcome_automation_groups || [];
    if (!groups.length) continue;

    // Acquire device lock for monitoring device
    const monitorDeviceId = automation.monitoring_device_id;
    if (!monitorDeviceId) continue;

    const monitorLockAcquired = DeviceLockManager.tryAcquire(monitorDeviceId, "welcome_monitor", `monitor_${automation.id}`);
    if (!monitorLockAcquired) {
      const lockReason = DeviceLockManager.getLockReason(monitorDeviceId);
      log.info(`Welcome monitor: device ${monitorDeviceId.slice(0, 8)} locked by: ${lockReason} — skipping`);
      continue;
    }

    try {
    // Get monitoring device credentials
    const { data: device } = await db
      .from("devices")
      .select("id, uazapi_token, uazapi_base_url, status, number")
      .eq("id", monitorDeviceId)
      .single();

    if (!device?.uazapi_token || !device?.uazapi_base_url) continue;
    const connected = ["Ready", "Connected", "connected", "authenticated", "open", "active", "online"].includes(device.status);
    if (!connected) continue;

    for (const group of groups) {
      const knownKey = `${automation.id}::${group.group_id}`;

      try {
        const currentParticipants = await fetchGroupParticipants(device.uazapi_base_url, device.uazapi_token, group.group_id);
        if (currentParticipants.size === 0) continue;

        const known = knownParticipants.get(knownKey);
        if (!known) {
          // First run — initialize snapshot, don't enqueue anyone
          knownParticipants.set(knownKey, new Set(currentParticipants));
          log.info(`Initialized snapshot for automation ${automation.id.slice(0, 8)} group ${group.group_name || group.group_id}: ${currentParticipants.size} members`);
          continue;
        }

        // Detect new participants
        const newMembers: string[] = [];
        for (const phone of currentParticipants) {
          if (!known.has(phone)) {
            // Skip own device number
            const deviceNumber = (device.number || "").replace(/\D/g, "");
            if (deviceNumber && phone.includes(deviceNumber)) continue;
            newMembers.push(phone);
          }
        }

        // Update snapshot
        knownParticipants.set(knownKey, new Set(currentParticipants));

        if (newMembers.length === 0) continue;

        log.info(`Detected ${newMembers.length} new members in group ${group.group_name || group.group_id}`);

        // Enqueue new members
        for (const phone of newMembers) {
          const dedupeHash = buildDedupeHash(automation.dedupe_rule, phone, group.group_id, automation.id);

          // Check dedupe window
          const windowCutoff = new Date(Date.now() - automation.dedupe_window_days * 86400000).toISOString();
          const { data: existing } = await db
            .from("welcome_queue")
            .select("id")
            .eq("dedupe_hash", dedupeHash)
            .gte("created_at", windowCutoff)
            .not("status", "in", '("ignored","duplicate_blocked")')
            .limit(1);

          if (existing && existing.length > 0) {
            log.info(`Skipped duplicate: ${phone} in ${group.group_id.slice(0, 12)}`);
            continue;
          }

          const { error: insertErr } = await db.from("welcome_queue").insert({
            automation_id: automation.id,
            user_id: automation.user_id,
            participant_phone: phone,
            group_id: group.group_id,
            group_name: group.group_name,
            status: "pending",
            dedupe_hash: dedupeHash,
            detected_at: nowIso(),
          });

          if (insertErr) {
            if (String(insertErr.message).includes("unique") || String(insertErr.code) === "23505") {
              log.info(`Dedupe blocked: ${phone}`);
            } else {
              log.error(`Failed to enqueue: ${phone}`, insertErr);
            }
          } else {
            log.info(`Enqueued: ${phone} → group ${group.group_name || group.group_id.slice(0, 12)}`);

            await db.from("welcome_events").insert({
              automation_id: automation.id,
              user_id: automation.user_id,
               event_type: "participant_detected",
               level: "info",
               message: `Novo participante detectado: ${phone}`,
               payload_json: { phone, group_id: group.group_id },
             }).then(() => {}, () => {});
          }
        }
      } catch (err: any) {
        log.error(`Monitor error for group ${group.group_id}: ${err.message}`);
      }
    }
    } finally {
      DeviceLockManager.release(monitorDeviceId, `monitor_${automation.id}`);
    }
  }
}

// ── PHASE 2: Process queue — send welcome messages ──
async function processPhase() {
  const db = getDb();

  // Recover stale locked items (>3 min)
  const staleThreshold = new Date(Date.now() - 3 * 60_000).toISOString();
  await db.from("welcome_queue")
    .update({ status: "pending", locked_at: null } as any)
    .eq("status", "processing")
    .lt("locked_at", staleThreshold)
    .then(() => {}, () => {});

  // Get active automations with pending queue items
  const { data: automations } = await db
    .from("welcome_automations")
    .select("*, welcome_automation_senders(*)")
    .eq("status", "active");
  if (!automations?.length) return;

  for (const automation of automations) {
    // Check send window
    if (!isWithinSendWindow(automation.send_start_hour, automation.send_end_hour)) continue;

    const senders = (automation.welcome_automation_senders || []).filter((s: any) => s.is_active);
    if (!senders.length) continue;

    // Get pending items (batch of 10)
    const { data: pendingItems } = await db
      .from("welcome_queue")
      .select("*")
      .eq("automation_id", automation.id)
      .eq("status", "pending")
      .order("detected_at", { ascending: true })
      .limit(10);
    if (!pendingItems?.length) continue;

    // Load sender device credentials
    const senderIds = senders.map((s: any) => s.device_id);
    const { data: senderDevices } = await db
      .from("devices")
      .select("id, uazapi_token, uazapi_base_url, status, name, number")
      .in("id", senderIds);
    if (!senderDevices?.length) continue;

    const activeSenders = senderDevices.filter(d =>
      d.uazapi_token && d.uazapi_base_url &&
      ["Ready", "Connected", "connected", "authenticated", "open", "active", "online"].includes(d.status)
    );
    if (!activeSenders.length) continue;

    // Acquire device locks for all sender devices
    const lockedSenderIds: string[] = [];
    for (const sender of activeSenders) {
      const lockAcquired = DeviceLockManager.tryAcquire(sender.id, "welcome_send", `welcome_send_${automation.id}`);
      if (lockAcquired) {
        lockedSenderIds.push(sender.id);
      } else {
        const lockReason = DeviceLockManager.getLockReason(sender.id);
        log.info(`Welcome send: device ${sender.id.slice(0, 8)} locked by: ${lockReason} — skipping sender`);
      }
    }
    const availableSenders = activeSenders.filter(d => lockedSenderIds.includes(d.id));
    if (!availableSenders.length) {
      // Release any locks we might have acquired
      for (const did of lockedSenderIds) DeviceLockManager.release(did, `welcome_send_${automation.id}`);
      continue;
    }

    // Read message type, buttons, carousel from automation
    const messageType = (automation.message_type || "text").toLowerCase();
    const automationButtons = Array.isArray(automation.buttons) ? automation.buttons : [];
    const automationCarousel = Array.isArray(automation.carousel_cards) ? automation.carousel_cards : [];

    let senderIdx = 0;
    let sentThisCycle = 0;

    for (const item of pendingItems) {
      // Lock item
      const { error: lockErr } = await db
        .from("welcome_queue")
        .update({ status: "processing", locked_at: nowIso() } as any)
        .eq("id", item.id)
        .eq("status", "pending");
      if (lockErr) continue;

      // Pick sender (round-robin) — each person gets ONE message from ONE sender
      const sender = activeSenders[senderIdx % activeSenders.length];
      senderIdx++;

      // Build message with variables
      const messageTemplate = automation.message_content || "Olá! Seja bem-vindo(a)!";
      const vars = {
        nome: item.participant_name || undefined,
        numero: item.participant_phone,
        grupo: item.group_name || undefined,
      };
      const finalMessage = buildMessage(messageTemplate, vars);

      // Apply variables to carousel cards too
      const finalCarousel = automationCarousel.length > 0
        ? buildCarouselCardsWithVars(automationCarousel, vars)
        : [];

      // Check max retries
      if (item.attempts >= automation.max_retries) {
        await db.from("welcome_queue").update({
          status: "failed",
          error_reason: `Excedeu ${automation.max_retries} tentativas`,
          processed_at: nowIso(),
        } as any).eq("id", item.id);
        continue;
      }

      // Send using the correct type
      const result = await sendWelcomeMessage(
        sender.uazapi_base_url!,
        sender.uazapi_token!,
        item.participant_phone,
        finalMessage,
        messageType,
        automationButtons,
        finalCarousel,
      );

      // Update queue item
      await db.from("welcome_queue").update({
        status: result.ok ? "sent" : "failed",
        attempts: item.attempts + 1,
        processed_at: nowIso(),
        sender_device_id: sender.id,
        error_reason: result.ok ? null : result.detail,
        message_used: finalMessage,
        locked_at: null,
      } as any).eq("id", item.id);

      // Log message
      await db.from("welcome_message_logs").insert({
        queue_id: item.id,
        sender_device_id: sender.id,
        message_text: finalMessage,
        result: result.ok ? "sent" : "failed",
        external_response: { detail: result.detail },
      }).then(() => {}, () => {});

      // Log event
      await db.from("welcome_events").insert({
        automation_id: automation.id,
        user_id: automation.user_id,
        event_type: result.ok ? "message_sent" : "message_failed",
        level: result.ok ? "info" : "error",
        message: result.ok
          ? `Mensagem (${messageType}) enviada para ${item.participant_phone} via ${sender.name}`
          : `Falha ao enviar para ${item.participant_phone}: ${result.detail}`,
        reference_id: item.id,
        payload_json: { phone: item.participant_phone, sender: sender.id, messageType, result: result.detail },
      }).then(() => {}, () => {});

      log.info(`${result.ok ? "✓" : "✗"} [${messageType}] ${item.participant_phone} via ${sender.name}: ${result.detail}`);

      sentThisCycle++;

      // Apply delay
      const minD = automation.min_delay_seconds ?? 30;
      const maxD = Math.max(automation.max_delay_seconds ?? 60, minD);
      const delayMs = randomBetween(minD * 1000, maxD * 1000);
      if (delayMs > 0) await sleep(delayMs);

      // Check if automation was paused/stopped while processing
      const { data: freshAutomation } = await db
        .from("welcome_automations")
        .select("status")
        .eq("id", automation.id)
        .single();
      if (freshAutomation?.status !== "active") {
        log.info(`Automation ${automation.id.slice(0, 8)} no longer active, stopping processing`);
        break;
      }
    }

    if (sentThisCycle > 0) {
      log.info(`Processed ${sentThisCycle} welcome messages for automation ${automation.id.slice(0, 8)}`);
    }
  }
}

// ── Main tick ──
export async function welcomeTick() {
  if (isProcessing) return;
  isProcessing = true;
  try {
    await monitorPhase();
    await processPhase();
    lastWelcomeTickAt = new Date();
  } catch (err: any) {
    log.error("Welcome tick error", { message: err.message, stack: err.stack });
  } finally {
    isProcessing = false;
  }
}
