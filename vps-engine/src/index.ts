// ══════════════════════════════════════════════════════════
// VPS Engine — Entry point (Phase 3: Inline Processing)
// Serviço contínuo que roda na VPS com PM2
// ══════════════════════════════════════════════════════════

import express, { Request, Response } from "express";
import { inspect } from "node:util";
import { config } from "./core/config";
import { getDb } from "./core/db";
import { createLogger } from "./core/logger";
import { DeviceLockManager } from "./core/device-lock-manager";
import { acquireGlobalSlot, releaseGlobalSlot, getGlobalConcurrencyStats } from "./core/global-semaphore";
import { workerMetrics } from "./core/worker-metrics";
import { getCircuitBreakerStats } from "./core/circuit-breaker";
import { isWithinOperatingWindow } from "./utils/brt";
import { massInjectTick, getMassInjectStatus, lastMassInjectTickAt } from "./workers/mass-inject-worker";
import { campaignWorkerTick, getCampaignWorkerStatus, lastCampaignWorkerTickAt } from "./workers/campaign-worker";
import { groupInteractionTick, lastGroupInteractionTickAt } from "./workers/group-interaction-worker";
import { chipConversationTick, lastChipConvTickAt } from "./workers/chip-conversation-worker";
import { groupJoinTick, lastGroupJoinTickAt } from "./workers/group-join-worker";
import { welcomeTick, lastWelcomeTickAt } from "./workers/welcome-worker";
import { verifyTick, lastVerifyTickAt } from "./workers/verify-worker";
import { communityTick as communityProcessorTick, lastCommunityTickAt } from "./community/community-processor";
import { autoreplyTick, lastAutoreplyTickAt } from "./autoreply/autoreply-processor";
import { scheduledMessagesTick, lastScheduledMsgTickAt } from "./workers/scheduled-messages-worker";
import { syncDevicesTick, lastSyncDevicesTickAt } from "./workers/sync-devices-worker";
import { backoffMinutes } from "./core/retry";
import { validateUazapiCredentials } from "./integrations/uazapi";
import { processJob, batchPreload, flushAuditLogs, ProcessJobContext } from "./warmup/warmup-processor";

const log = createLogger("main");

// ── Health check & status ──
const app = express();
const startedAt = new Date();
let lastTickAt: Date | null = null;
let lastCampaignTickAt: Date | null = null;
let tickCount = 0;
let tickErrors = 0;
const massInjectRunningRef = { value: true };

app.get("/health", (_req: Request, res: Response) => {
  const massInjectStatus = getMassInjectStatus();
  const campaignWorkerStatus = getCampaignWorkerStatus();
  res.json({
    status: "ok",
    uptime: Math.round((Date.now() - startedAt.getTime()) / 1000),
    lastTick: lastTickAt?.toISOString() || null,
    lastCampaignTick: lastCampaignTickAt?.toISOString() || null,
    lastMassInjectTick: lastMassInjectTickAt?.toISOString() || null,
    lastCampaignWorkerTick: lastCampaignWorkerTickAt?.toISOString() || null,
    lastGroupInteractionTick: lastGroupInteractionTickAt?.toISOString() || null,
    lastChipConvTick: lastChipConvTickAt?.toISOString() || null,
    lastGroupJoinTick: lastGroupJoinTickAt?.toISOString() || null,
    lastWelcomeTick: lastWelcomeTickAt?.toISOString() || null,
    lastVerifyTick: lastVerifyTickAt?.toISOString() || null,
    lastCommunityTick: lastCommunityTickAt?.toISOString() || null,
    lastAutoreplyTick: lastAutoreplyTickAt?.toISOString() || null,
    lastScheduledMsgTick: lastScheduledMsgTickAt?.toISOString() || null,
    lastSyncDevicesTick: lastSyncDevicesTickAt?.toISOString() || null,
    activeMassInjectCampaigns: massInjectStatus.activeCampaigns,
    activeCampaignWorker: campaignWorkerStatus.activeCampaigns,
    tickCount,
    tickErrors,
    concurrency: getGlobalConcurrencyStats(),
    workers: workerMetrics.getAllStats(),
    deviceLocks: {
      active: DeviceLockManager.getActiveLocks().length,
      byWorker: DeviceLockManager.getLocksByWorker(),
      details: DeviceLockManager.getActiveLocks().map(l => ({
        device: l.deviceId.slice(0, 8),
        worker: l.workerType,
        category: l.category,
        task: l.taskId.slice(0, 8),
        heldSeconds: Math.round((Date.now() - l.acquiredAt) / 1000),
      })),
    },
    withinWindow: isWithinOperatingWindow(),
    circuitBreakers: getCircuitBreakerStats(),
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
  tokenSource: "device" | "user_api_tokens" | "env" | "missing";
  baseUrlSource: "device" | "env" | "missing";
  isConnected: boolean;
  hasValidCredentials: boolean;
  isEligible: boolean;
  eligibilityReason: string | null;
  credentialValidationStatus: "valid" | "invalid" | "unknown";
  credentialValidationReason: string | null;
  credentialValidationHttpStatus: number | null;
}

const CONNECTED_STATUSES = ["Ready", "Connected", "connected", "authenticated", "open", "active", "online"];
const UAZAPI_VALIDATION_CACHE_TTL_MS = 5 * 60 * 1000;
const uazapiValidationCache = new Map<string, { expiresAt: number; status: "valid" | "invalid" | "unknown"; reason: string; httpStatus: number | null }>();

function serializeUnknownError(error: unknown) {
  if (error === null || error === undefined) {
    return {
      type: typeof error,
      message: "NO_ERROR_OBJECT",
      raw: String(error),
      keys: [],
    };
  }

  if (typeof error !== "object") {
    return {
      type: typeof error,
      message: String(error),
      raw: String(error),
      keys: [],
    };
  }

  const target = error as Record<string, any>;
  const ownKeys = Reflect.ownKeys(target).map((key) => String(key));
  const propertyNames = Object.getOwnPropertyNames(target);
  const keys = Array.from(new Set([...Object.keys(target), ...propertyNames, ...ownKeys]));
  const record: Record<string, any> = {
    type: target?.constructor?.name || "Object",
    keys,
    ownKeys,
    propertyNames,
  };

  for (const key of keys) {
    try {
      const value = target[key];
      if (typeof value === "bigint") record[key] = value.toString();
      else if (value instanceof Error) record[key] = serializeUnknownError(value);
      else record[key] = value;
    } catch (readErr: any) {
      record[key] = `[Unreadable:${readErr?.message || "unknown"}]`;
    }
  }

  const fallbackMessage = target.message || target.error_description || target.error || target.msg || "NO_MESSAGE";
  record.message = record.message || fallbackMessage;
  record.code = record.code || target.code || null;
  record.details = record.details || target.details || null;
  record.hint = record.hint || target.hint || null;
  record.status = record.status || target.status || target.statusCode || null;
  record.statusText = record.statusText || target.statusText || null;
  record.stack = record.stack || (new Error().stack ?? null);

  try {
    record.raw = JSON.stringify(target, keys);
  } catch {
    record.raw = String(target);
  }

  try {
    record.inspect = inspect(target, { depth: 8, showHidden: true, breakLength: 120 });
  } catch (inspectErr: any) {
    record.inspect = `[InspectFailed:${inspectErr?.message || "unknown"}]`;
  }

  return record;
}

function logQueryDiagnostics(stage: string, query: {
  schema?: string;
  table: string;
  columns: string;
  filters?: Record<string, unknown>;
  note?: string;
}, error?: unknown, extra?: Record<string, unknown>) {
  const serializedError = error ? serializeUnknownError(error) : null;

  log[serializedError ? "error" : "info"](stage, {
    schema: query.schema || "public",
    table: query.table,
    columns: query.columns,
    filters: query.filters || {},
    note: query.note || null,
    ...(extra || {}),
    ...(serializedError
      ? {
          errorType: serializedError.type,
          httpStatus: serializedError.status,
          statusText: serializedError.statusText,
          message: serializedError.message,
          details: serializedError.details,
          hint: serializedError.hint,
          code: serializedError.code,
          stack: serializedError.stack,
          rawError: serializedError.raw,
          errorKeys: serializedError.keys,
          errorOwnKeys: serializedError.ownKeys,
          errorPropertyNames: serializedError.propertyNames,
          errorInspect: serializedError.inspect,
        }
      : {}),
  });
}

async function runStartupStep<T>(
  db: ReturnType<typeof getDb>,
  stage: "startup_test_connection" | "startup_load_devices" | "startup_load_tokens" | "startup_load_cycles" | "startup_load_jobs",
  query: {
    schema?: string;
    table: string;
    columns: string;
    filters?: Record<string, unknown>;
    note?: string;
  },
  run: () => PromiseLike<{ data?: T | null; error?: unknown; count?: number | null }> | { data?: T | null; error?: unknown; count?: number | null },
) {
  try {
    logQueryDiagnostics(stage, query);
    const result = await run();

    if (result.error) {
      logQueryDiagnostics(stage, query, result.error);
      throw result.error;
    }

    logQueryDiagnostics(stage, query, undefined, {
      rows:
        Array.isArray(result.data)
          ? result.data.length
          : result.data === null || result.data === undefined
            ? 0
            : 1,
      count: typeof result.count === "number" ? result.count : null,
    });

    return result;
  } catch (error) {
    logQueryDiagnostics(stage, query, error);
    throw error;
  }
}

async function runDiagnosticSelect<T>(
  db: ReturnType<typeof getDb>,
  stage: string,
  query: {
    schema?: string;
    table: string;
    columns: string;
    filters?: Record<string, unknown>;
    note?: string;
  },
  run: () => PromiseLike<{ data: T | null; error: unknown }> | { data: T | null; error: unknown },
) {
  logQueryDiagnostics(stage, query);
  const result = await run();

  if (result.error) {
    logQueryDiagnostics(stage, query, result.error);
  } else {
    logQueryDiagnostics(stage, query, undefined, {
      rows:
        Array.isArray(result.data)
          ? result.data.length
          : result.data === null || result.data === undefined
            ? 0
            : 1,
    });
  }

  return result;
}

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
    credentialValidationStatus: device.credentialValidationStatus,
    credentialValidationReason: device.credentialValidationReason,
    credentialValidationHttpStatus: device.credentialValidationHttpStatus,
  };
}

function getValidationCacheKey(baseUrl: string, token: string) {
  return `${cleanBaseUrl(baseUrl)}::${cleanToken(token)}`;
}

async function getCachedCredentialValidation(baseUrl: string, token: string) {
  const key = getValidationCacheKey(baseUrl, token);
  const now = Date.now();
  const cached = uazapiValidationCache.get(key);

  if (cached && cached.expiresAt > now) {
    return cached;
  }

  const validation = await validateUazapiCredentials(baseUrl, token);
  const ttl = validation.status === "invalid" ? 2 * 60 * 1000 : UAZAPI_VALIDATION_CACHE_TTL_MS;
  const entry = {
    status: validation.status,
    reason: validation.reason,
    httpStatus: validation.httpStatus,
    expiresAt: now + ttl,
  };
  uazapiValidationCache.set(key, entry);
  return entry;
}

function buildDeviceCredentials(device: any, tokenByDeviceId: Record<string, string>): DeviceCredentials {
  const directToken = cleanToken(device?.uazapi_token);
  const linkedToken = cleanToken(tokenByDeviceId[device?.id]);
  const envToken = cleanToken(config.defaultUazapiToken);
  const resolvedToken = directToken || linkedToken || envToken;
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
    tokenSource: directToken ? "device" : linkedToken ? "user_api_tokens" : envToken ? "env" : "missing",
    baseUrlSource: directBaseUrl ? "device" : envBaseUrl ? "env" : "missing",
    isConnected,
    hasValidCredentials,
    isEligible: isConnected && hasValidCredentials,
    eligibilityReason,
    credentialValidationStatus: hasValidCredentials ? "unknown" : "invalid",
    credentialValidationReason: hasValidCredentials ? null : eligibilityReason,
    credentialValidationHttpStatus: null,
  };
}

async function resolveDeviceCredentialsBatch(deviceIds: string[]): Promise<Record<string, DeviceCredentials>> {
  const ids = [...new Set(deviceIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const db = getDb();
  const [{ data: devicesArr, error: devicesError }, { data: tokenRows, error: tokenError }] = await Promise.all([
    runDiagnosticSelect<any[]>(db, "diagnostic.devices.batch", {
      table: "devices",
      columns: "id, user_id, name, status, uazapi_token, uazapi_base_url, number",
      filters: { id_in_count: ids.length },
      note: "resolveDeviceCredentialsBatch",
    }, () => db.from("devices").select("id, user_id, name, status, uazapi_token, uazapi_base_url, number").in("id", ids)),
    runDiagnosticSelect<any[]>(db, "diagnostic.user_api_tokens.batch", {
      table: "user_api_tokens",
      columns: "device_id, token, status",
      filters: { device_id_in_count: ids.length, status: "in_use" },
      note: "resolveDeviceCredentialsBatch",
    }, () => db.from("user_api_tokens").select("device_id, token, status").in("device_id", ids).eq("status", "in_use")),
  ]);

  if (devicesError) {
    log.error("Failed to batch-load devices", serializeUnknownError(devicesError));
  }

  if (tokenError) {
    log.error("Failed to batch-load user_api_tokens", serializeUnknownError(tokenError));
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

  await Promise.all(Object.values(resolved).map(async (device) => {
    if (!device.hasValidCredentials) return;

    const validation = await getCachedCredentialValidation(device.uazapi_base_url, device.uazapi_token);
    device.credentialValidationStatus = validation.status;
    device.credentialValidationReason = validation.reason;
    device.credentialValidationHttpStatus = validation.httpStatus;

    if (validation.status === "invalid") {
      device.isEligible = false;
      device.eligibilityReason = validation.reason || "invalid_api_key";
    }
  }));

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
    const serializedStaleErr = serializeUnknownError(staleErr);
    logQueryDiagnostics("warmup.stale_jobs.recovery", {
      table: "warmup_jobs",
      columns: "status, last_error",
      filters: { status: "running", updated_at_lt: staleThreshold },
      note: "recover stale running jobs",
    }, staleErr);
    if (String(serializedStaleErr.raw).includes("Invalid API key") || String(serializedStaleErr.raw).includes("401") || serializedStaleErr.code === "PGRST301") {
      throw new Error(`Supabase auth error: ${serializedStaleErr.raw}. Check SUPABASE_SERVICE_ROLE_KEY in .env`);
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

  // 3. Fetch pending jobs — balanced across job types to prevent groups from starving autosave/community
  // Fetch each priority type separately, then merge & interleave
  const jobTypeBuckets = [
    { types: ["daily_reset"], limit: 200 },           // Highest priority — resets must happen first
    { types: ["autosave_interaction"], limit: 400 },   // Auto save needs guaranteed slots
    { types: ["community_interaction"], limit: 400 },  // Community needs guaranteed slots
    { types: ["group_interaction"], limit: 1000 },     // Groups get the largest share but capped
  ];

  const allJobs: any[] = [];
  for (const bucket of jobTypeBuckets) {
    const { data: bucketJobs, error: bucketErr } = await db.from("warmup_jobs")
      .select("id, user_id, device_id, cycle_id, job_type, payload, run_at, status, attempts, max_attempts")
      .eq("status", "pending")
      .lte("run_at", now)
      .in("job_type", bucket.types)
      .order("run_at", { ascending: true })
      .limit(bucket.limit);
    if (bucketErr) {
      log.warn(`Error fetching ${bucket.types.join(",")} jobs: ${bucketErr.message}`);
      continue;
    }
    if (bucketJobs?.length) allJobs.push(...bucketJobs);
  }

  // Sort merged results by run_at for fair ordering
  const pendingJobs = allJobs.sort((a, b) => new Date(a.run_at).getTime() - new Date(b.run_at).getTime());

  if (!pendingJobs?.length) return { processed: 0 };

  // Log job type distribution for observability
  const jobTypeCounts: Record<string, number> = {};
  for (const j of pendingJobs) { jobTypeCounts[j.job_type] = (jobTypeCounts[j.job_type] || 0) + 1; }
  log.info("Warmup job distribution", jobTypeCounts);

  // 4. Pre-load device credentials for all unique devices
  const uniqueDeviceIds = [...new Set(pendingJobs.map(j => j.device_id))];
  const deviceCredentials = await resolveDeviceCredentialsBatch(uniqueDeviceIds);
  const resolvedDevices = Object.values(deviceCredentials);
  const missingDevices = uniqueDeviceIds.filter(id => !deviceCredentials[id]);
  const devicesWithToken = resolvedDevices.filter(d => !!d.uazapi_token);
  const devicesWithoutToken = resolvedDevices.filter(d => !d.uazapi_token);
  const devicesWithBaseUrl = resolvedDevices.filter(d => !!d.uazapi_base_url);
  const ineligibleDevices = resolvedDevices.filter(d => !d.isEligible);
  const devicesWithValidatedToken = resolvedDevices.filter(d => d.credentialValidationStatus === "valid");
  const devicesWithInvalidToken = resolvedDevices.filter(d => d.credentialValidationStatus === "invalid");
  const devicesWithUnknownToken = resolvedDevices.filter(d => d.credentialValidationStatus === "unknown");

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
    validatedTokens: devicesWithValidatedToken.length,
    invalidTokens: devicesWithInvalidToken.length,
    unknownTokenState: devicesWithUnknownToken.length,
    tokenFromDevice: resolvedDevices.filter(d => d.tokenSource === "device").length,
    tokenFromUserApiTokens: resolvedDevices.filter(d => d.tokenSource === "user_api_tokens").length,
    tokenFromEnv: resolvedDevices.filter(d => d.tokenSource === "env").length,
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

  // 6. Pre-load all context data via batchPreload
  const preloaded = await batchPreload(getDb(), pendingJobs);

  // 7. Process devices in parallel with semaphore
  let succeeded = 0;
  let failed = 0;
  const globalAuditBuffer: any[] = [];
  const globalOpLogBuffer: any[] = [];

  const deviceIds = Object.keys(jobsByDevice);
  await Promise.allSettled(
    deviceIds.map(async (deviceId) => {
      const slotLabel = `warmup:${deviceId.slice(0, 8)}`;
      await acquireGlobalSlot(slotLabel);
      
      const warmupTaskId = `warmup_${deviceId}`;
      const lockAcquired = DeviceLockManager.tryAcquire(deviceId, "warmup", warmupTaskId);
      if (!lockAcquired) {
        const blockReason = DeviceLockManager.getBlockingReason(deviceId, "warmup");
        log.info(`Warmup: device ${deviceId.slice(0, 8)} blocked by: ${blockReason} — rescheduling ${jobsByDevice[deviceId].length} jobs`);
        for (const job of jobsByDevice[deviceId]) {
          const retryAt = new Date(Date.now() + 30_000).toISOString();
          await db.from("warmup_jobs").update({ status: "pending", run_at: retryAt, last_error: `Aguardando: ${blockReason}` }).eq("id", job.id);
        }
        releaseGlobalSlot(slotLabel);
        return;
      }
      
      try {
        const creds = deviceCredentials[deviceId];

        if (!creds) {
          log.warn(`Skipping device ${deviceId}: not found in DB`);
          for (const job of jobsByDevice[deviceId]) {
            await db.from("warmup_jobs").update({ status: "failed", last_error: "VPS: dispositivo não encontrado no banco" }).eq("id", job.id);
            failed++;
          }
          return;
        }

        if (!creds.hasValidCredentials) {
          log.warn(`Skipping device ${deviceId}: invalid UAZAPI credentials`, {
            label: formatDeviceLabel(creds), reason: creds.eligibilityReason,
            tokenSource: creds.tokenSource, baseUrlSource: creds.baseUrlSource,
          });
          for (const job of jobsByDevice[deviceId]) {
            await db.from("warmup_jobs").update({ status: "failed", last_error: `VPS: ${creds.eligibilityReason || "invalid_credentials"}` }).eq("id", job.id);
            failed++;
          }
          return;
        }

        if (!creds.isConnected) {
          log.warn(`Skipping device ${deviceId}: status="${creds.status}" (not connected)`);
        }

        for (const job of jobsByDevice[deviceId]) {
          try {
            await db.from("warmup_jobs").update({ status: "running" }).eq("id", job.id);

            // ── INLINE PROCESSING via processJob() ──
            const cycle = preloaded.cyclesMap[job.cycle_id];
            const device = preloaded.devicesMap[deviceId];
            const resolvedToken = creds.uazapi_token;
            const resolvedBaseUrl = creds.uazapi_base_url;

            const ctx: ProcessJobContext = {
              cycle,
              device,
              baseUrl: resolvedBaseUrl,
              token: resolvedToken,
              chipState: cycle?.chip_state || "new",
              subsMap: preloaded.subsMap,
              profilesMap: preloaded.profilesMap,
              tokenMap: preloaded.tokenMap,
              userMsgsMap: preloaded.userMsgsMap,
              autosaveMap: preloaded.autosaveMap,
              instanceGroupsMap: preloaded.instanceGroupsMap,
              groupsMap: preloaded.groupsMap,
              imagePool: preloaded.imagePool,
              audioPool: preloaded.audioPool,
              pausedCycles: new Set(),
              auditBuffer: [],
              opLogBuffer: [],
            };

            const ok = await processJob(db, job, ctx);

            // Collect audit logs
            globalAuditBuffer.push(...ctx.auditBuffer);
            globalOpLogBuffer.push(...ctx.opLogBuffer);

            if (ok) {
              await db.from("warmup_jobs").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", job.id);
              succeeded++;
            } else {
              // processJob returned false — job was already handled (cancelled/rescheduled)
              succeeded++;
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
        DeviceLockManager.release(deviceId, warmupTaskId);
        releaseGlobalSlot(slotLabel);
      }
    }),
  );

  // 8. Flush audit logs in batch
  if (globalAuditBuffer.length > 0 || globalOpLogBuffer.length > 0) {
    try {
      await flushAuditLogs(db, globalAuditBuffer, globalOpLogBuffer);
    } catch (err: any) {
      log.warn(`Failed to flush audit logs: ${err.message}`);
    }
  }

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
        headers: { "Content-Type": "application/json", apikey: config.supabaseAnonKey, Authorization: `Bearer ${config.supabaseAnonKey}` },
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
        headers: { "Content-Type": "application/json", apikey: config.supabaseAnonKey, Authorization: `Bearer ${config.supabaseAnonKey}` },
        body: JSON.stringify({ action: "continue", campaignId: campaign.id, deviceId: campaign.device_id || undefined }),
      });
      log.info(`Triggered scheduled campaign ${campaign.id}`);
    } catch (err: any) {
      log.error(`Failed to trigger campaign ${campaign.id}: ${err.message}`);
      await db.from("campaigns").update({ status: "scheduled", started_at: null }).eq("id", campaign.id).eq("status", "running");
    }
  }

  // 4. Group interaction ticks — now handled by dedicated groupInteractionTick worker
  // (removed Edge Function proxy — runs inline in VPS)
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

    // Test 0: Raw connectivity test with full error capture
    log.info("Testing DB connectivity...", {
      supabaseUrl: config.supabaseUrl,
      serviceKeyPrefix: config.supabaseServiceKey.substring(0, 20) + "...",
      serviceKeyLength: config.supabaseServiceKey.length,
    });

    const { count } = await runStartupStep<any[]>(db, "startup_test_connection", {
      table: "devices",
      columns: "id",
      filters: { count: "exact", head: true },
      note: "startup connectivity validation",
    }, () => db.from("devices").select("id", { count: "exact", head: true }));

    const { data: sampleDevices } = await runStartupStep<any[]>(db, "startup_load_devices", {
      table: "devices",
      columns: "id, name, status, uazapi_token, uazapi_base_url",
      filters: { limit: 5 },
      note: "startup minimal devices read",
    }, () => db.from("devices").select("id, name, status, uazapi_token, uazapi_base_url").limit(5));

    await runStartupStep<any[]>(db, "startup_load_tokens", {
      table: "user_api_tokens",
      columns: "device_id, token, status",
      filters: { status: "in_use", limit: 5 },
      note: "startup token source validation",
    }, () => db.from("user_api_tokens").select("device_id, token, status").eq("status", "in_use").limit(5));

    const { data: activeCycles } = await runStartupStep<any[]>(db, "startup_load_cycles", {
      table: "warmup_cycles",
      columns: "id, device_id, user_id, phase, day_index, chip_state",
      filters: { is_running: true, phase_not_in: ["completed", "paused", "error"], limit: 10 },
      note: "startup active cycles read",
    }, () => db.from("warmup_cycles")
      .select("id, device_id, user_id, phase, day_index, chip_state")
      .eq("is_running", true)
      .not("phase", "in", '("completed","paused","error")')
      .limit(10));

    const { count: jobCount } = await runStartupStep<any[]>(db, "startup_load_jobs", {
      table: "warmup_jobs",
      columns: "id",
      filters: { status: "pending", run_at_lte_now: true, count: "exact", head: true },
      note: "startup pending jobs count",
    }, () => db.from("warmup_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lte("run_at", new Date().toISOString()));

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

    log.info(`Pending warmup jobs ready to process: ${jobCount || 0}`);

    log.info("Phase 3: Inline warmup processing active (no Edge Function delegation)");

  } catch (err: any) {
    log.error("DB connection failed", serializeUnknownError(err));
    process.exit(1);
  }

  // ── Reentrancy guards ──
  // Although while/await already prevents overlap, these flags add
  // explicit defence-in-depth and visible log traces.
  const tickRunning = {
    warmup: false,
    campaign: false,
    massInject: false,
    campaignWorker: false,
    groupInteraction: false,
    chipConv: false,
    groupJoin: false,
    welcome: false,
    verify: false,
    community: false,
    autoreply: false,
    scheduledMsg: false,
    syncDevices: false,
  };

  function guardedLoop(
    name: keyof typeof tickRunning,
    fn: () => Promise<void>,
    intervalMs: number,
  ) {
    return async () => {
      while (isRunning) {
        if (tickRunning[name]) {
          log.warn(`⚠️ ${name} tick SKIPPED — previous still running`);
          workerMetrics.recordSkip(name);
        } else {
          tickRunning[name] = true;
          workerMetrics.setRunning(name, true);
          const t0 = Date.now();
          try {
            await fn();
            const elapsed = Date.now() - t0;
            workerMetrics.recordTick(name, elapsed);
            if (elapsed > 10_000) {
              log.info(`🐢 ${name} tick slow: ${(elapsed / 1000).toFixed(1)}s`);
            }
          } catch (err: any) {
            workerMetrics.recordTick(name, Date.now() - t0);
            workerMetrics.recordError(name);
            log.error(`${name} tick error`, serializeUnknownError(err));
          } finally {
            tickRunning[name] = false;
            workerMetrics.setRunning(name, false);
          }
        }
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    };
  }

  // Run all loops concurrently with reentrancy protection
  await Promise.all([
    guardedLoop("warmup", async () => {
      DeviceLockManager.cleanupStaleLocks(30 * 60_000);
      const result = await warmupTick();
      lastTickAt = new Date();
      tickCount++;
      if (result.processed > 0) {
        log.info(`Warmup tick #${tickCount}: ${result.processed} jobs (${result.succeeded} ok, ${result.failed} fail, ${result.devices} devices)`);
      }
    }, config.tickIntervalMs)(),

    guardedLoop("campaign", async () => {
      await campaignTick();
      lastCampaignTickAt = new Date();
    }, config.campaignTickMs)(),

    guardedLoop("massInject", async () => {
      await massInjectTick(massInjectRunningRef);
    }, 10_000)(),

    guardedLoop("campaignWorker", async () => {
      await campaignWorkerTick({ value: isRunning });
    }, 5_000)(),

    guardedLoop("groupInteraction", async () => {
      await groupInteractionTick();
    }, 20_000)(),

    guardedLoop("chipConv", async () => {
      await chipConversationTick();
    }, 30_000)(),

    guardedLoop("groupJoin", async () => {
      await groupJoinTick({ value: isRunning });
    }, 10_000)(),

    guardedLoop("welcome", async () => {
      await welcomeTick();
    }, 30_000)(),

    guardedLoop("verify", async () => {
      await verifyTick();
    }, 15_000)(),

    guardedLoop("community", async () => {
      const db = getDb();
      await communityProcessorTick(db);
    }, config.communityTickMs)(),

    guardedLoop("autoreply", async () => {
      const db = getDb();
      await autoreplyTick(db);
    }, 2_000)(),
  ]);
}

// Graceful shutdown
process.on("SIGTERM", () => { log.info("SIGTERM received, shutting down..."); isRunning = false; massInjectRunningRef.value = false; });
process.on("SIGINT", () => { log.info("SIGINT received, shutting down..."); isRunning = false; massInjectRunningRef.value = false; });

mainLoop().catch((err) => {
  log.error("Fatal error", serializeUnknownError(err));
  process.exit(1);
});
