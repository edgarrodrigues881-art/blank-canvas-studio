// ══════════════════════════════════════════════════════════
// VPS Engine — Warmup job scheduling (ported from Edge Function)
// ══════════════════════════════════════════════════════════

import { randInt } from "../utils/message-generator";
import { calculateWindow } from "../utils/brt";
import {
  getVolumes, isCommunityPhase,
} from "./warmup-rules";

function evenSample<T>(arr: T[], n: number): T[] {
  if (n >= arr.length) return arr;
  if (n <= 0) return [];
  const result: T[] = [];
  const step = arr.length / n;
  for (let i = 0; i < n; i++) {
    result.push(arr[Math.min(Math.floor(i * step), arr.length - 1)]);
  }
  return result;
}

export async function ensureNextDailyResetJob(db: any, job: any, cycleId: string): Promise<void> {
  const { data: existing } = await db
    .from("warmup_jobs").select("id")
    .eq("cycle_id", cycleId).eq("job_type", "daily_reset").eq("status", "pending")
    .gt("run_at", new Date().toISOString()).limit(1);
  if (existing?.length) return;

  const nextReset = new Date();
  nextReset.setUTCDate(nextReset.getUTCDate() + 1);
  nextReset.setUTCHours(9, 45, 0, 0);

  await db.from("warmup_jobs").insert({
    user_id: job.user_id, device_id: job.device_id, cycle_id: cycleId,
    job_type: "daily_reset", payload: {}, run_at: nextReset.toISOString(), status: "pending",
  });
}

export async function ensureJoinGroupJobs(db: any, cycleId: string, userId: string, deviceId: string): Promise<number> {
  const { data: existing } = await db.from("warmup_jobs")
    .select("id").eq("cycle_id", cycleId).eq("job_type", "join_group")
    .in("status", ["pending", "running"]).limit(1);
  if (existing?.length > 0) return 0;

  // Reset failed groups to pending for retry
  const { data: failedGroups } = await db.from("warmup_instance_groups")
    .select("id").eq("cycle_id", cycleId).eq("device_id", deviceId).eq("join_status", "failed");
  if (failedGroups?.length) {
    await db.from("warmup_instance_groups")
      .update({ join_status: "pending" })
      .eq("cycle_id", cycleId).eq("device_id", deviceId).eq("join_status", "failed");
  }

  const { data: pending } = await db.from("warmup_instance_groups")
    .select("group_id, group_name, invite_link")
    .eq("cycle_id", cycleId).eq("device_id", deviceId).eq("join_status", "pending");
  if (!pending?.length) return 0;

  const validPending = pending.filter((g: any) => g.invite_link && g.invite_link.trim() !== "");
  if (!validPending.length) return 0;

  const shuffled = validPending.sort(() => Math.random() - 0.5);
  const nowMs = Date.now();
  const joinJobs: any[] = [];
  let cumMs = randInt(5, 15) * 60000;

  for (const g of shuffled) {
    const jobPayload: any = { group_id: g.group_id, group_name: g.group_name || "Grupo" };
    if (g.invite_link) jobPayload.invite_link = g.invite_link;
    joinJobs.push({
      user_id: userId, device_id: deviceId, cycle_id: cycleId,
      job_type: "join_group", payload: jobPayload,
      run_at: new Date(nowMs + cumMs).toISOString(), status: "pending",
    });
    cumMs += randInt(5, 30) * 60000;
  }

  if (joinJobs.length > 0) await db.from("warmup_jobs").insert(joinJobs);
  return joinJobs.length;
}

export async function scheduleDayJobs(
  db: any, cycleId: string, userId: string, deviceId: string,
  dayIndex: number, phase: string, chipState: string, forced = false,
): Promise<number> {
  if (phase === "pre_24h" || phase === "completed") return 0;

  const window = calculateWindow(forced);
  if (!window) return 0;

  let { effectiveStart, effectiveEnd } = window;

  // Dedup guard
  const { count: existingPendingCount } = await db.from("warmup_jobs")
    .select("id", { count: "exact", head: true })
    .eq("cycle_id", cycleId).eq("status", "pending")
    .in("job_type", ["group_interaction", "autosave_interaction", "community_interaction"]);
  if ((existingPendingCount || 0) > 10) return existingPendingCount || 0;

  // Adjust window for pending join_group jobs
  if (dayIndex > 1) {
    const { data: pendingGroupsCheck } = await db.from("warmup_instance_groups")
      .select("id").eq("cycle_id", cycleId).eq("device_id", deviceId).eq("join_status", "pending").limit(1);
    if (!pendingGroupsCheck?.length) {
      await db.from("warmup_jobs")
        .update({ status: "cancelled", last_error: "Cancelado automaticamente: todos os grupos já foram entrados" })
        .eq("cycle_id", cycleId).eq("job_type", "join_group").in("status", ["pending", "running"]);
    } else {
      const { data: pendingJoinJobs } = await db.from("warmup_jobs")
        .select("run_at").eq("cycle_id", cycleId).eq("job_type", "join_group").in("status", ["pending", "running"]);
      if (pendingJoinJobs?.length) {
        const latestJoinMs = pendingJoinJobs.map((j: any) => new Date(j.run_at).getTime()).filter((v: number) => Number.isFinite(v)).reduce((max: number, v: number) => Math.max(max, v), effectiveStart);
        effectiveStart = Math.max(effectiveStart, latestJoinMs + 2 * 60 * 1000);
      }
    }
  } else {
    const { data: pendingJoinJobs } = await db.from("warmup_jobs")
      .select("run_at").eq("cycle_id", cycleId).eq("job_type", "join_group").in("status", ["pending", "running"]);
    if (pendingJoinJobs?.length) {
      const latestJoinMs = pendingJoinJobs.map((j: any) => new Date(j.run_at).getTime()).filter((v: number) => Number.isFinite(v)).reduce((max: number, v: number) => Math.max(max, v), effectiveStart);
      effectiveStart = Math.max(effectiveStart, latestJoinMs + 2 * 60 * 1000);
    }
  }

  const windowMs = effectiveEnd - effectiveStart;
  if (windowMs < 30 * 60 * 1000) return 0;

  const FULL_WINDOW_MS = 12 * 60 * 60 * 1000;
  const windowFraction = Math.min(windowMs / FULL_WINDOW_MS, 1);

  let communityDay: number | undefined;
  if (isCommunityPhase(phase)) {
    const { data: membership } = await db.from("warmup_community_membership")
      .select("community_day").eq("device_id", deviceId).maybeSingle();
    communityDay = membership?.community_day || 1;
  }
  const volumes = getVolumes(chipState, dayIndex, phase, communityDay);

  if (windowFraction < 0.95) {
    volumes.groupMsgs = Math.max(1, Math.ceil(volumes.groupMsgs * windowFraction));
    if (volumes.autosaveContacts > 0) volumes.autosaveContacts = Math.max(1, Math.ceil(volumes.autosaveContacts * windowFraction));
    if (volumes.communityMsgsPerPeer > 0) volumes.communityMsgsPerPeer = Math.max(1, Math.ceil(volumes.communityMsgsPerPeer * windowFraction));
  }

  const { data: existingCycle } = await db.from("warmup_cycles")
    .select("daily_interaction_budget_target, daily_interaction_budget_used, daily_unique_recipients_used")
    .eq("id", cycleId).maybeSingle();

  const existingBudgetTarget = Math.max(existingCycle?.daily_interaction_budget_target || 0, 0);
  const existingBudgetUsed = Math.max(existingCycle?.daily_interaction_budget_used || 0, 0);
  const existingRecipientsUsed = existingCycle?.daily_unique_recipients_used || 0;
  const remainingBudget = existingBudgetTarget > 0 ? Math.max(existingBudgetTarget - existingBudgetUsed, 0) : null;

  const autosaveNeeded = volumes.autosaveContacts * volumes.autosaveRounds;
  const reservedAutosaveBudget = Math.min(autosaveNeeded, remainingBudget ?? autosaveNeeded);
  const budgetAfterAutosave = remainingBudget === null ? null : Math.max((remainingBudget ?? 0) - reservedAutosaveBudget, 0);
  const reservedGroupBudget = Math.min(volumes.groupMsgs, budgetAfterAutosave ?? volumes.groupMsgs);
  const nonGroupBudget = remainingBudget === null ? null : Math.max((remainingBudget ?? 0) - reservedGroupBudget, reservedAutosaveBudget);

  // Cancel existing pending interaction jobs
  await db.from("warmup_jobs")
    .update({ status: "cancelled", last_error: "Substituído por novo agendamento" })
    .eq("cycle_id", cycleId).eq("status", "pending")
    .in("job_type", ["group_interaction", "autosave_interaction"]);

  // Cancel scheduled community burst jobs (preserve reply/reburst)
  const { data: pendingCommunityJobs } = await db.from("warmup_jobs")
    .select("id, payload").eq("cycle_id", cycleId).eq("status", "pending").eq("job_type", "community_interaction");
  if (pendingCommunityJobs?.length) {
    const scheduledBurstIds = pendingCommunityJobs
      .filter((j: any) => { const p = j.payload || {}; return !(typeof p.pair_id === "string" && typeof p.conversation_id === "string") && p.source !== "auto_reburst" && p.source !== "community_reply"; })
      .map((j: any) => j.id);
    for (let i = 0; i < scheduledBurstIds.length; i += 200) {
      await db.from("warmup_jobs").update({ status: "cancelled", last_error: "Substituído por novo agendamento" }).in("id", scheduledBurstIds.slice(i, i + 200));
    }
  }

  if (remainingBudget === 0 && volumes.groupMsgs <= 0) return 0;

  const jobs: any[] = [];
  const actualGroupCount = remainingBudget !== null ? Math.min(volumes.groupMsgs, reservedGroupBudget) : volumes.groupMsgs;
  const actualAutosaveCount = remainingBudget !== null ? Math.min(autosaveNeeded, reservedAutosaveBudget) : autosaveNeeded;

  // Check usable groups
  let hasUsableGroups = true;
  if (actualGroupCount > 0) {
    const { data: joinedGroups } = await db.from("warmup_instance_groups")
      .select("id").eq("cycle_id", cycleId).eq("device_id", deviceId).eq("join_status", "joined").limit(1);
    if (!joinedGroups?.length) hasUsableGroups = false;
  }

  // Group interaction jobs — fixed spacing of 90-150s between messages
  if (actualGroupCount > 0 && hasUsableGroups) {
    const firstJobOffset = randInt(60, 180) * 1000; // start 1-3 min after window opens
    let cursor = effectiveStart + firstJobOffset;
    for (let i = 0; i < actualGroupCount; i++) {
      if (cursor > effectiveEnd) break;
      jobs.push({ user_id: userId, device_id: deviceId, cycle_id: cycleId, job_type: "group_interaction", payload: {}, run_at: new Date(cursor).toISOString(), status: "pending" });
      // Fixed delay: 210-300 seconds (3.5-5 min) between messages
      cursor += randInt(210, 300) * 1000;
    }
  }

  // Check autosave disabled
  if (volumes.autosaveContacts > 0) {
    const { data: profileCheck } = await db.from("profiles").select("autosave_enabled").eq("id", userId).maybeSingle();
    if (profileCheck && profileCheck.autosave_enabled === false) {
      volumes.autosaveContacts = 0;
      volumes.autosaveRounds = 0;
    }
  }

  // Autosave jobs
  if (volumes.autosaveContacts > 0 && volumes.autosaveRounds > 0) {
    const contactsToProcess = remainingBudget !== null ? Math.min(volumes.autosaveContacts, Math.ceil(actualAutosaveCount / volumes.autosaveRounds)) : volumes.autosaveContacts;
    const segmentMs = windowMs / Math.max(contactsToProcess + 1, 2);
    for (let c = 0; c < contactsToProcess; c++) {
      const segmentStart = effectiveStart + segmentMs * (c + 0.5) + randInt(-120, 120) * 1000;
      let cursor = Math.max(segmentStart, effectiveStart + 5 * 60 * 1000);
      for (let r = 0; r < volumes.autosaveRounds; r++) {
        if (cursor > effectiveEnd) break;
        jobs.push({ user_id: userId, device_id: deviceId, cycle_id: cycleId, job_type: "autosave_interaction", payload: { recipient_index: c, msg_index: r }, run_at: new Date(Math.min(cursor, effectiveEnd)).toISOString(), status: "pending" });
        cursor += randInt(4, 7) * 60 * 1000;
      }
    }
  }

  // Community burst jobs
  if (volumes.communityPeers > 0 && volumes.communityMsgsPerPeer > 0) {
    for (let p = 0; p < volumes.communityPeers; p++) {
      const convStartOffset = randInt(5, 20) * 60 * 1000 + p * randInt(5, 15) * 60 * 1000;
      let cursor = effectiveStart + convStartOffset;
      const burstsForPeer = volumes.communityMsgsPerPeer;
      const remainingWindow2 = effectiveEnd - cursor;
      const baseSpacing = Math.floor(remainingWindow2 / Math.max(burstsForPeer, 1));
      for (let m = 0; m < burstsForPeer; m++) {
        if (cursor > effectiveEnd - 5 * 60 * 1000) break;
        jobs.push({ user_id: userId, device_id: deviceId, cycle_id: cycleId, job_type: "community_interaction", payload: { peer_index: p, burst_index: m }, run_at: new Date(cursor).toISOString(), status: "pending" });
        const jitter = randInt(-Math.floor(baseSpacing * 0.2), Math.floor(baseSpacing * 0.2));
        cursor += Math.max(baseSpacing + jitter, 15 * 60 * 1000);
      }
    }
  }

  // Budget trimming with even sampling
  let jobsToInsert = jobs;
  if (remainingBudget !== null) {
    const groupJobs = jobs.filter((j) => j.job_type === "group_interaction");
    const trimmedGroupJobs = evenSample(groupJobs, reservedGroupBudget);
    const autosaveJobs = jobs.filter((j) => j.job_type === "autosave_interaction");
    const trimmedAutosaveJobs = evenSample(autosaveJobs, reservedAutosaveBudget);
    const communityJobs = jobs.filter((j) => j.job_type === "community_interaction");
    const communityBudget = Math.max((nonGroupBudget ?? communityJobs.length) - trimmedAutosaveJobs.length, 0);
    const trimmedCommunity = evenSample(communityJobs, communityBudget);
    jobsToInsert = [...trimmedGroupJobs, ...trimmedAutosaveJobs, ...trimmedCommunity].sort((a, b) => new Date(a.run_at).getTime() - new Date(b.run_at).getTime());
  }

  // Insert jobs in batches
  for (let i = 0; i < jobsToInsert.length; i += 100) {
    await db.from("warmup_jobs").insert(jobsToInsert.slice(i, i + 100));
  }

  const interactionCount = jobsToInsert.length;
  const nextBudgetTarget = existingBudgetTarget > 0 ? existingBudgetTarget : interactionCount;
  if (nextBudgetTarget > 0) {
    await db.from("warmup_cycles").update({
      daily_interaction_budget_target: nextBudgetTarget,
      daily_interaction_budget_min: Math.floor(nextBudgetTarget * 0.8),
      daily_interaction_budget_max: Math.ceil(nextBudgetTarget * 1.2),
      daily_interaction_budget_used: existingBudgetUsed,
      daily_unique_recipients_used: existingRecipientsUsed,
      updated_at: new Date().toISOString(),
    }).eq("id", cycleId);
  }

  return jobsToInsert.length;
}
