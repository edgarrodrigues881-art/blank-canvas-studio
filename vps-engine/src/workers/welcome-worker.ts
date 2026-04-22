// ══════════════════════════════════════════════════════════
// VPS Engine — Welcome Message Worker
// Monitors groups for new participants and sends welcome messages
// Supports: text, buttons, carousel
// ══════════════════════════════════════════════════════════

import { getDb } from "../core/db";
import { createLogger } from "../core/logger";
import { DeviceLockManager } from "../core/device-lock-manager";
import { buildUazapiHeaders } from "../integrations/uazapi-headers";

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
  return buildUazapiHeaders(token, { json: true, context: "welcome-worker" });
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
  const headers: Record<string, string> = buildUazapiHeaders(token, { context: "welcome-worker" });
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

// ══════════════════════════════════════════════════════════
// Error classification + retry/backoff
// ══════════════════════════════════════════════════════════
//
// TEMPORÁRIO  → vale retry com backoff progressivo (timeout, 5xx, rate-limit, rede)
// PERMANENTE  → marcar failed definitivo (número inválido, bloqueado, formato errado)
// UNKNOWN     → tratar como temporário (mais conservador) mas com cap de retries

type ErrorClass = "temporary" | "permanent" | "unknown";

interface ClassifiedError {
  class: ErrorClass;
  reason: string;        // motivo curto para logs
  shouldRetry: boolean;
}

const PERMANENT_PATTERNS: Array<{ rx: RegExp; reason: string }> = [
  { rx: /not.*registered|not.*on.*whatsapp|n[ãa]o.*existe|invalid.*number|n[úu]mero.*inv[áa]lido/i, reason: "número não registrado no WhatsApp" },
  { rx: /blocked|bloqueado|banned|banido/i, reason: "destinatário bloqueou/baniu" },
  { rx: /forbidden|unauthorized|403|401/i, reason: "sem permissão (403/401)" },
  { rx: /invalid.*format|malformed|bad.*request|400/i, reason: "payload/número malformado" },
  { rx: /not.*found|404/i, reason: "recurso não encontrado (404)" },
];

const TEMPORARY_PATTERNS: Array<{ rx: RegExp; reason: string }> = [
  { rx: /timeout|timed?\s*out|esgotad/i, reason: "timeout na API" },
  { rx: /econnreset|econnrefused|enetunreach|etimedout|socket\s*hang|fetch\s*failed/i, reason: "falha de rede" },
  { rx: /rate.?limit|too.*many.*requests|429/i, reason: "rate limit (429)" },
  { rx: /5\d{2}|server.*error|internal.*error|bad.*gateway|service.*unavailable|gateway.*timeout/i, reason: "API indisponível (5xx)" },
  { rx: /disconnect|desconect|not.*connected|sess(ion|ão).*(closed|encerrad)/i, reason: "instância desconectada" },
];

function classifyError(detail: string): ClassifiedError {
  const text = String(detail || "").trim();
  if (!text) return { class: "unknown", reason: "erro desconhecido", shouldRetry: true };

  for (const p of PERMANENT_PATTERNS) {
    if (p.rx.test(text)) return { class: "permanent", reason: p.reason, shouldRetry: false };
  }
  for (const p of TEMPORARY_PATTERNS) {
    if (p.rx.test(text)) return { class: "temporary", reason: p.reason, shouldRetry: true };
  }
  return { class: "unknown", reason: "não classificado", shouldRetry: true };
}

// Backoff progressivo: send_at = now + (attempts * BACKOFF_BASE_SECONDS), com jitter
const BACKOFF_BASE_SECONDS = 60;       // 60s, 120s, 180s...
const BACKOFF_MAX_SECONDS = 30 * 60;   // teto de 30 min

function computeBackoffSendAt(attempts: number): string {
  const base = Math.min(attempts * BACKOFF_BASE_SECONDS, BACKOFF_MAX_SECONDS);
  const jitter = Math.floor(Math.random() * 15); // 0–15s
  return new Date(Date.now() + (base + jitter) * 1000).toISOString();
}

// ══════════════════════════════════════════════════════════
// Smart sender selection — limites reais + cooldown
// ══════════════════════════════════════════════════════════
//
// Pipeline:
//   1. FILTROS HARD (eliminam device do pool antes do score):
//        a) sentToday >= max_per_account   → limite diário esgotado
//        b) sentShortWindow >= max_per_minute (janela SHORT_WINDOW_MS)
//        c) lastCallAge < cooldown_seconds → device em cooldown
//   2. SCORE composto entre os sobreviventes:
//        - cycleUsage * 1000   (distribui carga no ciclo)
//        - sentToday  * 10     (balanceia ao longo do dia)
//        - failedRecent * 100  (penaliza instáveis)
//        - sentRecent * 5
//        - lastCallAge subtrai (mais antigo = melhor)
//   3. RPC claim_device_send_slot — serializa envios no mesmo device
//        - se waitMs > SLOT_MAX_WAIT_MS → pula pro próximo
//   4. SEM FALLBACK PERIGOSO: se nenhum passou, retorna null
//      (caller devolve item pra fila como pending)
//
// Limites são CONFIGURÁVEIS via SenderLimits (vindos da automação no futuro).

const SLOT_MIN_INTERVAL_MS = 4000;   // intervalo mínimo entre envios no mesmo device (RPC)
const SLOT_MAX_WAIT_MS = 1500;       // se RPC pedir mais que isso, pula pro próximo
const SHORT_WINDOW_MS = 2 * 60_000;  // janela curta (2min) para max_per_minute

// Defaults seguros — podem ser sobrescritos pela automação
const DEFAULT_LIMITS: SenderLimits = {
  maxPerAccount: 200,     // total/dia por device
  maxPerShortWindow: 5,   // envios em SHORT_WINDOW_MS
  cooldownSeconds: 8,     // tempo mínimo entre envios pro mesmo device
};

interface SenderLimits {
  maxPerAccount: number;
  maxPerShortWindow: number;
  cooldownSeconds: number;
}

interface SenderDevice {
  id: string;
  name: string;
  uazapi_token: string | null;
  uazapi_base_url: string | null;
  status: string;
  number: string | null;
  last_api_call_at: string | null;
}

interface SenderStats {
  sentRecent: number;       // últimos 60min
  failedRecent: number;     // últimos 60min
  sentToday: number;        // BRT hoje
  sentShortWindow: number;  // últimos SHORT_WINDOW_MS
}

interface SelectedSender {
  sender: SenderDevice;
  reason: string;
  waitedMs: number;
}

async function selectBestSender(
  db: any,
  pool: SenderDevice[],
  stats: Map<string, SenderStats>,
  cycleUsage: Map<string, number>,
  automationId: string,
  limits: SenderLimits = DEFAULT_LIMITS,
): Promise<SelectedSender | null> {
  if (pool.length === 0) return null;

  // ── FILTROS HARD: removem device do pool ANTES do score ──
  const eligible: SenderDevice[] = [];
  const cooldownMs = Math.max(0, limits.cooldownSeconds) * 1000;

  for (const d of pool) {
    const s = stats.get(d.id) || { sentRecent: 0, failedRecent: 0, sentToday: 0, sentShortWindow: 0 };
    const lastCallAge = d.last_api_call_at
      ? Date.now() - new Date(d.last_api_call_at).getTime()
      : Number.MAX_SAFE_INTEGER;

    // (a) limite diário por device
    if (s.sentToday >= limits.maxPerAccount) {
      log.info(`Device excluded [daily_cap]: ${d.name} [${d.id.slice(0, 8)}] sentToday=${s.sentToday} >= ${limits.maxPerAccount}`);
      continue;
    }
    // (b) limite curto prazo (janela SHORT_WINDOW_MS)
    if (s.sentShortWindow >= limits.maxPerShortWindow) {
      log.info(`Device excluded [short_window]: ${d.name} [${d.id.slice(0, 8)}] sent=${s.sentShortWindow}/${limits.maxPerShortWindow} in ${SHORT_WINDOW_MS / 1000}s`);
      continue;
    }
    // (c) cooldown entre envios
    if (cooldownMs > 0 && lastCallAge < cooldownMs) {
      log.info(`Device excluded [cooldown]: ${d.name} [${d.id.slice(0, 8)}] lastCall=${Math.round(lastCallAge / 1000)}s < ${limits.cooldownSeconds}s`);
      continue;
    }

    eligible.push(d);
  }

  if (eligible.length === 0) {
    log.warn(`Pool exhausted by limits — all devices excluded (daily/short-window/cooldown). Re-queueing item.`);
    return null;
  }

  // ── SCORE & SORT (lower = better) entre os elegíveis ──
  const scored = eligible.map(d => {
    const s = stats.get(d.id) || { sentRecent: 0, failedRecent: 0, sentToday: 0, sentShortWindow: 0 };
    const cycle = cycleUsage.get(d.id) || 0;
    const lastCallAge = d.last_api_call_at
      ? Date.now() - new Date(d.last_api_call_at).getTime()
      : Number.MAX_SAFE_INTEGER;

    const score =
      cycle * 1000 +
      s.sentToday * 10 +
      s.failedRecent * 100 +
      s.sentRecent * 5 +
      s.sentShortWindow * 50 -
      Math.min(lastCallAge / 1000, 600);

    return { d, s, cycle, lastCallAge, score };
  }).sort((a, b) => a.score - b.score);

  // ── RPC claim_device_send_slot em ordem de prioridade ──
  for (const candidate of scored) {
    const { d, s, cycle, lastCallAge } = candidate;

    let waitMs = 0;
    try {
      const { data: rpcResult, error: rpcErr } = await db.rpc("claim_device_send_slot", {
        p_device_id: d.id,
        p_min_interval_ms: SLOT_MIN_INTERVAL_MS,
      });
      if (rpcErr) {
        log.warn(`claim_device_send_slot error for ${d.name}: ${rpcErr.message} — skipping`);
        continue;
      }
      waitMs = Number(rpcResult ?? 0);
    } catch (err: any) {
      log.warn(`claim_device_send_slot threw for ${d.name}: ${err.message} — skipping`);
      continue;
    }

    if (waitMs < 0) continue;            // device não encontrado pelo RPC
    if (waitMs > SLOT_MAX_WAIT_MS) {
      log.info(`Slot busy on ${d.name} [${d.id.slice(0, 8)}] — needs ${waitMs}ms, trying next`);
      continue;
    }

    if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));

    const ageStr = lastCallAge === Number.MAX_SAFE_INTEGER
      ? "nunca usado"
      : `${Math.round(lastCallAge / 1000)}s atrás`;
    const reason =
      `cycle=${cycle} today=${s.sentToday}/${limits.maxPerAccount} ` +
      `short=${s.sentShortWindow}/${limits.maxPerShortWindow} ` +
      `fail60m=${s.failedRecent} lastCall=${ageStr}`;

    return { sender: d, reason, waitedMs: waitMs };
  }

  // ── SEM FALLBACK PERIGOSO ──
  // Se ninguém passou no claim, devolve null. O caller re-enfileira o item.
  log.warn(`No sender passed slot claim — re-queueing item (eligible=${eligible.length}, all slot-busy)`);
  return null;
}

// ══════════════════════════════════════════════════════════
// PHASE 1: Monitor groups for new participants
// ══════════════════════════════════════════════════════════

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
      const lockReason = DeviceLockManager.getBlockingReason(monitorDeviceId, "welcome_monitor");
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

          // ── Compute scheduled send time (send_at) ──
          // Cada item nasce com horário definido baseado em min/max_delay_seconds da automação.
          // O processPhase só envia quando send_at <= now(), eliminando dependência de sleep como controle principal.
          const minDelay = Math.max(0, automation.min_delay_seconds ?? 30);
          const maxDelay = Math.max(minDelay, automation.max_delay_seconds ?? 60);
          const delaySeconds = randomBetween(minDelay, maxDelay);
          const detectedAt = new Date();
          const sendAt = new Date(detectedAt.getTime() + delaySeconds * 1000);

          const { error: insertErr } = await db.from("welcome_queue").insert({
            automation_id: automation.id,
            user_id: automation.user_id,
            participant_phone: phone,
            group_id: group.group_id,
            group_name: group.group_name,
            status: "pending",
            dedupe_hash: dedupeHash,
            detected_at: detectedAt.toISOString(),
            send_at: sendAt.toISOString(),
          } as any);

          if (insertErr) {
            if (String(insertErr.message).includes("unique") || String(insertErr.code) === "23505") {
              log.info(`Dedupe blocked: ${phone}`);
            } else {
              log.error(`Failed to enqueue: ${phone}`, insertErr);
            }
          } else {
            log.info(`Enqueued: ${phone} → group ${group.group_name || group.group_id.slice(0, 12)} | send_at=${sendAt.toISOString()} (delay=${delaySeconds}s)`);

            await db.from("welcome_events").insert({
              automation_id: automation.id,
              user_id: automation.user_id,
               event_type: "participant_detected",
               level: "info",
               message: `Novo participante detectado: ${phone} (envio agendado para +${delaySeconds}s)`,
               payload_json: { phone, group_id: group.group_id, send_at: sendAt.toISOString(), delay_seconds: delaySeconds },
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

    // Get pending items DUE for sending (send_at <= now OR send_at IS NULL para compat).
    // O agendamento é o controle principal de tempo — o sleep entre envios virou apenas
    // um pequeno guard técnico (ver mais abaixo).
    const nowTs = new Date().toISOString();
    const { data: pendingItems } = await db
      .from("welcome_queue")
      .select("*")
      .eq("automation_id", automation.id)
      .eq("status", "pending")
      .or(`send_at.lte.${nowTs},send_at.is.null`)
      .order("priority", { ascending: false })
      .order("send_at", { ascending: true, nullsFirst: true })
      .order("detected_at", { ascending: true })
      .limit(10);
    if (!pendingItems?.length) continue;

    // Load sender device credentials (incluindo last_api_call_at para ranking)
    const senderIds = senders.map((s: any) => s.device_id);
    const { data: senderDevices } = await db
      .from("devices")
      .select("id, uazapi_token, uazapi_base_url, status, name, number, last_api_call_at")
      .in("id", senderIds);
    if (!senderDevices?.length) continue;

    const activeSenders = senderDevices.filter(d =>
      d.uazapi_token && d.uazapi_base_url &&
      ["Ready", "Connected", "connected", "authenticated", "open", "active", "online"].includes(d.status)
    );
    if (!activeSenders.length) continue;

    // ── Métricas de uso/falhas (janela: hoje em BRT + sub-janela 60min) ──
    // Estrutura preparada pra futuros limites: max_per_account, daily cap por device.
    const sinceWindow60m = new Date(Date.now() - 60 * 60_000).toISOString();
    const startOfDayBRT = (() => {
      const now = new Date();
      // BRT = UTC-3 → meia-noite BRT em UTC = 03:00 do mesmo dia UTC (ou dia anterior se utc<3)
      const brtNow = new Date(now.getTime() - 3 * 3600_000);
      const brtMidnight = new Date(Date.UTC(brtNow.getUTCFullYear(), brtNow.getUTCMonth(), brtNow.getUTCDate(), 0, 0, 0));
      return new Date(brtMidnight.getTime() + 3 * 3600_000).toISOString();
    })();

    const senderStats = new Map<string, { sentRecent: number; failedRecent: number; sentToday: number; sentShortWindow: number }>();
    for (const did of activeSenders.map(s => s.id)) {
      senderStats.set(did, { sentRecent: 0, failedRecent: 0, sentToday: 0, sentShortWindow: 0 });
    }
    const sinceShortWindow = new Date(Date.now() - SHORT_WINDOW_MS).toISOString();
    const { data: recentLogs } = await db
      .from("welcome_message_logs")
      .select("sender_device_id, result, created_at")
      .in("sender_device_id", activeSenders.map(s => s.id))
      .gte("created_at", startOfDayBRT);

    for (const lg of (recentLogs || [])) {
      const st = senderStats.get(lg.sender_device_id);
      if (!st) continue;
      st.sentToday += 1;
      if (lg.created_at >= sinceWindow60m) {
        if (lg.result === "sent") st.sentRecent += 1;
        else st.failedRecent += 1;
      }
      if (lg.result === "sent" && lg.created_at >= sinceShortWindow) {
        st.sentShortWindow += 1;
      }
    }

    // ── Limites configuráveis (podem vir da automação no futuro) ──
    const limits: SenderLimits = {
      maxPerAccount: Math.max(1, (automation as any).max_per_account ?? DEFAULT_LIMITS.maxPerAccount),
      maxPerShortWindow: Math.max(1, (automation as any).max_per_minute ?? DEFAULT_LIMITS.maxPerShortWindow),
      cooldownSeconds: Math.max(0, (automation as any).cooldown_seconds ?? DEFAULT_LIMITS.cooldownSeconds),
    };

    // Acquire device locks for all sender devices
    const lockedSenderIds: string[] = [];
    for (const sender of activeSenders) {
      const lockAcquired = DeviceLockManager.tryAcquire(sender.id, "welcome_send", `welcome_send_${automation.id}`);
      if (lockAcquired) {
        lockedSenderIds.push(sender.id);
      } else {
        const lockReason = DeviceLockManager.getBlockingReason(sender.id, "welcome_send");
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

    // Uso por sender DURANTE este ciclo — distribui carga mesmo entre devices "iguais"
    const cycleUsage = new Map<string, number>();
    for (const s of availableSenders) cycleUsage.set(s.id, 0);
    let sentThisCycle = 0;

    for (const item of pendingItems) {
      // Lock item
      const { error: lockErr } = await db
        .from("welcome_queue")
        .update({ status: "processing", locked_at: nowIso() } as any)
        .eq("id", item.id)
        .eq("status", "pending");
      if (lockErr) continue;

      // ── Select best sender (filtros HARD + score + send-slot claim) ──
      const selected = await selectBestSender(
        db, availableSenders, senderStats, cycleUsage, automation.id, limits,
      );
      if (!selected) {
        // Nenhum sender disponível (limites/cooldown/slot) — devolve item pra fila.
        // SEM fallback perigoso: melhor adiar do que sobrecarregar device.
        await db.from("welcome_queue")
          .update({ status: "pending", locked_at: null } as any)
          .eq("id", item.id);
        log.warn(`Queue paused for item ${item.id.slice(0, 8)} — no sender available (limits/cooldown). Will retry next tick.`);
        await db.from("welcome_events").insert({
          automation_id: automation.id,
          user_id: automation.user_id,
          event_type: "queue_paused",
          level: "warn",
          message: `Item re-enfileirado: nenhum sender disponível (limites diário/curto-prazo/cooldown)`,
          reference_id: item.id,
          payload_json: {
            phone: item.participant_phone,
            limits,
            available_senders: availableSenders.length,
          },
        }).then(() => {}, () => {});
        continue;
      }
      const { sender, reason, waitedMs } = selected;
      cycleUsage.set(sender.id, (cycleUsage.get(sender.id) || 0) + 1);
      // Atualiza contadores in-memory para próxima iteração do mesmo ciclo
      const st = senderStats.get(sender.id);
      if (st) { st.sentToday += 1; st.sentShortWindow += 1; st.sentRecent += 1; }
      log.info(`Sender chosen: ${sender.name} [${sender.id.slice(0, 8)}] — ${reason}${waitedMs > 0 ? ` (waited ${waitedMs}ms for slot)` : ""}`);

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

      // Pre-send guard: defensivo — normalmente max_retries é tratado no pós-envio (retry inteligente)
      if (item.attempts >= automation.max_retries) {
        await db.from("welcome_queue").update({
          status: "failed",
          error_reason: `[max_retries] Excedeu ${automation.max_retries} tentativas`,
          processed_at: nowIso(),
        } as any).eq("id", item.id);
        log.warn(`Discarded item ${item.id.slice(0, 8)} — pre-send guard (attempts=${item.attempts}/${automation.max_retries})`);
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

      // ── Classificação de erro + retry inteligente ──
      const newAttempts = item.attempts + 1;
      const errClass: ClassifiedError = result.ok
        ? { class: "temporary", reason: "ok", shouldRetry: false }
        : classifyError(result.detail);

      let nextStatus: "sent" | "failed" | "pending";
      let nextSendAt: string | null = item.send_at ?? null;
      let errorReason: string | null = null;
      let dispositionLog: string;

      if (result.ok) {
        nextStatus = "sent";
        dispositionLog = "ok";
      } else if (errClass.class === "permanent") {
        // Erro permanente → falha definitiva, sem retry
        nextStatus = "failed";
        errorReason = `[permanent:${errClass.reason}] ${result.detail}`;
        dispositionLog = `discarded_permanent (${errClass.reason})`;
      } else if (newAttempts >= automation.max_retries) {
        // Esgotou tentativas em erro temporário/desconhecido
        nextStatus = "failed";
        errorReason = `[${errClass.class}:max_retries] ${result.detail}`;
        dispositionLog = `discarded_max_retries (${newAttempts}/${automation.max_retries})`;
      } else {
        // Retry com backoff progressivo
        nextStatus = "pending";
        nextSendAt = computeBackoffSendAt(newAttempts);
        errorReason = `[${errClass.class}:retry] ${result.detail}`;
        const waitS = Math.round((new Date(nextSendAt).getTime() - Date.now()) / 1000);
        dispositionLog = `retry_${errClass.class} in ${waitS}s (attempt ${newAttempts}/${automation.max_retries}, ${errClass.reason})`;
      }

      // Update queue item
      await db.from("welcome_queue").update({
        status: nextStatus,
        attempts: newAttempts,
        processed_at: nextStatus === "pending" ? null : nowIso(),
        sender_device_id: sender.id,
        error_reason: errorReason,
        message_used: finalMessage,
        locked_at: null,
        send_at: nextSendAt,
      } as any).eq("id", item.id);

      // Log message
      await db.from("welcome_message_logs").insert({
        queue_id: item.id,
        sender_device_id: sender.id,
        message_text: finalMessage,
        result: result.ok ? "sent" : "failed",
        external_response: {
          detail: result.detail,
          error_class: errClass.class,
          classified_reason: errClass.reason,
          disposition: dispositionLog,
        },
      }).then(() => {}, () => {});

      // Compute timing metrics for observability
      const detectedAtMs = item.detected_at ? new Date(item.detected_at).getTime() : Date.now();
      const plannedSendMs = item.send_at ? new Date(item.send_at).getTime() : detectedAtMs;
      const actualSendMs = Date.now();
      const waitedSeconds = Math.round((actualSendMs - detectedAtMs) / 1000);
      const driftSeconds = Math.round((actualSendMs - plannedSendMs) / 1000);

      // Log event
      const eventType = result.ok
        ? "message_sent"
        : nextStatus === "pending" ? "message_retry" : "message_failed";
      const eventLevel = result.ok ? "info" : nextStatus === "pending" ? "warn" : "error";
      await db.from("welcome_events").insert({
        automation_id: automation.id,
        user_id: automation.user_id,
        event_type: eventType,
        level: eventLevel,
        message: result.ok
          ? `Mensagem (${messageType}) enviada para ${item.participant_phone} via ${sender.name} (esperou ${waitedSeconds}s, drift ${driftSeconds >= 0 ? "+" : ""}${driftSeconds}s)`
          : `Falha ao enviar para ${item.participant_phone}: ${result.detail} → ${dispositionLog}`,
        reference_id: item.id,
        payload_json: {
          phone: item.participant_phone,
          sender: sender.id,
          messageType,
          result: result.detail,
          error_class: errClass.class,
          classified_reason: errClass.reason,
          disposition: dispositionLog,
          attempts: newAttempts,
          max_retries: automation.max_retries,
          next_send_at: nextSendAt,
          planned_send_at: item.send_at,
          actual_sent_at: new Date(actualSendMs).toISOString(),
          waited_seconds: waitedSeconds,
          drift_seconds: driftSeconds,
        },
      }).then(() => {}, () => {});

      log.info(`${result.ok ? "✓" : "✗"} [${messageType}] ${item.participant_phone} via ${sender.name} | waited=${waitedSeconds}s drift=${driftSeconds}s | ${dispositionLog} | ${result.detail}`);

      sentThisCycle++;

      // ── Technical guard delay ──
      // O controle principal de tempo é o send_at (definido no monitorPhase).
      // Aqui aplicamos apenas um pequeno espaçamento (500ms) para evitar burst em uma mesma
      // instância quando vários itens vencem ao mesmo tempo. NÃO é o delay de aquecimento.
      await sleep(500);

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

    // Release sender device locks
    for (const did of lockedSenderIds) DeviceLockManager.release(did, `welcome_send_${automation.id}`);
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
