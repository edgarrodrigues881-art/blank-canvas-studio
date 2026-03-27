// ══════════════════════════════════════════════════════════
// VPS Engine — Entry point (Phase 2: Inline Processing)
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
// DEVICE CREDENTIAL RESOLVER
// Reads uazapi_token and uazapi_base_url directly from devices table
// (matches warmup-tick Edge Function logic: line 2256, 2401-2402)
// ══════════════════════════════════════════════════════════

interface DeviceCredentials {
  id: string;
  status: string;
  uazapi_token: string;
  uazapi_base_url: string;
  number: string | null;
}

const CONNECTED_STATUSES = ["Ready", "Connected", "authenticated", "open", "active", "online"];

async function resolveDeviceCredentials(deviceId: string): Promise<DeviceCredentials | null> {
  const db = getDb();
  const { data: device, error } = await db
    .from("devices")
    .select("id, status, uazapi_token, uazapi_base_url, number")
    .eq("id", deviceId)
    .maybeSingle();

  if (error) {
    log.error(`DB error resolving device ${deviceId}`, { error: error.message });
    return null;
  }

  if (!device) {
    log.warn(`Device not found: ${deviceId}`);
    return null;
  }

  return {
    id: device.id,
    status: device.status || "unknown",
    uazapi_token: device.uazapi_token || "",
    uazapi_base_url: (device.uazapi_base_url || "").replace(/\/+$/, ""),
    number: device.number || null,
  };
}

// ══════════════════════════════════════════════════════════
// WARMUP TICK — Continuous loop (replaces pg_cron)
// Phase 2: Proxies to Edge Function with proper auth diagnostics
// ══════════════════════════════════════════════════════════

async function warmupTick() {
  const db = getDb();
  const now = new Date().toISOString();
  const withinWindow = isWithinOperatingWindow();

  // 1. Recover stale "running" jobs (>5min)
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { error: staleErr } = await db.from("warmup_jobs")
    .update({ status: "pending", last_error: "Recuperado de estado running travado (VPS)" })
    .eq("status", "running").lt("updated_at", staleThreshold);

  if (staleErr) {
    log.error("Failed to recover stale jobs", { error: staleErr.message, code: staleErr.code, hint: staleErr.hint });
    // If it's an auth error, bail early with clear message
    if (staleErr.message?.includes("Invalid API key") || staleErr.code === "PGRST301") {
      throw new Error(`Supabase auth error: ${staleErr.message}. Check SUPABASE_SERVICE_ROLE_KEY in .env`);
    }
  }

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
        log.info(`Cancelled ${toCancel.length} jobs outside operating window`);
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

  if (fetchErr) {
    // Detailed error logging for auth/permission issues
    log.error("Failed to fetch pending jobs", {
      error: fetchErr.message,
      code: fetchErr.code,
      hint: fetchErr.hint,
      details: fetchErr.details,
    });
    if (fetchErr.message?.includes("Invalid API key") || fetchErr.code === "PGRST301") {
      throw new Error(`Supabase auth error fetching jobs: ${fetchErr.message}. Verify SUPABASE_SERVICE_ROLE_KEY is the service_role key (not anon key).`);
    }
    throw fetchErr;
  }

  if (!pendingJobs?.length) return { processed: 0 };

  // 4. Pre-load device credentials for all unique devices
  const uniqueDeviceIds = [...new Set(pendingJobs.map(j => j.device_id))];
  const deviceCredentials: Record<string, DeviceCredentials> = {};
  const invalidDevices = new Set<string>();

  // Batch-load all devices at once (like the Edge Function does)
  const { data: devicesArr, error: devErr } = await db
    .from("devices")
    .select("id, status, uazapi_token, uazapi_base_url, number")
    .in("id", uniqueDeviceIds);

  if (devErr) {
    log.error("Failed to batch-load devices", { error: devErr.message });
  }

  for (const dev of devicesArr || []) {
    deviceCredentials[dev.id] = {
      id: dev.id,
      status: dev.status || "unknown",
      uazapi_token: dev.uazapi_token || "",
      uazapi_base_url: (dev.uazapi_base_url || "").replace(/\/+$/, ""),
      number: dev.number || null,
    };
  }

  // Log diagnostic info
  const devicesWithToken = Object.values(deviceCredentials).filter(d => d.uazapi_token.length > 0);
  const devicesConnected = Object.values(deviceCredentials).filter(d => CONNECTED_STATUSES.includes(d.status));
  log.info(`Devices loaded: ${Object.keys(deviceCredentials).length}/${uniqueDeviceIds.length} found, ${devicesWithToken.length} with token, ${devicesConnected.length} connected`);

  // Log devices that weren't found
  const missingDevices = uniqueDeviceIds.filter(id => !deviceCredentials[id]);
  if (missingDevices.length > 0) {
    log.warn(`Devices NOT found in DB: ${missingDevices.join(", ")}`);
  }

  // 5. Group by device for sequential processing per device
  const jobsByDevice: Record<string, any[]> = {};
  for (const job of pendingJobs) {
    if (!jobsByDevice[job.device_id]) jobsByDevice[job.device_id] = [];
    jobsByDevice[job.device_id].push(job);
  }

  // 6. Process devices in parallel with semaphore
  let succeeded = 0;
  let failed = 0;

  const deviceIds = Object.keys(jobsByDevice);
  await Promise.allSettled(
    deviceIds.map(async (deviceId) => {
      await sem.acquire();
      try {
        const creds = deviceCredentials[deviceId];

        // Validate device credentials before processing any jobs
        if (!creds) {
          log.warn(`Skipping device ${deviceId}: not found in DB`);
          for (const job of jobsByDevice[deviceId]) {
            await db.from("warmup_jobs").update({
              status: "failed", last_error: "VPS: dispositivo não encontrado no banco",
            }).eq("id", job.id);
            failed++;
          }
          return;
        }

        if (!CONNECTED_STATUSES.includes(creds.status)) {
          log.warn(`Skipping device ${deviceId}: status="${creds.status}" (not connected)`);
          // Don't fail - just skip, the Edge Function will handle cycle pausing
        }

        if (!creds.uazapi_base_url) {
          log.warn(`Device ${deviceId}: no uazapi_base_url configured`);
        }

        if (!creds.uazapi_token) {
          log.warn(`Device ${deviceId}: no uazapi_token configured (number: ${creds.number || "?"})`);
        }

        for (const job of jobsByDevice[deviceId]) {
          try {
            // Mark as running
            await db.from("warmup_jobs").update({ status: "running" }).eq("id", job.id);

            // ── DELEGATE TO EDGE FUNCTION ──
            // The Edge Function handles all the complex logic (group interaction, autosave, community)
            // We pass the job_id so it processes only this specific job
            const edgeUrl = `${config.supabaseUrl}/functions/v1/warmup-tick`;
            const res = await fetch(edgeUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.supabaseAnonKey}`,
              },
              body: JSON.stringify({
                job_id: job.id,
                // Pass device credentials so the Edge Function doesn't need to re-fetch
                _vps_device: {
                  id: creds.id,
                  status: creds.status,
                  uazapi_token: creds.uazapi_token ? "***present***" : "",
                  uazapi_base_url: creds.uazapi_base_url ? "***present***" : "",
                },
              }),
            });

            if (res.ok) {
              succeeded++;
            } else {
              const text = await res.text();
              // Log the full error for debugging
              log.error(`Edge function error for job ${job.id}`, {
                deviceId,
                jobType: job.job_type,
                status: res.status,
                response: text.substring(0, 300),
                deviceStatus: creds.status,
                hasToken: !!creds.uazapi_token,
                hasBaseUrl: !!creds.uazapi_base_url,
                number: creds.number,
              });
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.supabaseAnonKey}` },
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.supabaseAnonKey}` },
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.supabaseAnonKey}` },
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

  // ── Validate DB connection with detailed diagnostics ──
  try {
    const db = getDb();

    // Test 1: Basic connectivity
    const { count, error: countErr } = await db.from("devices").select("id", { count: "exact", head: true });
    if (countErr) {
      log.error(`DB query error: ${countErr.message}`, {
        code: countErr.code,
        hint: countErr.hint,
        details: countErr.details,
      });
      if (countErr.message?.includes("Invalid API key")) {
        log.error("CRITICAL: The SUPABASE_SERVICE_ROLE_KEY appears to be invalid. Make sure you're using the service_role key (not the anon key). Find it in Supabase Dashboard > Settings > API.");
      }
      process.exit(1);
    }
    log.info(`DB connected. ${count || 0} total devices in database.`);

    // Test 2: Check warmup-eligible devices (running cycles)
    const { data: activeCycles, error: cycleErr } = await db.from("warmup_cycles")
      .select("id, device_id, user_id, phase, day_index, chip_state")
      .eq("is_running", true)
      .not("phase", "in", '("completed","paused","error")')
      .limit(10);

    if (cycleErr) {
      log.warn(`Failed to query warmup_cycles: ${cycleErr.message}`);
    } else {
      log.info(`Active warmup cycles: ${activeCycles?.length || 0}`);
      if (activeCycles?.length) {
        for (const cycle of activeCycles.slice(0, 3)) {
          const creds = await resolveDeviceCredentials(cycle.device_id);
          log.info(`  Cycle ${cycle.id.substring(0, 8)}: device=${cycle.device_id.substring(0, 8)}, phase=${cycle.phase}, day=${cycle.day_index}`, {
            deviceStatus: creds?.status || "NOT_FOUND",
            hasToken: !!creds?.uazapi_token,
            tokenLength: creds?.uazapi_token?.length || 0,
            hasBaseUrl: !!creds?.uazapi_base_url,
            baseUrl: creds?.uazapi_base_url ? creds.uazapi_base_url.substring(0, 30) + "..." : "MISSING",
            number: creds?.number || "?",
          });
        }
      }
    }

    // Test 3: Check pending warmup jobs
    const { count: jobCount } = await db.from("warmup_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lte("run_at", new Date().toISOString());
    log.info(`Pending warmup jobs ready to process: ${jobCount || 0}`);

    // Test 4: Verify Edge Function accessibility
    try {
      const testRes = await fetch(`${config.supabaseUrl}/functions/v1/warmup-tick`, {
        method: "OPTIONS",
      });
      log.info(`Edge Function warmup-tick reachable: ${testRes.status}`);
    } catch (err: any) {
      log.warn(`Edge Function warmup-tick not reachable: ${err.message}`);
    }

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
          log.info(`Warmup tick #${tickCount}: ${result.processed} jobs (${result.succeeded} ok, ${result.failed} fail, ${result.devices} devices)`);
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
