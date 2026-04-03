// ══════════════════════════════════════════════════════════
// VPS Engine — Group Interaction Worker
// Polls for due interactions and processes them directly
// Replaces Edge Function self-dispatch pattern
// ══════════════════════════════════════════════════════════

import { getDb } from "./db";
import { createLogger } from "./lib/logger";
import { DeviceLockManager } from "./lib/device-lock-manager";
import { acquireGlobalSlot, releaseGlobalSlot } from "./lib/global-semaphore";

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

function getCategoryForIndex(i: number, total: number): string {
  if (i === 0) return "abertura";
  if (i === total - 1) return "encerramento";
  return pickRandom(["continuacao", "pergunta", "resposta_curta", "engajamento"]);
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
  const raw = await res.text();
  if (res.ok) return;
  throw new Error(`Sticker send failed: ${res.status}`);
}

async function uazapiSendAudio(baseUrl: string, token: string, number: string, audioUrl: string) {
  const res = await fetch(`${baseUrl}/send/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token, Accept: "application/json" },
    body: JSON.stringify({ number, file: audioUrl, type: "audio", ptt: true }),
  });
  const raw = await res.text();
  if (res.ok) return;
  throw new Error(`Audio send failed: ${res.status}`);
}

// ── Group resolution (simplified) ──
async function fetchDeviceGroupJids(baseUrl: string, token: string): Promise<Map<string, { jid: string; name: string }>> {
  const groups = new Map<string, { jid: string; name: string }>();
  const endpoints = [
    `${baseUrl}/group/fetchAllGroups`,
    `${baseUrl}/group/list?GetParticipants=false&count=500`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { method: "GET", headers: { token, Accept: "application/json" } });
      if (!res.ok) continue;
      const body: any = await res.json();
      const rows = Array.isArray(body) ? body : body?.groups || body?.data || [];
      for (const row of rows) {
        const jid = row?.JID || row?.jid || row?.id || "";
        const name = row?.subject || row?.name || row?.Name || "";
        if (jid.includes("@g.us")) {
          groups.set(jid, { jid, name });
          if (row?.inviteCode || row?.invite) {
            const code = row.inviteCode || row.invite;
            groups.set(code, { jid, name });
            groups.set(`https://chat.whatsapp.com/${code}`, { jid, name });
          }
          if (name) groups.set(`name:${name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()}`, { jid, name });
        }
      }
      if (groups.size > 0) break;
    } catch {}
  }
  return groups;
}

function resolveGroupIdentifier(id: string, groupMap: Map<string, { jid: string; name: string }>): { jid: string; name: string } | null {
  if (id.includes("@g.us")) return groupMap.get(id) || { jid: id, name: "" };
  const direct = groupMap.get(id);
  if (direct) return direct;
  // Try invite code
  const code = id.replace(/^https?:\/\/chat\.whatsapp\.com\//i, "").split(/[/?#]/)[0]?.trim();
  if (code && code.length >= 10) {
    const byCode = groupMap.get(code) || groupMap.get(`https://chat.whatsapp.com/${code}`);
    if (byCode) return byCode;
  }
  return null;
}

// ── Media pools ──
const FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&q=80",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80",
];
const FALLBACK_AUDIOS = [
  "https://cdn.freesound.org/previews/531/531947_4397472-lq.mp3",
];

async function processOneInteraction(sb: any, interaction: any) {
  const userId = interaction.user_id;
  const groupIds: string[] = Array.isArray(interaction.group_ids) ? interaction.group_ids : [];
  if (groupIds.length === 0) {
    await sb.from("group_interactions").update({ last_error: "Nenhum grupo selecionado", next_action_at: null }).eq("id", interaction.id);
    return;
  }

  // Time window check
  const brNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const currentHour = `${String(brNow.getHours()).padStart(2, "0")}:${String(brNow.getMinutes()).padStart(2, "0")}`;
  if (currentHour < interaction.start_hour || currentHour > interaction.end_hour) return; // Skip, will retry

  const dayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const activeDays: string[] = interaction.active_days || [];
  if (activeDays.length > 0 && !activeDays.includes(dayMap[brNow.getDay()])) return;

  // Duration check
  if (interaction.started_at) {
    const maxMs = (interaction.duration_hours * 60 + interaction.duration_minutes) * 60 * 1000;
    if (maxMs > 0 && Date.now() - new Date(interaction.started_at).getTime() > maxMs) {
      await sb.from("group_interactions").update({ status: "completed", completed_at: new Date().toISOString(), next_action_at: null }).eq("id", interaction.id);
      return;
    }
  }

  // Device
  if (!interaction.device_id) return;
  const { data: device } = await sb.from("devices").select("id, name, uazapi_token, uazapi_base_url, status").eq("id", interaction.device_id).single();
  if (!device?.uazapi_token || !device?.uazapi_base_url) {
    await sb.from("group_interactions").update({ last_error: "Dispositivo sem API configurada" }).eq("id", interaction.id);
    return;
  }

  const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");

  // Resolve groups
  const groupMap = await fetchDeviceGroupJids(baseUrl, device.uazapi_token);
  const resolved: { jid: string; name: string }[] = [];
  for (const gid of groupIds) {
    const r = resolveGroupIdentifier(gid, groupMap);
    if (r) resolved.push(r);
  }
  if (resolved.length === 0) {
    await sb.from("group_interactions").update({ last_error: `Nenhum grupo resolvido (${groupIds.length} links, ${groupMap.size} grupos)`, updated_at: new Date().toISOString() }).eq("id", interaction.id);
    return;
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
  const category = getCategoryForIndex((interaction.today_count || 0) % 5, 5);

  // Pick content type
  const hasImage = (mediaByType.image?.length || 0) > 0;
  const hasAudio = (mediaByType.audio?.length || 0) > 0;
  const bag = ["text", "text", "text", "text", "text"];
  if (hasImage) bag.push("image", "image");
  if (hasAudio) bag.push("audio");
  const contentType = pickRandom(bag);

  let messageText = "";
  let sentOk = false;
  let sendError: string | null = null;

  try {
    if (contentType === "image") {
      const picked = mediaByType.image?.length ? pickRandom(mediaByType.image) : null;
      const imgUrl = picked?.file_url || pickRandom(FALLBACK_IMAGES);
      const caption = picked?.content?.trim() || pickRandom(messages);
      await uazapiSendImage(baseUrl, device.uazapi_token, group.jid, imgUrl, "");
      await sleep(randomBetween(1000, 3000));
      await uazapiSendText(baseUrl, device.uazapi_token, group.jid, caption);
      messageText = `[IMG+TXT] ${caption}`;
    } else if (contentType === "audio") {
      const picked = mediaByType.audio?.length ? pickRandom(mediaByType.audio) : null;
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

  // Log
  await sb.from("group_interaction_logs").insert({
    interaction_id: interaction.id, user_id: userId, group_id: group.jid, group_name: group.name,
    message_content: messageText, message_category: `${contentType}:${category}`,
    device_id: device.id, status: sentOk ? "sent" : "failed", error_message: sendError,
    pause_applied_seconds: 0, sent_at: new Date().toISOString(),
  }).then(() => {}, () => {});

  if (sentOk) {
    await sb.from("group_interactions").update({
      total_messages_sent: (interaction.total_messages_sent || 0) + 1,
      last_group_used: group.jid, last_content_sent: messageText,
      last_sent_at: new Date().toISOString(), today_count: (interaction.today_count || 0) + 1,
      last_error: null, updated_at: new Date().toISOString(),
    }).eq("id", interaction.id);
  } else {
    await sb.from("group_interactions").update({ last_error: sendError, updated_at: new Date().toISOString() }).eq("id", interaction.id);
  }

  // Schedule next
  const delay = randomBetween(
    Math.max(0, interaction.min_delay_seconds || 0),
    Math.max(interaction.min_delay_seconds || 0, interaction.max_delay_seconds || 60),
  );
  const nextAt = new Date(Date.now() + delay * 1000).toISOString();
  await sb.from("group_interactions").update({ next_action_at: nextAt, updated_at: new Date().toISOString() }).eq("id", interaction.id).in("status", ["running", "active"]);
}

// ══════════════════════════════════════════════════════════
// TICK: finds due interactions and processes them
// ══════════════════════════════════════════════════════════
export async function groupInteractionTick() {
  const db = getDb();
  const now = new Date().toISOString();

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

    // Check category-based device lock (allows non-conflicting parallel tasks)
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

      await processOneInteraction(db, interaction);
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
