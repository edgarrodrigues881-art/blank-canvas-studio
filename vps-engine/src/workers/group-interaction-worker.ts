// ══════════════════════════════════════════════════════════
// VPS Engine — Group Interaction Worker
// Polls for due interactions and processes them directly
// Replaces Edge Function self-dispatch pattern
// ══════════════════════════════════════════════════════════

import { getDb } from "../core/db";
import { createLogger } from "../core/logger";
import { DeviceLockManager } from "../core/device-lock-manager";
import { acquireGlobalSlot, releaseGlobalSlot } from "../core/global-semaphore";
import { extractInviteCode, type ResolvedGroup } from "../group-interaction/group-resolution";

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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CONNECTED_STATUSES = new Set(["Ready", "Connected", "connected", "authenticated", "open", "active", "online"]);
const MAX_CONSECUTIVE_ERRORS = 5;
const BACKOFF_BASE_SECONDS = 30;
const GROUP_JID_RE = /@g\.us$/i;

type AllowedGroupSelection = {
  selectionKey: string;
  groupId: string | null;
  groupIds: string[];
  inviteCode: string | null;
  link: string | null;
  name: string;
  joinedJid: string | null;
};

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

function pickNextResolvedGroup(
  groups: Array<{ jid: string; name: string }>,
  lastGroupUsed: string | null | undefined,
): { jid: string; name: string } | null {
  if (groups.length === 0) return null;
  if (groups.length === 1) return groups[0];

  const lastIndex = groups.findIndex((group) => group.jid === lastGroupUsed);
  if (lastIndex === -1) return groups[0];

  return groups[(lastIndex + 1) % groups.length];
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

function pickPreferredWarmupGroupRow(rows: any[], userId: string): any | null {
  return rows.find((row) => row?.user_id === userId)
    || rows.find((row) => !row?.user_id && row?.is_custom === false)
    || rows[0]
    || null;
}

async function loadAllowedGroupSelections(
  sb: any,
  userId: string,
  deviceId: string,
  identifiers: string[],
): Promise<AllowedGroupSelection[]> {
  const selectionKeys = dedupeStrings(identifiers);
  const selections = new Map<string, AllowedGroupSelection>(
    selectionKeys.map((selectionKey) => {
      const directGroupId = UUID_RE.test(selectionKey) ? selectionKey : null;
      const joinedJid = GROUP_JID_RE.test(selectionKey) ? selectionKey : null;
      const inviteCode = joinedJid ? null : extractInviteCode(selectionKey);

      return [
        selectionKey,
        {
          selectionKey,
          groupId: directGroupId,
          groupIds: directGroupId ? [directGroupId] : [],
          inviteCode,
          link: inviteCode
            ? `https://chat.whatsapp.com/${inviteCode}`
            : !directGroupId && !joinedJid
                ? selectionKey
                : null,
          name: "",
          joinedJid,
        },
      ];
    }),
  );

  if (selections.size === 0) return [];

  const uuidIds = selectionKeys.filter((value) => UUID_RE.test(value));
  const inviteLinks = selectionKeys.filter((value) => !UUID_RE.test(value) && !GROUP_JID_RE.test(value));
  const directJids = selectionKeys.filter((value) => GROUP_JID_RE.test(value));

  if (uuidIds.length > 0) {
    const { data } = await sb
      .from("warmup_groups")
      .select("id, name, link, is_custom, user_id")
      .in("id", uuidIds)
      .or(`user_id.eq.${userId},and(is_custom.eq.false,user_id.is.null)`);

    for (const row of data || []) {
      const key = String(row?.id || "").trim();
      const selection = selections.get(key);
      if (!selection) continue;
      selection.groupIds = dedupeStrings([...selection.groupIds, key]);
      selection.groupId = key || selection.groupId;
      selection.link = String(row?.link || "").trim() || null;
      selection.inviteCode = selection.inviteCode || extractInviteCode(row?.link);
      selection.name = String(row?.name || "").trim();
    }
  }

  if (inviteLinks.length > 0) {
    const canonicalInviteLinks = dedupeStrings(inviteLinks.map((value) => {
      const inviteCode = extractInviteCode(value);
      return inviteCode ? `https://chat.whatsapp.com/${inviteCode}` : value;
    }));

    const { data } = await sb
      .from("warmup_groups")
      .select("id, name, link, is_custom, user_id")
      .in("link", canonicalInviteLinks)
      .or(`user_id.eq.${userId},and(is_custom.eq.false,user_id.is.null)`);

    const rowsByInviteCode = new Map<string, any[]>();
    for (const row of data || []) {
      const inviteCode = extractInviteCode(row?.link);
      if (!inviteCode) continue;
      const current = rowsByInviteCode.get(inviteCode) ?? [];
      current.push(row);
      rowsByInviteCode.set(inviteCode, current);
    }

    for (const inviteLink of inviteLinks) {
      const selection = selections.get(inviteLink);
      if (!selection) continue;
      const inviteCode = selection.inviteCode || extractInviteCode(inviteLink);
      const rows = inviteCode ? rowsByInviteCode.get(inviteCode) ?? [] : [];
      const picked = pickPreferredWarmupGroupRow(rows, userId);
      if (!picked) continue;
      selection.groupIds = dedupeStrings([
        ...selection.groupIds,
        ...rows.map((row) => String(row?.id || "").trim()),
      ]);
      selection.groupId = String(picked?.id || "").trim() || selection.groupId;
      selection.link = String(picked?.link || "").trim() || selection.link;
      selection.name = String(picked?.name || "").trim() || selection.name;
      selection.inviteCode = inviteCode || selection.inviteCode;
    }
  }

  const { data: joinedRows } = await sb
    .from("warmup_instance_groups")
    .select("group_id, group_jid, group_name, invite_link")
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .eq("join_status", "joined")
    .not("group_jid", "is", null);

  const joinedByGroupId = new Map<string, any[]>();
  const joinedByInviteCode = new Map<string, any[]>();
  const joinedByJid = new Map<string, any>();

  for (const row of joinedRows || []) {
    const groupId = String(row?.group_id || "").trim();
    if (groupId) {
      const current = joinedByGroupId.get(groupId) ?? [];
      current.push(row);
      joinedByGroupId.set(groupId, current);
    }

    const inviteCode = extractInviteCode(row?.invite_link);
    if (inviteCode) {
      const current = joinedByInviteCode.get(inviteCode) ?? [];
      current.push(row);
      joinedByInviteCode.set(inviteCode, current);
    }

    const joinedJid = String(row?.group_jid || "").trim();
    if (joinedJid) joinedByJid.set(joinedJid, row);
  }

  for (const selection of selections.values()) {
    let joinedRow: any | null = null;

    for (const candidateGroupId of selection.groupIds) {
      const match = (joinedByGroupId.get(candidateGroupId) ?? [])[0];
      if (match) {
        joinedRow = match;
        break;
      }
    }

    if (!joinedRow && selection.inviteCode) {
      joinedRow = (joinedByInviteCode.get(selection.inviteCode) ?? [])[0] ?? null;
    }

    if (!joinedRow && selection.joinedJid) {
      joinedRow = joinedByJid.get(selection.joinedJid) ?? null;
    }

    if (!joinedRow) continue;

    const joinedGroupId = String(joinedRow?.group_id || "").trim();
    if (joinedGroupId) {
      selection.groupIds = dedupeStrings([...selection.groupIds, joinedGroupId]);
      selection.groupId = joinedGroupId;
    }

    selection.joinedJid = String(joinedRow?.group_jid || "").trim() || selection.joinedJid;
    selection.name = selection.name || String(joinedRow?.group_name || "").trim();
    selection.link = selection.link || String(joinedRow?.invite_link || "").trim() || null;
    selection.inviteCode = selection.inviteCode || extractInviteCode(joinedRow?.invite_link);
  }

  return Array.from(selections.values());
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

  // ── Check device connection status — skip if disconnected ──
  if (!CONNECTED_STATUSES.has(device.status)) {
    log.warn(`Interaction ${interaction.id.slice(0, 8)}: device "${device.name}" is ${device.status} — skipping send`);
    await rescheduleInteraction(sb, interaction.id, 120, {
      last_error: `Dispositivo "${device.name}" desconectado (${device.status}) — aguardando reconexão`,
    });
    return;
  }

  // ── Consecutive error backoff — avoid hammering API ──
  const consecutiveErrors = interaction.consecutive_errors || 0;
  if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    const backoffSeconds = Math.min(BACKOFF_BASE_SECONDS * Math.pow(2, consecutiveErrors - MAX_CONSECUTIVE_ERRORS), 1800);
    log.warn(`Interaction ${interaction.id.slice(0, 8)}: ${consecutiveErrors} consecutive errors — backoff ${backoffSeconds}s`);
    await pauseInteraction(sb, interaction.id, `Pausada automaticamente após ${consecutiveErrors} erros consecutivos. Último: ${interaction.last_error || "desconhecido"}`);
    return;
  }

  const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");

  // Resolve groups strictly from explicit allowlist/JIDs already linked to this interaction
  const allowedSelections = await loadAllowedGroupSelections(sb, userId, device.id, groupIds);

  // Build allowed group list ONLY from warmup_instance_groups joined JIDs — never from the device API
  const resolveFromAllowlist = () => {
    const found: Array<{ jid: string; name: string }> = [];
    const unresolved: string[] = [];

    for (const selection of allowedSelections) {
      // ONLY use the JID that was saved when the device joined the group via warmup
      if (selection.joinedJid) {
        found.push({ jid: selection.joinedJid, name: selection.name || "" });
      } else {
        unresolved.push(selection.selectionKey);
      }
    }

    return { resolved: uniqueGroups(found), unresolved };
  };

  const { resolved, unresolved } = resolveFromAllowlist();

  if (resolved.length === 0) {
    const recognizedSelections = allowedSelections.filter((selection) => selection.groupId || selection.link || selection.joinedJid || selection.name);
    await sb.from("group_interactions")
      .update({
        last_error: `Nenhum grupo permitido foi encontrado (${groupIds.length} configurados, ${recognizedSelections.length} reconhecidos na allowlist, nenhum com JID registrado)`,
        next_action_at: new Date(Date.now() + 300_000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", interaction.id)
      .in("status", ["running", "active"]);
    return;
  }

  if (unresolved.length > 0) {
    const missingCount = groupIds.length - resolved.length;
    log.warn(`Interaction ${interaction.id.slice(0, 8)}: ${missingCount} grupos sem JID registrado em warmup_instance_groups (${resolved.length}/${groupIds.length} usáveis)`);
  }

  // Get messages
  const { data: warmupMsgs } = await sb.from("warmup_messages").select("content").eq("user_id", userId);
  const userMessages = (warmupMsgs || []).map((m: any) => m.content).filter((c: string) => c?.trim());
  const messages = userMessages.length > 0 ? userMessages : Object.values(FALLBACK_MESSAGES).flat();

  // Get user media
  const { data: userMedia } = await sb.from("group_interaction_media").select("*").eq("user_id", userId).eq("is_active", true);
  const mediaByType: Record<string, any[]> = {};
  for (const m of userMedia || []) (mediaByType[m.media_type] ??= []).push(m);

  // Pick next group in deterministic rotation so every allowed group enters the cycle
  const group = pickNextResolvedGroup(resolved, interaction.last_group_used);
  if (!group) {
    await pauseInteraction(sb, interaction.id, "Nenhum grupo permitido disponível para envio");
    return;
  }

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
    updatePayload.consecutive_errors = 0; // Reset on success
  } else {
    // Transient API errors are suppressed from last_error so the client UI stays clean
    const isTransient = /502|503|504|Bad Gateway|Service Unavailable|Gateway Timeout|ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket hang up/i.test(sendError || "");
    updatePayload.last_error = isTransient ? null : sendError;
    updatePayload.consecutive_errors = (interaction.consecutive_errors || 0) + 1;
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
