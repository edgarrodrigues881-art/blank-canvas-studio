/**
 * warmup-tick v6.0 — Lightweight Edge Function (Phase 3)
 *
 * ALL heavy processing now runs on the VPS engine.
 * This Edge Function is kept only for:
 *   - schedule_day: Frontend-triggered daily scheduling
 *   - daily: Frontend-triggered daily reset
 *   - Manual triggers from the UI
 *
 * The VPS engine runs processJob() inline — no HTTP delegation.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ══════════════════════════════════════════════════════════
// PHASE RULES (read-only, for schedule_day calculations)
// ══════════════════════════════════════════════════════════

function getGroupsEndDay(chipState: string): number {
  if (chipState === "unstable") return 6;
  if (chipState === "recovered") return 5;
  return 4;
}

function getPhaseForDay(day: number, chipState: string): string {
  if (day <= 1) return "pre_24h";
  const groupsEnd = getGroupsEndDay(chipState);
  if (day <= groupsEnd) return "groups_only";
  if (day === groupsEnd + 1) return "autosave_enabled";
  const rampEnd = chipState === "unstable" ? 10 : chipState === "recovered" ? 10 : 9;
  if (day <= rampEnd) return "community_ramp_up";
  return "community_stable";
}

function isCommunityPhase(phase: string): boolean {
  return phase === "community_ramp_up" || phase === "community_stable" || phase === "community_enabled" || phase === "community_light";
}

function getProgressiveDailyBudget(dayIndex: number, chipState: string): number {
  const day = Math.max(1, Math.min(dayIndex, 30));
  if (chipState === "recovered") {
    if (day <= 7) return randInt(165, 180);
    if (day <= 15) return randInt(180, 200);
    if (day <= 23) return randInt(200, 215);
    return randInt(210, 220);
  }
  if (chipState === "unstable") {
    if (day <= 7) return randInt(160, 170);
    if (day <= 15) return randInt(170, 190);
    if (day <= 23) return randInt(190, 210);
    return randInt(205, 220);
  }
  if (day <= 7) return randInt(160, 175);
  if (day <= 15) return randInt(175, 195);
  if (day <= 23) return randInt(195, 212);
  return randInt(210, 220);
}

function getAutosaveContactsForDay(dayIndex: number, chipState: string): number {
  const autosaveStart = getGroupsEndDay(chipState) + 1;
  const daysSince = dayIndex - autosaveStart;
  if (daysSince < 0) return 0;
  if (chipState === "new") {
    if (daysSince <= 1) return 1; if (daysSince <= 3) return 2; if (daysSince <= 5) return 3; if (daysSince <= 10) return 4; return 5;
  }
  if (chipState === "recovered") {
    if (daysSince === 0) return 1; if (daysSince <= 2) return 2; if (daysSince <= 4) return 3; if (daysSince <= 9) return 4; return 5;
  }
  if (daysSince === 0) return 1; if (daysSince === 1) return 2; if (daysSince <= 3) return 3; if (daysSince <= 8) return 4; return 5;
}

function getAutosaveRoundsPerContact(chipState: string = "new"): number {
  return chipState === "unstable" ? 5 : 3;
}

function getCommunityStartDayForChip(chipState: string): number {
  if (chipState === "unstable") return 9;
  if (chipState === "recovered") return 7;
  return 6;
}

function getCommunityPeers(dayIndex: number, chipState: string, communityDay?: number): number {
  const communityStartDay = getCommunityStartDayForChip(chipState);
  if (dayIndex < communityStartDay) return 0;
  const cd = communityDay ?? Math.max(1, dayIndex - communityStartDay + 1);
  if (cd <= 1) return 1; if (cd === 2) return 2; if (cd === 3) return 3; if (cd === 4) return 4; return 5;
}

function getCommunityBurstsPerPeer(dayIndex: number, chipState: string, communityDay?: number): number {
  const communityStartDay = getCommunityStartDayForChip(chipState);
  if (dayIndex < communityStartDay) return 0;
  const cd = communityDay ?? Math.max(1, dayIndex - communityStartDay + 1);
  if (cd <= 1) return 3; if (cd === 2) return 4; if (cd === 3) return 5; if (cd <= 6) return 6; return 8;
}

interface DayVolumes {
  groupMsgs: number;
  autosaveContacts: number;
  autosaveRounds: number;
  communityPeers: number;
  communityMsgsPerPeer: number;
}

function getVolumes(chipState: string, dayIndex: number, phase: string, communityDay?: number): DayVolumes {
  const v: DayVolumes = { groupMsgs: 0, autosaveContacts: 0, autosaveRounds: 0, communityPeers: 0, communityMsgsPerPeer: 0 };
  if (["pre_24h", "completed", "paused", "error"].includes(phase)) return v;
  v.groupMsgs = dayIndex < 2 ? 0 : getProgressiveDailyBudget(dayIndex, chipState);
  if (phase === "autosave_enabled" || isCommunityPhase(phase)) {
    v.autosaveContacts = getAutosaveContactsForDay(dayIndex, chipState);
    v.autosaveRounds = getAutosaveRoundsPerContact(chipState);
  }
  if (isCommunityPhase(phase)) {
    v.communityPeers = getCommunityPeers(dayIndex, chipState, communityDay);
    v.communityMsgsPerPeer = getCommunityBurstsPerPeer(dayIndex, chipState, communityDay);
  }
  return v;
}

// ══════════════════════════════════════════════════════════
// OPERATING WINDOW
// ══════════════════════════════════════════════════════════

function getBrtTodayAt(hour: number, minute = 0): Date {
  const brtDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZoneName: "shortOffset",
  });
  const parts = formatter.formatToParts(new Date());
  const tzPart = parts.find(p => p.type === "timeZoneName")?.value || "GMT-3";
  const offsetMatch = tzPart.match(/GMT([+-]?\d+)/);
  const offsetHours = offsetMatch ? parseInt(offsetMatch[1]) : -3;
  const result = new Date();
  const [y, m, d] = brtDateStr.split("-").map(Number);
  result.setUTCFullYear(y, m - 1, d);
  result.setUTCHours(hour - offsetHours, minute, 0, 0);
  return result;
}

function calculateWindow(forced = false): { effectiveStart: number; effectiveEnd: number } | null {
  const now = new Date();
  const nowMs = now.getTime();
  const startMs = getBrtTodayAt(7).getTime();
  const endMs = getBrtTodayAt(19).getTime();
  if (forced && nowMs < startMs) return { effectiveStart: nowMs, effectiveEnd: endMs };
  if (forced && nowMs >= endMs) return { effectiveStart: nowMs, effectiveEnd: nowMs + 2 * 3600000 };
  if (nowMs < startMs) return { effectiveStart: startMs, effectiveEnd: endMs };
  if (nowMs >= endMs) return null;
  return { effectiveStart: nowMs, effectiveEnd: endMs };
}

function evenSample<T>(arr: T[], n: number): T[] {
  if (n >= arr.length) return arr;
  if (n <= 0) return [];
  const result: T[] = [];
  const step = arr.length / n;
  for (let i = 0; i < n; i++) result.push(arr[Math.min(Math.floor(i * step), arr.length - 1)]);
  return result;
}

// ══════════════════════════════════════════════════════════
// SCHEDULE DAY JOBS (lightweight — only creates DB records)
// ══════════════════════════════════════════════════════════

async function scheduleDayJobs(
  db: any, cycleId: string, userId: string, deviceId: string,
  dayIndex: number, phase: string, chipState: string, forced = false,
): Promise<number> {
  if (phase === "pre_24h" || phase === "completed") return 0;
  const window = calculateWindow(forced);
  if (!window) return 0;
  let { effectiveStart, effectiveEnd } = window;

  const { count: existingPendingCount } = await db.from("warmup_jobs")
    .select("id", { count: "exact", head: true })
    .eq("cycle_id", cycleId).eq("status", "pending")
    .in("job_type", ["group_interaction", "autosave_interaction", "community_interaction"]);
  if ((existingPendingCount || 0) > 10) return existingPendingCount || 0;

  // Adjust window for pending join_group jobs
  const { data: pendingJoinJobs } = await db.from("warmup_jobs")
    .select("run_at").eq("cycle_id", cycleId).eq("job_type", "join_group").in("status", ["pending", "running"]);
  if (pendingJoinJobs?.length) {
    const latestJoinMs = pendingJoinJobs.map((j: any) => new Date(j.run_at).getTime()).filter((v: number) => Number.isFinite(v)).reduce((max: number, v: number) => Math.max(max, v), effectiveStart);
    effectiveStart = Math.max(effectiveStart, latestJoinMs + 2 * 60 * 1000);
  }

  if (dayIndex > 1) {
    const { data: pendingGroupsCheck } = await db.from("warmup_instance_groups")
      .select("id").eq("cycle_id", cycleId).eq("device_id", deviceId).eq("join_status", "pending").limit(1);
    if (!pendingGroupsCheck?.length) {
      await db.from("warmup_jobs")
        .update({ status: "cancelled", last_error: "Cancelado automaticamente: todos os grupos já foram entrados" })
        .eq("cycle_id", cycleId).eq("job_type", "join_group").in("status", ["pending", "running"]);
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
  await db.from("warmup_jobs").update({ status: "cancelled", last_error: "Substituído por novo agendamento" })
    .eq("cycle_id", cycleId).eq("status", "pending").in("job_type", ["group_interaction", "autosave_interaction"]);

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

  // Group interaction jobs
  if (actualGroupCount > 0 && hasUsableGroups) {
    const firstJobOffset = randInt(60, 300) * 1000;
    const remainingWindow = windowMs - firstJobOffset;
    const spacing = remainingWindow / Math.max(actualGroupCount, 1);
    for (let i = 0; i < actualGroupCount; i++) {
      const offset = firstJobOffset + spacing * i + randInt(-60, 60) * 1000;
      const runAt = new Date(effectiveStart + Math.max(offset, 60000));
      if (runAt.getTime() > effectiveEnd) break;
      jobs.push({ user_id: userId, device_id: deviceId, cycle_id: cycleId, job_type: "group_interaction", payload: {}, run_at: runAt.toISOString(), status: "pending" });
    }
  }

  // Autosave jobs
  if (volumes.autosaveContacts > 0 && volumes.autosaveRounds > 0) {
    const { data: profileCheck } = await db.from("profiles").select("autosave_enabled").eq("id", userId).maybeSingle();
    if (!profileCheck || profileCheck.autosave_enabled !== false) {
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

  // Budget trimming
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

// ══════════════════════════════════════════════════════════
// HANDLER
// ══════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || (req.method === "POST" ? ((await req.json().catch(() => ({}))) as any).action : null);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // ── schedule_day: Frontend requests daily job scheduling ──
    if (action === "schedule_day") {
      const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
      const cycleId = body.cycle_id || url.searchParams.get("cycle_id");
      if (!cycleId) return json({ error: "cycle_id required" }, 400);

      const { data: cycle } = await db.from("warmup_cycles")
        .select("id, user_id, device_id, day_index, phase, chip_state, is_running")
        .eq("id", cycleId).maybeSingle();
      if (!cycle) return json({ error: "cycle not found" }, 404);
      if (!cycle.is_running) return json({ error: "cycle not running" }, 400);

      const count = await scheduleDayJobs(db, cycle.id, cycle.user_id, cycle.device_id, cycle.day_index, cycle.phase, cycle.chip_state || "new", !!body.forced);
      return json({ ok: true, jobs_scheduled: count });
    }

    // ── daily: Frontend triggers daily reset ──
    if (action === "daily") {
      const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
      const cycleId = body.cycle_id || url.searchParams.get("cycle_id");
      if (!cycleId) return json({ error: "cycle_id required" }, 400);

      const { data: cycle } = await db.from("warmup_cycles")
        .select("id, user_id, device_id, day_index, phase, chip_state, is_running")
        .eq("id", cycleId).maybeSingle();
      if (!cycle) return json({ error: "cycle not found" }, 404);

      // Insert a daily_reset job for the VPS to pick up
      const resetAt = new Date(Date.now() + 5000).toISOString();
      await db.from("warmup_jobs").insert({
        user_id: cycle.user_id, device_id: cycle.device_id, cycle_id: cycle.id,
        job_type: "daily_reset", payload: { source: "manual_trigger" },
        run_at: resetAt, status: "pending",
      });
      return json({ ok: true, message: "daily_reset job queued for VPS processing" });
    }

    // ── status: Health check ──
    if (action === "status" || req.method === "GET") {
      const { count: pendingCount } = await db.from("warmup_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      const { count: runningCount } = await db.from("warmup_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "running");
      return json({
        version: "6.0",
        mode: "vps_delegated",
        description: "All heavy processing runs on VPS. This Edge Function only handles schedule_day and daily triggers.",
        pending_jobs: pendingCount || 0,
        running_jobs: runningCount || 0,
      });
    }

    // ── Legacy tick action: redirect to VPS info ──
    return json({
      ok: true,
      message: "warmup-tick v6.0 — Processing delegated to VPS engine. Use action=schedule_day or action=daily for manual triggers.",
      version: "6.0",
    });
  } catch (err: any) {
    console.error("warmup-tick error:", err);
    return json({ error: err.message }, 500);
  }
});
