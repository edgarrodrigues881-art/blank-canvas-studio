// ══════════════════════════════════════════════════════════
// VPS Engine — Scheduled Messages Worker (v2)
// Robust processing with retry, backoff, concurrency-safe claiming
// ══════════════════════════════════════════════════════════

import { getDb } from "../core/db";
import { createLogger } from "../core/logger";

const log = createLogger("scheduled-msg");

export let lastScheduledMsgTickAt: Date | null = null;

// Retry backoff: attempt 1 → immediate, 2 → +1min, 3 → +5min
const RETRY_DELAYS_MS = [0, 60_000, 300_000];

function cleanPhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

async function sendTextMessage(
  baseUrl: string,
  token: string,
  phone: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const cleanNum = cleanPhone(phone);
  const endpoints = [
    { path: "/send/text", body: { number: cleanNum, text } },
    { path: "/chat/send-text", body: { number: cleanNum, to: cleanNum, body: text, text } },
    { path: "/message/sendText", body: { chatId: cleanNum, text } },
  ];

  let lastErr = "";
  for (const ep of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25_000);

      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token, Accept: "application/json" },
        body: JSON.stringify(ep.body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const raw = await res.text();
      if (res.ok) {
        try {
          const p = JSON.parse(raw);
          if (p?.error || p?.code === 404) { lastErr = raw; continue; }
        } catch { /* non-JSON is OK */ }
        return { ok: true };
      }
      if (res.status === 405) { lastErr = `405 @ ${ep.path}`; continue; }
      lastErr = `${res.status}: ${raw.substring(0, 200)}`;
    } catch (e: any) {
      lastErr = e.name === "AbortError" ? "Timeout (25s)" : e.message;
    }
  }
  return { ok: false, error: lastErr };
}

function isTransientError(error: string): boolean {
  const transient = ["502", "503", "504", "timeout", "Timeout", "ECONNRESET", "ECONNREFUSED", "AbortError", "fetch failed"];
  return transient.some(t => error.toLowerCase().includes(t.toLowerCase()));
}

async function resolveDevice(db: ReturnType<typeof getDb>, msg: any) {
  // Try the assigned device first
  if (msg.device_id) {
    const { data: device } = await db
      .from("devices")
      .select("id, name, number, uazapi_base_url, uazapi_token, status")
      .eq("id", msg.device_id)
      .in("status", ["Ready", "Connected", "authenticated"])
      .not("uazapi_base_url", "is", null)
      .not("uazapi_token", "is", null)
      .single();

    if (device) return device;
  }

  // Fallback: first available device for user
  const { data: devices } = await db
    .from("devices")
    .select("id, name, number, uazapi_base_url, uazapi_token, status")
    .eq("user_id", msg.user_id)
    .in("status", ["Ready", "Connected", "authenticated"])
    .not("uazapi_base_url", "is", null)
    .not("uazapi_token", "is", null)
    .neq("login_type", "report_wa")
    .limit(1);

  return devices?.[0] || null;
}

export async function scheduledMessagesTick() {
  const db = getDb();

  // Atomically claim pending messages (concurrency-safe)
  const { data: claimed, error } = await db.rpc("claim_scheduled_messages", { _limit: 20 });

  if (error) {
    log.error(`Error claiming scheduled messages: ${error.message}`);
    return;
  }

  if (!claimed?.length) return;

  let sent = 0;
  let failed = 0;
  let retried = 0;

  for (const msg of claimed) {
    const currentAttempt = (msg.attempts || 0) + 1;
    const maxAttempts = msg.max_attempts || 3;

    try {
      // Idempotency check
      if (msg.status === "sent" || msg.status === "cancelled") {
        continue;
      }

      const device = await resolveDevice(db, msg);

      if (!device) {
        // No device — schedule retry if attempts remain
        if (currentAttempt < maxAttempts) {
          const delayMs = RETRY_DELAYS_MS[Math.min(currentAttempt, RETRY_DELAYS_MS.length - 1)];
          await db.from("scheduled_messages").update({
            status: "retry",
            attempts: currentAttempt,
            next_retry_at: new Date(Date.now() + delayMs).toISOString(),
            error_message: "Nenhuma instância conectada disponível",
            updated_at: new Date().toISOString(),
          } as any).eq("id", msg.id);
          retried++;
        } else {
          await db.from("scheduled_messages").update({
            status: "failed",
            attempts: currentAttempt,
            error_message: "Nenhuma instância disponível após " + maxAttempts + " tentativas",
            updated_at: new Date().toISOString(),
          } as any).eq("id", msg.id);
          failed++;
        }
        continue;
      }

      const result = await sendTextMessage(
        device.uazapi_base_url,
        device.uazapi_token,
        msg.contact_phone,
        msg.message_content,
      );

      if (result.ok) {
        await db.from("scheduled_messages").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          device_id: device.id,
          error_message: null,
          attempts: currentAttempt,
          next_retry_at: null,
          updated_at: new Date().toISOString(),
        } as any).eq("id", msg.id);
        sent++;
      } else {
        const errMsg = (result.error || "Unknown").substring(0, 500);
        const canRetry = currentAttempt < maxAttempts && isTransientError(errMsg);

        if (canRetry) {
          const delayMs = RETRY_DELAYS_MS[Math.min(currentAttempt, RETRY_DELAYS_MS.length - 1)];
          await db.from("scheduled_messages").update({
            status: "retry",
            attempts: currentAttempt,
            next_retry_at: new Date(Date.now() + delayMs).toISOString(),
            error_message: errMsg,
            updated_at: new Date().toISOString(),
          } as any).eq("id", msg.id);
          retried++;
          log.warn(`Message ${msg.id} retry #${currentAttempt}: ${errMsg}`);
        } else {
          await db.from("scheduled_messages").update({
            status: "failed",
            attempts: currentAttempt,
            error_message: errMsg,
            next_retry_at: null,
            updated_at: new Date().toISOString(),
          } as any).eq("id", msg.id);
          failed++;
        }
      }
    } catch (e: any) {
      const errMsg = (e.message || "Unknown error").substring(0, 500);
      const canRetry = currentAttempt < maxAttempts;

      if (canRetry) {
        const delayMs = RETRY_DELAYS_MS[Math.min(currentAttempt, RETRY_DELAYS_MS.length - 1)];
        await db.from("scheduled_messages").update({
          status: "retry",
          attempts: currentAttempt,
          next_retry_at: new Date(Date.now() + delayMs).toISOString(),
          error_message: errMsg,
          updated_at: new Date().toISOString(),
        } as any).eq("id", msg.id);
        retried++;
      } else {
        await db.from("scheduled_messages").update({
          status: "failed",
          attempts: currentAttempt,
          error_message: errMsg,
          next_retry_at: null,
          updated_at: new Date().toISOString(),
        } as any).eq("id", msg.id);
        failed++;
      }
      log.error(`Error processing scheduled message ${msg.id}: ${errMsg}`);
    }
  }

  if (sent > 0 || failed > 0 || retried > 0) {
    log.info(`Processed ${claimed.length} scheduled messages: ${sent} sent, ${failed} failed, ${retried} retrying`);
  }

  lastScheduledMsgTickAt = new Date();
}
