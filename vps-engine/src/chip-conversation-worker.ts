// ══════════════════════════════════════════════════════════
// VPS Engine — Chip Conversation Worker
// Polls for active conversations and sends messages directly
// Replaces Edge Function self-dispatch pattern
// ══════════════════════════════════════════════════════════

import { getDb } from "./db";
import { createLogger } from "./lib/logger";
import { DeviceLockManager } from "./lib/device-lock-manager";

const log = createLogger("chip-conv");

export let lastChipConvTickAt: Date | null = null;

export function getChipConvStatus() {
  return { lastTick: lastChipConvTickAt };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const randomBetween = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
function pickRandom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function cleanNumber(num: string): string { return num.replace(/[^0-9]/g, ""); }

const FALLBACK_MESSAGES = [
  "Opa, tudo certo?", "Bom dia, como você tá?", "E aí, tranquilo?",
  "Fala, tudo bem?", "Tudo certo por aqui", "Tô bem sim, e você?",
  "Correria de sempre haha", "De boa, graças a Deus",
  "Hoje tá puxado hein", "Já almoçou?", "Como foi seu dia?",
  "Depois falamos", "Vou resolver umas coisas aqui", "Te chamo mais tarde",
  "E aí, beleza?", "Aqui tá suave", "Tudo joia, valeu por perguntar",
  "Tá chovendo aí?", "Esse calor tá demais né", "Tô precisando de férias",
];

async function sendTextMessage(baseUrl: string, token: string, number: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const cleanNum = cleanNumber(number);
  const endpoints = [
    { path: "/send/text", body: { number: cleanNum, text } },
    { path: "/chat/send-text", body: { number: cleanNum, to: cleanNum, body: text, text } },
    { path: "/message/sendText", body: { chatId: cleanNum, text } },
  ];

  let lastErr = "";
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token, Accept: "application/json" },
        body: JSON.stringify(ep.body),
      });
      const raw = await res.text();
      if (res.ok) {
        try { const p = JSON.parse(raw); if (p?.error || p?.code === 404) { lastErr = raw; continue; } } catch {}
        return { ok: true };
      }
      if (res.status === 405) { lastErr = `405 @ ${ep.path}`; continue; }
      lastErr = `${res.status}: ${raw.substring(0, 200)}`;
    } catch (e: any) { lastErr = e.message; }
  }
  return { ok: false, error: lastErr };
}

async function getUserMessages(sb: any, userId: string): Promise<string[]> {
  const { data } = await sb.from("warmup_messages").select("content").eq("user_id", userId);
  if (!data?.length) return FALLBACK_MESSAGES;
  const msgs = data.map((m: any) => m.content).filter((c: string) => c?.trim());
  return msgs.length > 0 ? msgs : FALLBACK_MESSAGES;
}

function safeDelay(primary: unknown, fallback: unknown, defaultVal: number): number {
  const p = Number(primary);
  if (Number.isFinite(p) && p > 0) return Math.floor(p);
  const f = Number(fallback);
  if (Number.isFinite(f) && f > 0) return Math.floor(f);
  return defaultVal;
}

async function processOneConversation(sb: any, conv: any) {
  const conversationId = conv.id;

  // Time window check
  const brNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const currentHour = brNow.getHours();
  const currentMinute = brNow.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;

  const startParts = String(conv.start_hour || "08:00").split(",").map((s: string) => s.trim());
  const endParts = String(conv.end_hour || "18:00").split(",").map((s: string) => s.trim());
  let insideWindow = false;
  for (let i = 0; i < startParts.length; i++) {
    const [sH, sM] = startParts[i].split(":").map(Number);
    const [eH, eM] = (endParts[i] || endParts[0]).split(":").map(Number);
    if (currentTime >= sH * 60 + (sM || 0) && currentTime < eH * 60 + (eM || 0)) { insideWindow = true; break; }
  }
  if (!insideWindow) return 60; // Retry in 60s

  const dayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const activeDays = conv.active_days as string[];
  if (activeDays?.length && !activeDays.includes(dayMap[brNow.getDay()])) return 300;

  const userMessages = await getUserMessages(sb, conv.user_id);
  const deviceIds = conv.device_ids as string[];
  const { data: devices } = await sb.from("devices").select("id, name, number, uazapi_base_url, uazapi_token").in("id", deviceIds);
  const activeDevices = (devices || []).filter((d: any) => d.uazapi_base_url && d.uazapi_token && d.number).sort((a: any, b: any) => a.id.localeCompare(b.id));

  if (activeDevices.length < 2) {
    await sb.from("chip_conversations").update({ status: "paused", last_error: "Pelo menos 2 dispositivos precisam ter API configurada" }).eq("id", conversationId);
    return -1;
  }

  const senderIndex = (conv.total_messages_sent || 0) % 2;
  const sender = activeDevices[senderIndex];
  const receiver = activeDevices[(senderIndex + 1) % 2];

  const messageText = pickRandom(userMessages);
  const result = await sendTextMessage(sender.uazapi_base_url, sender.uazapi_token, receiver.number, messageText);

  const newTotal = (conv.total_messages_sent || 0) + (result.ok ? 1 : 0);

  await sb.from("chip_conversation_logs").insert({
    conversation_id: conversationId, user_id: conv.user_id,
    sender_device_id: sender.id, receiver_device_id: receiver.id,
    sender_name: sender.name, receiver_name: receiver.name,
    message_content: messageText, message_category: "general",
    status: result.ok ? "sent" : "failed", error_message: result.ok ? null : result.error,
    sent_at: new Date().toISOString(),
  }).then(() => {}, () => {});

  await sb.from("chip_conversations").update({ total_messages_sent: newTotal, last_error: result.ok ? null : result.error, status: "active" }).eq("id", conversationId);

  const cycleTarget = safeDelay(conv.messages_per_cycle_min, conv.messages_per_cycle_max, 10);
  const normalDelay = safeDelay(conv.min_delay_seconds, conv.max_delay_seconds, 30);
  const pauseDelay = safeDelay(conv.pause_duration_min, conv.pause_duration_max, 120);
  const reachedPause = newTotal > 0 && newTotal % cycleTarget === 0;

  return reachedPause ? pauseDelay : normalDelay;
}

// ══════════════════════════════════════════════════════════
// TICK: processes active chip conversations
// ══════════════════════════════════════════════════════════
export async function chipConversationTick() {
  const db = getDb();

  const { data: activeConvs } = await db.from("chip_conversations")
    .select("*")
    .in("status", ["active", "running"])
    .limit(20);

  if (!activeConvs?.length) return;

  for (const conv of activeConvs) {
    // Lock ALL devices used in this conversation
    const deviceIds = (conv.device_ids as string[]) || [];
    const lockedIds: string[] = [];
    let allLocked = true;
    for (const did of deviceIds) {
      if (DeviceLockManager.tryAcquire(did, "chip_conversation", conv.id)) {
        lockedIds.push(did);
      } else {
        allLocked = false;
        const blockReason = DeviceLockManager.getBlockingReason(did, "chip_conversation");
        log.info(`Chip conv ${conv.id.slice(0, 8)}: device ${did.slice(0, 8)} blocked by: ${blockReason} — skipping`);
        break;
      }
    }

    if (!allLocked) {
      // Release any locks we acquired
      for (const did of lockedIds) DeviceLockManager.release(did, conv.id);
      continue;
    }

    try {
      const nextDelay = await processOneConversation(db, conv);
      if (nextDelay === -1) continue;
      log.info(`Chip conv ${conv.id.slice(0, 8)}: next in ${nextDelay}s`);
    } catch (err: any) {
      log.error(`Chip conv ${conv.id.slice(0, 8)} error: ${err.message}`);
      await db.from("chip_conversations").update({ last_error: err.message }).eq("id", conv.id).then(() => {}, () => {});
    } finally {
      for (const did of lockedIds) DeviceLockManager.release(did, conv.id);
    }
  }

  lastChipConvTickAt = new Date();
}
