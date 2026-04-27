// ══════════════════════════════════════════════════════════
// VPS Engine — Mass Inject Watchdog Worker
// Replaces mass-inject-watchdog Edge Function (was every 30s)
// Recovers stuck contacts and detects stalled campaigns.
// NOTE: Does NOT need to "restart workers" via HTTP — the local
// massInjectTick worker auto-picks up `queued`/`processing` campaigns.
// ══════════════════════════════════════════════════════════

import { getDb } from "../core/db";
import { createLogger } from "../core/logger";

const log = createLogger("mass-inject-watchdog");

export let lastMassInjectWatchdogTickAt: Date | null = null;

const NO_PROGRESS_THRESHOLD_MS = 60_000;
const STUCK_PROCESSING_THRESHOLD_MS = 180_000;
const HARD_FAIL_PROCESSING_MS = 120_000;
const MAX_CONTACT_ATTEMPTS = 3;

const RETRYABLE_STATUSES = [
  "pending", "retrying", "rate_limited", "api_temporary",
  "connection_unconfirmed", "session_dropped",
  "permission_unconfirmed", "unknown_failure", "timeout",
];

export async function massInjectWatchdogTick(): Promise<void> {
  const db = getDb();

  // Concurrency guard via advisory lock
  const { data: acquired } = await db.rpc("try_acquire_watchdog_lock");
  if (acquired !== true) return;

  try {
    const { data: campaigns } = await db.from("mass_inject_campaigns")
      .select("id, status, device_ids, updated_at, started_at")
      .in("status", ["queued", "running", "processing"]);

    if (!campaigns || campaigns.length === 0) {
      lastMassInjectWatchdogTickAt = new Date();
      return;
    }

    const now = Date.now();
    let hardFailed = 0;
    let cappedFailed = 0;
    let recovered = 0;
    let stalled = 0;

    for (const campaign of campaigns) {
      const campaignId = campaign.id as string;

      // 1a. HARD FAIL: contacts processing >2min → terminal failure
      const hardFailCutoff = new Date(now - HARD_FAIL_PROCESSING_MS).toISOString();
      const { data: hardFailContacts } = await db.from("mass_inject_contacts")
        .select("id")
        .eq("campaign_id", campaignId).eq("status", "processing")
        .lt("processed_at", hardFailCutoff);

      if (hardFailContacts && hardFailContacts.length > 0) {
        const ids = hardFailContacts.map((c: any) => c.id);
        await db.from("mass_inject_contacts").update({
          status: "failed", error_message: "timeout",
          processed_at: new Date().toISOString(), next_retry_at: null,
        }).in("id", ids);
        hardFailed += ids.length;
      }

      // 1b. Exceeded attempt cap → terminal failure
      const { data: cappedContacts } = await db.from("mass_inject_contacts")
        .select("id")
        .eq("campaign_id", campaignId)
        .gte("attempt_count", MAX_CONTACT_ATTEMPTS)
        .in("status", RETRYABLE_STATUSES);

      if (cappedContacts && cappedContacts.length > 0) {
        const ids = cappedContacts.map((c: any) => c.id);
        await db.from("mass_inject_contacts").update({
          status: "failed", error_message: "max_attempts_exceeded",
          processed_at: new Date().toISOString(), next_retry_at: null,
        }).in("id", ids);
        cappedFailed += ids.length;
      }

      // 1c. Recover contacts stuck in 'processing' (>3min) — soft recovery
      const stuckCutoff = new Date(now - STUCK_PROCESSING_THRESHOLD_MS).toISOString();
      const { data: stuckContacts } = await db.from("mass_inject_contacts")
        .select("id")
        .eq("campaign_id", campaignId).eq("status", "processing")
        .lt("processed_at", stuckCutoff);

      if (stuckContacts && stuckContacts.length > 0) {
        const ids = stuckContacts.map((c: any) => c.id);
        await db.from("mass_inject_contacts").update({
          status: "retrying",
          error_message: "watchdog: recovered from stuck processing",
          next_retry_at: new Date().toISOString(),
        }).in("id", ids);
        recovered += ids.length;
      }

      // 2. Detect no-progress stall — local massInjectTick will retry on next pass
      const { data: lastUpdate } = await db.from("mass_inject_contacts")
        .select("processed_at")
        .eq("campaign_id", campaignId).not("processed_at", "is", null)
        .order("processed_at", { ascending: false }).limit(1).maybeSingle();

      const lastTs = lastUpdate?.processed_at
        ? new Date(lastUpdate.processed_at as string).getTime()
        : campaign.started_at ? new Date(campaign.started_at as string).getTime() : 0;
      const noProgressMs = now - lastTs;

      const { count: pendingCount } = await db.from("mass_inject_contacts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId).in("status", RETRYABLE_STATUSES);

      const hasQueue = (pendingCount || 0) > 0;
      const isStalled = hasQueue && noProgressMs > NO_PROGRESS_THRESHOLD_MS;

      if (isStalled) {
        stalled++;
        // Force status back to 'queued' if it's 'running' but stalled — local tick will re-pick it
        if (campaign.status === "running" || campaign.status === "processing") {
          await db.from("mass_inject_campaigns")
            .update({ status: "queued", updated_at: new Date().toISOString() })
            .eq("id", campaignId)
            .in("status", ["running", "processing"]);
          log.info(`Campaign ${campaignId.slice(0, 8)} stalled (${Math.round(noProgressMs / 1000)}s) — requeued for local pickup`);
        }
      }
    }

    if (hardFailed + cappedFailed + recovered + stalled > 0) {
      log.info(`watchdog: hardFailed=${hardFailed} capped=${cappedFailed} recovered=${recovered} stalled=${stalled}`);
    }
  } catch (err: any) {
    log.error(`watchdog fatal: ${err?.message || err}`);
  } finally {
    try {
      await db.rpc("release_watchdog_lock");
    } catch { /* ignore */ }
  }

  lastMassInjectWatchdogTickAt = new Date();
}
