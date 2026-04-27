// ══════════════════════════════════════════════════════════
// VPS Engine — Scheduled Campaigns Worker
// Replaces run-scheduled-campaigns Edge Function
// Promotes due campaigns from 'scheduled' → 'running' so the
// local campaignWorkerTick picks them up automatically.
// Also nudges due group_interactions that have a next_action_at.
// ══════════════════════════════════════════════════════════

import { getDb } from "../core/db";
import { createLogger } from "../core/logger";

const log = createLogger("scheduled-campaigns");

export let lastScheduledCampaignsTickAt: Date | null = null;

export async function scheduledCampaignsTick(): Promise<void> {
  const db = getDb();
  const nowIso = new Date().toISOString();

  // ── A. Cleanup stale device locks (>120s without heartbeat) ──
  try {
    await db.rpc("cleanup_stale_locks", { _stale_seconds: 120 });
  } catch { /* ignore */ }

  // ── B. Watchdog: detect stuck running campaigns and reset ──
  const staleThresholdMs = 60_000;
  const { data: stuckCampaigns } = await db.from("campaigns")
    .select("id, user_id, device_id, device_ids, updated_at, sent_count, failed_count")
    .eq("status", "running")
    .lt("updated_at", new Date(Date.now() - staleThresholdMs).toISOString());

  for (const stuck of (stuckCampaigns || [])) {
    const ids: string[] = Array.isArray(stuck.device_ids) && stuck.device_ids.length > 0
      ? stuck.device_ids : stuck.device_id ? [stuck.device_id] : [];

    // Check if any device lock has fresh heartbeat → worker is alive
    let workerAlive = false;
    for (const deviceId of ids) {
      const { data: lock } = await db.from("campaign_device_locks")
        .select("heartbeat_at")
        .eq("device_id", deviceId).eq("campaign_id", stuck.id).maybeSingle();
      if (lock && new Date(lock.heartbeat_at).getTime() > Date.now() - staleThresholdMs) {
        workerAlive = true;
        break;
      }
    }
    if (workerAlive) continue;

    // Worker dead — reset processing contacts back to pending
    await db.from("campaign_contacts")
      .update({ status: "pending" })
      .eq("campaign_id", stuck.id).eq("status", "processing");

    // Release stale locks
    for (const deviceId of ids) {
      await db.rpc("release_device_lock", { _device_id: deviceId, _campaign_id: stuck.id });
    }

    // Check if there are still pending contacts
    const { count: pendingCount } = await db.from("campaign_contacts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", stuck.id).eq("status", "pending");

    if (!pendingCount || pendingCount === 0) {
      await db.from("campaigns").update({
        status: "completed", completed_at: nowIso,
      }).eq("id", stuck.id);
      log.info(`Campaign ${stuck.id.slice(0, 8)} had no pending contacts → completed`);
      continue;
    }

    // Local campaignWorkerTick will re-pickup since status remains 'running'
    // and updated_at will be touched by the contact-reset above
    await db.from("campaigns")
      .update({ updated_at: nowIso })
      .eq("id", stuck.id);
    log.info(`Campaign ${stuck.id.slice(0, 8)} watchdog reset (${pendingCount} pending) — local tick will retry`);
  }

  // ── C. Promote scheduled campaigns whose time has come ──
  const { data: dueCampaigns } = await db.from("campaigns")
    .select("id, user_id, device_id, device_ids, scheduled_at")
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso);

  let promoted = 0;

  for (const campaign of (dueCampaigns || [])) {
    const deviceIds: string[] = Array.isArray(campaign.device_ids) && campaign.device_ids.length > 0
      ? campaign.device_ids : campaign.device_id ? [campaign.device_id] : [];

    // Skip if any lock already exists (another worker is on it)
    let alreadyLocked = false;
    for (const did of deviceIds) {
      const { data: existingLock } = await db.from("campaign_device_locks")
        .select("id")
        .eq("campaign_id", campaign.id).eq("device_id", did).maybeSingle();
      if (existingLock) { alreadyLocked = true; break; }
    }
    if (alreadyLocked) continue;

    // Atomic transition scheduled → running
    const { data: updated } = await db.from("campaigns")
      .update({ status: "running", started_at: nowIso, updated_at: nowIso })
      .eq("id", campaign.id).eq("status", "scheduled")
      .select("id");

    if (updated && updated.length > 0) {
      promoted++;
      log.info(`Campaign ${campaign.id.slice(0, 8)} promoted scheduled → running`);
    }
  }

  // ── D. Nudge stale group_interactions (next_action_at passed) ──
  // The groupInteractionTick worker handles execution; we just touch updated_at
  // so it's prioritized in the next pass.
  const { data: dueInteractions } = await db.from("group_interactions")
    .select("id")
    .eq("status", "running").not("next_action_at", "is", null)
    .lte("next_action_at", nowIso).limit(100);

  if (dueInteractions && dueInteractions.length > 0) {
    const ids = dueInteractions.map((i: any) => i.id);
    await db.from("group_interactions")
      .update({ updated_at: nowIso })
      .in("id", ids);
  }

  if (promoted > 0 || (dueInteractions?.length || 0) > 0) {
    log.info(`tick: promoted=${promoted} interactions_due=${dueInteractions?.length || 0}`);
  }

  lastScheduledCampaignsTickAt = new Date();
}
