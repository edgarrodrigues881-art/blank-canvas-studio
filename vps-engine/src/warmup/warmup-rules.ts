// ══════════════════════════════════════════════════════════
// VPS Engine — Warmup phase rules & volume config
// Must match Edge Function warmup-tick logic exactly
// ══════════════════════════════════════════════════════════

import { randInt } from "../utils/message-generator";

// ── Phase rules ──

export function getGroupsEndDay(chipState: string): number {
  if (chipState === "unstable") return 6;
  if (chipState === "recovered") return 5;
  return 4; // new
}

export function getCommunityRampEnd(chipState: string): number {
  if (chipState === "unstable") return 10;
  if (chipState === "recovered") return 10;
  return 9; // new
}

export function getPhaseForDay(day: number, chipState: string): string {
  if (day <= 1) return "pre_24h";
  const groupsEnd = getGroupsEndDay(chipState);
  if (day <= groupsEnd) return "groups_only";
  if (day === groupsEnd + 1) return "autosave_enabled";
  const rampEnd = getCommunityRampEnd(chipState);
  if (day <= rampEnd) return "community_ramp_up";
  return "community_stable";
}

export function isCommunityPhase(phase: string): boolean {
  return phase === "community_ramp_up" || phase === "community_stable" || phase === "community_enabled" || phase === "community_light";
}

export function hasWarmupAccess(
  subscription: { expires_at?: string | null } | null | undefined,
  profile: { instance_override?: number | null } | null | undefined,
): boolean {
  const hasActiveSubscription = !!subscription?.expires_at && new Date(subscription.expires_at) >= new Date();
  const hasLegacyAccess = Number(profile?.instance_override ?? 0) > 0;
  return hasActiveSubscription || hasLegacyAccess;
}

// ── Volume config ──

export interface DayVolumes {
  groupMsgs: number;
  autosaveContacts: number;
  autosaveRounds: number;
  communityPeers: number;
  communityMsgsPerPeer: number;
}

// Budget: groups fill 07-19h at 1 msg every ~2min = ~360 msgs + autosave + community
export function getProgressiveDailyBudget(dayIndex: number, chipState: string): number {
  const day = Math.max(1, Math.min(dayIndex, 30));
  // Base budget = group msgs + headroom for autosave/community
  const groupBase = getGroupMsgsForDay(day, chipState);
  // Add headroom: autosave (~15-25) + community (~50-100 at peak)
  const headroom = day <= 5 ? 20 : day <= 10 ? 80 : day <= 20 ? 120 : 150;
  return groupBase + headroom;
}

// Group messages: 1 msg every 90-150s across 07:00-19:00 (12h = 720min)
// Progressive ramp: start gentle, reach full cadence by day 5
export function getGroupMsgsForDay(dayIndex: number, chipState: string = "new"): number {
  if (dayIndex < 2) return 0;
  // Day 2: ~1 msg every 5 min = 144
  if (dayIndex === 2) return randInt(130, 155);
  // Day 3: ~1 msg every 3.5 min = 206
  if (dayIndex === 3) return randInt(190, 220);
  // Day 4: ~1 msg every 2.5 min = 288
  if (dayIndex === 4) return randInt(270, 300);
  // Day 5+: ~1 msg every 2 min = 360
  if (dayIndex <= 10) return randInt(330, 380);
  // Day 11+: full cadence ~1 msg every 1.5-2 min
  return randInt(360, 400);
}

export function getAutosaveContactsForDay(dayIndex: number, chipState: string): number {
  const autosaveStart = getGroupsEndDay(chipState) + 1;
  const daysSince = dayIndex - autosaveStart;
  if (daysSince < 0) return 0;
  if (chipState === "new") {
    if (daysSince <= 1) return 1;
    if (daysSince <= 3) return 2;
    if (daysSince <= 5) return 3;
    if (daysSince <= 10) return 4;
    return 5;
  }
  if (chipState === "recovered") {
    if (daysSince === 0) return 1;
    if (daysSince <= 2) return 2;
    if (daysSince <= 4) return 3;
    if (daysSince <= 9) return 4;
    return 5;
  }
  if (daysSince === 0) return 1;
  if (daysSince === 1) return 2;
  if (daysSince <= 3) return 3;
  if (daysSince <= 8) return 4;
  return 5;
}

export function getAutosaveRoundsPerContact(chipState: string = "new"): number {
  if (chipState === "unstable") return 5;
  return 3;
}

export function getCommunityStartDayForChip(chipState: string): number {
  if (chipState === "unstable") return 9;
  if (chipState === "recovered") return 7;
  return 6;
}

export function getCommunityPeersFromCommunityDay(communityDay: number): { min: number; max: number } {
  if (communityDay <= 1) return { min: 1, max: 1 };
  if (communityDay === 2) return { min: 2, max: 2 };
  if (communityDay === 3) return { min: 3, max: 3 };
  if (communityDay === 4) return { min: 4, max: 4 };
  return { min: 5, max: 5 };
}

export function getCommunityPeers(dayIndex: number, chipState: string, communityDay?: number): number {
  const communityStartDay = getCommunityStartDayForChip(chipState);
  if (dayIndex < communityStartDay) return 0;
  const cd = communityDay ?? Math.max(1, dayIndex - communityStartDay + 1);
  const target = getCommunityPeersFromCommunityDay(cd);
  return randInt(target.min, target.max);
}

export function getCommunityBurstsPerPeer(dayIndex: number, chipState: string, communityDay?: number): number {
  const communityStartDay = getCommunityStartDayForChip(chipState);
  if (dayIndex < communityStartDay) return 0;
  const cd = communityDay ?? Math.max(1, dayIndex - communityStartDay + 1);
  if (cd <= 1) return 3;
  if (cd === 2) return 4;
  if (cd === 3) return 5;
  if (cd <= 6) return 6;
  return 8;
}

export function getMaxPairsForChip(_chipState: string, communityDay?: number): number {
  if (!communityDay || communityDay <= 0) return 0;
  const target = getCommunityPeersFromCommunityDay(communityDay);
  return target.max;
}

export function getVolumes(chipState: string, dayIndex: number, phase: string, communityDay?: number): DayVolumes {
  const v: DayVolumes = { groupMsgs: 0, autosaveContacts: 0, autosaveRounds: 0, communityPeers: 0, communityMsgsPerPeer: 0 };
  if (["pre_24h", "completed", "paused", "error"].includes(phase)) return v;

  v.groupMsgs = getGroupMsgsForDay(dayIndex, chipState);

  if (phase === "autosave_enabled") {
    v.autosaveContacts = getAutosaveContactsForDay(dayIndex, chipState);
    v.autosaveRounds = getAutosaveRoundsPerContact(chipState);
  } else if (isCommunityPhase(phase)) {
    v.autosaveContacts = getAutosaveContactsForDay(dayIndex, chipState);
    v.autosaveRounds = getAutosaveRoundsPerContact(chipState);
    v.communityPeers = getCommunityPeers(dayIndex, chipState, communityDay);
    v.communityMsgsPerPeer = getCommunityBurstsPerPeer(dayIndex, chipState, communityDay);
  }

  return v;
}

export const CONNECTED_STATUSES = ["Ready", "Connected", "connected", "authenticated", "open", "active", "online"];
export const INTERACTION_JOB_TYPES = ["group_interaction", "autosave_interaction", "community_interaction"];
