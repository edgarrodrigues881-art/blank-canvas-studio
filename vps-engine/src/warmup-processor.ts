// ══════════════════════════════════════════════════════════
// VPS Engine — Warmup Job Processor (Phase 3: Inline Processing)
// Replaces Edge Function delegation with direct processing
// ══════════════════════════════════════════════════════════

import { createLogger } from "./lib/logger";
import { getDb } from "./db";
import { config } from "./config";
import { isWithinOperatingWindow, getBrtTodayAt, getBrtDateKey } from "./lib/brt";
import { randInt, pickRandom, generateNaturalMessage, pickMediaTypeGroup, pickMediaTypeCommunity, IMAGE_CAPTIONS, LOCATION_CAPTIONS, FAKE_LOCATIONS, FALLBACK_IMAGES, FALLBACK_AUDIOS, pickFakeLocation } from "./lib/message-generator";
import { uazapiSendText, uazapiSendImage, uazapiSendSticker, uazapiSendAudio, uazapiSendLocation, uazapiCheckPhone, fetchLiveGroups } from "./lib/uazapi";
import {
  getPhaseForDay, isCommunityPhase, hasWarmupAccess, getVolumes, getGroupMsgsForDay,
  getAutosaveContactsForDay, getAutosaveRoundsPerContact, getCommunityStartDayForChip,
  getCommunityPeers, getCommunityPeersFromCommunityDay, getMaxPairsForChip,
  CONNECTED_STATUSES, INTERACTION_JOB_TYPES,
} from "./lib/warmup-rules";
import { scheduleDayJobs, ensureJoinGroupJobs, ensureNextDailyResetJob } from "./lib/warmup-scheduling";

const log = createLogger("warmup-processor");

// ── Cache ──
let _imagePoolCache: string[] | null = null;
let _audioPoolCache: string[] | null = null;

async function getImagePool(db: any): Promise<string[]> {
  if (_imagePoolCache) return _imagePoolCache;
  try {
    const { data: files, error } = await db.storage.from("media").list("warmup-media", { limit: 100 });
    if (!error && files?.length > 0) {
      const base = `${config.supabaseUrl}/storage/v1/object/public/media/warmup-media`;
      const imgs = files.filter((f: any) => f.name && !f.name.startsWith(".") && !f.name.startsWith("Captura") && /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name)).map((f: any) => `${base}/${encodeURIComponent(f.name)}`);
      if (imgs.length > 0) { _imagePoolCache = imgs; return imgs; }
    }
  } catch {}
  _imagePoolCache = [...FALLBACK_IMAGES];
  return _imagePoolCache;
}

async function getAudioPool(db: any): Promise<string[]> {
  if (_audioPoolCache) return _audioPoolCache;
  try {
    const { data: files, error } = await db.storage.from("media").list("warmup-audio", { limit: 100 });
    if (!error && files?.length > 0) {
      const base = `${config.supabaseUrl}/storage/v1/object/public/media/warmup-audio`;
      const audios = files.filter((f: any) => f.name && !f.name.startsWith(".") && /\.(mp3|ogg|wav|m4a|opus)$/i.test(f.name)).map((f: any) => `${base}/${encodeURIComponent(f.name)}`);
      if (audios.length > 0) { _audioPoolCache = audios; return _audioPoolCache; }
    }
  } catch {}
  _audioPoolCache = [...FALLBACK_AUDIOS];
  return _audioPoolCache;
}

// ── Community helpers ──

function getCommunityPeerDeviceId(pair: any, deviceId: string): string {
  return pair.instance_id_a === deviceId ? pair.instance_id_b : pair.instance_id_a;
}

function getCommunityInitiatorDeviceId(pair: any, initiator: "a" | "b"): string {
  return initiator === "b" ? pair.instance_id_b : pair.instance_id_a;
}

function normalizeCommunityPairMeta(pair: any): any {
  const raw = pair?.meta && typeof pair.meta === "object" ? pair.meta as Record<string, any> : {};
  const initiator: "a" | "b" = raw.initiator === "b" ? "b" : "a";
  const maxTurns = Number.isInteger(raw.max_turns) && raw.max_turns >= 2 && raw.max_turns <= 120 ? raw.max_turns : randInt(40, 80);
  const rawTurns = Number.isInteger(raw.turns_completed) && raw.turns_completed >= 0 ? raw.turns_completed : 0;
  const turnsCompleted = Math.min(rawTurns, maxTurns);
  const initiatorDeviceId = getCommunityInitiatorDeviceId(pair, initiator);
  const peerDeviceId = getCommunityPeerDeviceId(pair, initiatorDeviceId);
  const fallbackExpected = turnsCompleted === 0 ? initiatorDeviceId : turnsCompleted % 2 === 1 ? peerDeviceId : initiatorDeviceId;

  return {
    initiator,
    expected_sender_device_id: turnsCompleted >= maxTurns ? null : (typeof raw.expected_sender_device_id === "string" ? raw.expected_sender_device_id : fallbackExpected),
    last_sender_device_id: typeof raw.last_sender_device_id === "string" ? raw.last_sender_device_id : null,
    turns_completed: turnsCompleted >= maxTurns ? 0 : turnsCompleted,
    max_turns: maxTurns,
    conversation_id: typeof raw.conversation_id === "string" ? raw.conversation_id : null,
    last_turn_at: typeof raw.last_turn_at === "string" ? raw.last_turn_at : null,
    last_completed_at: typeof raw.last_completed_at === "string" ? raw.last_completed_at : null,
  };
}

async function getActiveCommunityPairsForDevice(db: any, deviceId: string): Promise<any[]> {
  const [{ data: pairsA }, { data: pairsB }] = await Promise.all([
    db.from("community_pairs").select("id, cycle_id, instance_id_a, instance_id_b, meta, created_at").eq("instance_id_a", deviceId).eq("status", "active"),
    db.from("community_pairs").select("id, cycle_id, instance_id_a, instance_id_b, meta, created_at").eq("instance_id_b", deviceId).eq("status", "active"),
  ]);
  const seen = new Set<string>();
  return [...(pairsA || []), ...(pairsB || [])].filter((p: any) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
}

async function closeCommunityPairs(db: any, pairIds: string[]): Promise<number> {
  if (!pairIds.length) return 0;
  for (let i = 0; i < pairIds.length; i += 200) {
    await db.from("community_pairs").update({ status: "closed", closed_at: new Date().toISOString() }).in("id", pairIds.slice(i, i + 200));
  }
  return pairIds.length;
}

async function getActivePairCount(db: any, deviceId: string): Promise<number> {
  const { count: a } = await db.from("community_pairs").select("id", { count: "exact", head: true }).eq("instance_id_a", deviceId).eq("status", "active");
  const { count: b } = await db.from("community_pairs").select("id", { count: "exact", head: true }).eq("instance_id_b", deviceId).eq("status", "active");
  return (a || 0) + (b || 0);
}

async function reconcileCommunityPairs(db: any, params: { deviceId: string; userId: string; cycleId: string; dayIndex: number; chipState: string; communityDay?: number }): Promise<{ pairs: any[]; keptCount: number; createdCount: number; closedCount: number; targetPeers: number }> {
  let communityDay = params.communityDay;
  if (communityDay === undefined) {
    const { data: membership } = await db.from("warmup_community_membership").select("community_day").eq("device_id", params.deviceId).maybeSingle();
    communityDay = membership?.community_day || 0;
  }

  const targetPeers = getCommunityPeers(params.dayIndex, params.chipState, communityDay);
  if (targetPeers <= 0) return { pairs: [], keptCount: 0, createdCount: 0, closedCount: 0, targetPeers };

  const existingPairs = await getActiveCommunityPairsForDevice(db, params.deviceId);
  let validPairs = existingPairs;
  let closedCount = 0;

  // Validate existing pairs
  const peerIds = [...new Set(existingPairs.map((pair: any) => getCommunityPeerDeviceId(pair, params.deviceId)))];
  if (peerIds.length > 0) {
    const [peerDevicesRes, peerMembershipRes, peerCyclesRes] = await Promise.all([
      db.from("devices").select("id, status, number").in("id", peerIds),
      db.from("warmup_community_membership").select("device_id, is_enabled, is_eligible, community_day").in("device_id", peerIds),
      db.from("warmup_cycles").select("device_id, is_running, phase").in("device_id", peerIds).eq("is_running", true),
    ]);
    const peerDevicesMap = Object.fromEntries((peerDevicesRes.data || []).map((r: any) => [r.id, r]));
    const peerMembershipMap = Object.fromEntries((peerMembershipRes.data || []).map((r: any) => [r.device_id, r]));
    const peerCycleMap = Object.fromEntries((peerCyclesRes.data || []).map((r: any) => [r.device_id, r]));

    const PAIR_GRACE_PERIOD_MS = 10 * 60 * 1000;
    const now = Date.now();
    const invalidPairIds = existingPairs
      .filter((pair: any) => {
        const createdAt = pair.created_at ? new Date(pair.created_at).getTime() : 0;
        if (createdAt && (now - createdAt) < PAIR_GRACE_PERIOD_MS) return false;
        const meta = pair.meta && typeof pair.meta === "object" ? pair.meta as Record<string, any> : {};
        if (meta.conversation_id && meta.expected_sender_device_id) return false;
        const peerId = getCommunityPeerDeviceId(pair, params.deviceId);
        const pd = peerDevicesMap[peerId];
        const pm = peerMembershipMap[peerId];
        const pc = peerCycleMap[peerId];
        return !pd?.number || !CONNECTED_STATUSES.includes(pd.status) || !pm?.is_enabled || !pm?.is_eligible || !pc?.is_running || ["paused", "completed", "error"].includes(pc.phase);
      })
      .map((pair: any) => pair.id);
    if (invalidPairIds.length > 0) {
      closedCount += await closeCommunityPairs(db, invalidPairIds);
      const invalidSet = new Set(invalidPairIds);
      validPairs = existingPairs.filter((pair: any) => !invalidSet.has(pair.id));
    }
  }

  // Dedup by peer
  if (validPairs.length > 1) {
    const pairByPeer = new Map<string, any>();
    const duplicateIds: string[] = [];
    for (const pair of validPairs) {
      const peerId = getCommunityPeerDeviceId(pair, params.deviceId);
      if (!pairByPeer.has(peerId)) { pairByPeer.set(peerId, pair); continue; }
      const keptPair = pairByPeer.get(peerId);
      const keptMeta = normalizeCommunityPairMeta(keptPair);
      const currentMeta = normalizeCommunityPairMeta(pair);
      const keptTouch = Math.max(keptMeta.last_turn_at ? new Date(keptMeta.last_turn_at).getTime() : 0, keptMeta.last_completed_at ? new Date(keptMeta.last_completed_at).getTime() : 0);
      const currentTouch = Math.max(currentMeta.last_turn_at ? new Date(currentMeta.last_turn_at).getTime() : 0, currentMeta.last_completed_at ? new Date(currentMeta.last_completed_at).getTime() : 0);
      if (currentTouch > keptTouch) { duplicateIds.push(keptPair.id); pairByPeer.set(peerId, pair); } else { duplicateIds.push(pair.id); }
    }
    if (duplicateIds.length > 0) { closedCount += await closeCommunityPairs(db, duplicateIds); validPairs = Array.from(pairByPeer.values()); }
  }

  // Trim excess pairs
  if (validPairs.length > targetPeers) {
    const withConv = validPairs.filter((p: any) => { const m = p.meta && typeof p.meta === "object" ? p.meta as Record<string, any> : {}; return Boolean(m.conversation_id && m.expected_sender_device_id); });
    const withoutConv = validPairs.filter((p: any) => { const m = p.meta && typeof p.meta === "object" ? p.meta as Record<string, any> : {}; return !m.conversation_id || !m.expected_sender_device_id; });
    const kept = [...withConv];
    const remaining = [...withoutConv].sort(() => Math.random() - 0.5);
    while (kept.length < targetPeers && remaining.length > 0) kept.push(remaining.shift()!);
    if (remaining.length > 0) closedCount += await closeCommunityPairs(db, remaining.map((p: any) => p.id));
    validPairs = kept;
  }

  // Create new pairs
  const usedDevices = new Set<string>(validPairs.map((p: any) => getCommunityPeerDeviceId(p, params.deviceId)));
  usedDevices.add(params.deviceId);
  let createdCount = 0;

  if (validPairs.length < targetPeers) {
    const { data: eligible } = await db.from("warmup_community_membership")
      .select("device_id, user_id, community_day").eq("is_enabled", true).eq("is_eligible", true).gte("community_day", 1).neq("device_id", params.deviceId).limit(200);
    const candidateIds = [...new Set((eligible || []).map((r: any) => String(r.device_id || "")).filter((id: string) => id.length > 0))].filter((id: string) => !usedDevices.has(id));

    if (candidateIds.length > 0) {
      const [candidateDevicesRes, candidateCyclesRes] = await Promise.all([
        db.from("devices").select("id, user_id, name, status, number").in("id", candidateIds),
        db.from("warmup_cycles").select("id, device_id, user_id, chip_state, day_index, phase, is_running").in("device_id", candidateIds).eq("is_running", true),
      ]);
      const candidateDeviceMap = Object.fromEntries((candidateDevicesRes.data || []).map((r: any) => [r.id, r]));
      const candidateCycleMap = Object.fromEntries((candidateCyclesRes.data || []).map((r: any) => [r.device_id, r]));
      const sortedEligible = [...(eligible || [])].sort(() => Math.random() - 0.5);

      for (const candidate of sortedEligible) {
        if (validPairs.length + createdCount >= targetPeers) break;
        if (usedDevices.has(candidate.device_id)) continue;
        const pd = candidateDeviceMap[candidate.device_id];
        const pc = candidateCycleMap[candidate.device_id];
        if (!pd?.number || !CONNECTED_STATUSES.includes(pd.status)) continue;
        if (!pc?.is_running || ["paused", "completed", "error"].includes(pc.phase)) continue;
        const pairCount = await getActivePairCount(db, candidate.device_id);
        const pcd = candidate.community_day || 1;
        if (pairCount >= getMaxPairsForChip(pc.chip_state || "new", pcd)) continue;

        const { data: insertedPair } = await db.from("community_pairs")
          .insert({ cycle_id: params.cycleId, instance_id_a: params.deviceId, instance_id_b: candidate.device_id, status: "active", meta: { initiator: (communityDay || 1) >= pcd ? "a" : "b", is_new: true } })
          .select("id, cycle_id, instance_id_a, instance_id_b, meta").maybeSingle();
        usedDevices.add(candidate.device_id);
        createdCount++;
        if (insertedPair) validPairs.push(insertedPair);
      }

      // Fallback for odd chip
      if (validPairs.length + createdCount === 0 && targetPeers > 0) {
        for (const candidate of sortedEligible) {
          if (usedDevices.has(candidate.device_id)) continue;
          const pd = candidateDeviceMap[candidate.device_id];
          const pc = candidateCycleMap[candidate.device_id];
          if (!pd?.number || !CONNECTED_STATUSES.includes(pd.status)) continue;
          if (!pc?.is_running || ["paused", "completed", "error"].includes(pc.phase)) continue;
          const pairCount = await getActivePairCount(db, candidate.device_id);
          const pcd = candidate.community_day || 1;
          if (pairCount >= getMaxPairsForChip(pc.chip_state || "new", pcd) + 1) continue;

          const { data: insertedPair } = await db.from("community_pairs")
            .insert({ cycle_id: params.cycleId, instance_id_a: params.deviceId, instance_id_b: candidate.device_id, status: "active", meta: { initiator: (communityDay || 1) >= pcd ? "a" : "b", is_new: true, is_odd_fallback: true } })
            .select("id, cycle_id, instance_id_a, instance_id_b, meta").maybeSingle();
          createdCount++;
          if (insertedPair) validPairs.push(insertedPair);
          break;
        }
      }
    }
  }

  return { pairs: validPairs, keptCount: Math.max(validPairs.length - createdCount, 0), createdCount, closedCount, targetPeers };
}

async function enqueueCommunityTurn(db: any, params: { user_id: string; device_id: string; cycle_id: string; pair_id: string; conversation_id: string; turn_index: number; delay_seconds: number }) {
  const { data: existing } = await db.from("warmup_jobs")
    .select("id").eq("status", "pending").eq("device_id", params.device_id).eq("cycle_id", params.cycle_id).eq("job_type", "community_interaction")
    .contains("payload", { pair_id: params.pair_id, conversation_id: params.conversation_id, turn_index: params.turn_index }).limit(1);
  if (existing?.length) return;
  await db.from("warmup_jobs").insert({
    user_id: params.user_id, device_id: params.device_id, cycle_id: params.cycle_id,
    job_type: "community_interaction",
    payload: { pair_id: params.pair_id, conversation_id: params.conversation_id, turn_index: params.turn_index, source: "community_reply" },
    run_at: new Date(Date.now() + params.delay_seconds * 1000).toISOString(), status: "pending",
  });
}

// ══════════════════════════════════════════════════════════
// MAIN JOB PROCESSOR — Ported from Edge Function
// ══════════════════════════════════════════════════════════

export interface ProcessJobContext {
  cycle: any;
  device: any;
  baseUrl: string;
  token: string;
  chipState: string;
  // Lookup maps (pre-loaded)
  subsMap: Record<string, any>;
  profilesMap: Record<string, any>;
  tokenMap: Record<string, string>;
  userMsgsMap: Record<string, string[]>;
  autosaveMap: Record<string, any[]>;
  instanceGroupsMap: Record<string, any[]>;
  groupsMap: Record<string, any>;
  imagePool: string[];
  audioPool: string[];
  // State
  pausedCycles: Set<string>;
  auditBuffer: any[];
  opLogBuffer: any[];
}

function bufferAudit(ctx: ProcessJobContext, entry: any) {
  ctx.auditBuffer.push(entry);
  ctx.opLogBuffer.push({
    user_id: entry.user_id, device_id: entry.device_id || null,
    event: `warmup_${String(entry.event_type || "event")}`,
    details: String(entry.message || entry.event_type || "warmup_event").slice(0, 500),
    meta: { cycle_id: entry.cycle_id || null, level: entry.level || "info", event_type: entry.event_type || null, ...(entry.meta || {}) },
  });
}

export async function processJob(db: any, job: any, ctx: ProcessJobContext): Promise<boolean> {
  const { cycle, device, baseUrl, token, chipState } = ctx;
  const withinWindow = isWithinOperatingWindow();

  if (!cycle || !cycle.is_running || ctx.pausedCycles.has(cycle.id)) {
    await db.from("warmup_jobs").update({ status: "cancelled" }).eq("id", job.id);
    return false;
  }

  // Plan check
  const userSub = ctx.subsMap[cycle.user_id];
  const userProf = ctx.profilesMap[cycle.user_id];
  if (!hasWarmupAccess(userSub, userProf) || userProf?.status === "suspended" || userProf?.status === "cancelled") {
    await db.from("warmup_cycles").update({ is_running: false, phase: "paused", previous_phase: cycle.phase, last_error: "Auto-pausado: plano inativo" }).eq("id", cycle.id);
    ctx.pausedCycles.add(cycle.id);
    cycle.is_running = false;
    await db.from("warmup_jobs").update({ status: "cancelled" }).eq("id", job.id);
    return false;
  }

  // Device check
  if (!device || !CONNECTED_STATUSES.includes(device.status)) {
    if (!ctx.pausedCycles.has(cycle.id)) {
      await db.from("warmup_cycles").update({ is_running: false, phase: "paused", previous_phase: cycle.phase, last_error: "Auto-pausado: instância desconectada" }).eq("id", cycle.id);
      await db.from("warmup_jobs").update({ status: "cancelled" }).eq("cycle_id", cycle.id).eq("status", "pending");
      bufferAudit(ctx, { user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id, level: "warn", event_type: "auto_paused_disconnected", message: `Aquecimento pausado: instância desconectada (fase: ${cycle.phase})` });
      ctx.pausedCycles.add(cycle.id);
      cycle.is_running = false;
    }
    await db.from("warmup_jobs").update({ status: "cancelled" }).eq("id", job.id);
    return false;
  }

  if (!token || !baseUrl) {
    await db.from("warmup_jobs").update({ status: "failed", last_error: "Credenciais UAZAPI ausentes" }).eq("id", job.id);
    return false;
  }

  // Budget check for interaction jobs
  if (INTERACTION_JOB_TYPES.includes(job.job_type)) {
    if (!withinWindow && !job.payload?.forced) {
      await db.from("warmup_jobs").update({ status: "cancelled", last_error: "Fora da janela 07-19 BRT" }).eq("id", job.id);
      return false;
    }
    const { data: freshBudget } = await db.from("warmup_cycles")
      .select("daily_interaction_budget_used, daily_interaction_budget_target").eq("id", cycle.id).single();
    if (freshBudget) {
      cycle.daily_interaction_budget_used = freshBudget.daily_interaction_budget_used || 0;
      cycle.daily_interaction_budget_target = freshBudget.daily_interaction_budget_target || 500;
    }
    const used = cycle.daily_interaction_budget_used || 0;
    const limit = cycle.daily_interaction_budget_target || 500;
    if (used >= limit) {
      await db.from("warmup_jobs").update({ status: "cancelled", last_error: `Budget atingido: ${used}/${limit}` }).eq("id", job.id);
      return false;
    }
  }

  switch (job.job_type) {
    case "join_group":
      return await processJoinGroup(db, job, ctx);
    case "group_interaction":
      return await processGroupInteraction(db, job, ctx);
    case "autosave_interaction":
      return await processAutosaveInteraction(db, job, ctx);
    case "community_interaction":
      return await processCommunityInteraction(db, job, ctx);
    case "daily_reset":
      return await processDailyReset(db, job, ctx);
    case "phase_transition":
      return await processPhaseTransition(db, job, ctx);
    case "enable_autosave":
    case "enable_community":
      return await processEnablePhase(db, job, ctx);
    case "health_check":
      bufferAudit(ctx, { user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id, level: "info", event_type: "health_check", message: `Health OK — device ${device.status}, day ${cycle.day_index}` });
      return true;
    default:
      log.warn(`Unknown job type: ${job.job_type}`);
      return false;
  }
}

// ── JOIN GROUP ──
async function processJoinGroup(db: any, job: any, ctx: ProcessJobContext): Promise<boolean> {
  const { baseUrl, token } = ctx;
  const groupId = job.payload?.group_id;
  const groupName = job.payload?.group_name || groupId;
  const existingIGs = ctx.instanceGroupsMap[job.cycle_id] || [];
  const record = existingIGs.find((ig: any) => ig.group_id === groupId);

  if (record?.join_status === "joined" || record?.join_status === "left") {
    bufferAudit(ctx, { user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id, level: "info", event_type: "join_group", message: `Grupo ${groupName} ${record.join_status} — ignorado` });
    return true;
  }

  const directInviteLink = job.payload?.invite_link || record?.invite_link;
  const groupRef = ctx.groupsMap[groupId];
  if (!directInviteLink && !groupRef?.external_group_ref) throw new Error(`Grupo ${groupName} sem link de convite`);

  const inviteLink = directInviteLink || groupRef.external_group_ref;
  const inviteCode = inviteLink.replace(/^https?:\/\//, "").replace(/^chat\.whatsapp\.com\//, "").split("?")[0].split("/")[0].trim();
  if (!inviteCode || inviteCode.length < 10) throw new Error(`Código inválido: ${inviteLink}`);

  let joinOk = false;
  let joinJid: string | null = null;

  const extractJid = (parsed: any): string | null => {
    const candidates = [parsed?.group?.JID, parsed?.group?.jid, parsed?.group?.id, parsed?.data?.group?.JID, parsed?.data?.group?.jid, parsed?.data?.group?.id, parsed?.data?.JID, parsed?.data?.jid, parsed?.data?.id, parsed?.data?.gid, parsed?.data?.groupId, parsed?.data?.chatId, parsed?.gid, parsed?.groupId, parsed?.jid, parsed?.id, parsed?.chatId];
    for (const c of candidates) { if (c && typeof c === "string" && c.includes("@g.us")) return c; }
    const jsonStr = JSON.stringify(parsed);
    const m = jsonStr.match(/(\d+@g\.us)/);
    return m ? m[1] : null;
  };

  const endpoints = [
    { method: "POST", url: `${baseUrl}/group/join`, body: JSON.stringify({ invitecode: inviteCode }) },
    { method: "POST", url: `${baseUrl}/group/acceptInvite`, body: JSON.stringify({ invitecode: inviteCode }) },
    { method: "GET", url: `${baseUrl}/group/join/${inviteCode}`, body: undefined },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, { method: ep.method as any, headers: { "Content-Type": "application/json", token, Accept: "application/json" }, ...(ep.body ? { body: ep.body } : {}) });
      const raw = await res.text();
      if (res.ok) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.error && typeof parsed.error === "string") continue;
          joinJid = extractJid(parsed);
          joinOk = true;
          break;
        } catch { joinOk = true; break; }
      }
      if (res.status === 409 || raw.includes("already") || raw.includes("já")) { joinOk = true; break; }
    } catch {}
  }

  if (joinOk) {
    const updateData: any = { join_status: "joined", joined_at: new Date().toISOString() };
    if (joinJid) updateData.group_jid = joinJid;
    if (record) await db.from("warmup_instance_groups").update(updateData).eq("id", record.id);
    bufferAudit(ctx, { user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id, level: "info", event_type: "group_joined", message: `Entrou no grupo ${groupName}${joinJid ? ` (JID: ${joinJid})` : ""}` });
  } else {
    if (record) await db.from("warmup_instance_groups").update({ join_status: "failed" }).eq("id", record.id);
    throw new Error(`Falha ao entrar no grupo ${groupName}`);
  }
  return true;
}

// ── GROUP INTERACTION ──
async function processGroupInteraction(db: any, job: any, ctx: ProcessJobContext): Promise<boolean> {
  const { cycle, baseUrl, token } = ctx;

  let allIGs = ctx.instanceGroupsMap[job.cycle_id] || [];
  let joinedGroups = allIGs.filter((ig: any) => ig.join_status === "joined" && ig.device_id === job.device_id);

  // Auto-sync if no joined groups
  if (joinedGroups.length === 0 && allIGs.length > 0) {
    try {
      const liveGroups = await fetchLiveGroups(baseUrl, token);
      if (liveGroups.length > 0) {
        const liveJids = new Set(liveGroups.map((g: any) => String(g.jid || g.id || g.JID || "").toLowerCase().trim()));
        for (const ig of allIGs) {
          if (ig.join_status === "joined" || ig.device_id !== job.device_id) continue;
          const igJid = String(ig.group_jid || "").toLowerCase().trim();
          if (igJid && liveJids.has(igJid)) {
            await db.from("warmup_instance_groups").update({ join_status: "joined", joined_at: new Date().toISOString() }).eq("id", ig.id);
            ig.join_status = "joined";
          }
        }
        joinedGroups = allIGs.filter((ig: any) => ig.join_status === "joined" && ig.device_id === job.device_id);
      }
    } catch {}
  }

  // Resolve group JID with least-used strategy
  let groupJid: string | null = null;
  let groupName = "Grupo";

  if (joinedGroups.length > 0) {
    const resetFloor = cycle.last_daily_reset_at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: groupCounts } = await db.from("warmup_audit_logs").select("meta").eq("cycle_id", cycle.id).eq("event_type", "group_msg_sent").gte("created_at", resetFloor);
    const jidCountMap = new Map<string, number>();
    for (const row of groupCounts || []) { const jid = row.meta?.group_jid; if (jid) jidCountMap.set(jid, (jidCountMap.get(jid) || 0) + 1); }

    const resolved: Array<{ target: any; jid: string; count: number }> = [];
    for (const target of joinedGroups) {
      if (target.group_jid) resolved.push({ target, jid: target.group_jid, count: jidCountMap.get(target.group_jid) || 0 });
    }
    if (resolved.length > 0) {
      resolved.sort((a, b) => a.count - b.count || (Math.random() - 0.5));
      const chosen = resolved[0];
      groupJid = chosen.jid;
      const grpRef = ctx.groupsMap[chosen.target.group_id];
      groupName = grpRef?.name || chosen.target.group_name || "Grupo";
    }
  }

  if (!groupJid) {
    await db.from("warmup_jobs").update({ status: "cancelled", last_error: "Sem grupos com JID resolvido" }).eq("cycle_id", job.cycle_id).eq("job_type", "group_interaction").eq("status", "pending");
    await ensureJoinGroupJobs(db, job.cycle_id, job.user_id, job.device_id);
    throw new Error("Nenhum grupo com JID resolvido");
  }

  // Send message
  const cachedMsgs = ctx.userMsgsMap[job.user_id];
  const longCachedMsgs = cachedMsgs?.filter((m: string) => m.length >= 60) || [];
  const getMsg = () => longCachedMsgs.length > 0 && Math.random() < 0.3 ? pickRandom(longCachedMsgs) : generateNaturalMessage("group");

  const mediaType = pickMediaTypeGroup(cycle.daily_interaction_budget_used || 0);
  let message = getMsg();

  try {
    if (mediaType === "image") {
      const imgUrl = pickRandom(ctx.imagePool);
      const caption = pickRandom(IMAGE_CAPTIONS);
      await uazapiSendImage(baseUrl, token, groupJid, imgUrl, "");
      await new Promise(r => setTimeout(r, randInt(1000, 3000)));
      await uazapiSendText(baseUrl, token, groupJid, caption, true);
      message = `[IMG+TXT] ${caption}`;
    } else if (mediaType === "sticker") {
      const imgUrl = pickRandom(ctx.imagePool);
      await uazapiSendSticker(baseUrl, token, groupJid, imgUrl);
      message = "[STICKER] 🎭";
    } else {
      await uazapiSendText(baseUrl, token, groupJid, message, true);
    }
  } catch {
    message = getMsg();
    await uazapiSendText(baseUrl, token, groupJid, message, true);
  }

  await db.rpc("increment_warmup_budget", { p_cycle_id: cycle.id, p_increment: 1, p_unique_recipient: false });
  bufferAudit(ctx, { user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id, level: "info", event_type: "group_msg_sent", message: `Msg no grupo ${groupName}: "${message.substring(0, 50)}"`, meta: { group_jid: groupJid, media_type: mediaType } });
  return true;
}

// ── AUTOSAVE INTERACTION ──
async function processAutosaveInteraction(db: any, job: any, ctx: ProcessJobContext): Promise<boolean> {
  const { cycle, baseUrl, token, chipState } = ctx;
  const userProfile = ctx.profilesMap[job.user_id];
  if (userProfile?.autosave_enabled === false) {
    await db.from("warmup_jobs").update({ status: "cancelled", last_error: "Auto Save desativado pelo usuário" }).eq("cycle_id", job.cycle_id).eq("job_type", "autosave_interaction").in("status", ["pending", "running"]);
    return false;
  }

  const rIdx = Number(job.payload?.recipient_index ?? 0);
  const mIdx = Number(job.payload?.msg_index ?? 0);
  const contacts = ctx.autosaveMap[job.user_id] || [];
  const maxRounds = getAutosaveRoundsPerContact(chipState);
  if (mIdx >= maxRounds) { await db.from("warmup_jobs").update({ status: "cancelled" }).eq("id", job.id); return false; }

  const autosavePool = contacts.map((c: any) => ({ ...c, _phone: String(c.phone_e164 || "").replace(/\D/g, "") })).filter((c: any) => c._phone.length >= 10);
  if (!autosavePool.length) { bufferAudit(ctx, { user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id, level: "warn", event_type: "autosave_no_contacts", message: "Nenhum contato Auto Save válido" }); return true; }

  const contactsForDay = getAutosaveContactsForDay(cycle.day_index || 1, chipState);
  const rotatedPool = autosavePool.slice(0, contactsForDay);
  if (!rotatedPool.length || rIdx >= rotatedPool.length) return true;

  const target = rotatedPool[rIdx];
  const msg = generateNaturalMessage("autosave");

  // First msg: validate phone
  if (mIdx === 0) {
    try {
      const hasWa = await uazapiCheckPhone(baseUrl, token, target._phone);
      if (!hasWa) {
        await db.from("warmup_autosave_contacts").update({ contact_status: "invalid", is_active: false }).eq("id", target.id);
        bufferAudit(ctx, { user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id, level: "warn", event_type: "autosave_contact_invalid", message: `Contato ${target._phone} sem WhatsApp — desativado` });
        return true;
      }
    } catch {}
  }

  try {
    await uazapiSendText(baseUrl, token, target._phone, msg);
  } catch (e: any) {
    if (mIdx === 0) {
      await db.from("warmup_autosave_contacts").update({ contact_status: "discarded", is_active: false }).eq("id", target.id);
      return true;
    }
    // Retry once
    await new Promise(r => setTimeout(r, 2000));
    await uazapiSendText(baseUrl, token, target._phone, msg);
  }

  const touchTimestamp = new Date().toISOString();
  if (mIdx === maxRounds - 1) {
    await db.from("warmup_autosave_contacts").update({ contact_status: "used", last_used_at: touchTimestamp, use_count: (target.use_count || 0) + 1, updated_at: touchTimestamp }).eq("id", target.id);
    // Check rotation reset
    const allContacts = ctx.autosaveMap[job.user_id] || [];
    const remainingNew = allContacts.filter((c: any) => (c.contact_status || "new") === "new");
    if (remainingNew.length === 0 && allContacts.length > 0) {
      await db.from("warmup_autosave_contacts").update({ contact_status: "new" }).eq("user_id", job.user_id).eq("is_active", true).eq("contact_status", "used");
    }
  } else {
    await db.from("warmup_autosave_contacts").update({ last_used_at: touchTimestamp, updated_at: touchTimestamp }).eq("id", target.id);
  }

  try { await db.from("warmup_unique_recipients").insert({ cycle_id: cycle.id, user_id: job.user_id, recipient_phone_e164: target.phone_e164, day_date: new Date().toISOString().split("T")[0] }); } catch {}
  await db.rpc("increment_warmup_budget", { p_cycle_id: cycle.id, p_increment: 1, p_unique_recipient: mIdx === 0 });
  bufferAudit(ctx, { user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id, level: "info", event_type: "autosave_msg_sent", message: `Auto Save: msg ${mIdx + 1}/${maxRounds} para ${target.contact_name || target._phone}`, meta: { recipient_index: rIdx, msg_index: mIdx, phone: target._phone } });
  return true;
}

// ── COMMUNITY INTERACTION ──
async function processCommunityInteraction(db: any, job: any, ctx: ProcessJobContext): Promise<boolean> {
  const { cycle, device, baseUrl, token } = ctx;

  // Auto-create membership
  const { data: myMembership } = await db.from("warmup_community_membership").select("id, is_enabled, community_day").eq("device_id", job.device_id).maybeSingle();
  if (!myMembership) {
    await db.from("warmup_community_membership").insert({ user_id: job.user_id, device_id: job.device_id, cycle_id: cycle.id, is_eligible: true, is_enabled: true, enabled_at: new Date().toISOString(), community_mode: "warmup_managed", community_day: 1 });
  } else {
    const fixData: any = {};
    if (!myMembership.is_enabled) { fixData.is_enabled = true; fixData.is_eligible = true; }
    if (myMembership.community_day === 0) fixData.community_day = 1;
    if (Object.keys(fixData).length > 0) await db.from("warmup_community_membership").update(fixData).eq("id", myMembership.id);
  }

  const isReplyTurn = typeof job.payload?.pair_id === "string" && typeof job.payload?.conversation_id === "string";

  if (isReplyTurn) {
    // Process reply turn
    const { data: selectedPair } = await db.from("community_pairs").select("id, cycle_id, instance_id_a, instance_id_b, meta").eq("id", job.payload.pair_id).eq("status", "active").maybeSingle();
    if (!selectedPair) return false;
    return await processCommunityTurn(db, job, ctx, selectedPair, job.payload.turn_index || 0, true);
  }

  // Initiate or pick pair to interact with
  const pairs = await reconcileCommunityPairs(db, { deviceId: job.device_id, userId: job.user_id, cycleId: cycle.id, dayIndex: cycle.day_index, chipState: ctx.chipState });

  if (!pairs.pairs.length) {
    const retryAt = new Date(Date.now() + randInt(180, 600) * 1000).toISOString();
    await db.from("warmup_jobs").update({ status: "pending", run_at: retryAt, last_error: "Sem pares disponíveis", attempts: (job.attempts || 0) + 1 }).eq("id", job.id);
    return false;
  }

  // Score pairs by priority
  const scored: Array<{ pair: any; priority: number }> = [];
  for (const pair of pairs.pairs) {
    const meta = normalizeCommunityPairMeta(pair);
    const peerDeviceId = getCommunityPeerDeviceId(pair, job.device_id);
    const { data: peerDev } = await db.from("devices").select("id, number, status").eq("id", peerDeviceId).maybeSingle();
    if (!peerDev?.number || !CONNECTED_STATUSES.includes(peerDev.status)) continue;

    if (meta.expected_sender_device_id === job.device_id) {
      scored.push({ pair, priority: 1 }); // I need to reply
    } else if (!meta.conversation_id || !meta.expected_sender_device_id) {
      const lastCompletedMs = meta.last_completed_at ? new Date(meta.last_completed_at).getTime() : 0;
      if (lastCompletedMs && (Date.now() - lastCompletedMs) < 5 * 60 * 1000) continue; // cooldown
      scored.push({ pair, priority: 2 }); // Can initiate
    }
  }

  if (!scored.length) {
    const attempts = (job.attempts || 0) + 1;
    if (attempts >= 5) {
      await db.from("warmup_jobs").update({ status: "failed", last_error: `Todos os pares ocupados após ${attempts} tentativas`, attempts }).eq("id", job.id);
    } else {
      const retryAt = new Date(Date.now() + randInt(180, 600) * 1000).toISOString();
      await db.from("warmup_jobs").update({ status: "pending", run_at: retryAt, last_error: "Todos os pares ocupados", attempts }).eq("id", job.id);
    }
    return false;
  }

  scored.sort((a, b) => a.priority - b.priority);

  for (const candidate of scored) {
    const result = await processCommunityTurn(db, job, ctx, candidate.pair, 0, false);
    if (result) return true;
  }

  return false;
}

async function processCommunityTurn(db: any, job: any, ctx: ProcessJobContext, selectedPair: any, currentTurnIndex: number, isReply: boolean): Promise<boolean> {
  const { cycle, device, baseUrl, token } = ctx;
  const rawMeta = selectedPair.meta && typeof selectedPair.meta === "object" ? selectedPair.meta as Record<string, any> : {};
  const pairMeta = normalizeCommunityPairMeta(selectedPair);
  const peerDeviceId = getCommunityPeerDeviceId(selectedPair, job.device_id);

  const { data: peerDev } = await db.from("devices").select("id, number, status").eq("id", peerDeviceId).maybeSingle();
  if (!peerDev?.number || !CONNECTED_STATUSES.includes(peerDev.status)) return false;

  const peerPhone = peerDev.number.replace(/\+/g, "");
  const maxTurns = pairMeta.max_turns || 4;
  const nextTurnNumber = currentTurnIndex + 1;
  const hasNextTurn = nextTurnNumber < maxTurns;

  let nextCycle: any = null;
  if (hasNextTurn) {
    const { data: nc } = await db.from("warmup_cycles").select("id, user_id").eq("device_id", peerDeviceId).eq("is_running", true).neq("phase", "completed").order("created_at", { ascending: false }).limit(1).maybeSingle();
    nextCycle = nc;
    if (!nextCycle) return false;
  }

  const mediaType = pickMediaTypeCommunity(cycle.daily_interaction_budget_used || 0);
  let msg = generateNaturalMessage("community");

  try {
    if (mediaType === "image") {
      const imgUrl = pickRandom(ctx.imagePool);
      const caption = pickRandom(IMAGE_CAPTIONS);
      await uazapiSendImage(baseUrl, token, peerPhone, imgUrl, "");
      await new Promise(r => setTimeout(r, randInt(1000, 3000)));
      await uazapiSendText(baseUrl, token, peerPhone, caption);
      msg = `[IMG+TXT] ${caption}`;
    } else if (mediaType === "audio") {
      const audioUrl = pickRandom(ctx.audioPool);
      await uazapiSendAudio(baseUrl, token, peerPhone, audioUrl);
      msg = "[AUDIO] 🎤";
    } else if (mediaType === "location") {
      const loc = pickFakeLocation();
      const locCaption = pickRandom(LOCATION_CAPTIONS);
      await uazapiSendLocation(baseUrl, token, peerPhone, loc.lat, loc.lng, loc.name);
      await new Promise(r => setTimeout(r, randInt(1000, 2000)));
      await uazapiSendText(baseUrl, token, peerPhone, locCaption);
      msg = `[LOC+TXT] ${loc.name}: ${locCaption}`;
    } else {
      await uazapiSendText(baseUrl, token, peerPhone, msg);
    }
  } catch {
    msg = generateNaturalMessage("community");
    await uazapiSendText(baseUrl, token, peerPhone, msg);
  }

  const nowIso = new Date().toISOString();
  const conversationId = isReply ? String(job.payload.conversation_id) : job.id;
  const nextMeta = {
    ...rawMeta,
    initiator: hasNextTurn ? (pairMeta.initiator || "a") : null,
    expected_sender_device_id: hasNextTurn ? peerDeviceId : null,
    last_sender_device_id: job.device_id,
    turns_completed: hasNextTurn ? nextTurnNumber : 0,
    max_turns: hasNextTurn ? maxTurns : randInt(40, 80),
    conversation_id: hasNextTurn ? conversationId : null,
    last_turn_at: nowIso,
    last_completed_at: hasNextTurn ? pairMeta.last_completed_at : nowIso,
  };

  await db.from("community_pairs").update({ meta: nextMeta }).eq("id", selectedPair.id);
  await db.rpc("increment_warmup_budget", { p_cycle_id: cycle.id, p_increment: 1, p_unique_recipient: false });

  if (hasNextTurn && nextCycle) {
    await enqueueCommunityTurn(db, { user_id: nextCycle.user_id, device_id: peerDeviceId, cycle_id: nextCycle.id, pair_id: selectedPair.id, conversation_id: conversationId, turn_index: nextTurnNumber, delay_seconds: randInt(8, 35) });
    bufferAudit(ctx, { user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id, level: "info", event_type: "community_turn_sent", message: `Comunitário: turno ${nextTurnNumber}/${maxTurns}`, meta: { pair_id: selectedPair.id, peer_device: peerDeviceId, conversation_id: conversationId, media_type: mediaType } });
  } else {
    bufferAudit(ctx, { user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id, level: "info", event_type: "community_conversation_completed", message: `Comunitário concluído com ${maxTurns} turnos`, meta: { pair_id: selectedPair.id, peer_device: peerDeviceId, turns: maxTurns } });

    // Schedule reburst
    if (isWithinOperatingWindow()) {
      const nextBurstDelay = randInt(15, 45) * 60;
      const endOfWindow = getBrtTodayAt(19).getTime();
      if (Date.now() + nextBurstDelay * 1000 < endOfWindow - 30 * 60 * 1000) {
        await db.from("warmup_jobs").insert({ user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id, job_type: "community_interaction", payload: { source: "auto_reburst", after_completed: selectedPair.id }, run_at: new Date(Date.now() + nextBurstDelay * 1000).toISOString(), status: "pending" });
      }
    }
  }
  return true;
}

// ── DAILY RESET ──
async function processDailyReset(db: any, job: any, ctx: ProcessJobContext): Promise<boolean> {
  const { cycle, chipState } = ctx;

  const nowBrtKey = getBrtDateKey(new Date());
  const lastResetBrtKey = cycle.last_daily_reset_at ? getBrtDateKey(new Date(cycle.last_daily_reset_at)) : null;
  const cycleStartRef = cycle.created_at || cycle.started_at || null;
  const cycleStartBrtKey = cycleStartRef ? getBrtDateKey(new Date(cycleStartRef)) : null;

  if (lastResetBrtKey === nowBrtKey) {
    await ensureNextDailyResetJob(db, job, cycle.id);
    return true;
  }
  if (cycleStartBrtKey === nowBrtKey) {
    await ensureNextDailyResetJob(db, job, cycle.id);
    return true;
  }

  // Block if still in first 24h
  if (cycle.first_24h_ends_at && Date.now() < new Date(cycle.first_24h_ends_at).getTime() && cycle.phase === "pre_24h") {
    const deferred = new Date(cycle.first_24h_ends_at);
    deferred.setUTCHours(9, 45, 0, 0);
    if (deferred.getTime() <= new Date(cycle.first_24h_ends_at).getTime()) deferred.setUTCDate(deferred.getUTCDate() + 1);
    await db.from("warmup_jobs").update({ status: "pending", run_at: deferred.toISOString(), last_error: "" }).eq("id", job.id);
    return false;
  }

  const newDay = (cycle.day_index || 1) + 1;
  if (newDay > cycle.days_total) {
    await db.from("warmup_cycles").update({ is_running: false, phase: "completed", daily_interaction_budget_used: 0, daily_unique_recipients_used: 0, last_daily_reset_at: new Date().toISOString() }).eq("id", cycle.id);
    cycle.is_running = false;
    bufferAudit(ctx, { user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id, level: "info", event_type: "cycle_completed", message: `Ciclo concluído: ${cycle.days_total} dias 🎉` });
    return true;
  }

  const oldPhase = cycle.phase;
  const newPhase = getPhaseForDay(newDay, chipState);

  // Cancel old jobs
  await db.from("warmup_jobs").update({ status: "cancelled", last_error: "Cancelado: reset diário" }).eq("cycle_id", cycle.id).eq("status", "pending").in("job_type", [...INTERACTION_JOB_TYPES, "enable_autosave", "enable_community"]);

  const resetAt = new Date().toISOString();
  await db.from("warmup_cycles").update({ day_index: newDay, phase: newPhase, last_daily_reset_at: resetAt, daily_interaction_budget_used: 0, daily_unique_recipients_used: 0, daily_interaction_budget_target: 0 }).eq("id", cycle.id);
  cycle.day_index = newDay;
  cycle.phase = newPhase;
  cycle.last_daily_reset_at = resetAt;

  // Ensure community membership
  const communityStartDay = getCommunityStartDayForChip(chipState);
  const isFirstCommunityDay = newDay === communityStartDay && !isCommunityPhase(oldPhase);

  if (["autosave_enabled", "community_ramp_up", "community_stable"].includes(newPhase)) {
    const { data: membership } = await db.from("warmup_community_membership").select("id, is_enabled, community_mode, community_day").eq("device_id", job.device_id).maybeSingle();
    if (!membership) {
      await db.from("warmup_community_membership").insert({ user_id: job.user_id, device_id: job.device_id, cycle_id: cycle.id, is_eligible: true, is_enabled: true, enabled_at: resetAt, community_mode: "warmup_managed", community_day: isFirstCommunityDay ? 1 : 0 });
    } else {
      const updateData: any = { is_enabled: true, is_eligible: true, enabled_at: resetAt, cycle_id: cycle.id, community_mode: "warmup_managed" };
      if (isFirstCommunityDay && (membership.community_day || 0) < 1) updateData.community_day = 1;
      await db.from("warmup_community_membership").update(updateData).eq("id", membership.id);
    }
  }

  // Increment community_day
  if (isCommunityPhase(newPhase) && !isFirstCommunityDay) {
    const { data: existingMembership } = await db.from("warmup_community_membership").select("id, community_day, community_mode").eq("device_id", job.device_id).maybeSingle();
    if (existingMembership && existingMembership.community_mode === "warmup_managed") {
      await db.from("warmup_community_membership").update({ community_day: (existingMembership.community_day || 0) + 1, messages_today: 0, pairs_today: 0, cooldown_until: null, last_error: null, last_daily_reset_at: resetAt }).eq("id", existingMembership.id);
    }
  }

  bufferAudit(ctx, { user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id, level: "info", event_type: "daily_reset", message: `Reset: dia ${newDay}/${cycle.days_total}, fase: ${oldPhase} → ${newPhase}`, meta: { day: newDay, phase: newPhase, old_phase: oldPhase } });

  // Reconcile community pairs
  if (isCommunityPhase(newPhase)) {
    await reconcileCommunityPairs(db, { deviceId: job.device_id, userId: job.user_id, cycleId: cycle.id, dayIndex: newDay, chipState });
  }

  await ensureJoinGroupJobs(db, cycle.id, job.user_id, job.device_id);
  await scheduleDayJobs(db, cycle.id, job.user_id, job.device_id, newDay, newPhase, chipState);
  await ensureNextDailyResetJob(db, job, cycle.id);

  return true;
}

// ── PHASE TRANSITION ──
async function processPhaseTransition(db: any, job: any, ctx: ProcessJobContext): Promise<boolean> {
  const { cycle, chipState } = ctx;
  const targetPhase = job.payload?.target_phase || "groups_only";
  await db.from("warmup_jobs").update({ status: "cancelled", last_error: "Cancelado: transição de fase" }).eq("cycle_id", cycle.id).eq("status", "pending").in("job_type", INTERACTION_JOB_TYPES);
  const updateData: any = { phase: targetPhase };
  let dayForSchedule = cycle.day_index;
  if (job.payload?.auto_advance_day && cycle.day_index <= 1) {
    updateData.day_index = 2;
    updateData.last_daily_reset_at = new Date().toISOString();
    dayForSchedule = 2;
  }
  await db.from("warmup_cycles").update(updateData).eq("id", cycle.id);
  if (targetPhase === "groups_only" && cycle.day_index <= 1) await ensureJoinGroupJobs(db, cycle.id, job.user_id, job.device_id);
  await scheduleDayJobs(db, cycle.id, job.user_id, job.device_id, dayForSchedule, targetPhase, chipState);
  bufferAudit(ctx, { user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id, level: "info", event_type: "phase_changed", message: `Fase: ${cycle.phase} → ${targetPhase}` });
  return true;
}

// ── ENABLE PHASE ──
async function processEnablePhase(db: any, job: any, ctx: ProcessJobContext): Promise<boolean> {
  const { cycle, chipState } = ctx;
  if (job.job_type === "enable_autosave") {
    const { count } = await db.from("warmup_autosave_contacts").select("id", { count: "exact", head: true }).eq("user_id", job.user_id).eq("is_active", true);
    if (count && count > 0) {
      await db.from("warmup_cycles").update({ phase: "autosave_enabled" }).eq("id", cycle.id);
      const { data: membership } = await db.from("warmup_community_membership").select("id, is_enabled").eq("device_id", job.device_id).maybeSingle();
      if (!membership) await db.from("warmup_community_membership").insert({ user_id: job.user_id, device_id: job.device_id, cycle_id: cycle.id, is_eligible: true, is_enabled: true, enabled_at: new Date().toISOString() });
      else if (!membership.is_enabled) await db.from("warmup_community_membership").update({ is_enabled: true, is_eligible: true, enabled_at: new Date().toISOString(), cycle_id: cycle.id }).eq("id", membership.id);
    }
  } else {
    await reconcileCommunityPairs(db, { deviceId: job.device_id, userId: job.user_id, cycleId: cycle.id, dayIndex: cycle.day_index, chipState });
    await db.from("warmup_cycles").update({ phase: getPhaseForDay(cycle.day_index, chipState) }).eq("id", cycle.id);
  }
  return true;
}

// ══════════════════════════════════════════════════════════
// BATCH PRE-LOAD — Load all data needed for processing
// ══════════════════════════════════════════════════════════

export async function batchPreload(db: any, jobs: any[]): Promise<{
  cyclesMap: Record<string, any>;
  subsMap: Record<string, any>;
  profilesMap: Record<string, any>;
  devicesMap: Record<string, any>;
  tokenMap: Record<string, string>;
  userMsgsMap: Record<string, string[]>;
  autosaveMap: Record<string, any[]>;
  instanceGroupsMap: Record<string, any[]>;
  groupsMap: Record<string, any>;
  imagePool: string[];
  audioPool: string[];
}> {
  const uniqueCycleIds = [...new Set(jobs.map((j: any) => j.cycle_id))];
  const uniqueUserIds = [...new Set(jobs.map((j: any) => j.user_id))];
  const uniqueDeviceIds = [...new Set(jobs.map((j: any) => j.device_id))];

  async function batchLoad<T>(table: string, cols: string, field: string, ids: string[], extra?: (q: any) => any): Promise<T[]> {
    const results: T[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      let q = db.from(table).select(cols).in(field, ids.slice(i, i + 200));
      if (extra) q = extra(q);
      const { data } = await q;
      if (data) results.push(...data);
    }
    return results;
  }

  const [cyclesArr, subsArr, profilesArr, devicesArr, tokenRows, userMsgsArr, autosaveArr, instanceGroupsArr, groupsPoolArr, imagePool, audioPool] = await Promise.all([
    batchLoad<any>("warmup_cycles", "id, user_id, device_id, phase, is_running, day_index, days_total, chip_state, daily_interaction_budget_min, daily_interaction_budget_max, daily_interaction_budget_target, daily_interaction_budget_used, daily_unique_recipients_cap, daily_unique_recipients_used, first_24h_ends_at, last_daily_reset_at, next_run_at, plan_id, created_at, started_at", "id", uniqueCycleIds),
    batchLoad<any>("subscriptions", "user_id, expires_at, created_at", "user_id", uniqueUserIds, q => q.order("created_at", { ascending: false })),
    batchLoad<any>("profiles", "id, status, instance_override, autosave_enabled", "id", uniqueUserIds),
    batchLoad<any>("devices", "id, status, uazapi_token, uazapi_base_url, number", "id", uniqueDeviceIds),
    batchLoad<any>("user_api_tokens", "device_id, token, status", "device_id", uniqueDeviceIds, q => q.eq("status", "in_use")),
    batchLoad<any>("warmup_messages", "content, user_id", "user_id", uniqueUserIds),
    batchLoad<any>("warmup_autosave_contacts", "id, phone_e164, contact_name, user_id, created_at, updated_at, last_used_at, use_count, contact_status", "user_id", uniqueUserIds, q => q.eq("is_active", true).neq("contact_status", "discarded").neq("contact_status", "invalid").order("use_count", { ascending: true }).order("created_at", { ascending: true }).order("id", { ascending: true })),
    batchLoad<any>("warmup_instance_groups", "id, group_id, group_jid, device_id, cycle_id, join_status, group_name, invite_link", "cycle_id", uniqueCycleIds),
    db.from("warmup_groups").select("id, link, name").then((r: any) => r.data || []),
    getImagePool(db),
    getAudioPool(db),
  ]);

  const cyclesMap: Record<string, any> = {};
  cyclesArr.forEach((c: any) => { cyclesMap[c.id] = c; });
  const subsMap: Record<string, any> = {};
  subsArr.forEach((s: any) => { if (!subsMap[s.user_id]) subsMap[s.user_id] = s; });
  const profilesMap: Record<string, any> = {};
  profilesArr.forEach((p: any) => { profilesMap[p.id] = p; });
  const devicesMapResult: Record<string, any> = {};
  devicesArr.forEach((d: any) => { devicesMapResult[d.id] = d; });
  const tokenMap: Record<string, string> = {};
  tokenRows.forEach((row: any) => { if (row.device_id && !tokenMap[row.device_id]) tokenMap[row.device_id] = String(row.token || "").trim(); });
  const userMsgsMap: Record<string, string[]> = {};
  userMsgsArr.forEach((m: any) => { if (!userMsgsMap[m.user_id]) userMsgsMap[m.user_id] = []; userMsgsMap[m.user_id].push(m.content); });

  // Autosave with disabled user filtering
  const autosaveDisabledUsers = new Set<string>();
  profilesArr.forEach((p: any) => { if (p.autosave_enabled === false) autosaveDisabledUsers.add(p.id); });
  const autosaveMap: Record<string, any[]> = {};
  autosaveArr.forEach((c: any) => {
    if (autosaveDisabledUsers.has(c.user_id)) return;
    if (!autosaveMap[c.user_id]) autosaveMap[c.user_id] = [];
    autosaveMap[c.user_id].push(c);
  });
  Object.values(autosaveMap).forEach((contacts: any[]) => {
    contacts.sort((a, b) => {
      const aNew = (a.contact_status || "new") === "new" ? 0 : 1;
      const bNew = (b.contact_status || "new") === "new" ? 0 : 1;
      if (aNew !== bNew) return aNew - bNew;
      return (a.use_count || 0) - (b.use_count || 0);
    });
  });

  const instanceGroupsMap: Record<string, any[]> = {};
  instanceGroupsArr.forEach((ig: any) => { const key = ig.cycle_id || ig.device_id; if (!instanceGroupsMap[key]) instanceGroupsMap[key] = []; instanceGroupsMap[key].push(ig); });
  const groupsMap: Record<string, any> = {};
  groupsPoolArr.forEach((g: any) => { groupsMap[g.id] = { ...g, external_group_ref: g.link }; });

  return { cyclesMap, subsMap, profilesMap, devicesMap: devicesMapResult, tokenMap, userMsgsMap, autosaveMap, instanceGroupsMap, groupsMap, imagePool, audioPool };
}

export async function flushAuditLogs(db: any, auditBuffer: any[], opLogBuffer: any[]) {
  for (let i = 0; i < auditBuffer.length; i += 100) {
    await db.from("warmup_audit_logs").insert(auditBuffer.slice(i, i + 100));
  }
  for (let i = 0; i < opLogBuffer.length; i += 100) {
    await db.from("operation_logs").insert(opLogBuffer.slice(i, i + 100));
  }
}
