/**
 * warmup-engine v5.0 — Lifecycle Management
 * 
 * Responsabilidades:
 *   - start:  Criar ciclo, registrar grupos, agendar join_group jobs
 *   - pause:  Pausar ciclo, cancelar jobs pendentes
 *   - resume: Retomar ciclo, reagendar jobs
 *   - stop:   Encerrar ciclo, limpar dados
 *   - schedule_day: Agendar jobs manualmente para o dia atual
 * 
 * NÃO processa jobs — isso é responsabilidade do warmup-tick.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ══════════════════════════════════════════════════════════
// CORS
// ══════════════════════════════════════════════════════════
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ══════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ══════════════════════════════════════════════════════════
// PHASE RULES — Single Source of Truth
// ══════════════════════════════════════════════════════════
//
// Dia 1: pre_24h
// Dia 2 → groupsEnd: groups_only
// groupsEnd+1: autosave_enabled
// groupsEnd+2 → rampEnd: community_ramp_up
// rampEnd+1 → 30: community_stable
//
// groupsEnd:  new=4, recovered=5, unstable=6
// rampEnd:    new=9, recovered=10, unstable=10

function getGroupsEndDay(chipState: string): number {
  if (chipState === "unstable") return 6;
  if (chipState === "recovered") return 5;
  return 4; // new
}

function getCommunityRampEnd(chipState: string): number {
  if (chipState === "unstable") return 10;
  if (chipState === "recovered") return 10;
  return 9; // new
}

function getPhaseForDay(day: number, chipState: string): string {
  if (day <= 1) return "pre_24h";
  const groupsEnd = getGroupsEndDay(chipState);
  if (day <= groupsEnd) return "groups_only";
  if (day === groupsEnd + 1) return "autosave_enabled";
  const rampEnd = getCommunityRampEnd(chipState);
  if (day <= rampEnd) return "community_ramp_up";
  return "community_stable";
}

function isCommunityPhase(phase: string): boolean {
  return phase === "community_ramp_up" || phase === "community_stable" || phase === "community_enabled" || phase === "community_light";
}

// ══════════════════════════════════════════════════════════
// VOLUME CONFIG — 120 to 200 messages/day total (progressive 30-day)
// ══════════════════════════════════════════════════════════
//
// Budget progresses over 30 days with different curves per chip mode.
// Messages are distributed in blocks throughout the operating window.
//
// Chip Novo:       cautious start → gentle growth → strong finish
// Chip Recuperado: faster acceleration → reaches ceiling sooner
// Chip Fraco:      gradual reactivation → stability-focused growth

interface DayVolumes {
  groupMsgs: number;
  autosaveContacts: number;
  autosaveRounds: number;
  communityPeers: number;
  communityMsgsPerPeer: number;
}

function getProgressiveDailyBudget(dayIndex: number, chipState: string): number {
  // Returns total daily message budget (120-200 range)
  // Each phase has a min/max range with slight daily randomization
  const day = Math.max(1, Math.min(dayIndex, 30));

  if (chipState === "recovered") {
    // Faster acceleration — enters intermediate volume earlier
    if (day <= 7)  return randInt(130, 150);
    if (day <= 15) return randInt(150, 175);
    if (day <= 23) return randInt(175, 195);
    return randInt(190, 200);
  }

  if (chipState === "unstable") {
    // Gradual reactivation — stability-focused
    if (day <= 7)  return randInt(120, 130);
    if (day <= 15) return randInt(130, 155);
    if (day <= 23) return randInt(155, 180);
    return randInt(175, 195);
  }

  // "new" — cautious start, gentle growth
  if (day <= 7)  return randInt(120, 135);
  if (day <= 15) return randInt(135, 160);
  if (day <= 23) return randInt(160, 185);
  return randInt(185, 200);
}

function getDailyBudget(dayIndex: number = 1, chipState: string = "new"): number {
  return getProgressiveDailyBudget(dayIndex, chipState);
}

function getAutosaveContactsForDay(dayIndex: number, chipState: string): number {
  if (chipState === "new") {
    const autosaveStart = getGroupsEndDay("new") + 1;
    const daysSince = dayIndex - autosaveStart;
    if (daysSince < 0) return 0;
    if (daysSince === 0) return 3;
    if (daysSince === 1) return 4;
    return 5;
  }
  if (chipState === "recovered") {
    const autosaveStart = getGroupsEndDay("recovered") + 1;
    const daysSince = dayIndex - autosaveStart;
    if (daysSince < 0) return 0;
    if (daysSince === 0) return 2;
    if (daysSince === 1) return 3;
    if (daysSince === 2) return 4;
    return 5;
  }
  if (chipState === "unstable") {
    const autosaveStart = getGroupsEndDay("unstable") + 1; // day 7
    const daysSince = dayIndex - autosaveStart;
    if (daysSince < 0) return 0;
    if (daysSince === 0) return 1;
    if (daysSince === 1) return 3;
    if (daysSince === 2) return 4;
    return 5;
  }
  return 5;
}

function getAutosaveRoundsPerContact(chipState: string = "new"): number {
  if (chipState === "unstable") return 5;
  return 3;
}

function getCommunityPeers(dayIndex: number, chipState: string): number {
  const communityStartDay = getGroupsEndDay(chipState) + 2;
  if (dayIndex < communityStartDay) return 0;

  if (chipState === "unstable") {
    // Dia 8:1, Dia 9:2, Dia 10+:2
    const d = dayIndex - communityStartDay;
    if (d === 0) return 1;
    return 2;
  }
  // new: 6→2, 7→3, 8→4, 9+→5 | recovered: 7→2, 8→3, 9→4, 10+→5
  const d = dayIndex - communityStartDay;
  if (d === 0) return 2;
  if (d === 1) return 3;
  if (d === 2) return 4;
  return 5;
}

function getCommunityBurstsPerPeer(dayIndex: number, chipState: string): number {
  const communityStartDay = getGroupsEndDay(chipState) + 2;
  if (dayIndex < communityStartDay) return 0;

  if (chipState === "unstable") {
    // Dia 8:2, Dia 9:3, Dia 10+:4
    const d = dayIndex - communityStartDay;
    if (d === 0) return 2;
    if (d === 1) return 3;
    return 4;
  }
  // new: 6→3,7→4,8→5,9→6,10-12→7,13+→8 | recovered: 7→3,8→4,9→5,10→6,11-13→7,14+→8
  const d = dayIndex - communityStartDay;
  if (d === 0) return 3;
  if (d === 1) return 4;
  if (d === 2) return 5;
  if (d === 3) return 6;
  if (d <= 6) return 7;
  return 8;
}

function getVolumes(chipState: string, dayIndex: number, phase: string): DayVolumes {
  const v: DayVolumes = {
    groupMsgs: 0, autosaveContacts: 0, autosaveRounds: 0,
    communityPeers: 0, communityMsgsPerPeer: 0,
  };
  if (["pre_24h", "completed", "paused", "error"].includes(phase)) return v;

  const totalBudget = getProgressiveDailyBudget(dayIndex, chipState);

  if (phase === "groups_only") {
    v.groupMsgs = totalBudget;
  } else if (phase === "autosave_enabled") {
    const asContacts = getAutosaveContactsForDay(dayIndex, chipState);
    const asRounds = getAutosaveRoundsPerContact(chipState);
    const asTotal = asContacts * asRounds;
    v.autosaveContacts = asContacts;
    v.autosaveRounds = asRounds;
    v.groupMsgs = Math.max(totalBudget - asTotal, 30);
  } else if (isCommunityPhase(phase)) {
    const asContacts = getAutosaveContactsForDay(dayIndex, chipState);
    const asRounds = getAutosaveRoundsPerContact(chipState);
    const asTotal = asContacts * asRounds;
    v.autosaveContacts = asContacts;
    v.autosaveRounds = asRounds;
    const peers = getCommunityPeers(dayIndex, chipState);
    const burstsPerPeer = getCommunityBurstsPerPeer(dayIndex, chipState);
    const communityMsgs = peers * burstsPerPeer;
    v.communityPeers = peers;
    v.communityMsgsPerPeer = burstsPerPeer;
    v.groupMsgs = Math.max(totalBudget - asTotal - communityMsgs, 30);
  }

  return v;
}

// ══════════════════════════════════════════════════════════
// OPERATING WINDOW — 07:00-19:00 BRT (exact timezone)
// ══════════════════════════════════════════════════════════

function getBrtNow(): Date {
  // Returns a Date object representing "now" with correct BRT offset
  return new Date();
}

function getBrtHour(date: Date): number {
  return parseInt(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(date));
}

function getBrtTodayAt(hour: number, minute = 0): Date {
  // Build a date for today at HH:MM in BRT
  const brtDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  // Parse as BRT by computing UTC offset dynamically
  const tempDate = new Date(`${brtDateStr}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
  // Get the BRT offset for this date
  const utcStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(tempDate);
  // Use a simpler approach: format in BRT, find offset
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    timeZoneName: "shortOffset",
  });
  const parts = formatter.formatToParts(new Date());
  const tzPart = parts.find(p => p.type === "timeZoneName")?.value || "GMT-3";
  const offsetMatch = tzPart.match(/GMT([+-]?\d+)/);
  const offsetHours = offsetMatch ? parseInt(offsetMatch[1]) : -3;
  
  const result = new Date();
  // Set to today's date in BRT
  const [y, m, d] = brtDateStr.split("-").map(Number);
  result.setUTCFullYear(y, m - 1, d);
  result.setUTCHours(hour - offsetHours, minute, 0, 0);
  return result;
}

interface WindowResult {
  effectiveStart: number;
  effectiveEnd: number;
  isEmergency: boolean;
}

function calculateWindow(forced: boolean = false): WindowResult | null {
  const now = new Date();
  const nowMs = now.getTime();
  const startMs = getBrtTodayAt(7).getTime();
  const endMs = getBrtTodayAt(19).getTime();

  // Case 1: Forced execution outside window → 2h emergency window
  if (forced && nowMs >= endMs) {
    return {
      effectiveStart: nowMs,
      effectiveEnd: nowMs + 2 * 60 * 60 * 1000,
      isEmergency: true,
    };
  }

  // Case 2: Before window opens → schedule for full window
  if (nowMs < startMs) {
    return { effectiveStart: startMs, effectiveEnd: endMs, isEmergency: false };
  }

  // Case 3: After window closed → no scheduling
  if (nowMs >= endMs) {
    return null;
  }

  // Case 4: Within window → use remaining time
  return { effectiveStart: nowMs, effectiveEnd: endMs, isEmergency: false };
}

// ══════════════════════════════════════════════════════════
// SCHEDULE DAY JOBS
// ══════════════════════════════════════════════════════════

async function scheduleDayJobs(
  db: any,
  cycleId: string,
  userId: string,
  deviceId: string,
  dayIndex: number,
  phase: string,
  chipState: string,
  forced: boolean = false,
): Promise<number> {
  if (phase === "pre_24h" || phase === "completed") return 0;

  const window = calculateWindow(forced);
  if (!window) {
    console.log(`[scheduleDayJobs] Outside operating window, no jobs scheduled`);
    return 0;
  }

  let { effectiveStart, effectiveEnd, isEmergency } = window;
  const FULL_WINDOW_MS = 12 * 60 * 60 * 1000; // 07:00-19:00 = 12h
  const MIN_SPACING_MS = 3 * 60 * 1000; // Mínimo 3 min entre mensagens

  const { data: pendingJoinJobs } = await db
    .from("warmup_jobs")
    .select("run_at")
    .eq("cycle_id", cycleId)
    .eq("job_type", "join_group")
    .in("status", ["pending", "running"]);

  if (pendingJoinJobs?.length) {
    const latestJoinMs = pendingJoinJobs
      .map((job: any) => new Date(job.run_at).getTime())
      .filter((value: number) => Number.isFinite(value))
      .reduce((max: number, value: number) => Math.max(max, value), effectiveStart);
    effectiveStart = Math.max(effectiveStart, latestJoinMs + 2 * 60 * 1000);
  }

  const windowMs = effectiveEnd - effectiveStart;
  if (windowMs < 30 * 60 * 1000) {
    console.log(`[scheduleDayJobs] Window too small after join wait (${Math.round(windowMs / 60000)}min)`);
    return 0;
  }

  if (isEmergency) {
    console.log(`[scheduleDayJobs] Using 2h emergency window`);
  }

  // ── PRESERVE DAILY BUDGET ON RE-SCHEDULE ──
  const { data: existingCycle } = await db.from("warmup_cycles")
    .select("daily_interaction_budget_target, daily_interaction_budget_used, daily_unique_recipients_used")
    .eq("id", cycleId)
    .maybeSingle();

  const existingBudgetTarget = Math.max(existingCycle?.daily_interaction_budget_target || 0, 0);
  const existingBudgetUsed = Math.max(existingCycle?.daily_interaction_budget_used || 0, 0);
  const existingRecipientsUsed = existingCycle?.daily_unique_recipients_used || 0;
  const remainingBudget = existingBudgetTarget > 0
    ? Math.max(existingBudgetTarget - existingBudgetUsed, 0)
    : null;

  if (remainingBudget === 0) {
    console.log(`[scheduleDayJobs] Budget already exhausted (${existingBudgetUsed}/${existingBudgetTarget}), skipping`);
    return 0;
  }

  // ── SCALE VOLUMES PROPORTIONALLY TO REMAINING WINDOW ──
  const windowRatio = Math.min(windowMs / FULL_WINDOW_MS, 1);
  const volumes = getVolumes(chipState, dayIndex, phase);

  // Scale group messages proportionally — never flood
  const scaledGroupMsgs = Math.max(1, Math.floor(volumes.groupMsgs * windowRatio));

  // Ensure minimum spacing is respected: max msgs = window / MIN_SPACING
  const maxBySpacing = Math.floor(windowMs / MIN_SPACING_MS);
  const safeGroupMsgs = Math.min(scaledGroupMsgs, maxBySpacing);

  console.log(`[scheduleDayJobs] Window: ${Math.round(windowMs / 60000)}min (${Math.round(windowRatio * 100)}%), groups: ${volumes.groupMsgs} → ${safeGroupMsgs}`);

  const jobs: any[] = [];

  // ── GROUP INTERACTIONS ──
  if (safeGroupMsgs > 0) {
    const firstJobOffset = randInt(60, 300) * 1000; // 1-5 min após abertura
    const remainingWindow = windowMs - firstJobOffset;
    const spacing = Math.max(remainingWindow / Math.max(safeGroupMsgs, 1), MIN_SPACING_MS);
    for (let i = 0; i < safeGroupMsgs; i++) {
      const offset = firstJobOffset + spacing * i + randInt(-30, 30) * 1000;
      const runAt = new Date(effectiveStart + Math.max(offset, 60000));
      if (runAt.getTime() > effectiveEnd - 60000) break; // 1 min margin
      jobs.push({
        user_id: userId, device_id: deviceId, cycle_id: cycleId,
        job_type: "group_interaction", payload: {},
        run_at: runAt.toISOString(), status: "pending",
      });
    }
  }

  // ── AUTOSAVE INTERACTIONS (scaled to window) ──
  const scaledAutosaveContacts = Math.max(1, Math.floor(volumes.autosaveContacts * windowRatio));
  const scaledAutosaveRounds = volumes.autosaveRounds;
  
  if (scaledAutosaveContacts > 0 && scaledAutosaveRounds > 0) {
    const asStartOffset = randInt(
      Math.floor(windowMs * 0.1),
      Math.floor(windowMs * 0.3)
    );
    let cursor = effectiveStart + asStartOffset;

    for (let c = 0; c < scaledAutosaveContacts; c++) {
      for (let r = 0; r < scaledAutosaveRounds; r++) {
        if (cursor > effectiveEnd - 60000) break;
        jobs.push({
          user_id: userId, device_id: deviceId, cycle_id: cycleId,
          job_type: "autosave_interaction",
          payload: { recipient_index: c, msg_index: r },
          run_at: new Date(cursor).toISOString(), status: "pending",
        });
        cursor += randInt(4, 7) * 60 * 1000;
      }
      cursor += randInt(5, 10) * 60 * 1000;
    }
    console.log(`[scheduleDayJobs] Autosave: ${volumes.autosaveContacts} → ${scaledAutosaveContacts} contacts`);
  }

  // ── COMMUNITY BURSTS (each job = 3-7 msgs, spaced across window) ──
  if (volumes.communityPeers > 0 && volumes.communityMsgsPerPeer > 0) {
    for (let p = 0; p < volumes.communityPeers; p++) {
      const convStartOffset = randInt(5, 20) * 60 * 1000 + p * randInt(5, 15) * 60 * 1000;
      let cursor = effectiveStart + convStartOffset;

      const burstsForPeer = volumes.communityMsgsPerPeer;
      const remainingWindow = effectiveEnd - cursor;
      const baseSpacing = Math.floor(remainingWindow / Math.max(burstsForPeer, 1));

      for (let m = 0; m < burstsForPeer; m++) {
        if (cursor > effectiveEnd - 5 * 60 * 1000) break;

        jobs.push({
          user_id: userId, device_id: deviceId, cycle_id: cycleId,
          job_type: "community_interaction",
          payload: { peer_index: p, burst_index: m },
          run_at: new Date(cursor).toISOString(), status: "pending",
        });

        const jitter = randInt(-Math.floor(baseSpacing * 0.2), Math.floor(baseSpacing * 0.2));
        cursor += Math.max(baseSpacing + jitter, 15 * 60 * 1000);
      }
    }
  }

  let jobsToInsert = jobs;
  if (remainingBudget !== null && jobs.length > remainingBudget) {
    jobsToInsert = jobs.slice(0, remainingBudget);
    console.log(`[scheduleDayJobs] Trimming jobs to remaining budget: ${jobs.length} → ${jobsToInsert.length}`);
  }

  // [BUG 1+2 FIX] Phase transitions are now handled ENTIRELY by daily_reset in warmup-tick.
  // Removed enable_autosave/enable_community end-of-day jobs to avoid:
  // - Wasted first day (jobs fire at end of window, no time for interactions)
  // - Duplicate pair creation between enable_community and daily_reset

  // Insert jobs in batches
  if (jobsToInsert.length > 0) {
    for (let i = 0; i < jobsToInsert.length; i += 100) {
      await db.from("warmup_jobs").insert(jobsToInsert.slice(i, i + 100));
    }
  }

  const totalInteractions = jobsToInsert.length;
  const nextBudgetTarget = existingBudgetTarget > 0 ? existingBudgetTarget : totalInteractions;

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

  console.log(`[scheduleDayJobs] Day ${dayIndex} (${phase}, ${chipState}): ${jobsToInsert.length} jobs scheduled`);
  return jobsToInsert.length;
}

// ══════════════════════════════════════════════════════════
// ENSURE JOIN GROUP JOBS
// ══════════════════════════════════════════════════════════

async function ensureJoinGroupJobs(
  db: any,
  cycleId: string,
  userId: string,
  deviceId: string,
): Promise<number> {
  // Don't schedule if there are already pending join jobs
  const { data: existingJoinJobs } = await db
    .from("warmup_jobs")
    .select("id")
    .eq("cycle_id", cycleId)
    .eq("job_type", "join_group")
    .in("status", ["pending", "running"])
    .limit(1);

  if (existingJoinJobs && existingJoinJobs.length > 0) return 0;

  // Find groups that haven't been joined yet for the CURRENT cycle only
  const { data: pendingGroups } = await db
    .from("warmup_instance_groups")
    .select("group_id, group_name, invite_link")
    .eq("cycle_id", cycleId)
    .eq("device_id", deviceId)
    .eq("join_status", "pending");

  if (!pendingGroups || pendingGroups.length === 0) return 0;

  // Filter out ghost rows without invite_link — they can never join
  const validGroups = pendingGroups.filter((g: any) => g.invite_link && g.invite_link.trim() !== "");
  if (validGroups.length === 0) {
    console.log(`[ensureJoinGroupJobs] ${pendingGroups.length} pending groups but none have invite_link — skipping`);
    return 0;
  }

  const shuffled = shuffleArray(validGroups);
  const nowMs = Date.now();
  const joinJobs: any[] = [];

  let cumulativeMs = randInt(5, 15) * 60 * 1000;
  for (let i = 0; i < shuffled.length; i++) {
    const g = shuffled[i];
    const groupName = g.group_name || "Grupo";
    const runAt = new Date(nowMs + cumulativeMs);

    const jobPayload: any = { group_id: g.group_id, group_name: groupName };
    if (g.invite_link) jobPayload.invite_link = g.invite_link;
    joinJobs.push({
      user_id: userId, device_id: deviceId, cycle_id: cycleId,
      job_type: "join_group",
      payload: jobPayload,
      run_at: runAt.toISOString(), status: "pending",
    });
    cumulativeMs += randInt(5, 30) * 60 * 1000;
  }

  if (joinJobs.length > 0) {
    await db.from("warmup_jobs").insert(joinJobs);
  }

  return joinJobs.length;
}

// ══════════════════════════════════════════════════════════
// PLAN/ACCOUNT VALIDATION
// ══════════════════════════════════════════════════════════

async function validateUserPlan(db: any, userId: string): Promise<string | null> {
  const { data: activeSub } = await db
    .from("subscriptions")
    .select("expires_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: profile } = await db
    .from("profiles")
    .select("status")
    .eq("id", userId)
    .maybeSingle();

  if (!activeSub || new Date(activeSub.expires_at) < new Date()) {
    return "Seu plano está inativo. Ative um plano para continuar.";
  }
  if (profile?.status === "suspended" || profile?.status === "cancelled") {
    return "Conta suspensa ou cancelada.";
  }
  return null;
}

// ══════════════════════════════════════════════════════════
// AUTH HANDLER
// ══════════════════════════════════════════════════════════

async function authenticateUser(req: Request, supabaseUrl: string): Promise<string | null> {
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret === Deno.env.get("WEBHOOK_SECRET")) {
    return null; // Cron caller — no user ID
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return "__unauthorized__";

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const anonClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) return "__unauthorized__";

  return claimsData.claims.sub as string;
}

// ══════════════════════════════════════════════════════════
// CONNECTED STATUS CHECK
// ══════════════════════════════════════════════════════════
const CONNECTED_STATUSES = ["Ready", "Connected", "authenticated"];

// ══════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceKey);

  const callerUserId = await authenticateUser(req, supabaseUrl);
  if (callerUserId === "__unauthorized__") {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body OK */ }

  const action = body.action || "tick";

  try {
    // Validate plan for user-initiated actions
    if (callerUserId && ["start", "resume"].includes(action)) {
      const planError = await validateUserPlan(db, callerUserId);
      if (planError) {
        return json({ error: planError, code: "NO_ACTIVE_PLAN" }, 403);
      }
    }

    switch (action) {
      case "start":
        return await handleStart(db, callerUserId, body);
      case "pause":
        return await handlePause(db, callerUserId, body);
      case "resume":
        return await handleResume(db, callerUserId, body);
      case "stop":
        return await handleStop(db, callerUserId, body);
      case "schedule_day":
        return await handleScheduleDay(db, callerUserId, body);
      default:
        return json({ error: "Ação inválida. Use: start, pause, resume, stop, schedule_day" }, 400);
    }
  } catch (err) {
    console.error(`[warmup-engine] ${action} error:`, err.message);
    return json({ error: err.message }, 500);
  }
});

// ══════════════════════════════════════════════════════════
// ACTION: START
// ══════════════════════════════════════════════════════════

async function handleStart(db: any, userId: string | null, body: any) {
  if (!userId) throw new Error("start requires authenticated user");

  const { device_id, chip_state, days_total, plan_id, start_day, group_source } = body;
  if (!device_id) throw new Error("device_id required");

  const resolvedChipState = chip_state || "new";
  const resolvedStartDay = Math.max(1, Math.min(start_day || 1, 30));
  const resolvedGroupSource = group_source || "custom";
  const now = new Date();

  // 1. Clean up completed/orphan cycles for this device
  const { data: oldCycles } = await db
    .from("warmup_cycles")
    .select("id")
    .eq("device_id", device_id)
    .eq("user_id", userId)
    .in("phase", ["completed", "error"]);

  if (oldCycles?.length > 0) {
    for (const old of oldCycles) {
      await Promise.all([
        db.from("warmup_jobs").delete().eq("cycle_id", old.id),
        db.from("warmup_audit_logs").delete().eq("cycle_id", old.id),
        db.from("warmup_instance_groups").delete().eq("device_id", device_id).eq("cycle_id", old.id),
        db.from("warmup_community_membership").delete().eq("device_id", device_id).eq("cycle_id", old.id),
        db.from("warmup_unique_recipients").delete().eq("cycle_id", old.id),
      ]);
      await db.from("warmup_cycles").delete().eq("id", old.id);
    }
  }

  // 2. Create cycle — if start_day > 1, skip pre_24h and start at correct phase
  const cycleDays = days_total || 30;
  const skipPre24h = resolvedStartDay > 1;
  const initialPhase = skipPre24h ? getPhaseForDay(resolvedStartDay, resolvedChipState) : "pre_24h";
  const first24hEnds = skipPre24h
    ? new Date(now.getTime() - 1000) // already past — skip 24h wait
    : new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const { data: cycle, error: cycleErr } = await db
    .from("warmup_cycles")
    .insert({
      user_id: userId,
      device_id,
      chip_state: resolvedChipState,
      days_total: cycleDays,
      plan_id: plan_id || null,
      phase: initialPhase,
      day_index: resolvedStartDay,
      is_running: true,
      started_at: now.toISOString(),
      first_24h_ends_at: first24hEnds.toISOString(),
      daily_interaction_budget_target: 0,
      daily_interaction_budget_min: 0,
      daily_interaction_budget_max: 0,
      group_source: resolvedGroupSource,
    })
    .select("id")
    .single();

  if (cycleErr) throw cycleErr;

  // 3. Register groups — always from user's warmup_groups
  const { data: userGroups } = await db
    .from("warmup_groups")
    .select("id, name, link")
    .eq("user_id", userId)
    .eq("is_custom", true);
  
  const allGroups = shuffleArray((userGroups || []).map((g: any) => ({
    id: g.id,
    name: g.name,
    invite_link: g.link,
  })));

  // Clear old instance_groups for this device
  await db.from("warmup_instance_groups").delete()
    .eq("device_id", device_id).eq("user_id", userId);

  // Register all user groups in warmup_instance_groups
  for (const g of allGroups) {
    await db.from("warmup_instance_groups").insert({
      user_id: userId, device_id,
      group_id: g.id, cycle_id: cycle.id, join_status: "pending",
      group_name: g.name, invite_link: g.invite_link,
    });
  }

  // 4. Schedule jobs based on start_day
  const jobs: any[] = [];

  if (skipPre24h) {
    // Starting from a later day: schedule expedited join_group jobs (2-5min apart)
    // to enter groups AND resolve JIDs, then schedule interaction jobs.
    // Groups stay "pending" until join_group jobs succeed and resolve JIDs.
    let cumulativeDelay = randInt(1, 3) * 60 * 1000; // Start joining in 1-3 min
    for (let i = 0; i < allGroups.length; i++) {
      if (i > 0) {
        cumulativeDelay += randInt(2, 5) * 60 * 1000; // 2-5 min between joins
      }
      const jobPayload: any = { group_id: allGroups[i].id, group_name: allGroups[i].name };
      if (allGroups[i].invite_link) jobPayload.invite_link = allGroups[i].invite_link;
      jobs.push({
        user_id: userId, device_id, cycle_id: cycle.id,
        job_type: "join_group",
        payload: jobPayload,
        run_at: new Date(now.getTime() + cumulativeDelay).toISOString(),
        status: "pending",
      });
    }

    // Enable community membership if phase requires it
    if (isCommunityPhase(initialPhase)) {
      await db.from("warmup_community_membership").upsert({
        user_id: userId,
        device_id,
        cycle_id: cycle.id,
        is_enabled: true,
        is_eligible: true,
        enabled_at: now.toISOString(),
      }, { onConflict: "device_id" });
    }

    // Schedule day interaction jobs — they'll auto-sync JIDs from live groups when they run
    // The tick's group_interaction handler has built-in auto-sync for groups without JIDs
    await scheduleDayJobs(db, cycle.id, userId, device_id, resolvedStartDay, initialPhase, resolvedChipState, true);
  } else {
    // Normal start from day 1: schedule join_group jobs 4-6h after start
    const joinStartMs = randInt(4, 6) * 60 * 60 * 1000;
    let cumulativeDelay = joinStartMs;

    for (let i = 0; i < allGroups.length; i++) {
      if (i > 0) {
        cumulativeDelay += randInt(5, 30) * 60 * 1000;
      }
      const jobPayload: any = { group_id: allGroups[i].id, group_name: allGroups[i].name };
      if (allGroups[i].invite_link) jobPayload.invite_link = allGroups[i].invite_link;
      jobs.push({
        user_id: userId, device_id, cycle_id: cycle.id,
        job_type: "join_group",
        payload: jobPayload,
        run_at: new Date(now.getTime() + cumulativeDelay).toISOString(),
        status: "pending",
      });
    }
  }

  // 5. Phase transition is now triggered automatically after last group joins
  //    (handled in warmup-tick join_group handler)

  // 6. Schedule first daily_reset
  const resetBase = skipPre24h ? now : first24hEnds;
  const firstReset = new Date(resetBase);
  firstReset.setUTCHours(9, 50, 0, 0);
  if (firstReset.getTime() <= now.getTime()) {
    firstReset.setUTCDate(firstReset.getUTCDate() + 1);
  }
  jobs.push({
    user_id: userId, device_id, cycle_id: cycle.id,
    job_type: "daily_reset", payload: {},
    run_at: firstReset.toISOString(), status: "pending",
  });

  // Insert all jobs
  if (jobs.length > 0) {
    await db.from("warmup_jobs").insert(jobs);
  }

  // 7. Audit log
  const chipLabels: Record<string, string> = {
    new: "Chip Novo",
    recovered: "Chip Banido/Recuperação",
    unstable: "Chip Crítico/Instável",
  };
  const chipLabel = chipLabels[resolvedChipState] || resolvedChipState.toUpperCase();

  const groupSchedule = jobs
    .filter(j => j.job_type === "join_group")
    .map((j, i) => {
      const brt = new Date(j.run_at).toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit", minute: "2-digit", hour12: false,
      });
      return `Grupo ${i + 1}: ${j.payload.group_name} às ${brt}`;
    })
    .join(" | ");

  await db.from("warmup_audit_logs").insert({
    user_id: userId, device_id, cycle_id: cycle.id,
    level: "info", event_type: "cycle_started",
    message: `Ciclo ${chipLabel} iniciado: Dia ${resolvedStartDay} até Dia ${cycleDays} (${initialPhase}).${groupSchedule ? ` Agenda: ${groupSchedule}` : ""}`,
    meta: {
      chip_state: resolvedChipState,
      groups: allGroups.map(g => g.name),
      total_days: cycleDays,
      start_day: resolvedStartDay,
      initial_phase: initialPhase,
    },
  });

  return json({
    ok: true,
    cycle_id: cycle.id,
    chip_state: resolvedChipState,
    jobs_scheduled: jobs.length,
    total_days: cycleDays,
    start_day: resolvedStartDay,
    initial_phase: initialPhase,
  });
}

// ══════════════════════════════════════════════════════════
// ACTION: PAUSE
// ══════════════════════════════════════════════════════════

async function handlePause(db: any, userId: string | null, body: any) {
  if (!userId) throw new Error("pause requires authenticated user");
  const { device_id } = body;

  const { data: cycle } = await db
    .from("warmup_cycles")
    .select("id, phase")
    .eq("device_id", device_id)
    .eq("user_id", userId)
    .eq("is_running", true)
    .neq("phase", "completed")
    .single();

  if (!cycle) throw new Error("No active cycle found");

  await db.from("warmup_cycles").update({
    is_running: false,
    phase: "paused",
    previous_phase: cycle.phase,
  }).eq("id", cycle.id);

  await db.from("warmup_jobs")
    .update({ status: "cancelled" })
    .eq("cycle_id", cycle.id)
    .eq("status", "pending");

  await db.from("warmup_audit_logs").insert({
    user_id: userId, device_id, cycle_id: cycle.id,
    level: "info", event_type: "cycle_paused",
    message: "Aquecimento pausado pelo usuário",
  });

  return json({ ok: true });
}

// ══════════════════════════════════════════════════════════
// ACTION: RESUME
// ══════════════════════════════════════════════════════════

async function handleResume(db: any, userId: string | null, body: any) {
  if (!userId) throw new Error("resume requires authenticated user");
  const { device_id } = body;

  const { data: cycle } = await db
    .from("warmup_cycles")
    .select("id, user_id, device_id, phase, day_index, days_total, chip_state, first_24h_ends_at, previous_phase")
    .eq("device_id", device_id)
    .eq("user_id", userId)
    .eq("phase", "paused")
    .single();

  if (!cycle) throw new Error("No paused cycle found");

  // Validate device is connected
  const { data: device } = await db
    .from("devices")
    .select("status")
    .eq("id", device_id)
    .single();

  if (!device || !CONNECTED_STATUSES.includes(device.status)) {
    throw new Error("Instância offline. Conecte o dispositivo antes de retomar o aquecimento.");
  }

  // Determine resume phase
  const now = new Date();
  const first24hEnds = new Date(cycle.first_24h_ends_at);
  let resumePhase: string;

  if (now < first24hEnds) {
    resumePhase = "pre_24h";
  } else if (cycle.previous_phase && !["error", "completed", "paused"].includes(cycle.previous_phase)) {
    resumePhase = cycle.previous_phase;
  } else {
    resumePhase = getPhaseForDay(cycle.day_index, cycle.chip_state || "new");
  }

  // Update cycle
  await db.from("warmup_cycles").update({
    is_running: true,
    phase: resumePhase,
    previous_phase: null,
    last_error: null,
    next_run_at: now.toISOString(),
  }).eq("id", cycle.id);

  // Schedule next daily reset
  const nextReset = new Date(now);
  nextReset.setUTCDate(nextReset.getUTCDate() + 1);
  nextReset.setUTCHours(9, 50, 0, 0);
  await db.from("warmup_jobs").insert({
    user_id: userId, device_id, cycle_id: cycle.id,
    job_type: "daily_reset", payload: {},
    run_at: nextReset.toISOString(), status: "pending",
  });

  // Cancel old pending interaction jobs
  await db.from("warmup_jobs")
    .update({ status: "cancelled", last_error: "Cancelado: retomada do ciclo" })
    .eq("cycle_id", cycle.id)
    .eq("status", "pending")
    .in("job_type", ["group_interaction", "autosave_interaction", "community_interaction"]);

  // Schedule today's jobs
  if (resumePhase !== "pre_24h" && resumePhase !== "completed") {
    await scheduleDayJobs(db, cycle.id, userId, device_id, cycle.day_index, resumePhase, cycle.chip_state || "new", true);
  }

  // Re-schedule join_group jobs ONLY if still on day 1
  if (cycle.day_index <= 1) {
    const { data: pendingGroups } = await db
      .from("warmup_instance_groups")
      .select("group_id, group_name, invite_link")
      .eq("device_id", device_id)
      .eq("cycle_id", cycle.id)
      .eq("join_status", "pending");

    if (pendingGroups?.length > 0) {
      const shuffled = shuffleArray(pendingGroups);
      const joinJobs: any[] = [];
      let cumulativeMs = randInt(5, 15) * 60 * 1000;

      for (let i = 0; i < shuffled.length; i++) {
        const g = shuffled[i];
        const jobPayload: any = { group_id: g.group_id, group_name: g.group_name || "Grupo" };
        if (g.invite_link) jobPayload.invite_link = g.invite_link;
        joinJobs.push({
          user_id: userId, device_id, cycle_id: cycle.id,
          job_type: "join_group",
          payload: jobPayload,
          run_at: new Date(now.getTime() + cumulativeMs).toISOString(),
          status: "pending",
        });
        cumulativeMs += randInt(5, 30) * 60 * 1000;
      }

      if (joinJobs.length > 0) {
        await db.from("warmup_jobs").insert(joinJobs);
      }
    }
  }

  await db.from("warmup_audit_logs").insert({
    user_id: userId, device_id, cycle_id: cycle.id,
    level: "info", event_type: "cycle_resumed",
    message: `Aquecimento retomado na fase: ${resumePhase} (dia ${cycle.day_index})`,
  });

  return json({ ok: true, phase: resumePhase });
}

// ══════════════════════════════════════════════════════════
// ACTION: STOP
// ══════════════════════════════════════════════════════════

async function handleStop(db: any, userId: string | null, body: any) {
  if (!userId) throw new Error("stop requires authenticated user");
  const { device_id } = body;

  const { data: cycle } = await db
    .from("warmup_cycles")
    .select("id")
    .eq("device_id", device_id)
    .eq("user_id", userId)
    .neq("phase", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!cycle) throw new Error("No active cycle found");

  // Mark completed and cancel pending jobs
  await db.from("warmup_cycles").update({ is_running: false, phase: "completed" }).eq("id", cycle.id);
  await db.from("warmup_jobs").update({ status: "cancelled" }).eq("cycle_id", cycle.id).eq("status", "pending");

  // Full cleanup
  await Promise.all([
    db.from("warmup_jobs").delete().eq("cycle_id", cycle.id),
    db.from("warmup_audit_logs").delete().eq("cycle_id", cycle.id),
    db.from("warmup_instance_groups").delete().eq("device_id", device_id).eq("cycle_id", cycle.id),
    db.from("warmup_community_membership").delete().eq("device_id", device_id).eq("cycle_id", cycle.id),
    db.from("warmup_unique_recipients").delete().eq("cycle_id", cycle.id),
  ]);
  await db.from("warmup_cycles").delete().eq("id", cycle.id);

  return json({ ok: true });
}

// ══════════════════════════════════════════════════════════
// ACTION: SCHEDULE_DAY (manual trigger)
// ══════════════════════════════════════════════════════════

async function handleScheduleDay(db: any, userId: string | null, body: any) {
  if (!userId) throw new Error("schedule_day requires authenticated user");

  const { device_id, cycle_id, day_index, phase, chip_state } = body;
  if (!cycle_id || !device_id) throw new Error("cycle_id and device_id required");

  // Cancel existing pending interaction jobs
  await db.from("warmup_jobs")
    .update({ status: "cancelled", last_error: "Cancelado: reagendamento manual" })
    .eq("cycle_id", cycle_id)
    .eq("status", "pending")
    .in("job_type", ["group_interaction", "autosave_interaction", "community_interaction"]);

  const resolvedPhase = phase || "groups_only";
  let joinScheduled = 0;

  // Sempre garante entradas pendentes antes de reagendar interações
  if (!["completed", "paused", "error"].includes(resolvedPhase)) {
    joinScheduled = await ensureJoinGroupJobs(db, cycle_id, userId, device_id);
  }

  const jobCount = await scheduleDayJobs(
    db, cycle_id, userId, device_id,
    day_index || 1, resolvedPhase, chip_state || "new", true,
  );

  return json({ ok: true, jobs_scheduled: (jobCount || 0) + joinScheduled });
}
