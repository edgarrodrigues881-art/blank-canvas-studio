/**
 * warmup-tick v5.0 — Job Processor
 *
 * Responsabilidades:
 *   - tick:   Processar jobs pendentes (join_group, interactions, phase transitions, daily reset)
 *   - daily:  Trigger manual de reset diário
 *
 * NÃO gerencia ciclos de vida — isso é responsabilidade do warmup-engine.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ══════════════════════════════════════════════════════════
// CORS & HELPERS
// ══════════════════════════════════════════════════════════
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

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function backoffMinutes(attempt: number): number {
  return [5, 15, 60, 180, 360][Math.min(attempt, 4)];
}

// ══════════════════════════════════════════════════════════
// PHASE RULES — Must match warmup-engine exactly
// ══════════════════════════════════════════════════════════

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
// Must match warmup-engine exactly
// ══════════════════════════════════════════════════════════

interface DayVolumes {
  groupMsgs: number;
  autosaveContacts: number;
  autosaveRounds: number;
  communityPeers: number;
  communityMsgsPerPeer: number;
}

function getProgressiveDailyBudget(dayIndex: number, chipState: string): number {
  const day = Math.max(1, Math.min(dayIndex, 30));

  if (chipState === "recovered") {
    if (day <= 7)  return randInt(130, 150);
    if (day <= 15) return randInt(150, 175);
    if (day <= 23) return randInt(175, 195);
    return randInt(190, 200);
  }

  if (chipState === "unstable") {
    if (day <= 7)  return randInt(120, 130);
    if (day <= 15) return randInt(130, 155);
    if (day <= 23) return randInt(155, 180);
    return randInt(175, 195);
  }

  // "new"
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
    const autosaveStart = getGroupsEndDay("new") + 1; // day 5
    const daysSince = dayIndex - autosaveStart;
    if (daysSince < 0) return 0;
    if (daysSince === 0) return 3;
    if (daysSince === 1) return 4;
    return 5;
  }
  if (chipState === "recovered") {
    const autosaveStart = getGroupsEndDay("recovered") + 1; // day 6
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
    if (daysSince === 0) return 1; // day 7: 1 contact
    if (daysSince === 1) return 3; // day 8: 3 contacts
    if (daysSince === 2) return 4; // day 9: 4 contacts
    return 5; // day 10+: 5 contacts
  }
  return 5;
}

function getAutosaveRoundsPerContact(chipState: string = "new"): number {
  if (chipState === "unstable") return 5; // max 5 messages per contact
  return 3; // max 3 messages per contact
}

function getCommunityPeers(dayIndex: number, chipState: string): number {
  const communityStartDay = getGroupsEndDay(chipState) + 2;
  if (dayIndex < communityStartDay) return 0;

  if (chipState === "unstable") {
    const d = dayIndex - communityStartDay;
    if (d === 0) return 1;
    return 2;
  }
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
    const d = dayIndex - communityStartDay;
    if (d === 0) return 2;
    if (d === 1) return 3;
    return 4;
  }
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

function getBrtTodayAt(hour: number, minute = 0): Date {
  const brtDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
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

  if (forced && nowMs >= endMs) {
    return { effectiveStart: nowMs, effectiveEnd: nowMs + 2 * 3600000 };
  }
  if (nowMs < startMs) return { effectiveStart: startMs, effectiveEnd: endMs };
  if (nowMs >= endMs) return null;
  return { effectiveStart: nowMs, effectiveEnd: endMs };
}

function isWithinOperatingWindow(): boolean {
  const now = new Date();
  return now.getTime() >= getBrtTodayAt(7).getTime() && now.getTime() < getBrtTodayAt(19).getTime();
}

function getBrtDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function ensureNextDailyResetJob(db: any, job: any, cycleId: string): Promise<void> {
  const { data: existingNextReset } = await db
    .from("warmup_jobs")
    .select("id")
    .eq("cycle_id", cycleId)
    .eq("job_type", "daily_reset")
    .eq("status", "pending")
    .gt("run_at", new Date().toISOString())
    .limit(1);

  if (existingNextReset?.length) return;

  const nextReset = new Date();
  nextReset.setUTCDate(nextReset.getUTCDate() + 1);
  nextReset.setUTCHours(9, 50, 0, 0);

  await db.from("warmup_jobs").insert({
    user_id: job.user_id,
    device_id: job.device_id,
    cycle_id: cycleId,
    job_type: "daily_reset",
    payload: {},
    run_at: nextReset.toISOString(),
    status: "pending",
  });
}

// ══════════════════════════════════════════════════════════
// SCHEDULE DAY JOBS — Must match warmup-engine exactly
// ══════════════════════════════════════════════════════════

async function scheduleDayJobs(
  db: any, cycleId: string, userId: string, deviceId: string,
  dayIndex: number, phase: string, chipState: string, forced = false,
): Promise<number> {
  if (phase === "pre_24h" || phase === "completed") return 0;

  const window = calculateWindow(forced);
  if (!window) return 0;

  let { effectiveStart, effectiveEnd } = window;

  const { data: pendingJoinJobs } = await db.from("warmup_jobs")
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
  if (windowMs < 30 * 60 * 1000) return 0;

  const volumes = getVolumes(chipState, dayIndex, phase);

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

  // Reserve budget for autosave (15 msgs = 5 contacts × 3 msgs) before groups take the rest.
  // This prevents group volume from starving autosave entirely.
  const autosaveNeeded = volumes.autosaveContacts * volumes.autosaveRounds; // typically 15
  const reservedAutosaveBudget = Math.min(autosaveNeeded, remainingBudget ?? autosaveNeeded);
  const budgetAfterAutosave = remainingBudget === null ? null : Math.max((remainingBudget ?? 0) - reservedAutosaveBudget, 0);
  const reservedGroupBudget = Math.min(volumes.groupMsgs, budgetAfterAutosave ?? volumes.groupMsgs);
  const nonGroupBudget = remainingBudget === null
    ? null
    : Math.max((remainingBudget ?? 0) - reservedGroupBudget, reservedAutosaveBudget);

  // Cancel existing pending SCHEDULED interaction jobs before creating new ones (prevent duplicates)
  // IMPORTANT: Do NOT cancel community_interaction reply/reburst jobs (they have pair_id or source in payload)
  await db.from("warmup_jobs")
    .update({ status: "cancelled", last_error: "Substituído por novo agendamento" })
    .eq("cycle_id", cycleId).eq("status", "pending")
    .in("job_type", ["group_interaction", "autosave_interaction"]);

  // For community_interaction: only cancel SCHEDULED burst jobs (peer_index in payload), preserve reply/reburst jobs
  const { data: pendingCommunityJobs } = await db.from("warmup_jobs")
    .select("id, payload")
    .eq("cycle_id", cycleId).eq("status", "pending")
    .eq("job_type", "community_interaction");
  
  if (pendingCommunityJobs?.length) {
    const scheduledBurstIds = pendingCommunityJobs
      .filter((j: any) => {
        const p = j.payload || {};
        const isReply = typeof p.pair_id === "string" && typeof p.conversation_id === "string";
        const isReburst = p.source === "auto_reburst" || p.source === "community_reply";
        return !isReply && !isReburst;
      })
      .map((j: any) => j.id);
    
    if (scheduledBurstIds.length > 0) {
      for (let i = 0; i < scheduledBurstIds.length; i += 200) {
        await db.from("warmup_jobs")
          .update({ status: "cancelled", last_error: "Substituído por novo agendamento" })
          .in("id", scheduledBurstIds.slice(i, i + 200));
      }
    }
  }

  if (remainingBudget === 0 && volumes.groupMsgs <= 0) {
    console.log(`[scheduleDayJobs] Budget already exhausted (${existingBudgetUsed}/${existingBudgetTarget}), skipping`);
    return 0;
  }

  const jobs: any[] = [];

  // Group interactions — primeiro job entre 1-5 min após abertura da janela
  if (volumes.groupMsgs > 0) {
    const firstJobOffset = randInt(60, 300) * 1000; // 1-5 min após abertura
    const remainingWindow = windowMs - firstJobOffset;
    const spacing = remainingWindow / Math.max(volumes.groupMsgs, 1);
    for (let i = 0; i < volumes.groupMsgs; i++) {
      const offset = firstJobOffset + spacing * i + randInt(-60, 60) * 1000;
      const runAt = new Date(effectiveStart + Math.max(offset, 60000));
      if (runAt.getTime() > effectiveEnd) break;
      jobs.push({
        user_id: userId, device_id: deviceId, cycle_id: cycleId,
        job_type: "group_interaction", payload: {},
        run_at: runAt.toISOString(), status: "pending",
      });
    }
  }

  // Autosave: contact-by-contact, 3 msgs each, 4-7 min gaps, spread through day
  if (volumes.autosaveContacts > 0 && volumes.autosaveRounds > 0) {
    const asWindowMs = effectiveEnd - effectiveStart;
    const asStartOffset = randInt(
      Math.floor(asWindowMs * 0.1),
      Math.floor(asWindowMs * 0.4)
    );
    let cursor = effectiveStart + asStartOffset;

    for (let c = 0; c < volumes.autosaveContacts; c++) {
      // Check window BEFORE starting a new contact — never break mid-contact
      if (cursor > effectiveEnd) break;
      for (let r = 0; r < volumes.autosaveRounds; r++) {
        jobs.push({
          user_id: userId, device_id: deviceId, cycle_id: cycleId,
          job_type: "autosave_interaction",
          payload: { recipient_index: c, msg_index: r },
          run_at: new Date(Math.min(cursor, effectiveEnd)).toISOString(), status: "pending",
        });
        cursor += randInt(4, 7) * 60 * 1000;
      }
      cursor += randInt(5, 10) * 60 * 1000;
    }
  }

  // Community bursts — each job = 1 burst of 2-4 msgs (real conversation)
  // 8-12 bursts per peer, spaced ~40-90 min apart to fill the 12h window
  if (volumes.communityPeers > 0 && volumes.communityMsgsPerPeer > 0) {
    for (let p = 0; p < volumes.communityPeers; p++) {
      const convStartOffset = randInt(5, 20) * 60 * 1000 + p * randInt(5, 15) * 60 * 1000;
      let cursor = effectiveStart + convStartOffset;

      // Space bursts evenly across the window with jitter
      const burstsForPeer = volumes.communityMsgsPerPeer;
      const remainingWindow = effectiveEnd - cursor;
      const baseSpacing = Math.floor(remainingWindow / Math.max(burstsForPeer, 1));

      for (let m = 0; m < burstsForPeer; m++) {
        if (cursor > effectiveEnd - 5 * 60 * 1000) break; // leave 5min margin for burst execution

        jobs.push({
          user_id: userId, device_id: deviceId, cycle_id: cycleId,
          job_type: "community_interaction",
          payload: { peer_index: p, burst_index: m },
          run_at: new Date(cursor).toISOString(), status: "pending",
        });

        // Space between bursts: baseSpacing ± 20% jitter
        const jitter = randInt(-Math.floor(baseSpacing * 0.2), Math.floor(baseSpacing * 0.2));
        cursor += Math.max(baseSpacing + jitter, 15 * 60 * 1000); // minimum 15min between bursts
      }
    }
  }

  let jobsToInsert = jobs;
  if (remainingBudget !== null) {
    const groupJobs = jobs.filter((job) => job.job_type === "group_interaction").slice(0, reservedGroupBudget);
    // Prioritize autosave over community when budget is limited
    const autosaveJobs = jobs.filter((job) => job.job_type === "autosave_interaction").slice(0, reservedAutosaveBudget);
    const communityJobs = jobs.filter((job) => job.job_type === "community_interaction");
    const communityBudget = Math.max((nonGroupBudget ?? communityJobs.length) - autosaveJobs.length, 0);
    const trimmedCommunity = communityJobs.slice(0, communityBudget);

    jobsToInsert = [...groupJobs, ...autosaveJobs, ...trimmedCommunity]
      .sort((a, b) => new Date(a.run_at).getTime() - new Date(b.run_at).getTime());

    if (jobsToInsert.length < jobs.length) {
      console.log(
        `[scheduleDayJobs] Prioritizing group jobs within remaining budget: ${jobs.length} → ${jobsToInsert.length} (groups reserved=${reservedGroupBudget}, non-group=${nonGroupBudget})`
      );
    }
  }

  // [BUG 1+2 FIX] Phase transitions are now handled ENTIRELY by daily_reset.
  // Removed enable_autosave/enable_community end-of-day jobs to avoid:
  // - Wasted first day (jobs fire at end of window, no time for interactions)
  // - Duplicate pair creation between enable_community and daily_reset

  // Insert jobs
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

  console.log(`[scheduleDayJobs] Day ${dayIndex} (${phase}/${chipState}): ${jobsToInsert.length} jobs`);
  return jobsToInsert.length;
}

// ══════════════════════════════════════════════════════════
// ENSURE JOIN GROUP JOBS
// ══════════════════════════════════════════════════════════

async function ensureJoinGroupJobs(db: any, cycleId: string, userId: string, deviceId: string) {
  const { data: existing } = await db.from("warmup_jobs")
    .select("id").eq("cycle_id", cycleId).eq("job_type", "join_group")
    .in("status", ["pending", "running"]).limit(1);
  if (existing?.length > 0) return 0;

  const { data: pending } = await db.from("warmup_instance_groups")
    .select("group_id, group_name, invite_link")
    .eq("cycle_id", cycleId)
    .eq("device_id", deviceId)
    .eq("join_status", "pending");
  if (!pending?.length) return 0;

  // Filter out ghost rows without invite_link
  const validPending = pending.filter((g: any) => g.invite_link && g.invite_link.trim() !== "");
  if (!validPending.length) {
    console.log(`[ensureJoinGroupJobs] ${pending.length} pending but none have invite_link — skipping`);
    return 0;
  }

  const shuffled = validPending.sort(() => Math.random() - 0.5);
  const nowMs = Date.now();
  const joinJobs: any[] = [];
  let cumMs = randInt(5, 15) * 60000;

  for (const g of shuffled) {
    const jobPayload: any = { group_id: g.group_id, group_name: g.group_name || "Grupo" };
    if (g.invite_link) jobPayload.invite_link = g.invite_link;
    joinJobs.push({
      user_id: userId, device_id: deviceId, cycle_id: cycleId,
      job_type: "join_group",
      payload: jobPayload,
      run_at: new Date(nowMs + cumMs).toISOString(), status: "pending",
    });
    cumMs += randInt(5, 30) * 60000;
  }

  if (joinJobs.length > 0) await db.from("warmup_jobs").insert(joinJobs);
  return joinJobs.length;
}

// ══════════════════════════════════════════════════════════
// MESSAGE GENERATOR — 80,000+ variations
// ══════════════════════════════════════════════════════════

const SAUDACOES = [
  "oi", "oii", "oiii", "olá", "ola", "e aí", "eai", "eae",
  "fala", "fala aí", "salve", "opa", "hey", "ei",
  "bom dia", "boa tarde", "boa noite",
  "tudo bem", "tudo certo", "tudo joia", "tudo tranquilo",
  "e aí como tá", "e aí blz", "fala parceiro", "fala amigo",
  "oi oi", "eae mano", "fala ae", "opa tudo bem",
];

const PERGUNTAS = [
  "como está seu cachorro", "como está a casa nova", "conseguiu terminar a mudança",
  "como está o trabalho", "como está sua família", "como foi seu dia",
  "está tudo bem por aí", "como estão as coisas aí", "conseguiu resolver aquilo",
  "como está o tempo aí", "ainda mora no mesmo lugar", "está tudo tranquilo por aí",
  "o cachorro já melhorou", "a casa nova ficou boa", "o dia foi corrido hoje",
  "como tá o projeto", "já resolveu aquele problema", "como tá a saúde",
  "como foi a semana", "como tá o pessoal aí", "já conseguiu aquilo",
  "como anda o serviço", "resolveu aquela questão", "como está o carro",
  "como tá a reforma", "o que aprontou hoje", "como foi o fds",
  "já voltou de viagem", "como tá o clima aí", "ainda tá naquela empresa",
  "como anda o treino", "como tá o estudo", "já fez a prova",
  "como foi a entrevista", "como está o bairro novo", "como tá a internet aí",
  "já arrumou a moto", "como foi o almoço", "como tá a dieta",
  "já comprou aquilo", "como está o filho", "a obra já terminou",
  "como ficou a festa", "como foi a reunião", "o médico falou o quê",
  "já trocou de celular", "como tá a academia", "como foi o passeio",
  "já assistiu aquele filme", "como tá o novo emprego",
  "como foi a viagem", "já mudou de apartamento", "como tá o cachorro novo",
  "conseguiu aquele emprego", "como foi a formatura", "já marcou a consulta",
];

const COMENTARIOS = [
  "hoje o dia foi corrido", "aqui está bem tranquilo", "estou resolvendo umas coisas",
  "hoje trabalhei bastante", "estou organizando tudo aqui", "aqui está tudo certo",
  "hoje foi puxado", "estou vendo umas coisas aqui", "tô meio ocupado hoje",
  "aqui tá de boa", "dia longo hoje", "finalmente deu uma folga",
  "tô correndo atrás das coisas", "hoje rendeu bastante", "tô resolvendo umas pendências",
  "aqui tá tudo na paz", "dia cheio mas tá indo", "tô focado aqui no trabalho",
  "hoje foi tranquilo", "semana puxada essa", "tô organizando umas ideias",
  "hoje foi produtivo", "tô de olho em umas coisas", "por aqui tudo certo",
  "mandando ver no trabalho", "hoje foi correria pura", "tô no corre mas tá suave",
  "dia movimentado hoje", "por aqui tá tranquilo", "tô planejando uns negócios",
];

const COMPLEMENTOS = [
  "faz tempo que não falamos", "lembrei disso agora", "estava pensando nisso",
  "vi algo parecido hoje", "estava lembrando disso", "me veio na cabeça agora",
  "pensei nisso mais cedo", "lembrei de vc", "tava pensando aqui",
  "me falaram disso", "vi vc online e lembrei", "alguém comentou isso",
];

const EMOJIS_POOL = [
  "🙂", "😂", "😅", "😄", "👍", "🙏", "🔥", "👀", "😎", "🤝",
  "😊", "🤔", "💯", "👏", "✌️", "🎉", "🙌", "😁", "🤗", "👌",
  "💪", "🌟", "⭐", "😃", "🤙", "👋", "❤️", "😆", "🫡", "🤣",
];

const RESPOSTAS_CURTAS = [
  "ss", "sim", "aham", "uhum", "pode crer", "exato",
  "verdade", "isso aí", "com certeza", "claro",
  "tá certo", "beleza", "blz", "joia", "show",
  "massa", "dahora", "top", "boa", "firmeza",
  "haha", "kkk", "kkkk", "rsrs",
  "é mesmo", "pois é", "né", "sei",
  "entendi", "ah sim", "faz sentido", "de boa",
];

const FRASES_GRUPO = [
  "muito bom esse conteúdo, parabéns por compartilhar com a gente",
  "cara isso é muito verdade, passei por algo parecido recentemente",
  "valeu demais pela informação, vou aplicar no meu dia a dia",
  "isso é exatamente o que eu precisava ouvir hoje, obrigado",
  "conteúdo de qualidade como sempre, continue assim que tá ótimo",
  "concordo demais com isso, acho que muita gente deveria ver",
  "alguém mais concorda com isso? acho que faz muito sentido",
  "tamo junto pessoal, boa semana pra todos nós aqui do grupo",
  "continue postando esse tipo de coisa, faz muita diferença pra gente",
  "excelente informação, salvei aqui pra compartilhar depois com a família",
  "mandou muito bem nessa postagem, curti demais o conteúdo",
  "quem mais tá acompanhando esse grupo? tá cada vez melhor o conteúdo",
  "valeu por compartilhar isso com a gente, muito bom mesmo",
  "interessante demais essa informação, vou pesquisar mais sobre isso",
  "parabéns pelo conteúdo de qualidade, a gente aprende muito aqui",
  "boa demais essa dica, já passei pra frente pra quem precisa",
];

const OPINIOES = [
  "acho que esse ano vai ser diferente, tenho muita esperança de dias melhores",
  "tô otimista com o futuro, muita coisa boa vindo por aí se Deus quiser",
  "cada vez mais difícil achar coisa boa, mas a gente segue firme e forte",
  "o mercado tá complicado, mas quem se esforça sempre encontra oportunidade",
  "tô repensando muita coisa na vida, acho que faz parte do crescimento",
  "preciso descansar mais, o corpo pede e a gente tem que ouvir né",
  "quero viajar mais esse ano, já tô até pesquisando alguns destinos legais",
  "preciso focar na saúde, comecei a me alimentar melhor essa semana",
  "tô curtindo mais ficar em casa, é bom demais ter paz e sossego",
  "o tempo tá passando rápido demais, parece que ontem era janeiro",
  "tô aprendendo a ter mais paciência, nem tudo acontece no nosso tempo",
  "as coisas estão melhorando aos poucos, cada dia é uma vitória",
  "cada dia é uma conquista, a gente tem que valorizar cada momento",
  "tô mais seletivo com meu tempo, aprendi que isso é muito importante",
  "quero investir mais em mim esse ano, tanto pessoal quanto profissional",
  "o importante é ter paz de espírito, o resto a gente vai resolvendo",
  "tô priorizando o que importa de verdade na minha vida agora",
  "a vida tá mudando pra melhor, e eu tô muito grato por isso",
];

const COTIDIANO = [
  "acabei de almoçar agora, comi muito bem hoje graças a Deus",
  "tô no trânsito parado faz uns vinte minutos, tá osso",
  "choveu demais aqui na região, parecia que não ia parar nunca",
  "acordei cedo hoje e aproveitei pra resolver umas coisas pendentes",
  "café da manhã ficou top hoje, fiz aquele capricho todo especial",
  "fui na feira agora cedo e encontrei umas frutas maravilhosas",
  "limpei a casa inteira, tá brilhando, dá gosto de ver",
  "fiz um churrasco ontem com a família, ficou muito bom",
  "passei no mercado agora e comprei umas coisas pro almoço de amanhã",
  "tô esperando o delivery, já tá com fome demais aqui",
  "acabei de sair da academia, treino pesado mas valeu a pena",
  "lavei o carro hoje, tava precisando muito, tava imundo",
  "fiz um bolo caseiro pra família e ficou uma delícia",
  "tô estudando uma coisa nova, é difícil mas tô gostando bastante",
  "voltei a ler depois de muito tempo, tô curtindo muito",
  "comecei a caminhar de manhã e já tô sentindo diferença no corpo",
  "troquei a tela do celular que tava rachada há meses",
  "arrumei o quarto todo, ficou muito bom, dá vontade de ficar lá",
  "cozinhei pela primeira vez em semanas e lembrei como é bom",
  "tô assistindo uma série boa demais, não consigo parar de ver",
  "fui cortar o cabelo hoje e ficou do jeito que eu queria",
  "dormi super bem ontem, acordei renovado, fazia tempo que não dormia assim",
  "tomei um açaí agora com granola e banana, melhor coisa do mundo",
  "pedi uma pizza pra comemorar o final de semana, merecido demais",
];

const DICAS_GERAIS = [
  "vi um restaurante bom pra indicar", "descobri um app muito bom",
  "tem uma série nova que vale a pena", "aprendi um truque legal ontem",
  "achei um lugar ótimo pra passear", "tem uma promoção boa hoje",
  "recomendo demais aquele livro", "testei uma receita incrível",
  "achei um canal no youtube muito bom", "descobri um café ótimo aqui perto",
];

const REFLEXOES = [
  "sabe o que eu penso, a gente tem que aproveitar cada momento porque passa muito rápido",
  "ontem eu tava lembrando de como as coisas eram diferentes uns anos atrás",
  "às vezes eu paro pra pensar no quanto a gente evoluiu",
  "tô numa fase da vida que tô priorizando paz e tranquilidade",
  "faz tempo que eu queria falar isso, mas a vida corrida não deixa",
  "eu acho que o segredo da vida é ter equilíbrio",
  "essa semana foi intensa demais, mas no final deu tudo certo",
  "tô aprendendo que nem tudo precisa de resposta imediata",
];

const HISTORIAS_CURTAS = [
  "ontem aconteceu uma coisa engraçada, eu fui no mercado e encontrei um amigo que não via há anos",
  "meu vizinho adotou um cachorro e agora o bicho late o dia inteiro mas ele é muito fofo",
  "fui almoçar num restaurante novo e a comida era tão boa que já marquei de voltar",
  "tentei fazer uma receita nova e deu tudo errado mas pelo menos a cozinha ficou cheirosa",
  "meu filho falou uma coisa tão engraçada ontem que eu quase chorei de rir",
  "fui numa loja comprar uma coisa e saí com cinco",
  "tava dirigindo e vi o pôr do sol mais bonito que já vi na vida",
  "hoje de manhã o café ficou perfeito, daquele jeito que a gente gosta",
  "recebi uma mensagem de um amigo antigo e matamos a saudade conversando por horas",
];

const PERGUNTAS_LONGAS = [
  "ei, tudo bem? faz tempo que não conversamos, queria saber como está sua vida",
  "opa, lembrei de você agora, como estão as coisas por aí?",
  "queria te perguntar uma coisa, você já foi naquele lugar que me indicou?",
  "fala, como tá? vi umas fotos suas e parece que tá tudo bem",
  "e aí, conseguiu resolver aquela situação que tava te preocupando?",
];

const FRASES_NUMERO = [
  "faz {n} dias que pensei nisso", "já tem uns {n} dias", "faz uns {n} dias",
  "uns {n} meses atrás", "a gente se viu uns {n} dias atrás",
];

const recentMsgs: string[] = [];
const MAX_RECENT = 200;

function maybeEmoji(msg: string): string {
  const r = Math.random();
  if (r < 0.55) return msg;
  if (r < 0.85) return `${msg} ${pickRandom(EMOJIS_POOL)}`;
  return `${msg} ${pickRandom(EMOJIS_POOL)}${pickRandom(EMOJIS_POOL)}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type MsgCtx = "group" | "private" | "autosave" | "community";

function generateNaturalMessage(context: MsgCtx = "group"): string {
  const maxLen = context === "autosave" ? 40 : 250;
  const minLen = (context === "group" || context === "community") ? 60 : 5;
  for (let attempt = 0; attempt < 120; attempt++) {
    const msg = buildMsg(context);
    if (msg.length >= minLen && msg.length <= maxLen && !recentMsgs.includes(msg)) {
      recentMsgs.push(msg);
      if (recentMsgs.length > MAX_RECENT) recentMsgs.shift();
      return msg;
    }
  }
  // Fallback: always combine multiple parts to guarantee length
  let fb = `${pickRandom(SAUDACOES)}, ${pickRandom(COTIDIANO)}. ${pickRandom(OPINIOES)}. ${pickRandom(COMPLEMENTOS)}`;
  if (fb.length < minLen) fb += ` ${pickRandom(REFLEXOES)}`;
  return cap(maybeEmoji(fb)).substring(0, maxLen);
}

function buildMsg(ctx: MsgCtx): string {
  if (ctx === "autosave") {
    const s = randInt(1, 6);
    if (s === 1) return pickRandom(RESPOSTAS_CURTAS);
    if (s === 2) return cap(maybeEmoji(pickRandom(SAUDACOES)));
    if (s === 3) return cap(maybeEmoji(`${pickRandom(SAUDACOES)}, ${pickRandom(PERGUNTAS)}?`));
    if (s === 4) return cap(maybeEmoji(`${pickRandom(PERGUNTAS)}?`));
    if (s === 5) return pickRandom(RESPOSTAS_CURTAS) + " " + pickRandom(EMOJIS_POOL);
    return cap(maybeEmoji(pickRandom(SAUDACOES)));
  }

  const s = randInt(1, 28);
  // Slots 1-2: short phrases (will be filtered out by minLen=30 for groups, retried)
  if (s === 1) return pickRandom(RESPOSTAS_CURTAS);
  if (s === 2) return cap(maybeEmoji(pickRandom(SAUDACOES)));
  // Slots 3-6: medium combos
  if (s <= 4) return cap(maybeEmoji(`${pickRandom(SAUDACOES)}, ${pickRandom(PERGUNTAS)}?`));
  if (s <= 6) return cap(maybeEmoji(`${pickRandom(PERGUNTAS)}?`));
  // Slots 7-10: comments + complements (longer)
  if (s <= 8) {
    let m = pickRandom(COMENTARIOS);
    m += `, ${pickRandom(COMPLEMENTOS)}`;
    return cap(maybeEmoji(m));
  }
  if (s <= 10) return cap(maybeEmoji(`${pickRandom(OPINIOES)}. ${pickRandom(COMPLEMENTOS)}`));
  // Slots 11-14: longer content
  if (s <= 12) return cap(maybeEmoji(`${pickRandom(COTIDIANO)}. ${pickRandom(COMPLEMENTOS)}`));
  if (s === 13) return cap(maybeEmoji(`${pickRandom(DICAS_GERAIS)}. ${pickRandom(COMPLEMENTOS)}`));
  if (s === 14) return cap(maybeEmoji(`${pickRandom(SAUDACOES)}, ${pickRandom(COMENTARIOS)}. ${pickRandom(COMPLEMENTOS)}`));
  if (s === 15) {
    const f = pickRandom(FRASES_NUMERO).replace("{n}", String(randInt(2, 15)));
    return cap(maybeEmoji(`${f}, ${pickRandom(COMENTARIOS)}`));
  }
  if (s === 16) return cap(maybeEmoji(`${pickRandom(SAUDACOES)}, ${pickRandom(OPINIOES)}`));
  // Slots 17-22: reflexões e histórias (naturally long)
  if (s <= 19) return cap(maybeEmoji(pickRandom(REFLEXOES)));
  if (s <= 22) return cap(maybeEmoji(pickRandom(HISTORIAS_CURTAS)));
  if (s === 23) return cap(maybeEmoji(pickRandom(PERGUNTAS_LONGAS)));
  if (s === 24) return cap(maybeEmoji(`${pickRandom(SAUDACOES)}, ${pickRandom(COTIDIANO)}. ${pickRandom(COMPLEMENTOS)}`));
  if (s === 25) return cap(maybeEmoji(`${pickRandom(COMENTARIOS)}, ${pickRandom(OPINIOES)}`));
  if (s <= 27 && ctx === "group") return cap(maybeEmoji(`${pickRandom(FRASES_GRUPO)}. ${pickRandom(COMPLEMENTOS)}`));
  if (ctx === "community") return cap(maybeEmoji(`${pickRandom(HISTORIAS_CURTAS)}. ${pickRandom(COMPLEMENTOS)}`));
  return cap(maybeEmoji(`${pickRandom(REFLEXOES)}. ${pickRandom(COMPLEMENTOS)}`));
}

// ══════════════════════════════════════════════════════════
// UAZAPI COMMUNICATION
// ══════════════════════════════════════════════════════════

async function uazapiSendText(baseUrl: string, token: string, number: string, text: string) {
  const safeText = String(text || "").trim();
  if (!safeText) throw new Error("Texto vazio para envio");

  // For group JIDs (@g.us), try every payload shape commonly accepted by UaZapi.
  // Some instances reject /chat/send-text with 405 while still accepting /send/text or /message/sendText.
  const isGroup = number.includes("@g.us");

  const attempts: Array<{ path: string; body: Record<string, unknown> }> = isGroup
    ? [
        { path: "/send/text", body: { chatId: number, text: safeText } },
        { path: "/send/text", body: { chatId: number, number, text: safeText } },
        { path: "/send/text", body: { number, text: safeText } },
        { path: "/chat/send-text", body: { chatId: number, body: safeText } },
        { path: "/chat/send-text", body: { chatId: number, text: safeText } },
        { path: "/chat/send-text", body: { chatId: number, to: number, body: safeText, text: safeText } },
        { path: "/message/sendText", body: { chatId: number, text: safeText } },
        { path: "/message/sendText", body: { number, text: safeText } },
      ]
    : [
        { path: "/send/text", body: { number, text: safeText } },
        { path: "/chat/send-text", body: { number, to: number, chatId: number, body: safeText, text: safeText } },
        { path: "/message/sendText", body: { chatId: number, text: safeText } },
        { path: "/message/sendText", body: { number, text: safeText } },
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
          if (parsed?.error) {
            lastErr = `${at.path}: ${raw.substring(0, 240)}`;
            if (typeof parsed.error === "string" && (parsed.error.includes("not on WhatsApp") || parsed.error.includes("not registered"))) {
              throw new Error(`API 500: ${raw.substring(0, 240)}`);
            }
            continue;
          }
          if (parsed?.code === 404) { lastErr = `${at.path}: ${raw.substring(0, 240)}`; continue; }
          if (parsed?.status === "error") { lastErr = `${at.path}: ${raw.substring(0, 240)}`; continue; }
          return parsed;
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message.startsWith("API 500:")) throw parseErr;
          return { ok: true, raw };
        }
      }
      if (res.status === 405 || res.status === 404) { lastErr = `${res.status} @ ${at.path}`; continue; }
      lastErr = `${res.status} @ ${at.path}: ${raw.substring(0, 240)}`;
    } catch (e) {
      lastErr = `${at.path}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  throw new Error(`Text send failed: ${lastErr}`);
}

// ── PRE-VALIDATION: Check if phone has WhatsApp ──
async function uazapiCheckPhone(baseUrl: string, token: string, phone: string): Promise<boolean> {
  const endpoints = [
    { url: `${baseUrl}/misc/checkPhones`, body: { phones: [phone] } },
    { url: `${baseUrl}/chat/check`, body: { phone } },
    { url: `${baseUrl}/misc/isOnWhatsapp`, body: { phone } },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", token, Accept: "application/json" },
        body: JSON.stringify(ep.body),
      });
      if (res.status === 405 || res.status === 404) continue;
      if (!res.ok) continue;
      const raw = await res.text();
      if (!raw) continue;
      const parsed = JSON.parse(raw);

      // Handle array responses
      const item = Array.isArray(parsed) ? parsed[0] : (parsed?.data?.[0] || parsed?.data || parsed);
      if (!item) continue;

      // Check various response formats
      if (item.exists === false || item.onWhatsapp === false || item.isOnWhatsapp === false || item.numberExists === false) return false;
      if (item.exists === true || item.onWhatsapp === true || item.isOnWhatsapp === true || item.numberExists === true) return true;
    } catch { continue; }
  }

  return true; // Assume valid if check endpoints unavailable
}


// NOTE: uazapiFetchLastMessage removed — UAZAPI does not support fetching chat messages (all endpoints return 404/405)



async function uazapiSendImage(baseUrl: string, token: string, number: string, imageUrl: string, caption: string) {
  if (!imageUrl) throw new Error("Image URL ausente");
  const safeCaption = (caption || "📸").trim() || "📸";

  const res = await fetch(`${baseUrl}/send/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token, Accept: "application/json" },
    body: JSON.stringify({ number, file: imageUrl, type: "image", caption: safeCaption }),
  });
  const raw = await res.text();
  if (res.ok) {
    try { return JSON.parse(raw); } catch { return { ok: true, raw }; }
  }
  throw new Error(`Image send failed: ${res.status} — ${raw.substring(0, 240)}`);
}

async function uazapiSendSticker(baseUrl: string, token: string, number: string, imageUrl: string) {
  if (!imageUrl) throw new Error("Sticker URL ausente");

  const res = await fetch(`${baseUrl}/send/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token, Accept: "application/json" },
    body: JSON.stringify({ number, file: imageUrl, type: "sticker" }),
  });
  const raw = await res.text();
  if (res.ok) {
    try { return JSON.parse(raw); } catch { return { ok: true, raw }; }
  }
  throw new Error(`Sticker send failed: ${res.status} — ${raw.substring(0, 240)}`);
}

async function uazapiSendAudio(baseUrl: string, token: string, number: string, audioUrl: string) {
  if (!audioUrl) throw new Error("Audio URL ausente");

  // Try PTT (push-to-talk / voice note) first, then regular audio
  const attempts = [
    { path: "/send/media", body: { number, file: audioUrl, type: "audio", ptt: true } },
    { path: "/send/media", body: { number, file: audioUrl, type: "audio" } },
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
        try { return JSON.parse(raw); } catch { return { ok: true, raw }; }
      }
      lastErr = `${res.status} @ ${at.path}: ${raw.substring(0, 240)}`;
    } catch (e) {
      lastErr = `${at.path}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  throw new Error(`Audio send failed: ${lastErr}`);
}

async function uazapiSendLocation(baseUrl: string, token: string, number: string, lat: number, lng: number, name: string) {
  const attempts = [
    { path: "/send/location", body: { number, lat, lng, name, address: name } },
    { path: "/message/sendLocation", body: { chatId: number, lat, lng, name, address: name } },
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
        try { return JSON.parse(raw); } catch { return { ok: true, raw }; }
      }
      lastErr = `${res.status} @ ${at.path}: ${raw.substring(0, 240)}`;
    } catch (e) {
      lastErr = `${at.path}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  throw new Error(`Location send failed: ${lastErr}`);
}

// ══════════════════════════════════════════════════════════
// MEDIA POOLS (Image, Audio, Location)
// ══════════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&q=80",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80",
  "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&q=80",
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80",
  "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=800&q=80",
  "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80",
  "https://images.unsplash.com/photo-1543269865-cbf427effbad?w=800&q=80",
  "https://images.unsplash.com/photo-1574158622682-e40e69881006?w=800&q=80",
  "https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=800&q=80",
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80",
];

// Fallback audio URLs — short ambient/nature sounds (public domain)
const FALLBACK_AUDIOS = [
  "https://cdn.freesound.org/previews/531/531947_4397472-lq.mp3",
  "https://cdn.freesound.org/previews/456/456058_5765826-lq.mp3",
  "https://cdn.freesound.org/previews/462/462808_8386274-lq.mp3",
  "https://cdn.freesound.org/previews/367/367125_6652158-lq.mp3",
  "https://cdn.freesound.org/previews/527/527642_2525202-lq.mp3",
];

// Pool de localizações fake — cidades brasileiras com variação
const FAKE_LOCATIONS: Array<{ lat: number; lng: number; name: string }> = [
  { lat: -23.5505, lng: -46.6333, name: "São Paulo, SP" },
  { lat: -22.9068, lng: -43.1729, name: "Rio de Janeiro, RJ" },
  { lat: -19.9167, lng: -43.9345, name: "Belo Horizonte, MG" },
  { lat: -25.4284, lng: -49.2733, name: "Curitiba, PR" },
  { lat: -30.0346, lng: -51.2177, name: "Porto Alegre, RS" },
  { lat: -15.7942, lng: -47.8822, name: "Brasília, DF" },
  { lat: -12.9714, lng: -38.5124, name: "Salvador, BA" },
  { lat: -8.0476, lng: -34.877, name: "Recife, PE" },
  { lat: -3.7172, lng: -38.5433, name: "Fortaleza, CE" },
  { lat: -22.9064, lng: -43.1822, name: "Copacabana, RJ" },
  { lat: -23.5631, lng: -46.6544, name: "Av. Paulista, SP" },
  { lat: -23.5874, lng: -46.6576, name: "Ibirapuera, SP" },
  { lat: -22.9519, lng: -43.2105, name: "Maracanã, RJ" },
  { lat: -20.3155, lng: -40.3128, name: "Vitória, ES" },
  { lat: -27.5954, lng: -48.548, name: "Florianópolis, SC" },
  { lat: -16.6869, lng: -49.2648, name: "Goiânia, GO" },
  { lat: -2.5008, lng: -44.2825, name: "São Luís, MA" },
  { lat: -1.4558, lng: -48.5024, name: "Belém, PA" },
  { lat: -3.1190, lng: -60.0217, name: "Manaus, AM" },
  { lat: -23.9619, lng: -46.3345, name: "Santos, SP" },
  { lat: -22.7557, lng: -43.4528, name: "Nova Iguaçu, RJ" },
  { lat: -23.4621, lng: -46.5331, name: "Guarulhos, SP" },
  { lat: -22.8859, lng: -47.0596, name: "Campinas, SP" },
  { lat: -23.1794, lng: -45.8868, name: "São José dos Campos, SP" },
  { lat: -21.1767, lng: -47.8208, name: "Ribeirão Preto, SP" },
  { lat: -23.5097, lng: -47.4609, name: "Sorocaba, SP" },
  { lat: -22.3154, lng: -49.0710, name: "Bauru, SP" },
  { lat: -23.3045, lng: -51.1696, name: "Londrina, PR" },
  { lat: -25.2521, lng: -52.0215, name: "Guarapuava, PR" },
  { lat: -29.1685, lng: -51.1794, name: "Caxias do Sul, RS" },
];

const LOCATION_CAPTIONS = [
  "tô aqui ó 📍", "olha onde eu tô", "passeando por aqui 🚶",
  "vim dar uma volta", "conhecendo o lugar", "queria que vc tivesse aqui",
  "lugar massa demais", "olha esse lugar 👀", "to aqui pertinho",
  "parei aqui rapidão", "saí pra resolver uns negócios", "tô nessa região",
  "vim visitar uns amigos aqui", "passeio do dia 😎", "andando por aqui",
];

let _imagePoolCache: string[] | null = null;
let _audioPoolCache: string[] | null = null;

async function getImagePool(db: any): Promise<string[]> {
  if (_imagePoolCache) return _imagePoolCache;
  try {
    const { data: files, error } = await db.storage.from("media").list("warmup-media", { limit: 100 });
    if (!error && files?.length > 0) {
      const base = `${SUPABASE_URL}/storage/v1/object/public/media/warmup-media`;
      const imgs = files
        .filter((f: any) => f.name && !f.name.startsWith(".") && !f.name.startsWith("Captura") && /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name))
        .map((f: any) => `${base}/${encodeURIComponent(f.name)}`);
      if (imgs.length > 0) {
        _imagePoolCache = imgs;
        return _imagePoolCache;
      }
    }
  } catch (_e) { /* fallback */ }
  _imagePoolCache = FALLBACK_IMAGES;
  return _imagePoolCache;
}

async function getAudioPool(db: any): Promise<string[]> {
  if (_audioPoolCache) return _audioPoolCache;
  try {
    const { data: files, error } = await db.storage.from("media").list("warmup-audio", { limit: 100 });
    if (!error && files?.length > 0) {
      const base = `${SUPABASE_URL}/storage/v1/object/public/media/warmup-audio`;
      const audios = files
        .filter((f: any) => f.name && !f.name.startsWith(".") && /\.(ogg|mp3|m4a|opus|wav)$/i.test(f.name))
        .map((f: any) => `${base}/${encodeURIComponent(f.name)}`);
      if (audios.length > 0) {
        _audioPoolCache = audios;
        return _audioPoolCache;
      }
    }
  } catch (_e) { /* fallback */ }
  _audioPoolCache = FALLBACK_AUDIOS;
  return _audioPoolCache;
}

function pickFakeLocation(): { lat: number; lng: number; name: string } {
  const base = pickRandom(FAKE_LOCATIONS);
  // Add small random offset (±0.005 degrees ≈ 500m) to make each unique
  return {
    lat: base.lat + (Math.random() - 0.5) * 0.01,
    lng: base.lng + (Math.random() - 0.5) * 0.01,
    name: base.name,
  };
}

const IMAGE_CAPTIONS = [
  "Olha que lindo isso 📸", "Registro do dia ✨", "Momento especial 🙌",
  "Curti demais essa foto", "Olha que coisa boa 🔥", "Isso aqui tá demais",
  "Que cenário incrível", "Achei muito bonito isso", "Olha o que encontrei hoje",
  "Dia abençoado 🙏", "Vale a pena registrar", "Momento de paz ☀️",
  "Cada dia uma conquista", "Simplesmente perfeito 💯", "A vida é boa demais",
  "Natureza sempre surpreende 🌿", "Que energia boa", "Olha essa beleza",
  "Pra guardar na memória", "Isso me faz feliz 😊", "Olha que show",
  "Quando a vida é boa 😎", "Registro pra eternidade", "Obrigado Deus 🙌",
];

// Mix para GRUPOS: 70% texto, 15% imagem, 15% figurinha (reduzido)
function pickMediaTypeGroup(budgetUsed: number): "text" | "image" | "sticker" {
  if (budgetUsed < 3) return "text";
  const r = Math.random();
  if (r < 0.70) return "text";
  if (r < 0.85) return "image";
  return "sticker";
}

// Mix para COMUNIDADE x1: 85% texto, 8% imagem, 5% áudio, 2% localização
function pickMediaTypeCommunity(budgetUsed: number): "text" | "image" | "audio" | "location" {
  if (budgetUsed < 3) return "text";
  const r = Math.random();
  if (r < 0.85) return "text";
  if (r < 0.93) return "image";
  if (r < 0.98) return "audio";
  return "location";
}

// ══════════════════════════════════════════════════════════
// CONNECTED STATUS
// ══════════════════════════════════════════════════════════
const CONNECTED_STATUSES = ["Ready", "Connected", "authenticated"];
const INTERACTION_JOB_TYPES = ["group_interaction", "autosave_interaction", "community_interaction"];

// Max active pairs a device can participate in (as A or B)
// Unstable chips get 2 pairs; new/recovered get up to 5
function getMaxPairsForChip(chipState: string): number {
  return chipState === "unstable" ? 2 : 5;
}

async function getActivePairCount(db: any, deviceId: string): Promise<number> {
  const { count: countA } = await db.from("community_pairs")
    .select("id", { count: "exact", head: true })
    .eq("instance_id_a", deviceId).eq("status", "active");
  const { count: countB } = await db.from("community_pairs")
    .select("id", { count: "exact", head: true })
    .eq("instance_id_b", deviceId).eq("status", "active");
  return (countA || 0) + (countB || 0);
}

async function getDeviceChipState(db: any, deviceId: string): Promise<string> {
  const { data } = await db.from("warmup_cycles")
    .select("chip_state").eq("device_id", deviceId).eq("is_running", true).limit(1).single();
  return data?.chip_state || "new";
}

async function getActiveCommunityPairsForDevice(db: any, deviceId: string): Promise<any[]> {
  const [{ data: pairsA }, { data: pairsB }] = await Promise.all([
    db.from("community_pairs")
      .select("id, cycle_id, instance_id_a, instance_id_b, meta")
      .eq("instance_id_a", deviceId)
      .eq("status", "active"),
    db.from("community_pairs")
      .select("id, cycle_id, instance_id_a, instance_id_b, meta")
      .eq("instance_id_b", deviceId)
      .eq("status", "active"),
  ]);

  const seen = new Set<string>();
  return [...(pairsA || []), ...(pairsB || [])].filter((pair: any) => {
    if (seen.has(pair.id)) return false;
    seen.add(pair.id);
    return true;
  });
}

async function closeCommunityPairs(db: any, pairIds: string[]): Promise<number> {
  if (!pairIds.length) return 0;

  for (let i = 0; i < pairIds.length; i += 200) {
    await db.from("community_pairs")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .in("id", pairIds.slice(i, i + 200));
  }

  return pairIds.length;
}

type ReconcileCommunityPairsResult = {
  pairs: any[];
  keptCount: number;
  createdCount: number;
  closedCount: number;
  targetPeers: number;
};

async function reconcileCommunityPairs(
  db: any,
  params: {
    deviceId: string;
    userId: string;
    cycleId: string;
    dayIndex: number;
    chipState: string;
  },
): Promise<ReconcileCommunityPairsResult> {
  const targetPeers = getCommunityPeers(params.dayIndex, params.chipState);
  if (targetPeers <= 0) {
    return { pairs: [], keptCount: 0, createdCount: 0, closedCount: 0, targetPeers };
  }

  const existingPairs = await getActiveCommunityPairsForDevice(db, params.deviceId);
  let validPairs = existingPairs;
  let closedCount = 0;

  const peerIds = [...new Set(existingPairs.map((pair: any) => getCommunityPeerDeviceId(pair, params.deviceId)))];
  if (peerIds.length > 0) {
    const [peerDevicesRes, peerMembershipRes, peerCyclesRes] = await Promise.all([
      db.from("devices")
        .select("id, status, number")
        .in("id", peerIds),
      db.from("warmup_community_membership")
        .select("device_id, is_enabled, is_eligible")
        .in("device_id", peerIds),
      db.from("warmup_cycles")
        .select("device_id, is_running, phase")
        .in("device_id", peerIds)
        .eq("is_running", true),
    ]);

    const peerDevicesMap = Object.fromEntries((peerDevicesRes.data || []).map((row: any) => [row.id, row]));
    const peerMembershipMap = Object.fromEntries((peerMembershipRes.data || []).map((row: any) => [row.device_id, row]));
    const peerCycleMap = Object.fromEntries((peerCyclesRes.data || []).map((row: any) => [row.device_id, row]));

    const invalidPairIds = existingPairs
      .filter((pair: any) => {
        const peerId = getCommunityPeerDeviceId(pair, params.deviceId);
        const peerDevice = peerDevicesMap[peerId];
        const peerMembership = peerMembershipMap[peerId];
        const peerCycle = peerCycleMap[peerId];

        return !peerDevice?.number ||
          !CONNECTED_STATUSES.includes(peerDevice.status) ||
          !peerMembership?.is_enabled ||
          !peerMembership?.is_eligible ||
          !peerCycle?.is_running ||
          ["paused", "completed", "error"].includes(peerCycle.phase);
      })
      .map((pair: any) => pair.id);

    if (invalidPairIds.length > 0) {
      closedCount += await closeCommunityPairs(db, invalidPairIds);
      const invalidSet = new Set(invalidPairIds);
      validPairs = existingPairs.filter((pair: any) => !invalidSet.has(pair.id));
    }
  }

  if (validPairs.length > 1) {
    const pairByPeer = new Map<string, any>();
    const duplicateIds: string[] = [];

    for (const pair of validPairs) {
      const peerId = getCommunityPeerDeviceId(pair, params.deviceId);
      const currentMeta = normalizeCommunityPairMeta(pair);
      const currentLastTouch = Math.max(
        currentMeta.last_turn_at ? new Date(currentMeta.last_turn_at).getTime() : 0,
        currentMeta.last_completed_at ? new Date(currentMeta.last_completed_at).getTime() : 0,
      );

      if (!pairByPeer.has(peerId)) {
        pairByPeer.set(peerId, pair);
        continue;
      }

      const keptPair = pairByPeer.get(peerId);
      const keptMeta = normalizeCommunityPairMeta(keptPair);
      const keptLastTouch = Math.max(
        keptMeta.last_turn_at ? new Date(keptMeta.last_turn_at).getTime() : 0,
        keptMeta.last_completed_at ? new Date(keptMeta.last_completed_at).getTime() : 0,
      );

      if (currentLastTouch > keptLastTouch) {
        duplicateIds.push(keptPair.id);
        pairByPeer.set(peerId, pair);
      } else {
        duplicateIds.push(pair.id);
      }
    }

    if (duplicateIds.length > 0) {
      closedCount += await closeCommunityPairs(db, duplicateIds);
      validPairs = Array.from(pairByPeer.values());
    }
  }

  if (validPairs.length > targetPeers) {
    const shuffledValid = [...validPairs].sort(() => Math.random() - 0.5);
    const keptPairs = shuffledValid.slice(0, targetPeers);
    const overflowIds = shuffledValid.slice(targetPeers).map((pair: any) => pair.id);

    if (overflowIds.length > 0) {
      closedCount += await closeCommunityPairs(db, overflowIds);
    }

    validPairs = keptPairs;
  }

  const usedDevices = new Set<string>(validPairs.map((pair: any) => getCommunityPeerDeviceId(pair, params.deviceId)));
  usedDevices.add(params.deviceId);

  let createdCount = 0;
  if (validPairs.length < targetPeers) {
    const { data: eligible } = await db.from("warmup_community_membership")
      .select("device_id, user_id")
      .eq("is_enabled", true)
      .eq("is_eligible", true)
      .neq("device_id", params.deviceId)
      .limit(200);

    const candidateIds = [...new Set(
      (eligible || [])
        .map((row: any) => String(row.device_id || ""))
        .filter((deviceId: string) => deviceId.length > 0),
    )].filter((deviceId) => !usedDevices.has(deviceId));

    if (candidateIds.length > 0) {
      const [candidateDevicesRes, candidateCyclesRes] = await Promise.all([
        db.from("devices")
          .select("id, user_id, name, status, number")
          .in("id", candidateIds),
        db.from("warmup_cycles")
          .select("id, device_id, user_id, chip_state, day_index, phase, is_running")
          .in("device_id", candidateIds)
          .eq("is_running", true),
      ]);

      const candidateDeviceMap = Object.fromEntries((candidateDevicesRes.data || []).map((row: any) => [row.id, row]));
      const candidateCycleMap = Object.fromEntries((candidateCyclesRes.data || []).map((row: any) => [row.device_id, row]));
      const phaseRank = (phase?: string) => {
        if (phase === "community_ramp_up" || phase === "community_stable") return 0;
        if (phase === "autosave_enabled") return 1;
        if (phase === "groups_only") return 2;
        return 3;
      };

      const sortedEligible = [...(eligible || [])].sort((a: any, b: any) => {
        const sameUserA = a.user_id === params.userId ? 0 : 1;
        const sameUserB = b.user_id === params.userId ? 0 : 1;
        if (sameUserA !== sameUserB) return sameUserA - sameUserB;

        const cycleA = candidateCycleMap[a.device_id];
        const cycleB = candidateCycleMap[b.device_id];
        const phaseDelta = phaseRank(cycleA?.phase) - phaseRank(cycleB?.phase);
        if (phaseDelta !== 0) return phaseDelta;

        return (cycleB?.day_index || 0) - (cycleA?.day_index || 0);
      });

      for (const candidate of sortedEligible) {
        if (validPairs.length + createdCount >= targetPeers) break;
        if (usedDevices.has(candidate.device_id)) continue;

        const partnerDevice = candidateDeviceMap[candidate.device_id];
        const partnerCycle = candidateCycleMap[candidate.device_id];
        if (!partnerDevice?.number || !CONNECTED_STATUSES.includes(partnerDevice.status)) continue;
        if (!partnerCycle?.is_running || ["paused", "completed", "error"].includes(partnerCycle.phase)) continue;

        const partnerPairCount = await getActivePairCount(db, candidate.device_id);
        const partnerChipState = partnerCycle.chip_state || "new";
        if (partnerPairCount >= getMaxPairsForChip(partnerChipState)) continue;

        const { data: insertedPair } = await db.from("community_pairs")
          .insert({
            cycle_id: params.cycleId,
            instance_id_a: params.deviceId,
            instance_id_b: candidate.device_id,
            status: "active",
            meta: { initiator: Math.random() < 0.5 ? "a" : "b", is_new: true },
          })
          .select("id, cycle_id, instance_id_a, instance_id_b, meta")
          .maybeSingle();

        usedDevices.add(candidate.device_id);
        createdCount++;
        if (insertedPair) validPairs.push(insertedPair);
      }
    }
  }

  return {
    pairs: validPairs,
    keptCount: Math.max(validPairs.length - createdCount, 0),
    createdCount,
    closedCount,
    targetPeers,
  };
}

type CommunityPairMeta = {
  initiator: "a" | "b";
  expected_sender_device_id: string | null;
  last_sender_device_id: string | null;
  turns_completed: number;
  max_turns: number;
  conversation_id: string | null;
  last_turn_at: string | null;
  last_completed_at: string | null;
};

function getCommunityInitiatorDeviceId(pair: any, initiator: "a" | "b"): string {
  return initiator === "b" ? pair.instance_id_b : pair.instance_id_a;
}

function getCommunityPeerDeviceId(pair: any, deviceId: string): string {
  return pair.instance_id_a === deviceId ? pair.instance_id_b : pair.instance_id_a;
}

function normalizeCommunityPairMeta(pair: any): CommunityPairMeta {
  const raw = pair?.meta && typeof pair.meta === "object"
    ? pair.meta as Record<string, any>
    : {};

  const initiator: "a" | "b" = raw.initiator === "b" ? "b" : "a";
  const maxTurns = Number.isInteger(raw.max_turns) && raw.max_turns >= 2 && raw.max_turns <= 120
    ? raw.max_turns
    : randInt(40, 80);
  const rawTurnsCompleted = Number.isInteger(raw.turns_completed) && raw.turns_completed >= 0
    ? raw.turns_completed
    : 0;
  const turnsCompleted = Math.min(rawTurnsCompleted, maxTurns);
  const initiatorDeviceId = getCommunityInitiatorDeviceId(pair, initiator);
  const peerDeviceId = getCommunityPeerDeviceId(pair, initiatorDeviceId);
  const fallbackExpectedSender = turnsCompleted === 0
    ? initiatorDeviceId
    : turnsCompleted % 2 === 1
      ? peerDeviceId
      : initiatorDeviceId;

  return {
    initiator,
    expected_sender_device_id: turnsCompleted >= maxTurns
      ? null
      : (typeof raw.expected_sender_device_id === "string"
        ? raw.expected_sender_device_id
        : fallbackExpectedSender),
    last_sender_device_id: typeof raw.last_sender_device_id === "string"
      ? raw.last_sender_device_id
      : null,
    turns_completed: turnsCompleted >= maxTurns ? 0 : turnsCompleted,
    max_turns: maxTurns,
    conversation_id: typeof raw.conversation_id === "string" ? raw.conversation_id : null,
    last_turn_at: typeof raw.last_turn_at === "string" ? raw.last_turn_at : null,
    last_completed_at: typeof raw.last_completed_at === "string" ? raw.last_completed_at : null,
  };
}

async function enqueueCommunityTurn(
  db: any,
  params: {
    user_id: string;
    device_id: string;
    cycle_id: string;
    pair_id: string;
    conversation_id: string;
    turn_index: number;
    delay_seconds: number;
  },
) {
  const { data: existing } = await db.from("warmup_jobs")
    .select("id")
    .eq("status", "pending")
    .eq("device_id", params.device_id)
    .eq("cycle_id", params.cycle_id)
    .eq("job_type", "community_interaction")
    .contains("payload", {
      pair_id: params.pair_id,
      conversation_id: params.conversation_id,
      turn_index: params.turn_index,
    })
    .limit(1);

  if (existing?.length) return;

  await db.from("warmup_jobs").insert({
    user_id: params.user_id,
    device_id: params.device_id,
    cycle_id: params.cycle_id,
    job_type: "community_interaction",
    payload: {
      pair_id: params.pair_id,
      conversation_id: params.conversation_id,
      turn_index: params.turn_index,
      source: "community_reply",
    },
    run_at: new Date(Date.now() + params.delay_seconds * 1000).toISOString(),
    status: "pending",
  });
}

// ══════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: accept x-internal-secret OR valid Authorization Bearer (anon/service role)
  const secret = req.headers.get("x-internal-secret");
  const expectedSecret = Deno.env.get("INTERNAL_TICK_SECRET");
  const authHeader = req.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  const secretOk = !!(expectedSecret && secret === expectedSecret);

  // Accept any JWT that belongs to this Supabase project
  let bearerOk = false;
  if (bearerToken) {
    try {
      const parts = bearerToken.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        // Accept if it's a Supabase JWT for this project (anon or service_role)
        bearerOk = payload?.iss === "supabase" && payload?.ref === "ccfsxwmvgyxsoscofqoh";
      }
    } catch { /* invalid jwt */ }
  }

  if (!secretOk && !bearerOk) {
    console.error(`[warmup-tick] AUTH FAILED: secretOk=${secretOk}, bearerOk=${bearerOk}, hasBearer=${!!bearerToken}, tokenLen=${bearerToken.length}`);
    return json({ error: "Unauthorized" }, 401);
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }

  // Shard support: split job processing across parallel invocations
  const shardIndex = body.shard ?? 0;
  const shardTotal = body.shards ?? 1;

  try {
    if (body.action === "daily") return await handleDailyReset(db);
    if (body.action === "schedule_day") return await handleScheduleDay(db, body);
    return await handleTick(db, shardIndex, shardTotal);
  } catch (err) {
    console.error("[warmup-tick] Error:", err.message);
    return json({ error: err.message }, 500);
  }
});

// ══════════════════════════════════════════════════════════
// TICK HANDLER
// ══════════════════════════════════════════════════════════

async function handleTick(db: any, shardIndex = 0, shardTotal = 1) {
  const now = new Date().toISOString();
  const withinWindow = isWithinOperatingWindow();

  // Only shard 0 handles maintenance tasks (cancel stale, recover running, reconcile, orphans, auto-resume)
  const isPrimaryShard = shardIndex === 0;

  // Cancel stale interaction jobs outside window (but skip forced jobs)
  if (!withinWindow && isPrimaryShard) {
    const { data: outsideJobs } = await db.from("warmup_jobs")
      .select("id, payload")
      .eq("status", "pending").lte("run_at", now)
      .in("job_type", INTERACTION_JOB_TYPES);
    
    if (outsideJobs?.length) {
      const toCancel = outsideJobs.filter((j: any) => !j.payload?.forced).map((j: any) => j.id);
      if (toCancel.length > 0) {
        for (let i = 0; i < toCancel.length; i += 200) {
          await db.from("warmup_jobs")
            .update({ status: "cancelled", last_error: "Cancelado: fora da janela 07-19 BRT" })
            .in("id", toCancel.slice(i, i + 200));
        }
      }
    }
  }

  // Recover stale "running" jobs (>5min) — only primary shard
  if (isPrimaryShard) {
    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await db.from("warmup_jobs")
      .update({ status: "pending", last_error: "Recuperado de estado running travado" })
      .eq("status", "running").lt("updated_at", staleThreshold);
  }

  // Reconcile join_group jobs already joined — only primary shard
  if (isPrimaryShard) {
    const { data: staleJoins } = await db.from("warmup_jobs")
      .select("id, device_id, payload")
      .eq("job_type", "join_group").eq("status", "pending").limit(1000);

    if (staleJoins?.length > 0) {
      const deviceIds = [...new Set(staleJoins.map((j: any) => j.device_id))];
      const { data: joinedRecords } = await db.from("warmup_instance_groups")
        .select("device_id, group_id")
        .in("device_id", deviceIds)
        .in("join_status", ["joined", "left"]);

      if (joinedRecords?.length > 0) {
        const joinedSet = new Set(joinedRecords.map((r: any) => `${r.device_id}:${r.group_id}`));
        const toReconcile = staleJoins
          .filter((j: any) => j.payload?.group_id && joinedSet.has(`${j.device_id}:${j.payload.group_id}`))
          .map((j: any) => j.id);

        for (let i = 0; i < toReconcile.length; i += 200) {
          await db.from("warmup_jobs")
            .update({ status: "succeeded", last_error: "Auto-reconciliado" })
            .in("id", toReconcile.slice(i, i + 200));
        }
      }
    }
  } // end isPrimaryShard reconcile

  // ── ORPHANED CYCLE RECOVERY: Running cycles with 0 pending jobs during operating hours ──
  if (withinWindow && isPrimaryShard) {
    const { data: runningCycles } = await db.from("warmup_cycles")
      .select("id, user_id, device_id, day_index, days_total, chip_state, phase, daily_interaction_budget_target, daily_interaction_budget_used, last_daily_reset_at, first_24h_ends_at")
      .eq("is_running", true)
      .not("phase", "in", '("completed","paused","error")')
      .limit(500);

    if (runningCycles?.length) {
      const cycleIds = runningCycles.map((c: any) => c.id);

      // Batch: get all cycle IDs that have pending jobs AND pending daily_reset jobs
      const [pendingJobsRes, pendingResetRes] = await Promise.all([
        db.from("warmup_jobs").select("cycle_id").in("cycle_id", cycleIds).in("status", ["pending", "running"]),
        db.from("warmup_jobs").select("cycle_id").in("cycle_id", cycleIds).eq("job_type", "daily_reset").eq("status", "pending"),
      ]);

      const cyclesWithJobs = new Set((pendingJobsRes.data || []).map((j: any) => j.cycle_id));
      const cyclesWithReset = new Set((pendingResetRes.data || []).map((j: any) => j.cycle_id));
      const nowMs = Date.now();
      const STALE_RESET_MS = 26 * 60 * 60 * 1000; // 26 hours — should reset every ~24h

      for (const cycle of runningCycles) {
        const chipState = cycle.chip_state || "new";

        // ── FIX A0: Recovery for pre_24h cycles past first_24h_ends_at ──
        if (cycle.phase === "pre_24h" && cycle.first_24h_ends_at) {
          const endsAtMs = new Date(cycle.first_24h_ends_at).getTime();
          if (nowMs > endsAtMs + 60 * 60 * 1000) { // 1h grace period
            const { data: dev } = await db.from("devices").select("status").eq("id", cycle.device_id).maybeSingle();
            if (!dev || !CONNECTED_STATUSES.includes(dev.status)) continue;

            const newDay = 2;
            const newPhase = getPhaseForDay(newDay, chipState);

            await db.from("warmup_jobs")
              .update({ status: "cancelled", last_error: "Cancelado: pre_24h expirado" })
              .eq("cycle_id", cycle.id).eq("status", "pending");

            const resetAt = new Date().toISOString();
            await db.from("warmup_cycles").update({
              day_index: newDay, phase: newPhase,
              last_daily_reset_at: resetAt,
              daily_interaction_budget_used: 0, daily_unique_recipients_used: 0,
              daily_interaction_budget_target: 0,
            }).eq("id", cycle.id);

            await ensureJoinGroupJobs(db, cycle.id, cycle.user_id, cycle.device_id);
            await scheduleDayJobs(db, cycle.id, cycle.user_id, cycle.device_id, newDay, newPhase, chipState, true);

            const nextReset = new Date();
            nextReset.setUTCDate(nextReset.getUTCDate() + 1);
            nextReset.setUTCHours(9, 50, 0, 0);
            await db.from("warmup_jobs").insert({
              user_id: cycle.user_id, device_id: cycle.device_id, cycle_id: cycle.id,
              job_type: "daily_reset", payload: {}, run_at: nextReset.toISOString(), status: "pending",
            });

            await db.from("warmup_audit_logs").insert({
              user_id: cycle.user_id, device_id: cycle.device_id, cycle_id: cycle.id,
              level: "warning", event_type: "pre_24h_recovery",
              message: `Ciclo preso em pre_24h — first_24h expirou há ${Math.round((nowMs - endsAtMs) / 3600000)}h. Avançado para dia ${newDay} (${newPhase})`,
              meta: { first_24h_ends_at: cycle.first_24h_ends_at, new_day: newDay, new_phase: newPhase },
            });
            console.log(`[warmup-tick] PRE_24H RECOVERY: cycle ${cycle.id} stuck — advanced to day ${newDay} (${newPhase})`);
            continue;
          }
        }

        // ── FIX A: Force daily reset for cycles stuck >26h without reset ──
        const lastResetMs = cycle.last_daily_reset_at ? new Date(cycle.last_daily_reset_at).getTime() : 0;
        const resetAge = nowMs - lastResetMs;

        if (cycle.phase !== "pre_24h" && resetAge > STALE_RESET_MS) {
          // Check device is connected
          const { data: dev } = await db.from("devices").select("status").eq("id", cycle.device_id).maybeSingle();
          if (!dev || !CONNECTED_STATUSES.includes(dev.status)) continue;

          const newDay = Math.min((cycle.day_index || 1) + 1, cycle.days_total);
          if (newDay > cycle.days_total) {
            await db.from("warmup_cycles").update({ is_running: false, phase: "completed" }).eq("id", cycle.id);
            continue;
          }

          const oldPhase = cycle.phase;
          const newPhase = getPhaseForDay(newDay, chipState);

          // Cancel old jobs
          await db.from("warmup_jobs")
            .update({ status: "cancelled", last_error: "Cancelado: reset forçado por ciclo travado" })
            .eq("cycle_id", cycle.id).eq("status", "pending")
            .in("job_type", [...INTERACTION_JOB_TYPES, "enable_autosave", "enable_community", "daily_reset"]);

          const resetAt = new Date().toISOString();
          await db.from("warmup_cycles").update({
            day_index: newDay, phase: newPhase,
            last_daily_reset_at: resetAt,
            daily_interaction_budget_used: 0, daily_unique_recipients_used: 0,
          }).eq("id", cycle.id);

          // Ensure community membership
          if (["autosave_enabled", "community_ramp_up", "community_stable"].includes(newPhase) || isCommunityPhase(newPhase)) {
            const { data: membership } = await db.from("warmup_community_membership")
              .select("id, is_enabled").eq("device_id", cycle.device_id).maybeSingle();
            if (!membership) {
              await db.from("warmup_community_membership").insert({
                user_id: cycle.user_id, device_id: cycle.device_id, cycle_id: cycle.id,
                is_eligible: true, is_enabled: true, enabled_at: resetAt,
              });
            } else if (!membership.is_enabled) {
              await db.from("warmup_community_membership")
                .update({ is_enabled: true, is_eligible: true, enabled_at: resetAt, cycle_id: cycle.id })
                .eq("id", membership.id);
            }
          }

          // Reconcile community pairs
          if (isCommunityPhase(newPhase)) {
            await reconcileCommunityPairs(db, { deviceId: cycle.device_id, userId: cycle.user_id, cycleId: cycle.id, dayIndex: newDay, chipState });
          }

          await ensureJoinGroupJobs(db, cycle.id, cycle.user_id, cycle.device_id);
          await scheduleDayJobs(db, cycle.id, cycle.user_id, cycle.device_id, newDay, newPhase, chipState, true);

          // Schedule next daily reset
          const nextReset = new Date();
          nextReset.setUTCDate(nextReset.getUTCDate() + 1);
          nextReset.setUTCHours(9, 50, 0, 0);
          await db.from("warmup_jobs").insert({
            user_id: cycle.user_id, device_id: cycle.device_id, cycle_id: cycle.id,
            job_type: "daily_reset", payload: {}, run_at: nextReset.toISOString(), status: "pending",
          });

          await db.from("warmup_audit_logs").insert({
            user_id: cycle.user_id, device_id: cycle.device_id, cycle_id: cycle.id,
            level: "warning", event_type: "stale_reset_forced",
            message: `Ciclo travado há ${Math.round(resetAge / 3600000)}h sem reset. Reset forçado: dia ${cycle.day_index} → ${newDay}, fase: ${oldPhase} → ${newPhase}`,
            meta: { old_day: cycle.day_index, new_day: newDay, old_phase: oldPhase, new_phase: newPhase, stale_hours: Math.round(resetAge / 3600000) },
          });
          console.log(`[warmup-tick] STALE RESET: cycle ${cycle.id} stuck ${Math.round(resetAge / 3600000)}h — forced day ${cycle.day_index} → ${newDay}, ${oldPhase} → ${newPhase}`);
          continue;
        }

        // ── FIX B: Ensure every running cycle has a daily_reset job ──
        if (cycle.phase !== "pre_24h" && !cyclesWithReset.has(cycle.id)) {
          const nextReset = new Date();
          nextReset.setUTCDate(nextReset.getUTCDate() + 1);
          nextReset.setUTCHours(9, 50, 0, 0);
          // If reset for tomorrow is already past (unlikely), schedule for day after
          if (nextReset.getTime() < nowMs) nextReset.setUTCDate(nextReset.getUTCDate() + 1);
          await db.from("warmup_jobs").insert({
            user_id: cycle.user_id, device_id: cycle.device_id, cycle_id: cycle.id,
            job_type: "daily_reset", payload: {}, run_at: nextReset.toISOString(), status: "pending",
          });
          await db.from("warmup_audit_logs").insert({
            user_id: cycle.user_id, device_id: cycle.device_id, cycle_id: cycle.id,
            level: "warning", event_type: "daily_reset_chain_restored",
            message: `Reset diário ausente detectado — cadeia restaurada para ${nextReset.toISOString()}`,
          });
          console.log(`[warmup-tick] RESET CHAIN RESTORED: cycle ${cycle.id} had no daily_reset job`);
        }

        // Skip pre_24h for orphan recovery below
        if (cycle.phase === "pre_24h") continue;

        // ── Original orphan recovery: running with 0 pending jobs ──
        if (cyclesWithJobs.has(cycle.id)) continue;
        if (cycle.daily_interaction_budget_used >= cycle.daily_interaction_budget_target && cycle.daily_interaction_budget_target > 0) continue;

        const { data: dev } = await db.from("devices").select("status").eq("id", cycle.device_id).maybeSingle();
        if (!dev || !CONNECTED_STATUSES.includes(dev.status)) continue;

        console.log(`[warmup-tick] ORPHAN RECOVERY: cycle ${cycle.id} (${cycle.phase}, day ${cycle.day_index}) has 0 pending jobs, budget ${cycle.daily_interaction_budget_used}/${cycle.daily_interaction_budget_target} — regenerating`);

        await scheduleDayJobs(db, cycle.id, cycle.user_id, cycle.device_id, cycle.day_index, cycle.phase, cycle.chip_state, true);
        await ensureNextDailyResetJob(db, { user_id: cycle.user_id, device_id: cycle.device_id }, cycle.id);
        await ensureJoinGroupJobs(db, cycle.id, cycle.user_id, cycle.device_id);

        await db.from("warmup_audit_logs").insert({
          user_id: cycle.user_id, device_id: cycle.device_id, cycle_id: cycle.id,
          level: "warning", event_type: "orphan_recovery",
          message: `Ciclo órfão recuperado: 0 jobs pendentes. Budget: ${cycle.daily_interaction_budget_used}/${cycle.daily_interaction_budget_target}`,
        });
      }
    }
  }

  // ── AUTO-RESUME: Reconnected devices auto-restart paused warmup cycles — only primary shard ──
  if (isPrimaryShard) {
    const { data: pausedCyclesCheck } = await db.from("warmup_cycles")
      .select("id, user_id, device_id, day_index, days_total, chip_state, phase, previous_phase, plan_id, last_error")
      .eq("is_running", false)
      .eq("phase", "paused")
      .not("previous_phase", "is", null)
      .limit(200);

    if (pausedCyclesCheck?.length) {
      const pausedDeviceIds = [...new Set(pausedCyclesCheck.map((c: any) => c.device_id))];
      const { data: devicesCheck } = await db.from("devices")
        .select("id, status")
        .in("id", pausedDeviceIds);

      const connectedDevices = new Set(
        (devicesCheck || [])
          .filter((d: any) => CONNECTED_STATUSES.includes(d.status))
          .map((d: any) => d.id)
      );

      for (const cycle of pausedCyclesCheck) {
        if (!connectedDevices.has(cycle.device_id)) continue;

        // Device is back online — check plan validity
        const { data: sub } = await db.from("subscriptions")
          .select("expires_at")
          .eq("user_id", cycle.user_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!sub || new Date(sub.expires_at) < new Date()) continue;

        const { data: prof } = await db.from("profiles")
          .select("status")
          .eq("id", cycle.user_id)
          .maybeSingle();

        if (prof?.status === "suspended" || prof?.status === "cancelled") continue;

        // All checks passed — resume cycle
        const resumePhase = cycle.previous_phase || "groups_only";
        const chipState = cycle.chip_state || "new";
        const expectedPhase = getPhaseForDay(cycle.day_index, chipState);
        const safePhase = expectedPhase || resumePhase;

        await db.from("warmup_cycles").update({
          is_running: true,
          phase: safePhase,
          previous_phase: null,
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq("id", cycle.id);

        // Only schedule new jobs if daily budget is NOT already consumed
        // AND we're within the operating window (no emergency window for auto-resume)
        const { data: freshCycle } = await db.from("warmup_cycles")
          .select("daily_interaction_budget_used, daily_interaction_budget_target")
          .eq("id", cycle.id)
          .maybeSingle();

        const budgetUsed = freshCycle?.daily_interaction_budget_used || 0;
        const budgetTarget = freshCycle?.daily_interaction_budget_target || 0;
        const budgetExhausted = budgetTarget > 0 && budgetUsed >= budgetTarget;

        if (!budgetExhausted) {
          // Use forced=false to respect the 07:00-19:00 window (no emergency window on auto-resume)
          await scheduleDayJobs(db, cycle.id, cycle.user_id, cycle.device_id, cycle.day_index, safePhase, chipState, false);
        } else {
          console.log(`[warmup-tick] AUTO-RESUME: cycle ${cycle.id} budget already consumed (${budgetUsed}/${budgetTarget}), skipping job scheduling`);
        }

        // Ensure daily reset chain continues
        await ensureNextDailyResetJob(db, { user_id: cycle.user_id, device_id: cycle.device_id }, cycle.id);

        // Ensure pending group joins are rescheduled
        await ensureJoinGroupJobs(db, cycle.id, cycle.user_id, cycle.device_id);

        // Audit log
        await db.from("warmup_audit_logs").insert({
          user_id: cycle.user_id,
          device_id: cycle.device_id,
          cycle_id: cycle.id,
          level: "info",
          event_type: "auto_resumed",
          message: `Aquecimento retomado automaticamente: dispositivo reconectado. Fase: ${safePhase}, dia ${cycle.day_index}/${cycle.days_total}`,
          meta: { previous_phase: cycle.previous_phase, resumed_phase: safePhase, last_error: cycle.last_error },
        });

        console.log(`[warmup-tick] AUTO-RESUME: cycle ${cycle.id} → ${safePhase} (day ${cycle.day_index})`);
      }
    }
  } // end isPrimaryShard auto-resume

  // Fetch pending jobs — increased limit for 10k+ scale
  // Each shard claims its own batch using FOR UPDATE SKIP LOCKED semantics (via order + limit)
  const jobLimit = shardTotal > 1 ? 1000 : 2000;
  const { data: pendingJobs, error: fetchErr } = await db.from("warmup_jobs")
    .select("id, user_id, device_id, cycle_id, job_type, payload, run_at, status, attempts, max_attempts")
    .eq("status", "pending").lte("run_at", now)
    .order("run_at", { ascending: true }).limit(jobLimit);

  if (fetchErr) throw fetchErr;
  if (!pendingJobs?.length) return json({ ok: true, processed: 0, succeeded: 0, failed: 0, shard: shardIndex });

  // Limit: only 1 autosave/community interaction per device per tick to preserve natural pacing
  const autosaveSeenDevices = new Set<string>();
  const communitySeenDevices = new Set<string>();
  const filteredJobs: any[] = [];
  const deferredAutosaveIds: string[] = [];
  const deferredCommunityIds: string[] = [];

  for (const j of pendingJobs) {
    if (j.job_type === "autosave_interaction") {
      const key = j.device_id;
      if (autosaveSeenDevices.has(key)) {
        deferredAutosaveIds.push(j.id);
        continue;
      }
      autosaveSeenDevices.add(key);
    }

    if (j.job_type === "community_interaction") {
      const key = j.device_id;
      if (communitySeenDevices.has(key)) {
        deferredCommunityIds.push(j.id);
        continue;
      }
      communitySeenDevices.add(key);
    }

    filteredJobs.push(j);
  }

  // Defer extra autosave/community jobs so each device speaks one turn at a time
  const deferredJobGroups = [
    { ids: deferredAutosaveIds, minSeconds: 120, maxSeconds: 240 },
    { ids: deferredCommunityIds, minSeconds: 45, maxSeconds: 120 },
  ];

  for (const group of deferredJobGroups) {
    if (group.ids.length === 0) continue;
    for (let i = 0; i < group.ids.length; i += 200) {
      const newRunAt = new Date(Date.now() + randInt(group.minSeconds, group.maxSeconds) * 1000).toISOString();
      await db.from("warmup_jobs")
        .update({ run_at: newRunAt })
        .in("id", group.ids.slice(i, i + 200));
    }
  }

  // Mark as running
  const jobIds = filteredJobs.map((j: any) => j.id);
  for (let i = 0; i < jobIds.length; i += 200) {
    await db.from("warmup_jobs").update({ status: "running" }).in("id", jobIds.slice(i, i + 200));
  }

  // ── BATCH PRE-LOAD ──
  const uniqueCycleIds = [...new Set(filteredJobs.map((j: any) => j.cycle_id))];
  const uniqueUserIds = [...new Set(filteredJobs.map((j: any) => j.user_id))];
  const uniqueDeviceIds = [...new Set(filteredJobs.map((j: any) => j.device_id))];

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

  const [cyclesArr, subsArr, profilesArr, devicesArr, userMsgsArr, autosaveArr, instanceGroupsArr, groupsPoolArr, imagePool, audioPool] = await Promise.all([
    batchLoad<any>("warmup_cycles", "id, user_id, device_id, phase, is_running, day_index, days_total, chip_state, daily_interaction_budget_min, daily_interaction_budget_max, daily_interaction_budget_target, daily_interaction_budget_used, daily_unique_recipients_cap, daily_unique_recipients_used, first_24h_ends_at, last_daily_reset_at, next_run_at, plan_id", "id", uniqueCycleIds),
    batchLoad<any>("subscriptions", "user_id, expires_at, created_at", "user_id", uniqueUserIds, q => q.order("created_at", { ascending: false })),
    batchLoad<any>("profiles", "id, status", "id", uniqueUserIds),
    batchLoad<any>("devices", "id, status, uazapi_token, uazapi_base_url, number", "id", uniqueDeviceIds),
    batchLoad<any>("warmup_messages", "content, user_id", "user_id", uniqueUserIds),
    batchLoad<any>("warmup_autosave_contacts", "id, phone_e164, contact_name, user_id, created_at, updated_at, last_used_at, use_count, contact_status", "user_id", uniqueUserIds, q =>
      q.eq("is_active", true)
        .neq("contact_status", "discarded")
        .neq("contact_status", "invalid")
        .order("use_count", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
    ),
    batchLoad<any>("warmup_instance_groups", "group_id, group_jid, device_id, cycle_id, join_status, group_name, invite_link", "device_id", uniqueDeviceIds),
    db.from("warmup_groups").select("id, link, name").then((r: any) => r.data || []),
    getImagePool(db),
    getAudioPool(db),
  ]);

  // Build lookup maps
  const cyclesMap: Record<string, any> = {};
  cyclesArr.forEach((c: any) => { cyclesMap[c.id] = c; });
  const subsMap: Record<string, any> = {};
  subsArr.forEach((s: any) => { if (!subsMap[s.user_id]) subsMap[s.user_id] = s; });
  const profilesMap: Record<string, any> = {};
  profilesArr.forEach((p: any) => { profilesMap[p.id] = p; });
  const devicesMap: Record<string, any> = {};
  devicesArr.forEach((d: any) => { devicesMap[d.id] = d; });
  const userMsgsMap: Record<string, string[]> = {};
  userMsgsArr.forEach((m: any) => {
    if (!userMsgsMap[m.user_id]) userMsgsMap[m.user_id] = [];
    userMsgsMap[m.user_id].push(m.content);
  });
  const autosaveMap: Record<string, any[]> = {};
  autosaveArr.forEach((c: any) => {
    if (!autosaveMap[c.user_id]) autosaveMap[c.user_id] = [];
    autosaveMap[c.user_id].push(c);
  });
  // Smart rotation: prioritize "new" contacts first, then lowest use_count
  Object.values(autosaveMap).forEach((contacts: any[]) => {
    contacts.sort((a, b) => {
      // Priority 1: "new" contacts first
      const aNew = (a.contact_status || "new") === "new" ? 0 : 1;
      const bNew = (b.contact_status || "new") === "new" ? 0 : 1;
      if (aNew !== bNew) return aNew - bNew;
      // Priority 2: lowest use_count
      const aUse = a.use_count || 0;
      const bUse = b.use_count || 0;
      if (aUse !== bUse) return aUse - bUse;
      // Priority 3: oldest first
      const aCreated = new Date(a.created_at || 0).getTime();
      const bCreated = new Date(b.created_at || 0).getTime();
      if (aCreated !== bCreated) return aCreated - bCreated;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
  });
  const instanceGroupsMap: Record<string, any[]> = {};
  instanceGroupsArr.forEach((ig: any) => {
    if (!instanceGroupsMap[ig.device_id]) instanceGroupsMap[ig.device_id] = [];
    instanceGroupsMap[ig.device_id].push(ig);
  });
  const groupsMap: Record<string, any> = {};
  groupsPoolArr.forEach((g: any) => { groupsMap[g.id] = { ...g, external_group_ref: g.link }; });

  console.log(`[warmup-tick] Loaded: ${cyclesArr.length} cycles, ${devicesArr.length} devices, ${filteredJobs.length} jobs`);

  const pausedCycles = new Set<string>();
  const auditLogBuffer: any[] = [];
  function bufferAudit(log: any) { auditLogBuffer.push(log); }
  async function flushAuditLogs() {
    for (let i = 0; i < auditLogBuffer.length; i += 100) {
      await db.from("warmup_audit_logs").insert(auditLogBuffer.slice(i, i + 100));
    }
  }

  // ── GROUP JOBS BY DEVICE ──
  const jobsByDevice: Record<string, any[]> = {};
  for (const job of filteredJobs) {
    if (!jobsByDevice[job.device_id]) jobsByDevice[job.device_id] = [];
    jobsByDevice[job.device_id].push(job);
  }

  let succeeded = 0;
  let failed = 0;
  const MAX_PARALLEL = 10;
  const deviceIdList = Object.keys(jobsByDevice);

  // ── PROCESS SINGLE JOB ──
  async function processJob(job: any): Promise<boolean> {
    const cycle = cyclesMap[job.cycle_id];
    if (!cycle || !cycle.is_running || pausedCycles.has(cycle.id)) {
      await db.from("warmup_jobs").update({ status: "cancelled" }).eq("id", job.id);
      return false;
    }

    // Plan check
    const userSub = subsMap[cycle.user_id];
    const userProf = profilesMap[cycle.user_id];
    if (!userSub || new Date(userSub.expires_at) < new Date() || userProf?.status === "suspended" || userProf?.status === "cancelled") {
      await db.from("warmup_cycles").update({
        is_running: false, phase: "paused", previous_phase: cycle.phase,
        last_error: "Auto-pausado: plano inativo",
      }).eq("id", cycle.id);
      pausedCycles.add(cycle.id);
      cycle.is_running = false;
      await db.from("warmup_jobs").update({ status: "cancelled" }).eq("id", job.id);
      return false;
    }

    // Device check
    const device = devicesMap[job.device_id];
    if (!device || !CONNECTED_STATUSES.includes(device.status)) {
      if (!pausedCycles.has(cycle.id)) {
        await db.from("warmup_cycles").update({
          is_running: false, phase: "paused", previous_phase: cycle.phase,
          last_error: "Auto-pausado: instância desconectada",
        }).eq("id", cycle.id);
        await db.from("warmup_jobs").update({ status: "cancelled" }).eq("cycle_id", cycle.id).eq("status", "pending");
        bufferAudit({
          user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
          level: "warn", event_type: "auto_paused_disconnected",
          message: `Aquecimento pausado: instância desconectada (fase: ${cycle.phase})`,
        });
        pausedCycles.add(cycle.id);
        cycle.is_running = false;
      }
      await db.from("warmup_jobs").update({ status: "cancelled" }).eq("id", job.id);
      return false;
    }

    const baseUrl = (device.uazapi_base_url || "").replace(/\/+$/, "");
    const token = device.uazapi_token || "";
    const chipState = cycle.chip_state || "new";

    // Budget check for interaction jobs — fresh DB read to prevent race conditions between concurrent ticks
    if (INTERACTION_JOB_TYPES.includes(job.job_type)) {
      if (!withinWindow && !job.payload?.forced) {
        await db.from("warmup_jobs").update({ status: "cancelled", last_error: "Fora da janela 07-19 BRT" }).eq("id", job.id);
        return false;
      }

      const desiredGroupMsgs = getVolumes(chipState, cycle.day_index || 1, cycle.phase || "groups_only").groupMsgs;
      let groupMsgsSentToday = 0;

      if (job.job_type === "group_interaction" && desiredGroupMsgs > 0) {
        const resetFloor = cycle.last_daily_reset_at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count } = await db.from("warmup_audit_logs")
          .select("id", { count: "exact", head: true })
          .eq("cycle_id", cycle.id)
          .eq("event_type", "group_msg_sent")
          .gte("created_at", resetFloor);
        groupMsgsSentToday = count || 0;
      }

      // Always read fresh budget from DB to prevent concurrent tick race conditions
      const { data: freshBudget } = await db.from("warmup_cycles")
        .select("daily_interaction_budget_used, daily_interaction_budget_target")
        .eq("id", cycle.id).single();
      if (freshBudget) {
        cycle.daily_interaction_budget_used = freshBudget.daily_interaction_budget_used || 0;
        cycle.daily_interaction_budget_target = freshBudget.daily_interaction_budget_target || 500;
      }
      const used = cycle.daily_interaction_budget_used || 0;
      const limit = cycle.daily_interaction_budget_target || 500;
      const preserveGroupQuota = job.job_type === "group_interaction"
        && desiredGroupMsgs > 0
        && groupMsgsSentToday < desiredGroupMsgs;

      if (used >= limit && !preserveGroupQuota) {
        await db.from("warmup_jobs").update({ status: "cancelled", last_error: `Budget atingido: ${used}/${limit}` }).eq("id", job.id);
        return false;
      }
    }

    switch (job.job_type) {
      // ── JOIN GROUP ──
      case "join_group": {
        if (!baseUrl || !token) throw new Error("Credenciais UAZAPI não configuradas");

        const groupId = job.payload?.group_id;
        const groupName = job.payload?.group_name || groupId;
        const existingIGs = instanceGroupsMap[job.device_id] || [];
        const record = existingIGs.find((ig: any) => ig.group_id === groupId);

        // Skip if already joined or manually left
        if (record?.join_status === "joined") {
          bufferAudit({ user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id, level: "info", event_type: "group_joined", message: `Grupo ${groupName} já joined — duplicata ignorada` });
          break;
        }
        if (record?.join_status === "left") {
          bufferAudit({ user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id, level: "info", event_type: "join_group", message: `Grupo ${groupName} marcado como "left" — entrada cancelada` });
          break;
        }

        const groupRef = groupsMap[groupId];
        const directInviteLink = job.payload?.invite_link || record?.invite_link;
        if (!directInviteLink && !groupRef?.external_group_ref) throw new Error(`Grupo ${groupName} sem link de convite`);

        const inviteLink = directInviteLink || groupRef.external_group_ref;
        const inviteCode = inviteLink.replace(/^https?:\/\//, "").replace(/^chat\.whatsapp\.com\//, "").split("?")[0].split("/")[0].trim();
        if (!inviteCode || inviteCode.length < 10) throw new Error(`Código inválido: ${inviteLink}`);

        let joinOk = false;
        let joinJid: string | null = null;
        let joinError: string | null = null;

        // Helper to extract JID from any API response shape
        const extractJid = (parsed: any): string | null => {
          const candidates = [
            parsed?.group?.JID, parsed?.group?.jid, parsed?.group?.id,
            parsed?.data?.group?.JID, parsed?.data?.group?.jid, parsed?.data?.group?.id,
            parsed?.data?.JID, parsed?.data?.jid, parsed?.data?.id,
            parsed?.data?.gid, parsed?.data?.groupId, parsed?.data?.chatId,
            parsed?.gid, parsed?.groupId, parsed?.jid, parsed?.id, parsed?.chatId,
          ];
          for (const c of candidates) {
            if (c && typeof c === "string" && c.includes("@g.us")) return c;
          }
          // Deep search: find any string with @g.us in the response
          const jsonStr = JSON.stringify(parsed);
          const jidMatch = jsonStr.match(/(\d+@g\.us)/);
          if (jidMatch) return jidMatch[1];
          return null;
        };

        const endpoints = [
          { method: "POST", url: `${baseUrl}/group/join`, body: JSON.stringify({ invitecode: inviteCode }) },
          { method: "POST", url: `${baseUrl}/group/join`, body: JSON.stringify({ invitecode: inviteLink.split("?")[0] }) },
          { method: "PUT", url: `${baseUrl}/group/acceptInviteGroup`, body: JSON.stringify({ inviteCode }) },
        ];

        for (const ep of endpoints) {
          try {
            const res = await fetch(ep.url, {
              method: ep.method,
              headers: { "Content-Type": "application/json", token, Accept: "application/json" },
              body: ep.body,
            });
            const raw = await res.text();
            let parsed: any;
            try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }

            if (res.status === 405) continue;
            if (res.status === 500 && (parsed?.error === "error joining group" || parsed?.error === "internal server error")) continue;

            if (res.ok || res.status === 409) {
              joinOk = true;
              joinJid = extractJid(parsed);
              const msg = (parsed?.message || parsed?.msg || "").toLowerCase();
              if (msg.includes("already") || msg.includes("já")) joinOk = true;
              break;
            } else {
              joinError = `${res.status}: ${raw.substring(0, 200)}`;
            }
          } catch (err) { joinError = err.message; }
        }

        if (joinOk) {
          // If JID not found in join response, resolve via live groups API
          if (!joinJid) {
            try {
              const liveEndpoints = [
                `${baseUrl}/group/fetchAllGroups`,
                `${baseUrl}/group/fetchAllGroups?getParticipants=false`,
                `${baseUrl}/group/list?GetParticipants=false&count=500`,
              ];
              const normName = (v: string) => String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
              const targetName = normName(groupName);
              
              for (const ep of liveEndpoints) {
                try {
                  const res = await fetch(ep, {
                    method: "GET",
                    headers: { token, Accept: "application/json" },
                  });
                  if (!res.ok) continue;
                  const raw = await res.text();
                  const parsed = raw ? JSON.parse(raw) : null;
                  if (!parsed) continue;
                  
                  const arrCandidates = [parsed, parsed?.groups, parsed?.data, parsed?.data?.groups];
                  for (const arr of arrCandidates) {
                    if (!Array.isArray(arr)) continue;
                    for (const g of arr) {
                      const gName = normName(g?.subject || g?.name || g?.Name || g?.title || "");
                      const gJid = g?.JID || g?.jid || g?.id || g?.groupJid || g?.chatId || "";
                      if (gName === targetName && String(gJid).includes("@g.us")) {
                        joinJid = gJid;
                        break;
                      }
                    }
                    if (joinJid) break;
                  }
                  if (joinJid) break;
                } catch { continue; }
              }
            } catch { /* ignore */ }
          }

          await db.from("warmup_instance_groups")
            .update({ join_status: "joined", joined_at: new Date().toISOString(), ...(joinJid ? { group_jid: joinJid } : {}) })
            .eq("device_id", job.device_id).eq("group_id", groupId);
          if (record) { record.join_status = "joined"; if (joinJid) record.group_jid = joinJid; }
          bufferAudit({
            user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
            level: "info", event_type: "group_joined",
            message: `Entrou no grupo ${groupName}${joinJid ? ` (JID: ${joinJid})` : " (JID não resolvido — será resolvido na interação)"}`,
            meta: { group_name: groupName, jid: joinJid },
          });

          // ── AUTO-TRANSITION: Check if ALL groups are now joined ──
          const allIGs = instanceGroupsMap[job.device_id] || [];
          // Update local cache
          const updatedRecord = allIGs.find((ig: any) => ig.group_id === groupId);
          if (updatedRecord) updatedRecord.join_status = "joined";

          const pendingCount = allIGs.filter((ig: any) => ig.join_status === "pending").length;
          const hasMoreJoinJobs = filteredJobs.some((pj: any) =>
            pj.device_id === job.device_id && pj.job_type === "join_group" && pj.id !== job.id && pj.status !== "succeeded"
          );

          if (pendingCount === 0 && !hasMoreJoinJobs && cycle.phase === "pre_24h") {
            // All groups joined! Check if it's after 7:00 BRT (10:00 UTC)
            const now = new Date();
            const windowOpen = getBrtTodayAt(7);

            if (now.getTime() >= windowOpen.getTime()) {
              // Already past 7:00 BRT → transition immediately and schedule messages
              await db.from("warmup_cycles").update({
                phase: "groups_only",
                day_index: 2,
                last_daily_reset_at: now.toISOString(),
              }).eq("id", cycle.id);
              cycle.phase = "groups_only";
              cycle.day_index = 2;
              cycle.last_daily_reset_at = now.toISOString();

              await scheduleDayJobs(db, cycle.id, job.user_id, job.device_id, 2, "groups_only", chipState, true);

              bufferAudit({
                user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
                level: "info", event_type: "auto_transition_post_groups",
                message: `Todos os grupos entrados! Transição automática para groups_only (dia 2). Mensagens agendadas até 19h BRT.`,
              });
            } else {
              // Before 7:00 BRT → schedule transition for 7:00 BRT
              await db.from("warmup_jobs").insert({
                user_id: job.user_id, device_id: job.device_id, cycle_id: cycle.id,
                job_type: "phase_transition",
                payload: { target_phase: "groups_only", auto_advance_day: true },
                run_at: windowOpen.toISOString(), status: "pending",
              });

              bufferAudit({
                user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
                level: "info", event_type: "groups_complete_waiting",
                message: `Todos os grupos entrados! Aguardando 07:00 BRT para iniciar mensagens.`,
              });
            }

            // Ensure daily reset is scheduled
            await ensureNextDailyResetJob(db, job, cycle.id);
          }
        } else {
          await db.from("warmup_instance_groups")
            .update({ join_status: "failed", last_error: joinError || "Falha" })
            .eq("device_id", job.device_id).eq("group_id", groupId);
          throw new Error(`Falha no grupo ${groupName}: ${joinError}`);
        }
        break;
      }

      // ── PHASE TRANSITION ──
      case "phase_transition": {
        const targetPhase = job.payload?.target_phase || "groups_only";
        const autoAdvanceDay = job.payload?.auto_advance_day === true;

        await db.from("warmup_jobs")
          .update({ status: "cancelled", last_error: "Cancelado: transição de fase" })
          .eq("cycle_id", cycle.id).eq("status", "pending")
          .in("job_type", INTERACTION_JOB_TYPES);

        const updateData: any = { phase: targetPhase };
        let dayForSchedule = cycle.day_index;

        // If auto_advance_day, also advance to day 2 (post-groups start)
        if (autoAdvanceDay && cycle.day_index <= 1) {
          updateData.day_index = 2;
          updateData.last_daily_reset_at = new Date().toISOString();
          dayForSchedule = 2;
        }

        await db.from("warmup_cycles").update(updateData).eq("id", cycle.id);

        if (targetPhase === "groups_only" && cycle.day_index <= 1) {
          await ensureJoinGroupJobs(db, cycle.id, job.user_id, job.device_id);
        }

        await scheduleDayJobs(db, cycle.id, job.user_id, job.device_id, dayForSchedule, targetPhase, chipState);

        bufferAudit({
          user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
          level: "info", event_type: "phase_changed",
          message: `Fase: ${cycle.phase} → ${targetPhase}${autoAdvanceDay ? ` (dia → ${dayForSchedule})` : ""}`,
        });
        break;
      }

      // ── GROUP INTERACTION ──
      case "group_interaction": {
        if (!baseUrl || !token) throw new Error("Credenciais UAZAPI não configuradas");

        let allIGs = instanceGroupsMap[job.device_id] || [];
        let joinedGroups = allIGs.filter((ig: any) => ig.join_status === "joined");
        let liveGroupsCache: any[] = [];

        const norm = (v: string) =>
          String(v || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ")
            .trim();

        const fetchLiveGroups = async (): Promise<any[]> => {
          const endpoints = [
            `${baseUrl}/group/fetchAllGroups`,
            `${baseUrl}/group/fetchAllGroups?getParticipants=false`,
            `${baseUrl}/group/list?GetParticipants=false&count=500`,
            `${baseUrl}/group/listAll`,
            `${baseUrl}/chats?type=group`,
          ];

          const dedup = new Map<string, any>();

          for (const ep of endpoints) {
            try {
              const res = await fetch(ep, {
                method: "GET",
                headers: { token, Accept: "application/json", "Cache-Control": "no-cache" },
              });
              if (!res.ok) continue;

              const raw = await res.text();
              let parsed: any = null;
              try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
              if (!parsed) continue;

              const arrCandidates = [
                parsed,
                parsed?.groups,
                parsed?.data,
                parsed?.data?.groups,
                parsed?.chats,
                parsed?.data?.chats,
              ];

              const rows: any[] = [];
              for (const c of arrCandidates) {
                if (Array.isArray(c)) rows.push(...c);
              }

              for (const g of rows) {
                const jid = g?.JID || g?.jid || g?.id || g?.groupJid || g?.chatId || null;
                const name = g?.subject || g?.name || g?.Name || g?.title || "Grupo detectado";
                if (!jid || !String(jid).includes("@g.us")) continue;
                if (!dedup.has(jid)) dedup.set(jid, { ...g, jid, name });
              }

              if (dedup.size > 0) {
                return Array.from(dedup.values());
              }
            } catch { /* tenta próximo endpoint */ }
          }

          return [];
        };

        // Auto-sync: if no "joined" groups, check live device groups and promote pending→joined
        if (joinedGroups.length === 0 && allIGs.length > 0) {
          try {
            liveGroupsCache = await fetchLiveGroups();
            if (liveGroupsCache.length > 0) {
              const liveNames = new Set(liveGroupsCache.map((g: any) => norm(g.subject || g.name || g.Name || g.title || "")));
              const liveJids = new Set(liveGroupsCache.map((g: any) => String(g.jid || g.id || g.JID || g.groupJid || g.chatId || "").toLowerCase().trim()));

              for (const ig of allIGs) {
                if (ig.join_status === "joined") continue;
                const grpRef = groupsMap[ig.group_id];
                const grpName = norm(grpRef?.name || ig.group_name || "");
                const igJid = String(ig.group_jid || "").toLowerCase().trim();

                const nameMatch = grpName && liveNames.has(grpName);
                const jidMatch = igJid && liveJids.has(igJid);

                // Also try to find JID from live groups
                let resolvedJid = ig.group_jid;
                if (!resolvedJid) {
                  const match = liveGroupsCache.find((g: any) =>
                    norm(g.subject || g.name || g.Name || g.title || "") === grpName
                  );
                  if (match) resolvedJid = match.jid || match.id || match.JID || match.groupJid || match.chatId;
                }

                if (nameMatch || jidMatch) {
                  const updateData: any = { join_status: "joined", joined_at: new Date().toISOString() };
                  if (resolvedJid && !ig.group_jid) updateData.group_jid = resolvedJid;
                  await db.from("warmup_instance_groups")
                    .update(updateData)
                    .eq("id", ig.id);
                  ig.join_status = "joined";
                  ig.group_jid = resolvedJid || ig.group_jid;
                  bufferAudit({
                    user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
                    level: "info", event_type: "auto_sync_joined",
                    message: `Auto-sync: grupo "${grpRef?.name || ig.group_name}" detectado no dispositivo → marcado como joined`,
                  });
                }
              }
              joinedGroups = allIGs.filter((ig: any) => ig.join_status === "joined");
            }
          } catch (syncErr) {
            console.warn("[group_interaction] auto-sync error:", syncErr);
          }
        }

        let groupJid: string | null = null;
        let groupName = "Grupo";
        let targetGroupId: string | null = null;

        // Helper: try to resolve JID for a specific group
        const resolveJidForGroup = async (target: any): Promise<string | null> => {
          if (target.group_jid) return target.group_jid;
          
          // Try live lookup by name
          try {
            if (!liveGroupsCache.length) liveGroupsCache = await fetchLiveGroups();
            const grpRef = groupsMap[target.group_id];
            const targetName = norm(grpRef?.name || target.group_name || "");
            if (targetName) {
              const match = liveGroupsCache.find((g: any) =>
                norm(g.subject || g.name || g.Name || g.title || "") === targetName
              );
              if (match) {
                const jid = match.jid || match.id || match.JID || match.groupJid || match.chatId;
                if (jid) {
                  await db.from("warmup_instance_groups")
                    .update({ group_jid: jid })
                    .eq("device_id", job.device_id)
                    .eq("group_id", target.group_id);
                  target.group_jid = jid;
                  return jid;
                }
              }
            }
          } catch { /* ignore */ }
          return null;
        };

        if (joinedGroups.length > 0) {
          // Shuffle and try all joined groups until we find one with a resolvable JID
          const shuffled = joinedGroups.sort(() => Math.random() - 0.5);
          for (const target of shuffled) {
            const jid = await resolveJidForGroup(target);
            if (jid) {
              groupJid = jid;
              targetGroupId = target.group_id;
              const grpRef = groupsMap[target.group_id];
              groupName = grpRef?.name || target.group_name || "Grupo";
              break;
            }
          }
        }

        // Fallback: if no joined group has a resolvable JID, use any live group from device
        if (!groupJid) {
          try {
            if (!liveGroupsCache.length) liveGroupsCache = await fetchLiveGroups();
          } catch { /* ignore */ }

          const candidates = liveGroupsCache
            .map((g: any) => ({
              jid: g?.jid || g?.id || g?.JID || g?.groupJid || g?.chatId || null,
              name: g?.subject || g?.name || g?.Name || g?.title || "Grupo detectado",
            }))
            .filter((g: any) => !!g.jid && String(g.jid).includes("@g.us"));

          if (candidates.length === 0) {
            bufferAudit({
              user_id: job.user_id,
              device_id: job.device_id,
              cycle_id: job.cycle_id,
              level: "error",
              event_type: "group_live_discovery_empty",
              message: "Nenhum grupo retornado pelos endpoints de descoberta",
              meta: { fetched_count: liveGroupsCache.length, joined_count: joinedGroups.length },
            });
            throw new Error("Nenhum grupo com JID resolvido (aguardando entrada nos grupos)");
          }

          const fallbackGroup = pickRandom(candidates);
          groupJid = fallbackGroup.jid;
          groupName = fallbackGroup.name;

          bufferAudit({
            user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
            level: "warn", event_type: "group_fallback_live_jid",
            message: `Sem JID no banco. Usando grupo real do dispositivo: ${groupName}`,
            meta: { group_jid: groupJid },
          });
        }

        if (!groupJid) {
          throw new Error(`Sem JID para envio em grupo (${groupName})`);
        }

        const cachedMsgs = userMsgsMap[job.user_id];
        const longCachedMsgs = cachedMsgs?.filter((m: string) => m.length >= 60) || [];
        const getMsg = () => {
          if (longCachedMsgs.length > 0 && Math.random() < 0.3) {
            return pickRandom(longCachedMsgs);
          }
          return generateNaturalMessage("group");
        };

        const requestedMediaType = pickMediaTypeGroup(cycle.daily_interaction_budget_used || 0);
        let actualMediaType: "text" | "image" | "sticker" = requestedMediaType;
        let message = getMsg();
        let sendFallbackReason: string | null = null;

        try {
          if (requestedMediaType === "image") {
            const imgUrl = pickRandom(imagePool);
            const caption = pickRandom(IMAGE_CAPTIONS);
            await uazapiSendImage(baseUrl, token, groupJid, imgUrl, "");
            await new Promise(r => setTimeout(r, randInt(1000, 3000)));
            await uazapiSendText(baseUrl, token, groupJid, caption);
            message = `[IMG+TXT] ${caption}`;
          } else if (requestedMediaType === "sticker") {
            const imgUrl = pickRandom(imagePool);
            await uazapiSendSticker(baseUrl, token, groupJid, imgUrl);
            message = `[STICKER] 🎭`;
          } else {
            await uazapiSendText(baseUrl, token, groupJid, message);
          }
        } catch (e) {
          actualMediaType = "text";
          sendFallbackReason = e instanceof Error ? e.message : String(e || "unknown_error");
          message = getMsg();
          await uazapiSendText(baseUrl, token, groupJid, message);
        }

        // Update budget (atomic increment to prevent race conditions)
        const { data: budgetResult1 } = await db.rpc("increment_warmup_budget", {
          p_cycle_id: cycle.id, p_increment: 1, p_unique_recipient: false,
        });
        if (budgetResult1) cycle.daily_interaction_budget_used = budgetResult1.used;

        bufferAudit({
          user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
          level: "info", event_type: "group_msg_sent",
          message: `Msg no grupo ${groupName}: "${message.substring(0, 50)}"`,
          meta: {
            group_jid: groupJid,
            media_type: actualMediaType,
            requested_media_type: requestedMediaType,
            send_fallback_reason: sendFallbackReason,
            group_id: targetGroupId,
          },
        });
        break;
      }

      // ── AUTOSAVE INTERACTION ──
      case "autosave_interaction": {
        if (!baseUrl || !token) throw new Error("Credenciais UAZAPI não configuradas");

        const rIdx = Number(job.payload?.recipient_index ?? 0);
        const mIdx = Number(job.payload?.msg_index ?? 0);
        const contacts = autosaveMap[job.user_id] || [];
        const maxRounds = getAutosaveRoundsPerContact(chipState);

        if (mIdx >= maxRounds) {
          await db.from("warmup_jobs")
            .update({ status: "cancelled", last_error: `Auto Save limitado a ${maxRounds} mensagens por contato` })
            .eq("id", job.id);
          bufferAudit({
            user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
            level: "warn", event_type: "autosave_job_cancelled",
            message: `Job Auto Save excedente cancelado (recipient_index=${rIdx}, msg_index=${mIdx}, max=${maxRounds})`,
          });
          return false;
        }

        // Smart rotation: contacts are already sorted by contact_status='new' first, then use_count ASC
        const autosavePool = contacts
          .map((c: any) => ({ ...c, _phone: String(c.phone_e164 || "").replace(/\D/g, "") }))
          .filter((c: any) => c._phone.length >= 10);

        if (autosavePool.length === 0) {
          bufferAudit({ user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id, level: "warn", event_type: "autosave_no_contacts", message: "Nenhum contato Auto Save válido/ativo" });
          break;
        }

        // Check if all contacts have been used — if so, reset for new cycle
        const newContacts = autosavePool.filter((c: any) => (c.contact_status || "new") === "new");
        const contactsForDay = getAutosaveContactsForDay(cycle.day_index || 1, chipState);

        // Smart selection: pick from pool sequentially (already sorted by priority)
        // The pool is pre-sorted: new contacts first, then lowest use_count
        const rotatedPool = autosavePool.slice(0, contactsForDay);

        // If we've exhausted all new contacts but still need more, allow reuse
        if (rotatedPool.length === 0) {
          bufferAudit({ user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id, level: "warn", event_type: "autosave_no_contacts", message: "Todos os contatos já utilizados, sem novos disponíveis" });
          break;
        }

        if (rIdx >= rotatedPool.length) {
          bufferAudit({
            user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
            level: "info", event_type: "autosave_skip_no_contact",
            message: `Auto Save: recipient_index=${rIdx} excede pool (${rotatedPool.length} contatos) — pulando`,
          });
          break;
        }
        const selectedIndex = rIdx;
        const target = rotatedPool[selectedIndex];

        // ── VALIDATION STEP (msg_index=0 only): Pre-validate before sending anything ──
        if (mIdx === 0) {
          // Try UAZAPI phone check first
          const phoneExists = await uazapiCheckPhone(baseUrl, token, target._phone);

          if (!phoneExists) {
            // Phone confirmed invalid — disable and cancel all jobs immediately
            await db.from("warmup_autosave_contacts")
              .update({ is_active: false, contact_status: "invalid", updated_at: new Date().toISOString() })
              .eq("phone_e164", target.phone_e164)
              .eq("user_id", job.user_id);

            await db.from("warmup_jobs")
              .update({ status: "cancelled", last_error: `Contato ${target._phone} não possui WhatsApp — pré-validação` })
              .eq("cycle_id", job.cycle_id)
              .eq("job_type", "autosave_interaction")
              .eq("status", "pending")
              .filter("payload->>recipient_index", "eq", String(rIdx));

            // Also remove from in-memory cache
            const cacheArr = autosaveMap[job.user_id];
            if (cacheArr) {
              const idx = cacheArr.findIndex((c: any) => c.phone_e164 === target.phone_e164);
              if (idx >= 0) cacheArr.splice(idx, 1);
            }

            bufferAudit({
              user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
              level: "warn", event_type: "autosave_contact_disabled",
              message: `Auto Save: contato ${target.contact_name || target._phone} desativado — pré-validação: número não possui WhatsApp`,
              meta: { phone: target._phone, method: "pre_check" },
            });
            break; // Mark as succeeded, don't retry
          }
        }

        // ── SEND MESSAGE ──
        const msg = generateNaturalMessage("autosave");

        try {
          await uazapiSendText(baseUrl, token, target._phone, msg);
        } catch (e) {
          const sendErr = e instanceof Error ? e.message : String(e);

          // On msg_index=0 (first message to this contact): ANY failure = skip contact immediately
          // The first message IS the validation — if it fails, don't waste 4 more attempts
          if (mIdx === 0) {
            await db.from("warmup_autosave_contacts")
              .update({ is_active: false, contact_status: "discarded", updated_at: new Date().toISOString() })
              .eq("phone_e164", target.phone_e164)
              .eq("user_id", job.user_id);

            await db.from("warmup_jobs")
              .update({ status: "cancelled", last_error: `Contato ${target._phone} falhou no envio — desativado` })
              .eq("cycle_id", job.cycle_id)
              .eq("job_type", "autosave_interaction")
              .eq("status", "pending")
              .filter("payload->>recipient_index", "eq", String(rIdx));

            // Remove from in-memory cache
            const cacheArr = autosaveMap[job.user_id];
            if (cacheArr) {
              const idx = cacheArr.findIndex((c: any) => c.phone_e164 === target.phone_e164);
              if (idx >= 0) cacheArr.splice(idx, 1);
            }

            bufferAudit({
              user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
              level: "warn", event_type: "autosave_contact_disabled",
              message: `Auto Save: contato ${target.contact_name || target._phone} desativado — falha na 1ª msg (validação)`,
              meta: { phone: target._phone, error: sendErr, method: "first_send_failed" },
            });
            break; // Don't throw — don't retry
          }

          // msg_index > 0: number was already validated (1st msg succeeded). Retry once for transient errors.
          await new Promise(r => setTimeout(r, 2000));
          try {
            await uazapiSendText(baseUrl, token, target._phone, msg);
          } catch (e2) {
            const retryErr = e2 instanceof Error ? e2.message : String(e2);
            bufferAudit({
              user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
              level: "warn", event_type: "autosave_send_failed",
              message: `Auto Save falhou: contato ${selectedIndex + 1}/${rotatedPool.length}, msg ${mIdx + 1}/3 para ${target.contact_name || target._phone}`,
              meta: { recipient_index: selectedIndex, msg_index: mIdx, phone: target._phone, error: retryErr },
            });
            throw new Error(`Auto Save: falha ao enviar msg ${mIdx + 1} para ${target._phone}. Erro: ${retryErr}`);
          }
        }

        const sentPhone = target._phone;

        // Mark contact as used after successful send (on last msg_index)
        if (mIdx === maxRounds - 1 || mIdx === 0) {
          await db.from("warmup_autosave_contacts")
            .update({
              contact_status: "used",
              last_used_at: new Date().toISOString(),
              use_count: (target.use_count || 0) + (mIdx === 0 ? 1 : 0),
              updated_at: new Date().toISOString(),
            })
            .eq("id", target.id);

          // Update in-memory cache
          target.contact_status = "used";
          if (mIdx === 0) target.use_count = (target.use_count || 0) + 1;
          target.last_used_at = new Date().toISOString();

          // Check if all valid contacts are now "used" — if so, reset for new rotation cycle
          const allContacts = autosaveMap[job.user_id] || [];
          const remainingNew = allContacts.filter((c: any) => (c.contact_status || "new") === "new");
          if (remainingNew.length === 0 && allContacts.length > 0) {
            // All used — reset all to "new" for next rotation cycle
            await db.from("warmup_autosave_contacts")
              .update({ contact_status: "new" })
              .eq("user_id", job.user_id)
              .eq("is_active", true)
              .eq("contact_status", "used");

            // Reset in-memory cache
            allContacts.forEach((c: any) => {
              if (c.contact_status === "used") c.contact_status = "new";
            });

            bufferAudit({
              user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
              level: "info", event_type: "autosave_rotation_reset",
              message: `Auto Save: lista esgotada (${allContacts.length} contatos usados). Novo ciclo de rotação iniciado.`,
              meta: { total_contacts: allContacts.length },
            });
          }
        }

        try {
          await db.from("warmup_unique_recipients").insert({
            cycle_id: cycle.id, user_id: job.user_id,
            recipient_phone_e164: target.phone_e164,
            day_date: new Date().toISOString().split("T")[0],
          });
        } catch { /* duplicate OK */ }

        // Atomic budget increment
        const { data: budgetResult2 } = await db.rpc("increment_warmup_budget", {
          p_cycle_id: cycle.id, p_increment: 1, p_unique_recipient: mIdx === 0,
        });
        if (budgetResult2) {
          cycle.daily_interaction_budget_used = budgetResult2.used;
          cycle.daily_unique_recipients_used = budgetResult2.recipients_used;
        }

        bufferAudit({
          user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
          level: "info", event_type: "autosave_msg_sent",
          message: `Auto Save: contato ${selectedIndex + 1}/${rotatedPool.length}, msg ${mIdx + 1}/${maxRounds} para ${target.contact_name || sentPhone} [${(target.contact_status || "new") === "new" ? "NOVO" : `uso #${target.use_count || 1}`}]`,
          meta: { recipient_index: selectedIndex, msg_index: mIdx, phone: sentPhone, contact_name: target.contact_name, contact_status: target.contact_status, use_count: target.use_count },
        });
        break;
      }

      // ── COMMUNITY INTERACTION (rotação inteligente entre pares) ──
      // Cada job processa UM par por vez, priorizando:
      //   1) Pares com conversa ativa onde SOU EU o próximo a falar (responder)
      //   2) Pares sem conversa ativa, mais tempo sem contato (iniciar nova)
      //   3) Pares em cooldown são pulados
      // Isso simula uma pessoa real que responde quem mandou mensagem e
      // depois puxa conversa com quem não fala há mais tempo.
      case "community_interaction": {
        if (!baseUrl || !token) throw new Error("Credenciais UAZAPI não configuradas");

        const isReplyTurn = typeof job.payload?.pair_id === "string" && typeof job.payload?.conversation_id === "string";

        // ── Helper: processa um turno para um par específico ──
        const processCommunityTurn = async (selectedPair: any, currentTurnIndex: number, isReply: boolean) => {
          const rawPairMeta = selectedPair.meta && typeof selectedPair.meta === "object"
            ? selectedPair.meta as Record<string, any>
            : {};
          const pairMeta = normalizeCommunityPairMeta(selectedPair);
          const initiatorDeviceId = getCommunityInitiatorDeviceId(selectedPair, pairMeta.initiator);
          const peerDeviceId = getCommunityPeerDeviceId(selectedPair, job.device_id);
          const iAmInitiator = job.device_id === initiatorDeviceId;

          if (isReply) {
            if (!Number.isFinite(currentTurnIndex)) return "skip";
            if (pairMeta.conversation_id !== job.payload.conversation_id) return "skip";
            if (pairMeta.expected_sender_device_id !== job.device_id || pairMeta.turns_completed !== currentTurnIndex) return "skip";
          } else {
            // Allow either side to initiate when there's NO active conversation
            // The initiator check only matters during active conversations to prevent race conditions
            const hasActiveConversation = Boolean(rawPairMeta.conversation_id && rawPairMeta.expected_sender_device_id);
            if (hasActiveConversation && !iAmInitiator) return "skip";

            const pairBusy = Boolean(pairMeta.conversation_id && pairMeta.expected_sender_device_id);
            if (pairBusy) {
              const lastTurnMs = pairMeta.last_turn_at ? new Date(pairMeta.last_turn_at).getTime() : 0;
              const STALE_CONVERSATION_MS = 10 * 60 * 1000;
              const isStale = lastTurnMs && !Number.isNaN(lastTurnMs) && (Date.now() - lastTurnMs) > STALE_CONVERSATION_MS;

              if (isStale) {
                const resetMeta = {
                  ...rawPairMeta, initiator: null, expected_sender_device_id: null,
                  last_sender_device_id: pairMeta.last_sender_device_id,
                  turns_completed: 0, max_turns: randInt(40, 80), conversation_id: null,
                  last_turn_at: pairMeta.last_turn_at, last_completed_at: new Date().toISOString(),
                };
                await db.from("community_pairs").update({ meta: resetMeta }).eq("id", selectedPair.id);
                bufferAudit({
                  user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
                  level: "warn", event_type: "community_stale_reset",
                  message: `Par não respondeu em 10 min — conversa resetada`,
                  meta: { pair_id: selectedPair.id },
                });
              } else {
                return "busy";
              }
            }

            const lastCompletedMs = pairMeta.last_completed_at ? new Date(pairMeta.last_completed_at).getTime() : 0;
            if (lastCompletedMs && !Number.isNaN(lastCompletedMs) && (Date.now() - lastCompletedMs) < 5 * 60 * 1000) {
              return "cooldown";
            }
          }

          const { data: peerDev } = await db.from("devices")
            .select("id, number, status").eq("id", peerDeviceId).maybeSingle();

          if (!peerDev?.number || !CONNECTED_STATUSES.includes(peerDev.status)) {
            bufferAudit({
              user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
              level: "warn", event_type: "community_peer_offline",
              message: "Par offline — pulando para próximo",
              meta: { pair_id: selectedPair.id, peer_device: peerDeviceId },
            });
            return "offline";
          }

          const myPhone = device.number?.replace(/\+/g, "") || "";
          const peerPhone = peerDev.number.replace(/\+/g, "");
          if (!myPhone) return "skip";

          const nextTurnNumber = currentTurnIndex + 1;
          const maxTurns = pairMeta.max_turns || 4;
          const hasNextTurn = nextTurnNumber < maxTurns;
          let nextCycle: any = null;

          if (hasNextTurn) {
            const { data: nextCycleData } = await db.from("warmup_cycles")
              .select("id, user_id").eq("device_id", peerDeviceId)
              .eq("is_running", true).neq("phase", "completed")
              .order("created_at", { ascending: false }).limit(1).maybeSingle();
            nextCycle = nextCycleData;
            if (!nextCycle) return "no_cycle";
          }

          const communityMediaType = pickMediaTypeCommunity(cycle.daily_interaction_budget_used || 0);
          let msg = generateNaturalMessage("community");
          let communityActualMedia: string = communityMediaType;

          try {
            if (communityMediaType === "image") {
              const imgUrl = pickRandom(imagePool);
              const caption = pickRandom(IMAGE_CAPTIONS);
              await uazapiSendImage(baseUrl, token, peerPhone, imgUrl, "");
              await new Promise(r => setTimeout(r, randInt(1000, 3000)));
              await uazapiSendText(baseUrl, token, peerPhone, caption);
              msg = `[IMG+TXT] ${caption}`;
            } else if (communityMediaType === "audio") {
              const audioUrl = pickRandom(audioPool);
              await uazapiSendAudio(baseUrl, token, peerPhone, audioUrl);
              msg = `[AUDIO] 🎤`;
            } else if (communityMediaType === "location") {
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
            communityActualMedia = "text";
            msg = generateNaturalMessage("community");
            await uazapiSendText(baseUrl, token, peerPhone, msg);
          }

          const nowIso = new Date().toISOString();
          const conversationId = isReply ? String(job.payload.conversation_id) : job.id;
          const nextMeta = {
            ...rawPairMeta,
            initiator: hasNextTurn ? (pairMeta.initiator || (iAmInitiator ? "a" : "b")) : null,
            expected_sender_device_id: hasNextTurn ? peerDeviceId : null,
            last_sender_device_id: job.device_id,
            turns_completed: hasNextTurn ? nextTurnNumber : 0,
            max_turns: hasNextTurn ? maxTurns : randInt(40, 80),
            conversation_id: hasNextTurn ? conversationId : null,
            last_turn_at: nowIso,
            last_completed_at: hasNextTurn ? pairMeta.last_completed_at : nowIso,
          };

          await db.from("community_pairs").update({ meta: nextMeta }).eq("id", selectedPair.id);

          // Atomic budget increment
          const { data: budgetResult3 } = await db.rpc("increment_warmup_budget", {
            p_cycle_id: cycle.id, p_increment: 1, p_unique_recipient: false,
          });
          if (budgetResult3) cycle.daily_interaction_budget_used = budgetResult3.used;

          if (hasNextTurn && nextCycle) {
            const replyDelaySeconds = randInt(8, 35);
            await enqueueCommunityTurn(db, {
              user_id: nextCycle.user_id, device_id: peerDeviceId, cycle_id: nextCycle.id,
              pair_id: selectedPair.id, conversation_id: conversationId,
              turn_index: nextTurnNumber, delay_seconds: replyDelaySeconds,
            });
            bufferAudit({
              user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
              level: "info", event_type: "community_turn_sent",
              message: `Comunitário x1: turno ${nextTurnNumber}/${maxTurns} enviado (${communityActualMedia})`,
              meta: { pair_id: selectedPair.id, peer_device: peerDeviceId, conversation_id: conversationId, media_type: communityActualMedia },
            });
          } else {
            bufferAudit({
              user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
              level: "info", event_type: "community_conversation_completed",
              message: `Comunitário x1 concluído com ${maxTurns} turnos`,
              meta: { pair_id: selectedPair.id, peer_device: peerDeviceId, turns: maxTurns },
            });

            // [FIX] Schedule a NEW burst to start another conversation later in the day
            if (isWithinOperatingWindow()) {
              const nextBurstDelay = randInt(15, 45) * 60; // 15-45 min cooldown before next conversation
              const nextRunAt = new Date(Date.now() + nextBurstDelay * 1000).toISOString();
              const endOfWindow = getBrtTodayAt(19).getTime();
              
              // Only schedule if there's enough time left in the day
              if (Date.now() + nextBurstDelay * 1000 < endOfWindow - 30 * 60 * 1000) {
                await db.from("warmup_jobs").insert({
                  user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
                  job_type: "community_interaction",
                  payload: { source: "auto_reburst", after_completed: selectedPair.id },
                  run_at: nextRunAt, status: "pending",
                });
                bufferAudit({
                  user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
                  level: "info", event_type: "community_reburst_scheduled",
                  message: `Novo burst agendado em ${Math.round(nextBurstDelay / 60)}min após conclusão`,
                  meta: { next_run_at: nextRunAt },
                });
              }
            }
          }
          return "ok";
        };

        // ── Reply turn: processar o par específico ──
        if (isReplyTurn) {
          const { data: replyPair } = await db.from("community_pairs")
            .select("id, instance_id_a, instance_id_b, meta")
            .eq("id", job.payload.pair_id).eq("status", "active").maybeSingle();

          if (!replyPair || ![replyPair.instance_id_a, replyPair.instance_id_b].includes(job.device_id)) {
            bufferAudit({
              user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
              level: "warn", event_type: "community_stale_turn",
              message: "Par não encontrado ou dispositivo não pertence mais ao par",
              meta: { pair_id: job.payload.pair_id },
            });
            break;
          }

          await processCommunityTurn(replyPair, Number(job.payload?.turn_index) || 0, true);
          break;
        }

        // ── Novo início: reconciliar pares válidos e selecionar UM com prioridade inteligente ──
        const pairStats = await reconcileCommunityPairs(db, {
          deviceId: job.device_id,
          userId: job.user_id,
          cycleId: job.cycle_id,
          dayIndex: cycle.day_index,
          chipState,
        });
        const uniquePairs = pairStats.pairs;

        if (pairStats.closedCount > 0 || pairStats.createdCount > 0) {
          bufferAudit({
            user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
            level: "info", event_type: "community_pairs_reconciled",
            message: `Pares comunitários reconciliados: ${pairStats.keptCount} mantidos, ${pairStats.createdCount} novos, ${pairStats.closedCount} fechados`,
            meta: {
              kept: pairStats.keptCount,
              created: pairStats.createdCount,
              closed: pairStats.closedCount,
              target: pairStats.targetPeers,
            },
          });
        }

        if (!uniquePairs.length) {
          const retryAt = new Date(Date.now() + randInt(300, 900) * 1000).toISOString();
          await db.from("warmup_jobs")
            .update({ status: "pending", run_at: retryAt, last_error: "Nenhum par ativo e válido para conversar" })
            .eq("id", job.id);
          bufferAudit({
            user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
            level: "warn", event_type: "community_no_pairs",
            message: "Nenhum par ativo e válido para conversar",
            meta: {
              closed: pairStats.closedCount,
              created: pairStats.createdCount,
              target: pairStats.targetPeers,
            },
          });
          return false;
        }

        // ── Count recent offline events per peer for penalty scoring ──
        const recentOfflineWindow = 6 * 60 * 60 * 1000; // 6 hours
        const offlineWindowStart = new Date(Date.now() - recentOfflineWindow).toISOString();
        const { data: recentOfflineLogs } = await db.from("warmup_audit_logs")
          .select("meta")
          .eq("device_id", job.device_id)
          .eq("event_type", "community_peer_offline")
          .gte("created_at", offlineWindowStart);
        
        const peerOfflineCounts: Record<string, number> = {};
        for (const log of recentOfflineLogs || []) {
          const peerId = log.meta?.peer_device;
          if (peerId) peerOfflineCounts[peerId] = (peerOfflineCounts[peerId] || 0) + 1;
        }
        const CHRONIC_OFFLINE_THRESHOLD = 5; // 5+ offline in 6h = chronic

        // ── Classificar pares por prioridade ──
        // Prioridade 1: Par com conversa ativa esperando MINHA resposta
        // Prioridade 2: Par livre sem conversa ativa, mais tempo sem contato
        // Prioridade 3: Par stale (resetado agora) — deprioritizado para dar chance a outros
        // Prioridade 4: Par cronicamente offline — deprioritizado fortemente
        // Pula: par esperando resposta do outro (< 10 min), par em cooldown
        type ScoredPair = { pair: any; priority: number; lastContactMs: number; rejectedReason?: string };
        const scored: ScoredPair[] = [];
        const rejectedPeers: { peer_id: string; reason: string }[] = [];

        for (const pair of uniquePairs) {
          const meta = normalizeCommunityPairMeta(pair);
          const rawMeta = pair.meta && typeof pair.meta === "object" ? pair.meta as Record<string, any> : {};
          const hasBusyConversation = Boolean(meta.conversation_id && meta.expected_sender_device_id);
          const myTurnToReply = hasBusyConversation && meta.expected_sender_device_id === job.device_id;
          const otherSideTurn = hasBusyConversation && meta.expected_sender_device_id !== job.device_id;

          const lastTurnMs = meta.last_turn_at ? new Date(meta.last_turn_at).getTime() : 0;
          const lastCompletedMs = meta.last_completed_at ? new Date(meta.last_completed_at).getTime() : 0;
          const lastContactMs = Math.max(lastTurnMs, lastCompletedMs) || 0;

          const peerDeviceId = pair.instance_id_a === job.device_id ? pair.instance_id_b : pair.instance_id_a;
          const peerOfflineCount = peerOfflineCounts[peerDeviceId] || 0;

          const STALE_MS = 10 * 60 * 1000;
          const isStale = otherSideTurn && lastTurnMs && (Date.now() - lastTurnMs) > STALE_MS;

          if (myTurnToReply) {
            scored.push({ pair, priority: 1, lastContactMs });
          } else if (otherSideTurn && !isStale) {
            rejectedPeers.push({ peer_id: peerDeviceId, reason: "awaiting_other_reply" });
            continue; // Aguardando resposta do outro — pular
          } else if (isStale) {
            // Resetar conversa travada AGORA, mas dar prioridade baixa
            const resetMeta = {
              ...rawMeta, initiator: null, expected_sender_device_id: null,
              last_sender_device_id: meta.last_sender_device_id,
              turns_completed: 0, max_turns: randInt(40, 80), conversation_id: null,
              last_turn_at: meta.last_turn_at, last_completed_at: new Date().toISOString(),
            };
            await db.from("community_pairs").update({ meta: resetMeta }).eq("id", pair.id);
            bufferAudit({
              user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
              level: "warn", event_type: "community_stale_reset",
              message: `Par não respondeu em 10 min — resetado, priorizando outro par`,
              meta: { pair_id: pair.id, stale_peer: meta.expected_sender_device_id },
            });
            scored.push({ pair, priority: 3, lastContactMs: Date.now() });
          } else {
            const inCooldown = lastCompletedMs && (Date.now() - lastCompletedMs) < 5 * 60 * 1000;
            if (inCooldown) {
              rejectedPeers.push({ peer_id: peerDeviceId, reason: "cooldown" });
              continue;
            }
            // Chronic offline peers get deprioritized
            if (peerOfflineCount >= CHRONIC_OFFLINE_THRESHOLD) {
              scored.push({ pair, priority: 4, lastContactMs, rejectedReason: `chronic_offline(${peerOfflineCount}x)` });
            } else {
              scored.push({ pair, priority: 2, lastContactMs });
            }
          }
        }

        if (!scored.length) {
          const busyAttempts = (job.attempts || 0) + 1;
          const MAX_BUSY_RETRIES = 5;
          if (busyAttempts >= MAX_BUSY_RETRIES) {
            await db.from("warmup_jobs")
              .update({ status: "failed", last_error: `Todos os pares ocupados após ${busyAttempts} tentativas`, attempts: busyAttempts })
              .eq("id", job.id);
            bufferAudit({
              user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
              level: "warn", event_type: "community_all_busy_exhausted",
              message: `Todos os pares ocupados — desistindo após ${busyAttempts} tentativas`,
              meta: { total_pairs: uniquePairs.length, attempts: busyAttempts },
            });
          } else {
            const retryAt = new Date(Date.now() + randInt(180, 600) * 1000).toISOString();
            await db.from("warmup_jobs")
              .update({ status: "pending", run_at: retryAt, last_error: "Todos os pares ocupados ou em cooldown", attempts: busyAttempts })
              .eq("id", job.id);
            bufferAudit({
              user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
              level: "info", event_type: "community_all_busy",
              message: `Todos os pares ocupados — tentativa ${busyAttempts}/${MAX_BUSY_RETRIES}`,
              meta: { total_pairs: uniquePairs.length, attempts: busyAttempts },
            });
          }
          return false;
        }

        // Ordenar: prioridade 1 > 2 > 3, depois por tempo sem contato
        scored.sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          return a.lastContactMs - b.lastContactMs;
        });

        // Tentar pares na ordem de prioridade até um funcionar
        let pickedResult = "none";
        let pickedPair: any = null;
        let pickedPriority = 0;

        for (const candidate of scored) {
          const result = await processCommunityTurn(candidate.pair, 0, false);
          if (result === "ok") {
            pickedResult = result;
            pickedPair = candidate.pair;
            pickedPriority = candidate.priority;
            break;
          }
          // Se falhou (offline, no_cycle, etc), tenta o próximo
          pickedResult = result;
        }

        // Build selected_peer_id from picked pair
        const selectedPeerId = pickedPair
          ? (pickedPair.instance_id_a === job.device_id ? pickedPair.instance_id_b : pickedPair.instance_id_a)
          : null;

        // Build tried peers list (all candidates that were attempted before success)
        const triedPeers: { peer_id: string; result: string }[] = [];
        for (const candidate of scored) {
          const candidatePeerId = candidate.pair.instance_id_a === job.device_id
            ? candidate.pair.instance_id_b : candidate.pair.instance_id_a;
          if (candidate.pair === pickedPair) {
            triedPeers.push({ peer_id: candidatePeerId, result: pickedResult });
            break;
          }
          triedPeers.push({ peer_id: candidatePeerId, result: "skipped_or_failed" });
        }

        bufferAudit({
          user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
          level: "info", event_type: "community_smart_pick",
          message: `Par selecionado (prioridade ${pickedPriority}): ${pickedResult}`,
          meta: {
            pair_id: pickedPair?.id || null,
            selected_peer_id: selectedPeerId,
            priority: pickedPriority,
            result: pickedResult,
            candidates: scored.length,
            total_pairs: uniquePairs.length,
            rejected_peers: rejectedPeers.slice(0, 10),
            tried_peers: triedPeers.slice(0, 10),
            chronic_offline_peers: Object.entries(peerOfflineCounts)
              .filter(([, c]) => c >= CHRONIC_OFFLINE_THRESHOLD)
              .map(([id, c]) => ({ peer_id: id, offline_count: c })),
            phase: cycle.phase,
            day_index: cycle.day_index,
          },
        });

        if (pickedResult !== "ok") {
          const noSendAttempts = (job.attempts || 0) + 1;
          const MAX_NO_SEND_RETRIES = 4;
          if (noSendAttempts >= MAX_NO_SEND_RETRIES) {
            await db.from("warmup_jobs")
              .update({ status: "failed", last_error: `Comunidade sem envio efetivo após ${noSendAttempts} tentativas: ${pickedResult}`, attempts: noSendAttempts })
              .eq("id", job.id);
          } else {
            const retryAt = new Date(Date.now() + randInt(180, 600) * 1000).toISOString();
            await db.from("warmup_jobs")
              .update({ status: "pending", run_at: retryAt, last_error: `Comunidade sem envio efetivo: ${pickedResult}`, attempts: noSendAttempts })
              .eq("id", job.id);
          }
          return false;
        }

        break;
      }

      // ── ENABLE AUTOSAVE ──
      case "enable_autosave": {
        const { count } = await db.from("warmup_autosave_contacts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", job.user_id).eq("is_active", true);

        if (count && count > 0) {
          await db.from("warmup_cycles").update({ phase: "autosave_enabled" }).eq("id", cycle.id);

          const { data: membership } = await db.from("warmup_community_membership")
            .select("id, is_enabled").eq("device_id", job.device_id).maybeSingle();

          if (!membership) {
            await db.from("warmup_community_membership").insert({
              user_id: job.user_id, device_id: job.device_id, cycle_id: cycle.id,
              is_eligible: true, is_enabled: true, enabled_at: new Date().toISOString(),
            });
          } else if (!membership.is_enabled) {
            await db.from("warmup_community_membership")
              .update({ is_enabled: true, is_eligible: true, enabled_at: new Date().toISOString(), cycle_id: cycle.id })
              .eq("id", membership.id);
          }

          bufferAudit({ user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id, level: "info", event_type: "autosave_enabled", message: `Auto Save ativado: ${count} contatos` });
        } else {
          bufferAudit({ user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id, level: "warn", event_type: "autosave_no_contacts", message: "Nenhum contato, mantendo fase anterior" });
        }
        break;
      }

      // ── ENABLE COMMUNITY ──
      case "enable_community": {
        const pairStats = await reconcileCommunityPairs(db, {
          deviceId: job.device_id,
          userId: job.user_id,
          cycleId: cycle.id,
          dayIndex: cycle.day_index,
          chipState,
        });

        await db.from("warmup_cycles").update({ phase: getPhaseForDay(cycle.day_index, chipState) }).eq("id", cycle.id);
        bufferAudit({
          user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
          level: "info", event_type: "community_enabled",
          message: `Comunidade ativada: ${pairStats.keptCount} pares válidos + ${pairStats.createdCount} novos = ${pairStats.pairs.length}/${pairStats.targetPeers} (fechados inválidos: ${pairStats.closedCount})`,
          meta: {
            pairs_kept: pairStats.keptCount,
            pairs_new: pairStats.createdCount,
            pairs_closed: pairStats.closedCount,
            target: pairStats.targetPeers,
          },
        });
        break;
      }

      // ── HEALTH CHECK ──
      case "health_check": {
        bufferAudit({ user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id, level: "info", event_type: "health_check", message: `Health OK — device ${device.status}, day ${cycle.day_index}` });
        break;
      }

      // ── DAILY RESET ──
      case "daily_reset": {
        // Idempotência: nunca avançar dia 2x no mesmo dia BRT
        const nowBrtKey = getBrtDateKey(new Date());
        const lastResetBrtKey = cycle.last_daily_reset_at
          ? getBrtDateKey(new Date(cycle.last_daily_reset_at))
          : null;

        if (lastResetBrtKey === nowBrtKey) {
          await ensureNextDailyResetJob(db, job, cycle.id);
          bufferAudit({
            user_id: job.user_id,
            device_id: job.device_id,
            cycle_id: job.cycle_id,
            level: "info",
            event_type: "daily_reset_skipped",
            message: "Reset diário ignorado: já executado hoje (BRT)",
          });
          break;
        }

        // Block if still in first 24h
        const first24hEnd = new Date(cycle.first_24h_ends_at);
        if (Date.now() < first24hEnd.getTime() && cycle.phase === "pre_24h") {
          const deferred = new Date(first24hEnd);
          deferred.setUTCHours(9, 50, 0, 0);
          if (deferred.getTime() <= first24hEnd.getTime()) deferred.setUTCDate(deferred.getUTCDate() + 1);

          await db.from("warmup_jobs").update({ status: "pending", run_at: deferred.toISOString(), last_error: "" }).eq("id", job.id);
          bufferAudit({ user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id, level: "info", event_type: "daily_reset_deferred", message: `Reset adiado para ${deferred.toISOString()}` });
          return false;
        }

        const newDay = (cycle.day_index || 1) + 1;

        // Check if cycle is complete
        if (newDay > cycle.days_total) {
          await db.from("warmup_cycles").update({
            is_running: false,
            phase: "completed",
            daily_interaction_budget_used: 0,
            daily_unique_recipients_used: 0,
            last_daily_reset_at: new Date().toISOString(),
          }).eq("id", cycle.id);
          cycle.is_running = false;
          cycle.phase = "completed";
          cycle.last_daily_reset_at = new Date().toISOString();
          bufferAudit({ user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id, level: "info", event_type: "cycle_completed", message: `Ciclo concluído: ${cycle.days_total} dias 🎉` });
          break;
        }

        const oldPhase = cycle.phase;
        const newPhase = getPhaseForDay(newDay, chipState);

        // Cancel old interaction jobs and orphan enable_* jobs
        // [BUG B FIX] Do NOT cancel join_group here — reschedule failed ones below
        await db.from("warmup_jobs")
          .update({ status: "cancelled", last_error: "Cancelado: reset diário" })
          .eq("cycle_id", cycle.id).eq("status", "pending")
          .in("job_type", [...INTERACTION_JOB_TYPES, "enable_autosave", "enable_community"]);

        const resetAt = new Date().toISOString();

        // Update day and phase
        await db.from("warmup_cycles").update({
          day_index: newDay,
          phase: newPhase,
          last_daily_reset_at: resetAt,
          daily_interaction_budget_used: 0,
          daily_unique_recipients_used: 0,
        }).eq("id", cycle.id);

        cycle.day_index = newDay;
        cycle.phase = newPhase;
        cycle.last_daily_reset_at = resetAt;

        // [BUG 3 FIX] When transitioning to autosave_enabled or community_enabled,
        // ensure community membership is activated (was only done by enable_autosave job before)
        if (newPhase !== oldPhase && ["autosave_enabled", "community_ramp_up", "community_stable"].includes(newPhase)) {
          const { data: membership } = await db.from("warmup_community_membership")
            .select("id, is_enabled").eq("device_id", job.device_id).maybeSingle();

          if (!membership) {
            await db.from("warmup_community_membership").insert({
              user_id: job.user_id, device_id: job.device_id, cycle_id: cycle.id,
              is_eligible: true, is_enabled: true, enabled_at: resetAt,
            });
          } else if (!membership.is_enabled) {
            await db.from("warmup_community_membership")
              .update({ is_enabled: true, is_eligible: true, enabled_at: resetAt, cycle_id: cycle.id })
              .eq("id", membership.id);
          }
        }

        const chipLabels: Record<string, string> = { new: "NOVO", recovered: "BANIDO/RECUPERAÇÃO", unstable: "CRÍTICO/INSTÁVEL" };
        bufferAudit({
          user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
          level: "info", event_type: "daily_reset",
          message: `Reset: dia ${newDay}/${cycle.days_total}, fase: ${oldPhase} → ${newPhase}, perfil: ${chipLabels[chipState] || chipState}`,
          meta: { day: newDay, phase: newPhase, old_phase: oldPhase },
        });

        // Rotate community pairs on daily reset
        if (isCommunityPhase(newPhase)) {
          const pairStats = await reconcileCommunityPairs(db, {
            deviceId: job.device_id,
            userId: job.user_id,
            cycleId: cycle.id,
            dayIndex: newDay,
            chipState,
          });

          bufferAudit({
            user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
            level: "info", event_type: "community_pairs_rotated",
            message: `Pares rotacionados/reconciliados: ${pairStats.keptCount} mantidos, ${pairStats.createdCount} novos, ${pairStats.closedCount} fechados = ${pairStats.pairs.length}/${pairStats.targetPeers}`,
            meta: {
              kept: pairStats.keptCount,
              new: pairStats.createdCount,
              closed: pairStats.closedCount,
              target: pairStats.targetPeers,
              day: newDay,
            },
          });
        }

        // [BUG B FIX] Reschedule pending join_group jobs for groups still not joined
        await ensureJoinGroupJobs(db, cycle.id, job.user_id, job.device_id);

        // Schedule today's jobs
        await scheduleDayJobs(db, cycle.id, job.user_id, job.device_id, newDay, newPhase, chipState);

        // Ensure exactly one NEXT daily reset
        await ensureNextDailyResetJob(db, job, cycle.id);
        break;
      }

      default:
        console.warn(`[warmup-tick] Unknown job type: ${job.job_type}`);
        break;
    }

    return true;
  }

  // ── Process in parallel batches ──
  for (let i = 0; i < deviceIdList.length; i += MAX_PARALLEL) {
    const batch = deviceIdList.slice(i, i + MAX_PARALLEL);
    await Promise.allSettled(
      batch.map(async (did) => {
        for (const job of jobsByDevice[did]) {
          try {
            const ok = await processJob(job);
            if (ok) {
              await db.from("warmup_jobs").update({ status: "succeeded" }).eq("id", job.id);
              succeeded++;
            }
          } catch (err) {
            failed++;
            const attempts = (job.attempts || 0) + 1;
            if (attempts >= (job.max_attempts || 3)) {
              await db.from("warmup_jobs").update({ status: "failed", last_error: err.message, attempts }).eq("id", job.id);
            } else {
              const retryAt = new Date(Date.now() + backoffMinutes(attempts) * 60000).toISOString();
              await db.from("warmup_jobs").update({ status: "pending", last_error: err.message, attempts, run_at: retryAt }).eq("id", job.id);
            }
            bufferAudit({
              user_id: job.user_id, device_id: job.device_id, cycle_id: job.cycle_id,
              level: "error", event_type: `${job.job_type}_error`,
              message: `Erro: ${err.message.substring(0, 200)}`,
              meta: { attempts, job_id: job.id },
            });
          }
        }
      })
    );
  }

  await flushAuditLogs();

  console.log(`[warmup-tick] Done: ${succeeded} ok, ${failed} fail, ${deviceIdList.length} devices`);
  return json({ ok: true, processed: succeeded + failed, succeeded, failed, shard: shardIndex });
}

// ══════════════════════════════════════════════════════════
// DAILY RESET HANDLER (manual trigger)
// ══════════════════════════════════════════════════════════

async function handleDailyReset(db: any) {
  const { data: activeCycles } = await db.from("warmup_cycles")
    .select("id, user_id, device_id, day_index, days_total, chip_state, phase, first_24h_ends_at")
    .eq("is_running", true).neq("phase", "completed");

  if (!activeCycles?.length) return json({ ok: true, message: "No active cycles" });

  let processed = 0;
  for (const cycle of activeCycles) {
    // Skip if still in pre_24h
    if (Date.now() < new Date(cycle.first_24h_ends_at).getTime()) continue;

    const chipState = cycle.chip_state || "new";
    const newDay = Math.min(cycle.day_index + 1, cycle.days_total);

    if (newDay > cycle.days_total) {
      await db.from("warmup_cycles").update({ is_running: false, phase: "completed" }).eq("id", cycle.id);
      continue;
    }

    const oldPhase = cycle.phase;
    const newPhase = getPhaseForDay(newDay, chipState);

    // Cancel old pending jobs (interactions + orphan enable_* + join_group)
    await db.from("warmup_jobs")
      .update({ status: "cancelled", last_error: "Cancelado: reset diário manual" })
      .eq("cycle_id", cycle.id).eq("status", "pending")
      .in("job_type", [...INTERACTION_JOB_TYPES, "enable_autosave", "enable_community", "join_group"]);

    const resetAt = new Date().toISOString();

    await db.from("warmup_cycles").update({
      day_index: newDay, phase: newPhase,
      last_daily_reset_at: resetAt,
      daily_interaction_budget_used: 0, daily_unique_recipients_used: 0,
    }).eq("id", cycle.id);

    // [BUG A FIX] Activate community membership on phase transition (mirrors job-based daily_reset)
    if (newPhase !== oldPhase && ["autosave_enabled", "community_ramp_up", "community_stable"].includes(newPhase)) {
      const { data: membership } = await db.from("warmup_community_membership")
        .select("id, is_enabled").eq("device_id", cycle.device_id).maybeSingle();

      if (!membership) {
        await db.from("warmup_community_membership").insert({
          user_id: cycle.user_id, device_id: cycle.device_id, cycle_id: cycle.id,
          is_eligible: true, is_enabled: true, enabled_at: resetAt,
        });
      } else if (!membership.is_enabled) {
        await db.from("warmup_community_membership")
          .update({ is_enabled: true, is_eligible: true, enabled_at: resetAt, cycle_id: cycle.id })
          .eq("id", membership.id);
      }
    }

    // [BUG A FIX] Rotate/reconcile community pairs on daily reset (mirrors job-based daily_reset)
    if (isCommunityPhase(newPhase)) {
      const pairStats = await reconcileCommunityPairs(db, {
        deviceId: cycle.device_id,
        userId: cycle.user_id,
        cycleId: cycle.id,
        dayIndex: newDay,
        chipState,
      });

      await db.from("warmup_audit_logs").insert({
        user_id: cycle.user_id,
        device_id: cycle.device_id,
        cycle_id: cycle.id,
        level: "info",
        event_type: "community_pairs_rotated",
        message: `Pares rotacionados/reconciliados: ${pairStats.keptCount} mantidos, ${pairStats.createdCount} novos, ${pairStats.closedCount} fechados = ${pairStats.pairs.length}/${pairStats.targetPeers}`,
        meta: {
          kept: pairStats.keptCount,
          new: pairStats.createdCount,
          closed: pairStats.closedCount,
          target: pairStats.targetPeers,
          day: newDay,
        },
      });
    }

    // [BUG B FIX] Reschedule failed join_group jobs instead of just cancelling them
    const { data: failedJoinGroups } = await db.from("warmup_instance_groups")
      .select("group_id, group_name, invite_link")
      .eq("device_id", cycle.device_id).eq("join_status", "pending");

    if (failedJoinGroups?.length > 0) {
      await ensureJoinGroupJobs(db, cycle.id, cycle.user_id, cycle.device_id);
    }

    await scheduleDayJobs(db, cycle.id, cycle.user_id, cycle.device_id, newDay, newPhase, chipState);

    // Schedule next daily reset
    const nextReset = new Date();
    nextReset.setUTCDate(nextReset.getUTCDate() + 1);
    nextReset.setUTCHours(9, 50, 0, 0);
    await db.from("warmup_jobs").insert({
      user_id: cycle.user_id, device_id: cycle.device_id, cycle_id: cycle.id,
      job_type: "daily_reset", payload: {},
      run_at: nextReset.toISOString(), status: "pending",
    });

    processed++;
  }

  return json({ ok: true, cycles_reset: processed });
}

// ══════════════════════════════════════════════════════════
// SCHEDULE DAY HANDLER (on-demand job creation)
// ══════════════════════════════════════════════════════════

async function handleScheduleDay(db: any, body: any) {
  const { cycle_id, device_id, forced } = body;

  if (!cycle_id) return json({ error: "cycle_id obrigatório" }, 400);

  const { data: cycle, error: cycleErr } = await db.from("warmup_cycles")
    .select("*")
    .eq("id", cycle_id)
    .single();

  if (cycleErr || !cycle) return json({ error: "Ciclo não encontrado" }, 404);
  if (!cycle.is_running) return json({ error: "Ciclo não está rodando" }, 400);

  const chipState = cycle.chip_state || "new";
  const phase = cycle.phase;
  const dayIndex = cycle.day_index || 1;

  // Cancel existing pending interaction jobs to avoid duplicates
  await db.from("warmup_jobs")
    .update({ status: "cancelled", last_error: "Cancelado: nova geração de tarefas" })
    .eq("cycle_id", cycle_id)
    .eq("status", "pending")
    .in("job_type", ["group_interaction", "autosave_interaction", "community_interaction"]);

  let jobsCreated = 0;

  // Sempre garante entradas pendentes antes de reagendar interações
  if (!["completed", "paused", "error"].includes(phase)) {
    const created = await ensureJoinGroupJobs(db, cycle_id, cycle.user_id, device_id || cycle.device_id);
    jobsCreated += created;
  }

  // Schedule interaction jobs (forced = true uses current time as start)
  const scheduled = await scheduleDayJobs(
    db, cycle_id, cycle.user_id, device_id || cycle.device_id,
    dayIndex, phase === "pre_24h" ? "groups_only" : phase, chipState, forced
  );
  jobsCreated += scheduled;

  return json({ ok: true, jobs_created: jobsCreated, phase, day_index: dayIndex });
}
