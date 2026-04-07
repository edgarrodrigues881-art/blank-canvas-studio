// ══════════════════════════════════════════════════════════
// VPS Engine — Group Interaction Worker
// Polls for due interactions and processes them directly
// Replaces Edge Function self-dispatch pattern
// ══════════════════════════════════════════════════════════

import { getDb } from "../core/db";
import { createLogger } from "../core/logger";
import { DeviceLockManager } from "../core/device-lock-manager";
import { acquireGlobalSlot, releaseGlobalSlot } from "../core/global-semaphore";
import { fetchDeviceGroups, type ResolvedGroup } from "../group-interaction/group-resolution";

const log = createLogger("group-interaction");

export let lastGroupInteractionTickAt: Date | null = null;

export function getGroupInteractionStatus() {
  return { lastTick: lastGroupInteractionTickAt };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const randomBetween = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const FALLBACK_MESSAGES: Record<string, string[]> = {
  abertura: ["Bom dia pessoal! 🌞", "Opa, tudo certo por aqui?", "E aí galera, como estão? 👋"],
  continuacao: ["Alguém mais tá trabalhando agora?", "Hoje tá corrido hein", "Alguém tem novidade pra contar?"],
  pergunta: ["Como vocês estão organizando a semana?", "Alguém tem dica de app bom?"],
  resposta_curta: ["Com certeza!", "Verdade", "Concordo total", "Boa!", "Valeu pela dica 👍"],
  engajamento: ["Pessoal, bora interagir mais no grupo!", "Quem concorda dá um 👍"],
  encerramento: ["Bom, vou indo pessoal! Até mais 👋", "Até mais pessoal!"],
};

const DAY_MAP = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function getCategoryForIndex(i: number, total: number): string {
  if (i === 0) return "abertura";
  if (i === total - 1) return "encerramento";
  return pickRandom(["continuacao", "pergunta", "resposta_curta", "engajamento"]);
}

function getBrazilNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value || typeof value !== "string") return null;
  const [hoursRaw, minutesRaw = "0"] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

function isTimeWithinWindow(currentMinutes: number, start: string, end: string): boolean {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  if (startMinutes === null || endMinutes === null) return false;
  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

function getWindowDayKey(now: Date, currentMinutes: number, start: string, end: string): string {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  const currentDay = now.getDay();

  if (startMinutes !== null && endMinutes !== null && startMinutes > endMinutes && currentMinutes <= endMinutes) {
    return DAY_MAP[(currentDay + 6) % 7];
  }

  return DAY_MAP[currentDay];
}

function uniqueGroups(groups: Array<{ jid: string; name: string }>): Array<{ jid: string; name: string }> {
  const seen = new Set<string>();
  return groups.filter((group) => {
    if (!group?.jid || seen.has(group.jid)) return false;
    seen.add(group.jid);
    return true;
  });
}

function dedupeStrings(values: unknown[]): string[] {
  return Array.from(new Set(
    values
      .map((value) => String(value ?? "").trim())
      .filter(Boolean),
  ));
}

async function rescheduleInteraction(sb: any, interactionId: string, delaySeconds: number, extra: Record<string, any> = {}) {
  await sb.from("group_interactions")
    .update({ next_action_at: new Date(Date.now() + delaySeconds * 1000).toISOString(), ...extra })
    .eq("id", interactionId)
    .in("status", ["running", "active"]);
}

async function pauseInteraction(sb: any, interactionId: string, lastError: string) {
  await sb.from("group_interactions")
    .update({ status: "paused", last_error: lastError, next_action_at: null, updated_at: new Date().toISOString() })
    .eq("id", interactionId);
}

async function loadAllowedGroupJids(sb: any, identifiers: string[]): Promise<Map<string, string>> {
  const allowedMap = new Map<string, string>();
  const validIds = identifiers.filter((value) => typeof value === "string" && value.trim().length > 0);
  const uuidIds = Array.from(new Set(validIds.filter((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))));

  if (uuidIds.length === 0) return allowedMap;

  const { data } = await sb
    .from("warmup_instance_groups")
    .select("group_id, group_jid")
    .in("group_id", uuidIds)
    .not("group_jid", "is", null);

  for (const row of data || []) {
    const groupId = String(row?.group_id || "").trim();
    const groupJid = String(row?.group_jid || "").trim();
    if (groupId && groupJid && groupJid.includes("@g.us")) {
      allowedMap.set(groupId, groupJid);
    }
  }

  return allowedMap;
}

// ── Group Map Cache (avoid calling API every tick) ──
const groupMapCache = new Map<string, { map: Map<string, ResolvedGroup>; fetchedAt: number }>();
const GROUP_MAP_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getDeviceGroupMap(baseUrl: string, token: string, deviceId: string): Promise<Map<string, ResolvedGroup>> {
  const cached = groupMapCache.get(deviceId);
  if (cached && Date.now() - cached.fetchedAt < GROUP_MAP_TTL_MS) {
    return cached.map;
  }

  const groups = await fetchDeviceGroups(baseUrl, token);
  groupMapCache.set(deviceId, { map: groups, fetchedAt: Date.now() });

  // Evict old entries
  if (groupMapCache.size > 50) {
    const now = Date.now();
    for (const [key, val] of groupMapCache) {
      if (now - val.fetchedAt > GROUP_MAP_TTL_MS * 2) groupMapCache.delete(key);
    }
  }

  return groups;
}

async function uazapiSendText(baseUrl: string, token: string, number: string, text: string) {
  const isGroup = number.includes("@g.us");
  const attempts = isGroup
    ? [
        { path: "/send/text", body: { chatId: number, text } },
        { path: "/send/text", body: { number, text } },
        { path: "/chat/send-text", body: { chatId: number, body: text } },
      ]
    : [
        { path: "/send/text", body: { number, text } },
        { path: "/chat/send-text", body: { number, body: text, text } },
      ];

  let lastErr = "";
  for (const attempt of attempts) {
    try {
      const res = await fetch(`${baseUrl}${attempt.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token, Accept: "application/json" },
        body: JSON.stringify(attempt.body),
      });
      const raw = await res.text();
      if (res.ok) {
        try { const p = JSON.parse(raw); if (p?.error || p?.code === 404) { lastErr = raw; continue; } return p; } catch { return { ok: true }; }
      }
      if (res.status === 405 || res.status === 404) { lastErr = `${res.status} @ ${attempt.path}`; continue; }
      lastErr = `${res.status}: ${raw.substring(0, 200)}`;
    } catch (e: any) { lastErr = e.message; }
  }
  throw new Error(`Text send failed: ${lastErr}`);
}

async function uazapiSendImage(baseUrl: string, token: string, number: string, imageUrl: string, caption: string) {
  const res = await fetch(`${baseUrl}/send/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token, Accept: "application/json" },
    body: JSON.stringify({ number, file: imageUrl, type: "image", caption }),
  });
  const raw = await res.text();
  if (res.ok) return;
  throw new Error(`Image send failed: ${res.status} — ${raw.substring(0, 200)}`);
}

async function uazapiSendSticker(baseUrl: string, token: string, number: string, imageUrl: string) {
  const res = await fetch(`${baseUrl}/send/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token, Accept: "application/json" },
    body: JSON.stringify({ number, file: imageUrl, type: "sticker" }),
  });
  await res.text();
  if (res.ok) return;
  throw new Error(`Sticker send failed: ${res.status}`);
}

async function uazapiSendAudio(baseUrl: string, token: string, number: string, audioUrl: string) {
  const res = await fetch(`${baseUrl}/send/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token, Accept: "application/json" },
    body: JSON.stringify({ number, file: audioUrl, type: "audio", ptt: true }),
  });
  await res.text();
  if (res.ok) return;
  throw new Error(`Audio send failed: ${res.status}`);
}

// ── Media pools ──
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
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=800&q=80",
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
  "https://www2.cs.uic.edu/~i101/SoundFiles/StarWars3.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/StarWars60.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/ImperialMarch60.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/PinkPanther30.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/PinkPanther60.wav",
  "https://filesamples.com/samples/audio/mp3/sample1.mp3",
  "https://filesamples.com/samples/audio/mp3/sample2.mp3",
  "https://filesamples.com/samples/audio/mp3/sample3.mp3",
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
];

// ── Today count daily reset helper ──
function getBrazilDateString(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD
}

async function processOneInteraction(sb: any, interaction: any) {
  const userId = interaction.user_id;
  const groupIds: string[] = Array.isArray(interaction.group_ids) ? interaction.group_ids : [];
  if (groupIds.length === 0) {
    await pauseInteraction(sb, interaction.id, "Nenhum grupo selecionado");
    return;
  }

  // Time window check (supports Period 1 + optional Period 2)
  const brNow = getBrazilNow();
  const currentMinutes = brNow.getHours() * 60 + brNow.getMinutes();
  const period2Start = interaction.start_hour_2 || (interaction.end_hour_2 ? "13:00" : null);
  const period2End = interaction.end_hour_2 || (interaction.start_hour_2 ? "19:00" : null);
  const inPeriod1 = isTimeWithinWindow(currentMinutes, interaction.start_hour, interaction.end_hour);
  const inPeriod2 = period2Start && period2End
    ? isTimeWithinWindow(currentMinutes, period2Start, period2End)
    : false;
  if (!inPeriod1 && !inPeriod2) {
    await rescheduleInteraction(sb, interaction.id, 60);
    return;
  }

  const activeDays: string[] = interaction.active_days || [];
  const validDayKeys = new Set<string>();
  if (inPeriod1) validDayKeys.add(getWindowDayKey(brNow, currentMinutes, interaction.start_hour, interaction.end_hour));
  if (inPeriod2 && period2Start && period2End) validDayKeys.add(getWindowDayKey(brNow, currentMinutes, period2Start, period2End));
  if (activeDays.length > 0 && !Array.from(validDayKeys).some((dayKey) => activeDays.includes(dayKey))) {
    await rescheduleInteraction(sb, interaction.id, 300);
    return;
  }

  // Duration check
  if (interaction.started_at) {
    const maxMs = (interaction.duration_hours * 60 + interaction.duration_minutes) * 60 * 1000;
    if (maxMs > 0 && Date.now() - new Date(interaction.started_at).getTime() > maxMs) {
      await sb.from("group_interactions").update({ status: "completed", completed_at: new Date().toISOString(), next_action_at: null }).eq("id", interaction.id);
      return;
    }
  }

  // ── Daily reset of today_count ──
  const todayBR = getBrazilDateString();
  const lastResetDate = interaction.last_daily_reset_date || "";
  let todayCount = interaction.today_count || 0;
  if (lastResetDate !== todayBR) {
    todayCount = 0;
    await sb.from("group_interactions").update({ today_count: 0, last_daily_reset_date: todayBR }).eq("id", interaction.id);
    log.info(`Interaction ${interaction.id.slice(0, 8)}: daily reset (${lastResetDate} → ${todayBR})`);
  }

  // ── Daily limit check ──
  const dailyLimit = interaction.daily_limit_total || 0;
  if (dailyLimit > 0 && todayCount >= dailyLimit) {
    log.info(`Interaction ${interaction.id.slice(0, 8)}: daily limit reached (${todayCount}/${dailyLimit})`);
    await rescheduleInteraction(sb, interaction.id, 900);
    return;
  }

  // Device
  if (!interaction.device_id) {
    await pauseInteraction(sb, interaction.id, "Nenhuma instância vinculada");
    return;
  }
  const { data: device } = await sb.from("devices").select("id, name, uazapi_token, uazapi_base_url, status").eq("id", interaction.device_id).single();
  if (!device?.uazapi_token || !device?.uazapi_base_url) {
    await pauseInteraction(sb, interaction.id, "Dispositivo sem API configurada");
    return;
  }

  const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");

  // Resolve groups strictly from explicit allowlist/JIDs already linked to this interaction
  let groupMap = await getDeviceGroupMap(baseUrl, device.uazapi_token, device.id);
  const allowedGroupJids = await loadAllowedGroupJids(sb, groupIds);

  const resolveStrict = (map: Map<string, ResolvedGroup>) => {
    const found: Array<{ jid: string; name: string }> = [];
    const unresolved: string[] = [];

    for (const gid of groupIds) {
      const explicitJid = allowedGroupJids.get(gid);
      if (!explicitJid) {
        unresolved.push(gid);
        continue;
      }

      const resolvedGroup = map.get(explicitJid);
      if (resolvedGroup?.jid) found.push(resolvedGroup);
      else unresolved.push(gid);
    }

    return { resolved: uniqueGroups(found), unresolved };
  };

  let { resolved, unresolved } = resolveStrict(groupMap);

  if (resolved.length === 0 || unresolved.length > 0) {
    groupMapCache.delete(device.id);
    groupMap = await getDeviceGroupMap(baseUrl, device.uazapi_token, device.id);
    ({ resolved, unresolved } = resolveStrict(groupMap));
  }

  if (resolved.length === 0) {
    await sb.from("group_interactions")
      .update({
        last_error: `Nenhum grupo permitido foi encontrado no dispositivo (${groupIds.length} configurados, ${allowedGroupJids.size} com JID salvo, ${groupMap.size} grupos no aparelho)`,
        next_action_at: new Date(Date.now() + 300_000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", interaction.id)
      .in("status", ["running", "active"]);
    return;
  }

  if (unresolved.length > 0) {
    const missingCount = groupIds.length - resolved.length;
    log.warn(`Interaction ${interaction.id.slice(0, 8)}: ${missingCount} grupos fora da allowlist ou sem JID salvo (${resolved.length}/${groupIds.length})`);
  }

  // Get messages
  const { data: warmupMsgs } = await sb.from("warmup_messages").select("content").eq("user_id", userId);
  const userMessages = (warmupMsgs || []).map((m: any) => m.content).filter((c: string) => c?.trim());
  const messages = userMessages.length > 0 ? userMessages : Object.values(FALLBACK_MESSAGES).flat();

  // Get user media
  const { data: userMedia } = await sb.from("group_interaction_media").select("*").eq("user_id", userId).eq("is_active", true);
  const mediaByType: Record<string, any[]> = {};
  for (const m of userMedia || []) (mediaByType[m.media_type] ??= []).push(m);

  // Pick group (avoid last used)
  const rotated = resolved.filter(g => g.jid !== interaction.last_group_used);
  const group = pickRandom(rotated.length > 0 ? rotated : resolved);
  const category = getCategoryForIndex(todayCount % 5, 5);

  // ── All media types always enabled ──
  const hasUserImage = (mediaByType.image?.length || 0) > 0;
  const hasUserAudio = (mediaByType.audio?.length || 0) > 0;
  const hasUserSticker = (mediaByType.sticker?.length || 0) > 0;

  // Always include media in the bag — use fallbacks if user has no uploads
  const bag = ["text", "text", "text", "text", "text", "image", "image", "sticker", "sticker", "audio"]
  const contentType = pickRandom(bag);

  let messageText = "";
  let sentOk = false;
  let sendError: string | null = null;

  try {
    if (contentType === "image") {
      const picked = hasUserImage ? pickRandom(mediaByType.image) : null;
      const imgUrl = picked?.file_url || pickRandom(FALLBACK_IMAGES);
      const caption = picked?.content?.trim() || pickRandom(messages);
      await uazapiSendImage(baseUrl, device.uazapi_token, group.jid, imgUrl, "");
      await sleep(randomBetween(1000, 3000));
      await uazapiSendText(baseUrl, device.uazapi_token, group.jid, caption);
      messageText = `[IMG+TXT] ${caption}`;
    } else if (contentType === "sticker") {
      const picked = hasUserSticker ? pickRandom(mediaByType.sticker) : null;
      const stickerUrl = picked?.file_url || pickRandom(FALLBACK_STICKERS);
      await uazapiSendSticker(baseUrl, device.uazapi_token, group.jid, stickerUrl);
      messageText = `[STICKER] ${picked?.content || "🎭"}`;
    } else if (contentType === "audio") {
      const picked = hasUserAudio ? pickRandom(mediaByType.audio) : null;
      const audioUrl = picked?.file_url || pickRandom(FALLBACK_AUDIOS);
      await uazapiSendAudio(baseUrl, device.uazapi_token, group.jid, audioUrl);
      messageText = `[AUDIO] ${picked?.content || "🎤"}`;
    } else {
      messageText = pickRandom(messages);
      await uazapiSendText(baseUrl, device.uazapi_token, group.jid, messageText);
    }
    sentOk = true;
  } catch (e: any) {
    sendError = e.message;
  }

  // Single combined update + log insert (avoid multiple round-trips)
  const logPromise = sb.from("group_interaction_logs").insert({
    interaction_id: interaction.id, user_id: userId, group_id: group.jid, group_name: group.name,
    message_content: messageText, message_category: `${contentType}:${category}`,
    device_id: device.id, status: sentOk ? "sent" : "failed", error_message: sendError,
    pause_applied_seconds: 0, sent_at: new Date().toISOString(),
  }).then(() => {}, () => {});

  const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };
  if (sentOk) {
    updatePayload.total_messages_sent = (interaction.total_messages_sent || 0) + 1;
    updatePayload.last_group_used = group.jid;
    updatePayload.last_content_sent = messageText;
    updatePayload.last_sent_at = new Date().toISOString();
    updatePayload.today_count = todayCount + 1;
    updatePayload.last_error = null;
  } else {
    updatePayload.last_error = sendError;
  }

  // Schedule next delay
  const delay = randomBetween(
    Math.max(0, interaction.min_delay_seconds || 0),
    Math.max(interaction.min_delay_seconds || 0, interaction.max_delay_seconds || 60),
  );
  updatePayload.next_action_at = new Date(Date.now() + delay * 1000).toISOString();

  // Single update with everything
  const updatePromise = sb.from("group_interactions").update(updatePayload).eq("id", interaction.id).in("status", ["running", "active"]);

  await Promise.all([logPromise, updatePromise]);
}

// ══════════════════════════════════════════════════════════
// TICK: finds due interactions and processes them
// ══════════════════════════════════════════════════════════
export async function groupInteractionTick() {
  const db = getDb();
  const now = new Date().toISOString();

  // ── Recover stuck interactions (running but no next_action_at) ──
  const { data: stuckInteractions } = await db.from("group_interactions")
    .select("id")
    .in("status", ["running", "active"])
    .is("next_action_at", null)
    .limit(20);

  if (stuckInteractions?.length) {
    const retryAt = new Date(Date.now() + 5_000).toISOString();
    for (const stuck of stuckInteractions) {
      await db.from("group_interactions")
        .update({ next_action_at: retryAt })
        .eq("id", stuck.id)
        .is("next_action_at", null)
        .in("status", ["running", "active"])
        .then(() => {}, () => {});
    }
    log.info(`Recovered ${stuckInteractions.length} stuck interaction(s)`);
  }

  const { data: dueInteractions } = await db.from("group_interactions")
    .select("*")
    .in("status", ["running", "active"])
    .not("next_action_at", "is", null)
    .lte("next_action_at", now)
    .limit(20);

  if (!dueInteractions?.length) return;

  for (const interaction of dueInteractions) {
    const deviceId = interaction.device_id;
    if (!deviceId) continue;

    const lockAcquired = DeviceLockManager.tryAcquire(deviceId, "group_interaction", interaction.id);
    if (!lockAcquired) {
      const blockReason = DeviceLockManager.getBlockingReason(deviceId, "group_interaction");
      log.info(`Interaction ${interaction.id.slice(0, 8)}: device ${deviceId.slice(0, 8)} blocked by: ${blockReason} — rescheduling`);
      const retryAt = new Date(Date.now() + 30_000).toISOString();
      await db.from("group_interactions").update({ next_action_at: retryAt }).eq("id", interaction.id).in("status", ["running", "active"]).then(() => {}, () => {});
      continue;
    }

    const slotLabel = `group-interaction:${interaction.id.slice(0, 8)}`;
    await acquireGlobalSlot(slotLabel);

    try {
      // Claim the tick (prevent duplicates)
      const { data: claimed } = await db.from("group_interactions")
        .update({ next_action_at: null, updated_at: new Date().toISOString() })
        .eq("id", interaction.id).eq("next_action_at", interaction.next_action_at)
        .in("status", ["running", "active"]).select("id").maybeSingle();
      if (!claimed) continue;

      const t0 = Date.now();
      await processOneInteraction(db, interaction);
      log.info(`Interaction ${interaction.id.slice(0, 8)} processed in ${Date.now() - t0}ms`);
    } catch (err: any) {
      log.error(`Interaction ${interaction.id.slice(0, 8)} error: ${err.message}`);
      await db.from("group_interactions").update({ last_error: err.message }).eq("id", interaction.id).then(() => {}, () => {});
      const retryAt = new Date(Date.now() + 120_000).toISOString();
      await db.from("group_interactions").update({ next_action_at: retryAt }).eq("id", interaction.id).in("status", ["running", "active"]).then(() => {}, () => {});
    } finally {
      DeviceLockManager.release(deviceId, interaction.id);
      releaseGlobalSlot(slotLabel);
    }
  }

  lastGroupInteractionTickAt = new Date();
}
