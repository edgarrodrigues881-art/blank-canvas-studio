// ══════════════════════════════════════════════════════════
// VPS Engine — Entry point
// Serviço contínuo que roda na VPS com PM2
// ══════════════════════════════════════════════════════════

import express from "express";
import { config } from "./config";
import { getDb } from "./db";
import { createLogger } from "./lib/logger";
import { Semaphore } from "./lib/concurrency";
import { isWithinOperatingWindow, getBrtTodayAt } from "./lib/brt";
import { backoffMinutes } from "./lib/retry";

const log = createLogger("main");
const sem = new Semaphore(config.maxConcurrentDevices);

// ── Health check & status ──
const app = express();
const startedAt = new Date();
let lastTickAt: Date | null = null;
let lastCampaignTickAt: Date | null = null;
let tickCount = 0;
let tickErrors = 0;

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: Math.round((Date.now() - startedAt.getTime()) / 1000),
    lastTick: lastTickAt?.toISOString() || null,
    lastCampaignTick: lastCampaignTickAt?.toISOString() || null,
    tickCount,
    tickErrors,
    concurrency: { active: sem.active, waiting: sem.waiting, max: config.maxConcurrentDevices },
    withinWindow: isWithinOperatingWindow(),
  });
});

app.listen(config.port, () => {
  log.info(`Health check listening on port ${config.port}`);
});

// ══════════════════════════════════════════════════════════
// WARMUP TICK — Continuous loop (replaces pg_cron every 2min)
// ══════════════════════════════════════════════════════════

async function warmupTick() {
  const db = getDb();
  const now = new Date().toISOString();
  const withinWindow = isWithinOperatingWindow();

  // 1. Recover stale "running" jobs (>5min)
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await db.from("warmup_jobs")
    .update({ status: "pending", last_error: "Recuperado de estado running travado (VPS)" })
    .eq("status", "running").lt("updated_at", staleThreshold);

  // 2. Cancel outside-window interaction jobs
  if (!withinWindow) {
    const { data: outsideJobs } = await db.from("warmup_jobs")
      .select("id, payload")
      .eq("status", "pending").lte("run_at", now)
      .in("job_type", ["group_interaction", "autosave_interaction", "community_interaction"])
      .limit(500);

    if (outsideJobs?.length) {
      const toCancel = outsideJobs.filter((j: any) => !j.payload?.forced).map((j: any) => j.id);
      if (toCancel.length > 0) {
        for (let i = 0; i < toCancel.length; i += 200) {
          await db.from("warmup_jobs")
            .update({ status: "cancelled", last_error: "Cancelado: fora da janela 07-19 BRT (VPS)" })
            .in("id", toCancel.slice(i, i + 200));
        }
      }
    }
  }

  // 3. Fetch pending jobs
  const { data: pendingJobs, error: fetchErr } = await db.from("warmup_jobs")
    .select("id, user_id, device_id, cycle_id, job_type, payload, run_at, status, attempts, max_attempts")
    .eq("status", "pending")
    .lte("run_at", now)
    .order("run_at", { ascending: true })
    .limit(2000);

  if (fetchErr) throw fetchErr;
  if (!pendingJobs?.length) return { processed: 0 };

  // 4. Group by device for sequential processing per device
  const jobsByDevice: Record<string, any[]> = {};
  for (const job of pendingJobs) {
    if (!jobsByDevice[job.device_id]) jobsByDevice[job.device_id] = [];
    jobsByDevice[job.device_id].push(job);
  }

  // 5. Process devices in parallel with semaphore
  let succeeded = 0;
  let failed = 0;

  const deviceIds = Object.keys(jobsByDevice);
  await Promise.allSettled(
    deviceIds.map(async (deviceId) => {
      await sem.acquire();
      try {
        for (const job of jobsByDevice[deviceId]) {
          try {
            // Mark as running
            await db.from("warmup_jobs").update({ status: "running" }).eq("id", job.id);

            // ── DELEGATE TO EDGE FUNCTION (Phase 1: proxy to existing logic) ──
            // In Phase 1, we proxy heavy jobs to the Edge Function but with no timeout pressure
            // In Phase 2+, this will be replaced with inline Node.js processing
            const res = await fetch(`${config.supabaseUrl}/functions/v1/warmup-tick`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.supabaseServiceKey}`,
              },
              body: JSON.stringify({ job_id: job.id }),
            });

            if (res.ok) {
              succeeded++;
            } else {
              const text = await res.text();
              throw new Error(`Edge function returned ${res.status}: ${text.substring(0, 200)}`);
            }
          } catch (err: any) {
            failed++;
            const attempts = (job.attempts || 0) + 1;
            if (attempts >= (job.max_attempts || 3)) {
              await db.from("warmup_jobs").update({
                status: "failed", last_error: `VPS: ${err.message}`, attempts,
              }).eq("id", job.id);
            } else {
              const retryAt = new Date(Date.now() + backoffMinutes(attempts) * 60000).toISOString();
              await db.from("warmup_jobs").update({
                status: "pending", last_error: `VPS: ${err.message}`, attempts, run_at: retryAt,
              }).eq("id", job.id);
            }
          }
        }
      } finally {
        sem.release();
      }
    }),
  );

  return { processed: succeeded + failed, succeeded, failed, devices: deviceIds.length };
}

// ══════════════════════════════════════════════════════════
// CAMPAIGN SCHEDULER — Replaces run-scheduled-campaigns cron
// ══════════════════════════════════════════════════════════

async function campaignTick() {
  const db = getDb();

  // 1. Cleanup stale device locks
  const { data: cleanedCount } = await db.rpc("cleanup_stale_locks", { _stale_seconds: 120 });
  if (cleanedCount && cleanedCount > 0) {
    log.info(`Cleaned ${cleanedCount} stale device locks`);
  }

  // 2. Watchdog: detect stuck campaigns
  const staleThresholdMs = 60_000;
  const { data: stuckCampaigns } = await db
    .from("campaigns")
    .select("id, user_id, device_id, device_ids, updated_at, sent_count, failed_count")
    .eq("status", "running")
    .lt("updated_at", new Date(Date.now() - staleThresholdMs).toISOString());

  for (const stuck of stuckCampaigns || []) {
    const ids: string[] = Array.isArray(stuck.device_ids) && stuck.device_ids.length > 0
      ? stuck.device_ids : stuck.device_id ? [stuck.device_id] : [];

    let workerAlive = false;
    for (const deviceId of ids) {
      const { data: lock } = await db
        .from("campaign_device_locks")
        .select("heartbeat_at")
        .eq("device_id", deviceId)
        .eq("campaign_id", stuck.id)
        .single();
      if (lock && new Date(lock.heartbeat_at).getTime() > Date.now() - staleThresholdMs) {
        workerAlive = true;
        break;
      }
    }
    if (workerAlive) continue;

    // Reset processing contacts
    await db.from("campaign_contacts")
      .update({ status: "pending" })
      .eq("campaign_id", stuck.id)
      .eq("status", "processing");

    // Release locks
    for (const deviceId of ids) {
      await db.rpc("release_device_lock", { _device_id: deviceId, _campaign_id: stuck.id });
    }

    // Check pending
    const { count: pendingCount } = await db.from("campaign_contacts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", stuck.id)
      .eq("status", "pending");

    if (!pendingCount || pendingCount === 0) {
      await db.from("campaigns").update({
        status: "completed", completed_at: new Date().toISOString(),
      }).eq("id", stuck.id);
      continue;
    }

    // Restart via Edge Function
    try {
      await fetch(`${config.supabaseUrl}/functions/v1/process-campaign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.supabaseServiceKey}` },
        body: JSON.stringify({ action: "continue", campaignId: stuck.id, deviceId: stuck.device_id || undefined }),
      });
      log.info(`Watchdog restarted stuck campaign ${stuck.id}`);
    } catch (err: any) {
      log.error(`Failed to restart campaign ${stuck.id}: ${err.message}`);
    }
  }

  // 3. Trigger scheduled campaigns
  const { data: campaigns } = await db.from("campaigns")
    .select("id, user_id, device_id, device_ids, scheduled_at")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString());

  for (const campaign of campaigns || []) {
    const { data: updated } = await db.from("campaigns")
      .update({ status: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", campaign.id)
      .eq("status", "scheduled")
      .select("id");

    if (!updated?.length) continue;

    try {
      await fetch(`${config.supabaseUrl}/functions/v1/process-campaign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.supabaseServiceKey}` },
        body: JSON.stringify({ action: "continue", campaignId: campaign.id, deviceId: campaign.device_id || undefined }),
      });
      log.info(`Triggered scheduled campaign ${campaign.id}`);
    } catch (err: any) {
      log.error(`Failed to trigger campaign ${campaign.id}: ${err.message}`);
      await db.from("campaigns").update({ status: "scheduled", started_at: null }).eq("id", campaign.id).eq("status", "running");
    }
  }

  // 4. Group interaction ticks
  const { data: dueInteractions } = await db.from("group_interactions")
    .select("id, next_action_at")
    .eq("status", "running")
    .not("next_action_at", "is", null)
    .lte("next_action_at", new Date().toISOString())
    .limit(100);

  for (const interaction of dueInteractions || []) {
    try {
      await fetch(`${config.supabaseUrl}/functions/v1/group-interaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.supabaseServiceKey}` },
        body: JSON.stringify({ action: "tick", interactionId: interaction.id, scheduled_for: interaction.next_action_at }),
      });
    } catch (err: any) {
      log.error(`Failed to trigger group interaction ${interaction.id}: ${err.message}`);
    }
  }
}

// ══════════════════════════════════════════════════════════
// MAIN LOOP
// ══════════════════════════════════════════════════════════

let isRunning = true;

async function mainLoop() {
  log.info("VPS Engine started", {
    supabaseUrl: config.supabaseUrl.substring(0, 40),
    maxConcurrent: config.maxConcurrentDevices,
    tickInterval: config.tickIntervalMs,
    campaignInterval: config.campaignTickMs,
  });

  // Validate DB connection
  try {
    const db = getDb();
    const { count } = await db.from("devices").select("id", { count: "exact", head: true });
    log.info(`DB connected. ${count || 0} devices found.`);
  } catch (err: any) {
    log.error(`DB connection failed: ${err.message}`);
    process.exit(1);
  }

  // Warmup tick loop
  const runWarmupTick = async () => {
    while (isRunning) {
      try {
        const result = await warmupTick();
        lastTickAt = new Date();
        tickCount++;
        if (result.processed > 0) {
          log.info(`Warmup tick: ${result.processed} jobs (${result.succeeded} ok, ${result.failed} fail)`);
        }
      } catch (err: any) {
        tickErrors++;
        log.error(`Warmup tick error: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, config.tickIntervalMs));
    }
  };

  // Campaign tick loop
  const runCampaignTick = async () => {
    while (isRunning) {
      try {
        await campaignTick();
        lastCampaignTickAt = new Date();
      } catch (err: any) {
        log.error(`Campaign tick error: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, config.campaignTickMs));
    }
  };

  // Run both loops concurrently
  await Promise.all([runWarmupTick(), runCampaignTick()]);
}

// Graceful shutdown
process.on("SIGTERM", () => { log.info("SIGTERM received, shutting down..."); isRunning = false; });
process.on("SIGINT", () => { log.info("SIGINT received, shutting down..."); isRunning = false; });

mainLoop().catch((err) => {
  log.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
