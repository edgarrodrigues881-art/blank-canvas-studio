// ══════════════════════════════════════════════════════════
// VPS Engine — Sync Devices Worker
// Polls device status from UAZAPI and updates DB
// (replaces sync-devices-cron Edge Function)
// ══════════════════════════════════════════════════════════

import { getDb } from "../core/db";
import { createLogger } from "../core/logger";

const log = createLogger("sync-devices");

export let lastSyncDevicesTickAt: Date | null = null;

const CONNECTED_STATUSES = ["Ready", "Connected", "connected", "authenticated", "open", "active", "online"];
const DISCONNECTED_STATUSES = ["Disconnected", "disconnected", "close", "TIMEOUT"];

function fmtPhone(phone: string): string {
  const r = String(phone).replace(/\D/g, "");
  if (!r) return "";
  if (r.startsWith("55") && r.length === 13) return `+${r.slice(0, 2)} ${r.slice(2, 4)} ${r.slice(4, 9)}-${r.slice(9)}`;
  if (r.startsWith("55") && r.length === 12) return `+${r.slice(0, 2)} ${r.slice(2, 4)} ${r.slice(4, 8)}-${r.slice(8)}`;
  if (r.startsWith("55") && r.length >= 10) return `+${r.slice(0, 2)} ${r.slice(2, 4)} ${r.slice(4, r.length - 4)}-${r.slice(r.length - 4)}`;
  return `+${r}`;
}

async function fetchWithTimeout(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: c.signal });
    clearTimeout(t);
    return r;
  } catch (e: any) {
    clearTimeout(t);
    throw e;
  }
}

function normalizeProviderState(payload: any): { state: "connected" | "disconnected" | "transitional" | "unknown"; owner: string } {
  const inst = payload?.instance || payload?.data || payload || {};

  // Check status object (some providers)
  const statusObj = payload?.status;
  if (statusObj && typeof statusObj === "object" && statusObj.connected === true) {
    const owner = [inst?.owner, inst?.phone, inst?.number, inst?.jid, inst?.wid, statusObj?.jid]
      .map((v: any) => typeof v === "string" ? v.replace(/@.*$/, "").split(":")[0].trim() : "")
      .find((v: string) => v.replace(/\D/g, "").length >= 10) || "";
    return { state: "connected", owner };
  }
  if (statusObj && typeof statusObj === "object" && statusObj.connected === false) {
    return { state: "disconnected", owner: "" };
  }

  const rawStatus = [
    inst?.connectionStatus, inst?.status, payload?.connectionStatus, payload?.state,
  ].find((v: any) => typeof v === "string" && v.trim())?.toLowerCase().trim() || "";

  const owner = [inst?.owner, inst?.phone, inst?.number, inst?.jid, inst?.wid, payload?.phone, payload?.owner, payload?.number, payload?.jid, payload?.wid]
    .map((v: any) => typeof v === "string" ? v.replace(/@.*$/, "").trim() : "")
    .find((v: string) => v.replace(/\D/g, "").length >= 10) || "";

  const textBlob = [payload?.message, payload?.error, payload?.msg, payload?.details, payload?.data?.message, payload?.data?.error, inst?.message, inst?.error]
    .filter((v: any) => typeof v === "string" && v.trim()).join(" ").toLowerCase();

  const has = (signals: string[]) => signals.some(s => {
    const cs = s.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const rc = rawStatus.replace(/[^a-z0-9]+/g, "_");
    if (rc === cs || rc.includes(`_${cs}`) || rc.includes(`${cs}_`)) return true;
    return textBlob.includes(s.toLowerCase());
  });

  if (has(["disconnected", "closed", "close", "offline", "logout", "logged_out"])) return { state: "disconnected", owner };
  if (has(["connected", "authenticated", "open", "ready", "active", "online"])) return { state: "connected", owner };
  if (has(["connecting", "pairing", "waiting", "initializing", "qr"])) return { state: "transitional", owner };
  return { state: "unknown", owner };
}

export async function syncDevicesTick() {
  const db = getDb();
  const startTime = Date.now();

  // Get all devices with API config
  const { data: allDevices, error: devicesError } = await db
    .from("devices")
    .select("id, name, number, status, uazapi_token, uazapi_base_url, login_type, user_id, updated_at")
    .not("uazapi_token", "is", null)
    .not("uazapi_base_url", "is", null);

  if (devicesError) {
    log.error(`Error fetching devices: ${devicesError.message}`);
    return;
  }

  // Filter out Loading devices
  const syncable = (allDevices || []).filter(d => {
    const st = String(d.status || "").toLowerCase().trim();
    return st !== "loading";
  });

  if (!syncable.length) return;

  let statusChanges = 0;

  // Process devices in batches of 10 concurrently
  for (let i = 0; i < syncable.length; i += 10) {
    if (Date.now() - startTime > 90_000) {
      log.info(`Deadline approaching, processed ${i}/${syncable.length} devices`);
      break;
    }

    const batch = syncable.slice(i, i + 10);

    await Promise.allSettled(batch.map(async (device) => {
      const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");
      try {
        const res = await fetchWithTimeout(`${baseUrl}/instance/status?t=${Date.now()}`, {
          method: "GET",
          headers: { token: device.uazapi_token, Accept: "application/json", "Cache-Control": "no-cache" },
        }, 5000);

        if (!res.ok) { await res.text(); return; }

        const data = await res.json();
        const state = normalizeProviderState(data);
        const previousStatus = String(device.status || "").toLowerCase().trim();
        const wasReady = previousStatus === "ready";
        const wasDisconnected = previousStatus === "disconnected";

        if (state.state === "disconnected" && wasReady) {
          // Double-check
          try {
            const confirmRes = await fetchWithTimeout(`${baseUrl}/instance/status?t=${Date.now()}`, {
              method: "GET",
              headers: { token: device.uazapi_token, Accept: "application/json", "Cache-Control": "no-cache" },
            }, 3500);
            if (confirmRes.ok) {
              const confirmData = await confirmRes.json();
              const confirmState = normalizeProviderState(confirmData);
              if (confirmState.state !== "disconnected") return;
            }
          } catch { return; }

          // Strike system: instant — single confirmed double-check
          await db.from("operation_logs").insert({
            user_id: device.user_id,
            device_id: device.id,
            event: "cron_disconnect_strike",
            details: `[vps] Desconexão confirmada "${device.name}" (double-check passed)`,
          });

          {
            await db.from("devices").update({
              status: "Disconnected",
              updated_at: new Date().toISOString(),
            }).eq("id", device.id);

            statusChanges++;

            await db.from("operation_logs").insert({
              user_id: device.user_id,
              device_id: device.id,
              event: "instance_disconnected",
              details: `[vps] "${device.name}" confirmado desconectado após ${strikes} verificações (${Math.round(timeSpread / 1000)}s)`,
            });

            // Auto-pause warmup
            const { data: cycles } = await db.from("warmup_cycles").select("id, phase")
              .eq("device_id", device.id).eq("is_running", true)
              .neq("phase", "completed").neq("phase", "paused");

            for (const c of (cycles || [])) {
              await db.from("warmup_cycles").update({
                is_running: false, phase: "paused", previous_phase: c.phase,
                last_error: "Auto-pausado: instância desconectada",
              }).eq("id", c.id);
              await db.from("warmup_jobs").update({ status: "cancelled" }).eq("cycle_id", c.id).eq("status", "pending");
            }

            // Send WhatsApp notification
            await sendDisconnectNotification(db, device, false);
          }
        } else if (state.state === "connected" && wasDisconnected) {
          const phone = state.owner ? fmtPhone(state.owner) : (device.number || "");
          await db.from("devices").update({
            status: "Ready",
            number: phone || device.number,
            updated_at: new Date().toISOString(),
          }).eq("id", device.id);

          statusChanges++;

          await db.from("operation_logs").insert({
            user_id: device.user_id,
            device_id: device.id,
            event: "instance_connected",
            details: `[vps] "${device.name}" reconectou`,
          });

          // Auto-resume warmup
          const { data: cycles } = await db.from("warmup_cycles")
            .select("id, first_24h_ends_at, previous_phase, last_error, day_index, days_total")
            .eq("device_id", device.id).eq("phase", "paused").eq("is_running", false);

          for (const c of (cycles || [])) {
            if (c.last_error !== "Auto-pausado: instância desconectada") continue;
            let phase = c.previous_phase || "groups_only";
            if (phase === "completed") continue;
            if (new Date() < new Date(c.first_24h_ends_at)) phase = "pre_24h";
            if (["error", "paused"].includes(phase)) phase = "groups_only";
            await db.from("warmup_cycles").update({
              is_running: true, phase, previous_phase: null, last_error: null,
              next_run_at: null, daily_interaction_budget_target: 0,
            }).eq("id", c.id);
          }

          // Send WhatsApp notification
          await sendDisconnectNotification(db, device, true);
        }
      } catch {
        // Network error — skip silently
      }
    }));
  }

  const elapsed = Date.now() - startTime;
  if (statusChanges > 0) {
    log.info(`Sync complete: ${syncable.length} devices, ${statusChanges} changes, ${elapsed}ms`);
  }

  lastSyncDevicesTickAt = new Date();
}

async function sendDisconnectNotification(db: any, device: any, isConnected: boolean) {
  try {
    const { data: rwConfig } = await db.from("report_wa_configs")
      .select("device_id, alert_disconnect, group_id, connection_status, toggle_instances, connection_group_id")
      .eq("user_id", device.user_id).not("device_id", "is", null).maybeSingle();

    if (!rwConfig?.device_id || (!rwConfig.alert_disconnect && !rwConfig.toggle_instances)) return;

    const targetGroup = (rwConfig.connection_group_id || "").trim() || rwConfig.group_id;
    if (!targetGroup || rwConfig.connection_status !== "connected") return;

    const { data: rwDevice } = await db.from("devices")
      .select("uazapi_token, uazapi_base_url")
      .eq("id", rwConfig.device_id).single();

    if (!rwDevice?.uazapi_token || !rwDevice?.uazapi_base_url) return;

    const rwBase = rwDevice.uazapi_base_url.replace(/\/+$/, "");
    const nowBRT = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
    const rPhone = device.number ? fmtPhone(device.number) : "N/A";

    const msg = isConnected
      ? `✅ CONECTADA\n🔹 ${device.name}\n📞 ${rPhone}\n🟢 Online ${nowBRT}`
      : `⚠️ DESCONECTADA\n🖥 ${device.name}\n📞 ${rPhone}\n❌ Offline ${nowBRT}`;

    fetch(`${rwBase}/chat/send-text`, {
      method: "POST",
      headers: { token: rwDevice.uazapi_token, "Content-Type": "application/json" },
      body: JSON.stringify({ to: targetGroup, body: msg }),
    }).catch(() => {
      fetch(`${rwBase}/send/text`, {
        method: "POST",
        headers: { token: rwDevice.uazapi_token, "Content-Type": "application/json" },
        body: JSON.stringify({ number: targetGroup, text: msg }),
      }).catch(() => {});
    });
  } catch { /* notification optional */ }
}
