// ══════════════════════════════════════════════════════════
// VPS Engine — WhatsApp Number Verify Worker
// Processes verify_jobs in background, survives page close
// Supports multi-device round-robin for parallel verification
// ══════════════════════════════════════════════════════════

import { getDb } from "../core/db";
import { createLogger } from "../core/logger";

const log = createLogger("verify");

const API_TIMEOUT_MS = 25_000;
const BATCH_SIZE = 10;
const DELAY_BETWEEN_BATCHES_MS = 800;
const CONNECTED_STATUSES = ["Ready", "Connected", "connected", "authenticated", "open", "active", "online"];

export let lastVerifyTickAt: Date | null = null;
const activeJobs = new Set<string>();

export function getVerifyStatus() {
  return { lastTick: lastVerifyTickAt, activeJobs: Array.from(activeJobs) };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchWithTimeout(url: string, opts: RequestInit, timeout = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface VerifyResult {
  phone: string;
  status: "success" | "no_whatsapp" | "error";
  detail: string;
}

interface DeviceInfo {
  id: string;
  uazapi_base_url: string;
  uazapi_token: string;
  status: string;
}

async function checkBatchNumbers(baseUrl: string, token: string, phones: string[]): Promise<VerifyResult[]> {
  const url = `${baseUrl}/chat/check`;
  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { token, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ numbers: phones }),
    });
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      return phones.map(phone => ({ phone, status: "error" as const, detail: "Token inválido" }));
    }
    if (!res.ok) {
      return phones.map(phone => ({ phone, status: "error" as const, detail: `HTTP ${res.status}` }));
    }
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* ignore */ }
    const items = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    const resultMap = new Map<string, any>();
    for (const item of items) {
      const query = String(item?.query || item?.phone || item?.number || "").replace(/\D/g, "");
      if (query) resultMap.set(query, item);
    }
    return phones.map(phone => {
      const item = resultMap.get(phone) || items.find((it: any) => {
        const q = String(it?.query || it?.phone || it?.number || "").replace(/\D/g, "");
        return q === phone;
      });
      if (!item) return { phone, status: "error" as const, detail: "Sem resposta da API" };
      if (item.isInWhatsapp === true) return { phone, status: "success" as const, detail: "Tem WhatsApp" };
      if (item.isInWhatsapp === false) return { phone, status: "no_whatsapp" as const, detail: "Sem WhatsApp" };
      if (item.jid && String(item.jid).includes("@s.whatsapp.net")) return { phone, status: "success" as const, detail: "Tem WhatsApp" };
      return { phone, status: "error" as const, detail: "Resposta inesperada" };
    });
  } catch (err: any) {
    const detail = err?.name === "AbortError" ? "Timeout" : "Erro de conexão";
    return phones.map(phone => ({ phone, status: "error" as const, detail }));
  }
}

async function loadDevices(db: any, deviceIds: string[]): Promise<DeviceInfo[]> {
  if (deviceIds.length === 0) return [];
  const { data } = await db
    .from("devices")
    .select("id, uazapi_base_url, uazapi_token, status")
    .in("id", deviceIds);
  return (data || []).filter((d: any) => d.uazapi_base_url && d.uazapi_token);
}

function getOnlineDevices(devices: DeviceInfo[]): DeviceInfo[] {
  return devices.filter(d => CONNECTED_STATUSES.includes(d.status));
}

async function processJob(jobId: string) {
  const db = getDb();
  activeJobs.add(jobId);

  try {
    const { data: job, error: jobErr } = await db
      .from("verify_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobErr || !job) {
      log.error(`Job ${jobId.slice(0, 8)} not found`);
      activeJobs.delete(jobId);
      return;
    }

    // Resolve device list: prefer device_ids array, fallback to single device_id
    let deviceIds: string[] = [];
    if (Array.isArray(job.device_ids) && job.device_ids.length > 0) {
      deviceIds = job.device_ids;
    } else if (job.device_id) {
      deviceIds = [job.device_id];
    }

    if (deviceIds.length === 0) {
      await db.from("verify_jobs").update({ status: "failed", last_error: "Nenhum dispositivo configurado", completed_at: new Date().toISOString() }).eq("id", jobId);
      activeJobs.delete(jobId);
      return;
    }

    // Load all devices
    let allDevices = await loadDevices(db, deviceIds);
    if (allDevices.length === 0) {
      await db.from("verify_jobs").update({ status: "failed", last_error: "Dispositivos sem credenciais", completed_at: new Date().toISOString() }).eq("id", jobId);
      activeJobs.delete(jobId);
      return;
    }

    // Check if at least one is online
    let onlineDevices = getOnlineDevices(allDevices);
    if (onlineDevices.length === 0) {
      await db.from("verify_jobs").update({ status: "paused", last_error: "Todos os dispositivos desconectados — pausado automaticamente" }).eq("id", jobId);
      log.info(`Job ${jobId.slice(0, 8)} auto-paused: all devices disconnected`);
      activeJobs.delete(jobId);
      return;
    }

    // Mark as running
    await db.from("verify_jobs").update({ status: "running", started_at: job.started_at || new Date().toISOString() }).eq("id", jobId);

    let successCount = job.success_count || 0;
    let noWaCount = job.no_whatsapp_count || 0;
    let errorCount = job.error_count || 0;
    let deviceIndex = 0; // round-robin index

    while (true) {
      // Re-check job status
      const { data: freshJob } = await db.from("verify_jobs").select("status, device_id, device_ids").eq("id", jobId).single();
      if (!freshJob || freshJob.status === "canceled") {
        log.info(`Job ${jobId.slice(0, 8)} canceled`);
        activeJobs.delete(jobId);
        return;
      }
      if (freshJob.status === "paused") {
        log.info(`Job ${jobId.slice(0, 8)} paused by user`);
        activeJobs.delete(jobId);
        return;
      }

      // Re-resolve device list (user may have changed devices mid-job)
      let currentDeviceIds: string[] = [];
      if (Array.isArray(freshJob.device_ids) && freshJob.device_ids.length > 0) {
        currentDeviceIds = freshJob.device_ids;
      } else if (freshJob.device_id) {
        currentDeviceIds = [freshJob.device_id];
      }

      // Reload device statuses periodically
      allDevices = await loadDevices(db, currentDeviceIds);
      onlineDevices = getOnlineDevices(allDevices);

      if (onlineDevices.length === 0) {
        await db.from("verify_jobs").update({ status: "paused", last_error: "Todos os dispositivos desconectados — pausado automaticamente" }).eq("id", jobId);
        log.info(`Job ${jobId.slice(0, 8)} auto-paused: all devices disconnected`);
        activeJobs.delete(jobId);
        return;
      }

      // Fetch next batch of pending results
      // With multiple devices, fetch BATCH_SIZE * onlineDevices.length to parallelize
      const fetchLimit = BATCH_SIZE * onlineDevices.length;
      const { data: pendingResults } = await db
        .from("verify_results")
        .select("id, phone")
        .eq("job_id", jobId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(fetchLimit);

      if (!pendingResults || pendingResults.length === 0) break;

      // Distribute batches across online devices via round-robin
      const batches: { device: DeviceInfo; results: typeof pendingResults }[] = [];
      for (let i = 0; i < pendingResults.length; i += BATCH_SIZE) {
        const chunk = pendingResults.slice(i, i + BATCH_SIZE);
        const device = onlineDevices[deviceIndex % onlineDevices.length];
        deviceIndex++;
        batches.push({ device, results: chunk });
      }

      // Process all batches IN PARALLEL — each device works simultaneously
      const batchPromises = batches.map(async (batch) => {
        const { device, results: batchResults } = batch;
        const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");
        const phones = batchResults.map(r => r.phone);
        const results = await checkBatchNumbers(baseUrl, device.uazapi_token, phones);
        const now = new Date().toISOString();

        let batchSuccess = 0, batchNoWa = 0, batchError = 0;
        const successIds: string[] = [];
        const noWaIds: string[] = [];
        const errorIds: string[] = [];
        const detailMap: Record<string, string> = {};

        for (const result of results) {
          const matchingRow = batchResults.find(r => r.phone === result.phone);
          if (!matchingRow) continue;
          detailMap[matchingRow.id] = result.detail;
          if (result.status === "success") { successIds.push(matchingRow.id); batchSuccess++; }
          else if (result.status === "no_whatsapp") { noWaIds.push(matchingRow.id); batchNoWa++; }
          else { errorIds.push(matchingRow.id); batchError++; }
        }

        // Bulk updates by status — much faster than individual updates
        const bulkOps: Promise<any>[] = [];
        if (successIds.length > 0) bulkOps.push(db.from("verify_results").update({ status: "success", detail: "Tem WhatsApp", checked_at: now }).in("id", successIds));
        if (noWaIds.length > 0) bulkOps.push(db.from("verify_results").update({ status: "no_whatsapp", detail: "Sem WhatsApp", checked_at: now }).in("id", noWaIds));
        if (errorIds.length > 0) bulkOps.push(db.from("verify_results").update({ status: "error", detail: "Erro", checked_at: now }).in("id", errorIds));
        await Promise.all(bulkOps);

        return { batchSuccess, batchNoWa, batchError };
      });

      const batchResults = await Promise.all(batchPromises);
      for (const r of batchResults) {
        successCount += r.batchSuccess;
        noWaCount += r.batchNoWa;
        errorCount += r.batchError;
      }

      // Update job counters
      await db.from("verify_jobs").update({
        verified_count: successCount + noWaCount + errorCount,
        success_count: successCount,
        no_whatsapp_count: noWaCount,
        error_count: errorCount,
      }).eq("id", jobId);
    }

    // Mark as completed
    await db.from("verify_jobs").update({
      status: "completed",
      verified_count: successCount + noWaCount + errorCount,
      success_count: successCount,
      no_whatsapp_count: noWaCount,
      error_count: errorCount,
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);

    log.info(`Job ${jobId.slice(0, 8)} completed: ${successCount} ok, ${noWaCount} no_wa, ${errorCount} err`);
  } catch (err: any) {
    log.error(`Job ${jobId.slice(0, 8)} error: ${err?.message}`);
    await db.from("verify_jobs").update({
      status: "failed",
      last_error: err?.message || "Erro interno",
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);
  } finally {
    activeJobs.delete(jobId);
  }
}

export async function verifyTick() {
  const db = getDb();

  const { data: jobs } = await db
    .from("verify_jobs")
    .select("id")
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: true })
    .limit(5);

  if (!jobs || jobs.length === 0) return;

  for (const job of jobs) {
    if (activeJobs.has(job.id)) continue;
    await processJob(job.id);
  }

  lastVerifyTickAt = new Date();
}
