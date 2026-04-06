// ══════════════════════════════════════════════════════════
// VPS Engine — Scheduled Messages Worker
// Processes pending scheduled messages (replaces Edge Function)
// ══════════════════════════════════════════════════════════

import { getDb } from "../core/db";
import { createLogger } from "../core/logger";

const log = createLogger("scheduled-msg");

export let lastScheduledMsgTickAt: Date | null = null;

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
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token, Accept: "application/json" },
        body: JSON.stringify(ep.body),
      });
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
      lastErr = e.message;
    }
  }
  return { ok: false, error: lastErr };
}

export async function scheduledMessagesTick() {
  const db = getDb();

  // Fetch pending messages where scheduled_at <= now
  const { data: pending, error } = await db
    .from("scheduled_messages")
    .select("*, devices!scheduled_messages_device_id_fkey(id, name, number, uazapi_base_url, uazapi_token, status)")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .limit(20);

  if (error) {
    log.error(`Error fetching scheduled messages: ${error.message}`);
    return;
  }

  if (!pending?.length) return;

  let sent = 0;
  let failed = 0;

  for (const msg of pending) {
    try {
      let device = msg.devices;

      // If no device or missing credentials, find first available for user
      if (!device?.uazapi_base_url || !device?.uazapi_token) {
        const { data: availableDevices } = await db
          .from("devices")
          .select("id, name, number, uazapi_base_url, uazapi_token, status")
          .eq("user_id", msg.user_id)
          .in("status", ["Ready", "Connected", "authenticated"])
          .not("uazapi_base_url", "is", null)
          .not("uazapi_token", "is", null)
          .neq("login_type", "report_wa")
          .limit(1);

        device = availableDevices?.[0];
      }

      if (!device?.uazapi_base_url || !device?.uazapi_token) {
        await db.from("scheduled_messages").update({
          status: "failed",
          error_message: "Nenhuma instância conectada disponível",
        }).eq("id", msg.id);
        failed++;
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
        }).eq("id", msg.id);
        sent++;
      } else {
        await db.from("scheduled_messages").update({
          status: "failed",
          error_message: (result.error || "Unknown").substring(0, 500),
        }).eq("id", msg.id);
        failed++;
      }
    } catch (e: any) {
      log.error(`Error processing scheduled message ${msg.id}: ${e.message}`);
      await db.from("scheduled_messages").update({
        status: "failed",
        error_message: e.message?.substring(0, 500),
      }).eq("id", msg.id);
      failed++;
    }
  }

  if (sent > 0 || failed > 0) {
    log.info(`Processed ${pending.length} scheduled messages: ${sent} sent, ${failed} failed`);
  }

  lastScheduledMsgTickAt = new Date();
}
