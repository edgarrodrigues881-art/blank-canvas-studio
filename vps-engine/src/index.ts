// ══════════════════════════════════════════════════════════
// VPS Engine — Entry point (Phase 2: Inline Processing)
// Serviço contínuo que roda na VPS com PM2
// ══════════════════════════════════════════════════════════

import express, { Request, Response } from "express";
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

app.get("/health", (_req: Request, res: Response) => {
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
  name: string | null;
  user_id: string | null;
  status: string;
  uazapi_token: string;
  uazapi_base_url: string;
  number: string | null;
  tokenSource: "device" | "user_api_tokens" | "missing";
  baseUrlSource: "device" | "env" | "missing";
  isConnected: boolean;
  hasValidCredentials: boolean;
  isEligible: boolean;
  eligibilityReason: string | null;
}

const CONNECTED_STATUSES = ["Ready", "Connected", "authenticated", "open", "active", "online"];

function cleanToken(value: unknown): string {
  return String(value || "").trim();
}

function cleanBaseUrl(value: unknown): string {
  return String(value || "").trim().replace(/\/+$/, "");
}

function formatDeviceLabel(device: { id?: string; name?: string | null; number?: string | null }): string {
  const id = device.id ? device.id.slice(0, 8) : "unknown";
  const name = device.name?.trim() || `device:${id}`;
  const number = device.number ? ` (${device.number})` : "";
  return `${name}${number}`;
}

function summarizeDevice(device: DeviceCredentials) {
  return {
    id: device.id,
    label: formatDeviceLabel(device),
    status: device.status,
    tokenSource: device.tokenSource,
    baseUrlSource: device.baseUrlSource,
    hasToken: !!device.uazapi_token,
    hasBaseUrl: !!device.uazapi_base_url,
    eligible: device.isEligible,
    eligibilityReason: device.eligibilityReason,
  };
}

function buildDeviceCredentials(device: any, tokenByDeviceId: Record<string, string>): DeviceCredentials {
  const directToken = cleanToken(device?.uazapi_token);
  const linkedToken = cleanToken(tokenByDeviceId[device?.id]);
  const resolvedToken = directToken || linkedToken;
  const directBaseUrl = cleanBaseUrl(device?.uazapi_base_url);
  const envBaseUrl = cleanBaseUrl(config.defaultUazapiBaseUrl);
  const resolvedBaseUrl = directBaseUrl || envBaseUrl;
  const status = String(device?.status || "unknown");
  const isConnected = CONNECTED_STATUSES.includes(status);
  const hasValidCredentials = !!(resolvedToken && resolvedBaseUrl);

  let eligibilityReason: string | null = null;
  if (!resolvedToken) eligibilityReason = "missing_token";
  else if (!resolvedBaseUrl) eligibilityReason = "missing_base_url";
  else if (!isConnected) eligibilityReason = `device_status:${status}`;

  return {
    id: device.id,
    name: device.name || null,
    user_id: device.user_id || null,
    status,
    uazapi_token: resolvedToken,
    uazapi_base_url: resolvedBaseUrl,
    number: device.number || null,
    tokenSource: directToken ? "device" : linkedToken ? "user_api_tokens" : "missing",
    baseUrlSource: directBaseUrl ? "device" : envBaseUrl ? "env" : "missing",
    isConnected,
    hasValidCredentials,
    isEligible: isConnected && hasValidCredentials,
    eligibilityReason,
  };
}

async function resolveDeviceCredentialsBatch(deviceIds: string[]): Promise<Record<string, DeviceCredentials>> {
  const ids = [...new Set(deviceIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const db = getDb();
  const [{ data: devicesArr, error: devicesError }, { data: tokenRows, error: tokenError }] = await Promise.all([
    db.from("devices").select("id, user_id, name, status, uazapi_token, uazapi_base_url, number").in("id", ids),
    db.from("user_api_tokens").select("device_id, token, status").in("device_id", ids).eq("status", "in_use"),
  ]);

  if (devicesError) {
    log.error("Failed to batch-load devices", { error: devicesError.message, code: devicesError.code, details: devicesError.details });
  }

  if (tokenError) {
    log.error("Failed to batch-load user_api_tokens", { error: tokenError.message, code: tokenError.code, details: tokenError.details });
  }

  const tokenByDeviceId: Record<string, string> = {};
  for (const row of tokenRows || []) {
    if (row.device_id && !tokenByDeviceId[row.device_id]) {
      tokenByDeviceId[row.device_id] = cleanToken(row.token);
    }
  }

  const resolved: Record<string, DeviceCredentials> = {};
  for (const device of devicesArr || []) {
    resolved[device.id] = buildDeviceCredentials(device, tokenByDeviceId);
  }

  return resolved;
}

async function resolveDeviceCredentials(deviceId: string): Promise<DeviceCredentials | null> {
  const devices = await resolveDeviceCredentialsBatch([deviceId]);
  const resolved = devices[deviceId] || null;
  if (!resolved) log.warn(`Device not found: ${deviceId}`);
  return resolved;
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
  const deviceCredentials = await resolveDeviceCredentialsBatch(uniqueDeviceIds);
  const resolvedDevices = Object.values(deviceCredentials);
  const missingDevices = uniqueDeviceIds.filter(id => !deviceCredentials[id]);
  const devicesWithToken = resolvedDevices.filter(d => !!d.uazapi_token);
  const devicesWithoutToken = resolvedDevices.filter(d => !d.uazapi_token);
  const devicesWithBaseUrl = resolvedDevices.filter(d => !!d.uazapi_base_url);
  const ineligibleDevices = resolvedDevices.filter(d => !d.isEligible);

  log.info("Warmup device eligibility summary", {
    requestedDevices: uniqueDeviceIds.length,
    foundDevices: resolvedDevices.length,
    missingDevices,
    eligibleDevices: resolvedDevices.filter(d => d.isEligible).length,
    connectedDevices: resolvedDevices.filter(d => d.isConnected).length,
    devicesWithToken: devicesWithToken.length,
    devicesWithoutToken: devicesWithoutToken.length,
    devicesWithBaseUrl: devicesWithBaseUrl.length,
    devicesWithoutBaseUrl: resolvedDevices.filter(d => !d.uazapi_base_url).length,
    tokenFromDevice: resolvedDevices.filter(d => d.tokenSource === "device").length,
    tokenFromUserApiTokens: resolvedDevices.filter(d => d.tokenSource === "user_api_tokens").length,
    baseUrlFromDevice: resolvedDevices.filter(d => d.baseUrlSource === "device").length,
    baseUrlFromEnv: resolvedDevices.filter(d => d.baseUrlSource === "env").length,
  });

  if (devicesWithToken.length > 0) {
    log.info("Devices with resolved token", {
      devices: devicesWithToken.map(summarizeDevice),
    });
  }

  if (devicesWithoutToken.length > 0 || ineligibleDevices.length > 0 || missingDevices.length > 0) {
    log.warn("Devices skipped or incomplete for warmup", {
      missingDevices,
      withoutToken: devicesWithoutToken.map(summarizeDevice),
      ineligibleDevices: ineligibleDevices.map(summarizeDevice),
    });
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

        if (!creds.hasValidCredentials) {
          log.warn(`Skipping device ${deviceId}: invalid UAZAPI credentials`, {
            label: formatDeviceLabel(creds),
            reason: creds.eligibilityReason,
            tokenSource: creds.tokenSource,
            baseUrlSource: creds.baseUrlSource,
          });
          for (const job of jobsByDevice[deviceId]) {
            await db.from("warmup_jobs").update({
              status: "failed",
              last_error: `VPS: credenciais UAZAPI ausentes (${creds.eligibilityReason || "unknown"})`,
            }).eq("id", job.id);
            failed++;
          }
          return;
        }

        if (!creds.isConnected) {
          log.warn(`Skipping device ${deviceId}: status="${creds.status}" (not connected)`);
          // Don't fail - just skip, the Edge Function will handle cycle pausing
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
                apikey: config.supabaseAnonKey,
                Authorization: `Bearer ${config.supabaseAnonKey}`,
              },
              body: JSON.stringify({
                job_id: job.id,
                _vps_device: {
                  id: creds.id,
                  name: creds.name,
                  status: creds.status,
                  number: creds.number,
                  uazapi_token: creds.uazapi_token,
                  uazapi_base_url: creds.uazapi_base_url,
                  token_source: creds.tokenSource,
                  base_url_source: creds.baseUrlSource,
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
                tokenSource: creds.tokenSource,
                baseUrlSource: creds.baseUrlSource,
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
    const [{ count, error: countErr }, { data: sampleDevices, error: sampleErr }] = await Promise.all([
      db.from("devices").select("id", { count: "exact", head: true }),
      db.from("devices").select("id, name, status, uazapi_token, uazapi_base_url").limit(5),
    ]);
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
    if (sampleErr) {
      log.warn(`Devices sample query failed: ${sampleErr.message}`);
    }

    const totalDevices = typeof count === "number" ? count : (sampleDevices?.length || 0);
    log.info("DB connected", {
      totalDevices,
      countSource: typeof count === "number" ? "exact_count" : "sample_fallback",
      sampleDevices: (sampleDevices || []).map((d: any) => ({
        id: d.id,
        label: d.name || d.id.slice(0, 8),
        status: d.status,
        hasToken: !!cleanToken(d.uazapi_token),
        hasBaseUrl: !!cleanBaseUrl(d.uazapi_base_url),
      })),
    });

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
        const activeCycleCredentials = await resolveDeviceCredentialsBatch(activeCycles.map((cycle) => cycle.device_id));
        log.info("Active warmup eligibility", {
          totalCycles: activeCycles.length,
          eligibleCycles: activeCycles.filter((cycle) => activeCycleCredentials[cycle.device_id]?.isEligible).length,
          withToken: activeCycles.filter((cycle) => !!activeCycleCredentials[cycle.device_id]?.uazapi_token).length,
          withoutToken: activeCycles.filter((cycle) => !activeCycleCredentials[cycle.device_id]?.uazapi_token).length,
        });

        for (const cycle of activeCycles.slice(0, 10)) {
          const creds = activeCycleCredentials[cycle.device_id] || null;
          log.info(`  Cycle ${cycle.id.substring(0, 8)}: device=${cycle.device_id.substring(0, 8)}, phase=${cycle.phase}, day=${cycle.day_index}`, {
            deviceStatus: creds?.status || "NOT_FOUND",
            hasToken: !!creds?.uazapi_token,
            tokenLength: creds?.uazapi_token?.length || 0,
            hasBaseUrl: !!creds?.uazapi_base_url,
            baseUrl: creds?.uazapi_base_url ? creds.uazapi_base_url.substring(0, 30) + "..." : "MISSING",
            number: creds?.number || "?",
            tokenSource: creds?.tokenSource || "missing",
            baseUrlSource: creds?.baseUrlSource || "missing",
            eligible: creds?.isEligible || false,
            eligibilityReason: creds?.eligibilityReason || null,
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
