// ══════════════════════════════════════════════════════════
// VPS Engine — WhatsApp Number Verify Worker
// Processes verify_jobs in background, survives page close
// ══════════════════════════════════════════════════════════

import { getDb } from "../core/db";
import { createLogger } from "../core/logger";

const log = createLogger("verify");

const API_TIMEOUT_MS = 25_000;
const BATCH_SIZE = 5;
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

async function processJob(jobId: string) {
  const db = getDb();
  activeJobs.add(jobId);

  try {
    // Load job
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

    // Load device credentials
    const { data: device } = await db
      .from("devices")
      .select("id, uazapi_base_url, uazapi_token, status")
      .eq("id", job.device_id)
      .single();

    if (!device || !device.uazapi_base_url || !device.uazapi_token) {
      await db.from("verify_jobs").update({ status: "failed", last_error: "Dispositivo sem credenciais", completed_at: new Date().toISOString() }).eq("id", jobId);
      activeJobs.delete(jobId);
      return;
    }

    if (!CONNECTED_STATUSES.includes(device.status)) {
      await db.from("verify_jobs").update({ status: "failed", last_error: "Dispositivo desconectado", completed_at: new Date().toISOString() }).eq("id", jobId);
      activeJobs.delete(jobId);
      return;
    }

    let baseUrl = device.uazapi_base_url.replace(/\/+$/, "");
    let token = device.uazapi_token;

    // Mark as running
    await db.from("verify_jobs").update({ status: "running", started_at: new Date().toISOString() }).eq("id", jobId);

    // Get pending results in batches
    let processed = 0;
    let successCount = job.success_count || 0;
    let noWaCount = job.no_whatsapp_count || 0;
    let errorCount = job.error_count || 0;

    while (true) {
      // Re-check job status (user might have canceled or paused)
      const { data: freshJob } = await db.from("verify_jobs").select("status, device_id").eq("id", jobId).single();
      if (!freshJob || freshJob.status === "canceled") {
        log.info(`Job ${jobId.slice(0, 8)} canceled by user`);
        activeJobs.delete(jobId);
        return;
      }
      if (freshJob.status === "paused") {
        log.info(`Job ${jobId.slice(0, 8)} paused by user`);
        activeJobs.delete(jobId);
        return;
      }

      // Check if device was swapped mid-job
      if (freshJob.device_id !== device.id) {
        log.info(`Job ${jobId.slice(0, 8)} device swapped, reloading credentials`);
        const { data: newDevice } = await db.from("devices").select("id, uazapi_base_url, uazapi_token, status").eq("id", freshJob.device_id).single();
        if (!newDevice || !newDevice.uazapi_base_url || !newDevice.uazapi_token) {
          await db.from("verify_jobs").update({ status: "paused", last_error: "Nova instância sem credenciais" }).eq("id", jobId);
          activeJobs.delete(jobId);
          return;
        }
        if (!CONNECTED_STATUSES.includes(newDevice.status)) {
          await db.from("verify_jobs").update({ status: "paused", last_error: "Nova instância desconectada" }).eq("id", jobId);
          activeJobs.delete(jobId);
          return;
        }
        // Update local references
        (device as any).id = newDevice.id;
        (device as any).uazapi_base_url = newDevice.uazapi_base_url;
        (device as any).uazapi_token = newDevice.uazapi_token;
        (device as any).status = newDevice.status;
        baseUrl = newDevice.uazapi_base_url.replace(/\/+$/, "");
        token = newDevice.uazapi_token;
        log.info(`Job ${jobId.slice(0, 8)} now using device ${newDevice.id.slice(0, 8)}`);
      }

      // Fetch next batch of pending results
      const { data: pendingResults } = await db
        .from("verify_results")
        .select("id, phone")
        .eq("job_id", jobId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(BATCH_SIZE);

      if (!pendingResults || pendingResults.length === 0) break;

      const phones = pendingResults.map(r => r.phone);
      const results = await checkBatchNumbers(baseUrl, token, phones);
      const now = new Date().toISOString();

      // Update each result
      for (const result of results) {
        const matchingRow = pendingResults.find(r => r.phone === result.phone);
        if (!matchingRow) continue;

        await db.from("verify_results").update({
          status: result.status,
          detail: result.detail,
          checked_at: now,
        }).eq("id", matchingRow.id);

        if (result.status === "success") successCount++;
        else if (result.status === "no_whatsapp") noWaCount++;
        else errorCount++;
      }

      processed += results.length;

      // Update job counters
      await db.from("verify_jobs").update({
        verified_count: (job.verified_count || 0) + processed,
        success_count: successCount,
        no_whatsapp_count: noWaCount,
        error_count: errorCount,
      }).eq("id", jobId);

      // Delay between batches
      if (pendingResults.length === BATCH_SIZE) {
        await sleep(DELAY_BETWEEN_BATCHES_MS);
      }
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

  // Find jobs that need processing
  const { data: jobs } = await db
    .from("verify_jobs")
    .select("id")
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: true })
    .limit(5);

  if (!jobs || jobs.length === 0) return;

  // Process each job (skip if already active)
  for (const job of jobs) {
    if (activeJobs.has(job.id)) continue;
    await processJob(job.id);
  }

  lastVerifyTickAt = new Date();
}