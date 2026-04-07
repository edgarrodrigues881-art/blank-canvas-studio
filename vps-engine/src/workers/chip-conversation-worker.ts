// ══════════════════════════════════════════════════════════
// VPS Engine — Chip Conversation Worker
// Polls for active conversations and sends messages directly
// Replaces Edge Function self-dispatch pattern
// ══════════════════════════════════════════════════════════

import { getDb } from "../core/db";
import { createLogger } from "../core/logger";
import { DeviceLockManager } from "../core/device-lock-manager";
// chip-conversation is lightweight — does NOT use global semaphore

const log = createLogger("chip-conv");

export let lastChipConvTickAt: Date | null = null;

export function getChipConvStatus() {
  return { lastTick: lastChipConvTickAt };
}

const randomBetween = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
function pickRandom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
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

// ── Media helpers ──
const FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&q=80",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80",
  "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&q=80",
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80",
  "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=800&q=80",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80",
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80",
  "https://images.unsplash.com/photo-1475924156734-496f401b2420?w=800&q=80",
  "https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?w=800&q=80",
  "https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=800&q=80",
  "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=800&q=80",
  "https://images.unsplash.com/photo-1490730141103-6cac27aaab94?w=800&q=80",
  "https://images.unsplash.com/photo-1505144808419-1957a94ca61e?w=800&q=80",
  "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&q=80",
  "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=800&q=80",
  "https://images.unsplash.com/photo-1426604966848-d7adac402bff?w=800&q=80",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=800&q=80",
  "https://images.unsplash.com/photo-1504567961542-e24d9439a724?w=800&q=80",
  "https://images.unsplash.com/photo-1494500764479-0c8f2919a3d8?w=800&q=80",
  "https://images.unsplash.com/photo-1431794062232-2a99a5431c6c?w=800&q=80",
];
const FALLBACK_AUDIOS = [
  "https://samplelib.com/lib/preview/mp3/sample-3s.mp3",
  "https://samplelib.com/lib/preview/mp3/sample-6s.mp3",
  "https://samplelib.com/lib/preview/mp3/sample-9s.mp3",
  "https://samplelib.com/lib/preview/mp3/sample-12s.mp3",
  "https://samplelib.com/lib/preview/mp3/sample-15s.mp3",
  "https://www2.cs.uic.edu/~i101/SoundFiles/BabyElephantWalk60.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/CantinaBand3.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/CantinaBand60.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/Fanfare60.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/gettysburg10.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/preamble10.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/StarWars3.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/StarWars60.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/taunt.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/ImperialMarch60.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/PinkPanther30.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/PinkPanther60.wav",
  "https://filesamples.com/samples/audio/mp3/sample1.mp3",
  "https://filesamples.com/samples/audio/mp3/sample2.mp3",
  "https://filesamples.com/samples/audio/mp3/sample3.mp3",
  "https://filesamples.com/samples/audio/mp3/sample4.mp3",
  "https://download.samplelib.com/mp3/sample-3s.mp3",
  "https://download.samplelib.com/mp3/sample-6s.mp3",
  "https://download.samplelib.com/mp3/sample-9s.mp3",
  "https://download.samplelib.com/mp3/sample-12s.mp3",
  "https://download.samplelib.com/mp3/sample-15s.mp3",
];
const FALLBACK_STICKERS = [
  "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=400&q=80",
  "https://images.unsplash.com/photo-1574158622682-e40e69881006?w=400&q=80",
  "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400&q=80",
  "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=400&q=80",
  "https://images.unsplash.com/photo-1517849845537-4d257902454a?w=400&q=80",
  "https://images.unsplash.com/photo-1425082661507-6af0db6f6412?w=400&q=80",
  "https://images.unsplash.com/photo-1561037404-61cd46aa615b?w=400&q=80",
  "https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=400&q=80",
  "https://images.unsplash.com/photo-1537151625747-768eb6cf92b2?w=400&q=80",
  "https://images.unsplash.com/photo-1596854407944-bf87f6fdd49e?w=400&q=80",
  "https://images.unsplash.com/photo-1552053831-71594a27632d?w=400&q=80",
  "https://images.unsplash.com/photo-1560807707-8cc77767d783?w=400&q=80",
];

const KNOWN_BROKEN_AUDIO_HINTS = [
  "531947_4397472",
  "456058_5765826",
  "523746_10717283",
  "527087_10717283",
  "514742_1648170",
  "459145_5765826",
  "467049_9655975",
  "511484_10717283",
  "516565_10717283",
  "530110_10717283",
  "415079_5121236",
];

function isKnownBrokenAudioUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  return KNOWN_BROKEN_AUDIO_HINTS.some((hint) => url.includes(hint));
}

function getAudioCandidates(userAudio: any[]): Array<{ url: string; label: string }> {
  const candidates: Array<{ url: string; label: string }> = [];
  const seen = new Set<string>();

  for (const item of userAudio || []) {
    const url = String(item?.file_url || "").trim();
    if (!url || seen.has(url) || isKnownBrokenAudioUrl(url)) continue;
    seen.add(url);
    candidates.push({ url, label: String(item?.content || "🎤").trim() || "🎤" });
  }

  for (const url of FALLBACK_AUDIOS) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    candidates.push({ url, label: "🎤" });
  }

  return candidates;
}

async function sendImage(baseUrl: string, token: string, number: string, imageUrl: string, caption: string): Promise<{ ok: boolean; error?: string }> {
  const cleanNum = cleanNumber(number);
  try {
    const res = await fetch(`${baseUrl}/send/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token, Accept: "application/json" },
      body: JSON.stringify({ number: cleanNum, file: imageUrl, type: "image", caption }),
    });
    if (res.ok) return { ok: true };
    const raw = await res.text();
    return { ok: false, error: `Image: ${res.status} — ${raw.substring(0, 200)}` };
  } catch (e: any) { return { ok: false, error: e.message }; }
}

async function sendSticker(baseUrl: string, token: string, number: string, imageUrl: string): Promise<{ ok: boolean; error?: string }> {
  const cleanNum = cleanNumber(number);
  try {
    const res = await fetch(`${baseUrl}/send/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token, Accept: "application/json" },
      body: JSON.stringify({ number: cleanNum, file: imageUrl, type: "sticker" }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `Sticker: ${res.status}` };
  } catch (e: any) { return { ok: false, error: e.message }; }
}

async function sendAudio(baseUrl: string, token: string, number: string, audioUrl: string): Promise<{ ok: boolean; error?: string }> {
  const cleanNum = cleanNumber(number);
  const attempts = [
    { path: "/send/media", body: { number: cleanNum, file: audioUrl, type: "ptt" } },
    { path: "/send/media", body: { number: cleanNum, media: audioUrl, type: "ptt" } },
    { path: "/send/media", body: { number: cleanNum, file: audioUrl, type: "audio", ptt: true } },
    { path: "/send/media", body: { number: cleanNum, media: audioUrl, type: "audio", ptt: true } },
    { path: "/send/media", body: { number: cleanNum, url: audioUrl, type: "audio", ptt: true } },
    { path: "/send/media", body: { number: cleanNum, file: audioUrl, type: "audio" } },
  ];

  let lastErr = "";
  for (const at of attempts) {
    try {
      const res = await fetch(`${baseUrl}${at.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token, Accept: "application/json" },
        body: JSON.stringify(at.body),
      });
      const raw = await res.text();
      if (res.ok) {
        try {
          const parsed = raw ? JSON.parse(raw) : {};
          if (parsed?.error || parsed?.code === 404 || parsed?.status === "error") {
            lastErr = `${at.path}: ${raw.substring(0, 200)}`;
            continue;
          }
        } catch {}
        return { ok: true };
      }
      if (res.status === 405 || res.status === 404) {
        lastErr = `${res.status} @ ${at.path}`;
        continue;
      }
      lastErr = `${res.status} @ ${at.path}: ${raw.substring(0, 200)}`;
    } catch (e: any) {
      lastErr = `${at.path}: ${e?.message || String(e)}`;
    }
  }

  return { ok: false, error: lastErr };
}

function safeRange(min: unknown, max: unknown, defaultMin: number, defaultMax?: number): number {
  const minN = Number(min);
  const maxN = Number(max);
  const safeMin = Number.isFinite(minN) && minN > 0 ? Math.floor(minN) : defaultMin;
  const safeMax = Number.isFinite(maxN) && maxN > safeMin ? Math.floor(maxN) : (defaultMax ?? safeMin);
  return randomBetween(safeMin, safeMax);
}

function pickChipContentType(): "text" | "audio" | "sticker" | "image" {
  const roll = randomBetween(1, 100);
  if (roll <= 52) return "text";
  if (roll <= 87) return "audio";
  if (roll <= 97) return "sticker";
  return "image";
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

  // Load user media for chip conversations (reuse group_interaction_media table)
  const { data: userMedia } = await sb.from("group_interaction_media").select("*").eq("user_id", conv.user_id).eq("is_active", true);
  const mediaByType: Record<string, any[]> = {};
  for (const m of userMedia || []) (mediaByType[m.media_type] ??= []).push(m);

  const hasUserImage = (mediaByType.image?.length || 0) > 0;
  const hasUserSticker = (mediaByType.sticker?.length || 0) > 0;
  const hasUserAudio = (mediaByType.audio?.length || 0) > 0;

  // Distribuição solicitada: 52% texto, 35% áudio, 10% figurinha, 3% imagem
  const contentType = pickChipContentType();

  // ── Fair rotation: pick the device that sent the LEAST recently ──
  const totalDevices = activeDevices.length;

  // Query recent logs to find how many messages each device sent
  const { data: sendCounts } = await sb
    .from("chip_conversation_logs")
    .select("sender_device_id")
    .eq("conversation_id", conversationId)
    .in("sender_device_id", activeDevices.map((d: any) => d.id))
    .order("sent_at", { ascending: false })
    .limit(totalDevices * 50); // last N messages per device

  // Count messages per device
  const countMap = new Map<string, number>();
  for (const d of activeDevices) countMap.set(d.id, 0);
  for (const row of sendCounts || []) {
    const cur = countMap.get(row.sender_device_id) || 0;
    countMap.set(row.sender_device_id, cur + 1);
  }

  // Sort by least messages sent (ascending), break ties randomly
  const sortedDevices = [...activeDevices].sort((a: any, b: any) => {
    const diff = (countMap.get(a.id) || 0) - (countMap.get(b.id) || 0);
    return diff !== 0 ? diff : (Math.random() - 0.5);
  });

  const sender = sortedDevices[0]; // device that sent the least
  // Pick a random receiver that is NOT the sender
  const possibleReceivers = activeDevices.filter((d: any) => d.id !== sender.id);
  const receiver = possibleReceivers[Math.floor(Math.random() * possibleReceivers.length)];

  let messageText = "";
  let messageCategory: "text" | "audio" | "sticker" | "image" = contentType;
  let result: { ok: boolean; error?: string };

  if (contentType === "image") {
    const picked = hasUserImage ? pickRandom(mediaByType.image) : null;
    const imgUrl = picked?.file_url || pickRandom(FALLBACK_IMAGES);
    const caption = picked?.content?.trim() || pickRandom(userMessages);
    result = await sendImage(sender.uazapi_base_url, sender.uazapi_token, receiver.number, imgUrl, caption);
    messageText = `[IMG] ${caption}`;
  } else if (contentType === "sticker") {
    const picked = hasUserSticker ? pickRandom(mediaByType.sticker) : null;
    const stickerUrl = picked?.file_url || pickRandom(FALLBACK_STICKERS);
    result = await sendSticker(sender.uazapi_base_url, sender.uazapi_token, receiver.number, stickerUrl);
    messageText = `[STICKER] ${picked?.content || "🎭"}`;
  } else if (contentType === "audio") {
    const audioCandidates = shuffleArray(getAudioCandidates(hasUserAudio ? mediaByType.audio : []));
    const audioErrors: string[] = [];

    result = { ok: false, error: "Nenhum áudio disponível" };
    for (const candidate of audioCandidates.slice(0, 4)) {
      const attempt = await sendAudio(sender.uazapi_base_url, sender.uazapi_token, receiver.number, candidate.url);
      if (attempt.ok) {
        result = attempt;
        messageText = `[AUDIO] ${candidate.label}`;
        break;
      }
      if (attempt.error) audioErrors.push(attempt.error);
    }

    if (!result.ok) {
      const fallbackText = pickRandom(userMessages);
      const textFallback = await sendTextMessage(sender.uazapi_base_url, sender.uazapi_token, receiver.number, fallbackText);
      if (textFallback.ok) {
        result = textFallback;
        messageCategory = "text";
        messageText = fallbackText;
        log.info(`Chip conv ${conversationId.slice(0, 8)}: audio falhou, fallback para texto (${audioErrors.length} tentativas)`);
      } else {
        result = {
          ok: false,
          error: `Audio failed: ${(audioErrors.join(" | ") || result.error || "unknown").substring(0, 500)} | Text fallback failed: ${textFallback.error}`,
        };
        messageText = `[AUDIO-FAILED] ${fallbackText}`;
      }
    }
  } else {
    messageText = pickRandom(userMessages);
    result = await sendTextMessage(sender.uazapi_base_url, sender.uazapi_token, receiver.number, messageText);
  }

  log.info(`Turn #${turnIndex}: ${sender.name} → ${receiver.name} [${messageCategory}] (${totalDevices} devices rotating)`);

  const newTotal = turnIndex + (result.ok ? 1 : 0);

  // Fire-and-forget log insert
  sb.from("chip_conversation_logs").insert({
    conversation_id: conversationId, user_id: conv.user_id,
    sender_device_id: sender.id, receiver_device_id: receiver.id,
    sender_name: sender.name, receiver_name: receiver.name,
    message_content: messageText, message_category: messageCategory,
    status: result.ok ? "sent" : "failed", error_message: result.ok ? null : result.error,
    sent_at: new Date().toISOString(),
  }).then(() => {}, () => {});

  await sb.from("chip_conversations").update({ total_messages_sent: newTotal, last_error: result.ok ? null : result.error, status: "active" }).eq("id", conversationId);

  // Use randomized delays instead of fixed values
  const cycleTarget = safeRange(conv.messages_per_cycle_min, conv.messages_per_cycle_max, 10, 30);
  const normalDelay = safeRange(conv.min_delay_seconds, conv.max_delay_seconds, 15, 60);
  const pauseDelay = safeRange(conv.pause_duration_min, conv.pause_duration_max, 120, 300);
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
