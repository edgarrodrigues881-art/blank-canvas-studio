// sync-devices-cron v1.0 — Server-side periodic sync for ALL active users
// Triggered by pg_cron every 2 minutes, independent of browser sessions
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const jsonRes = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function fetchT(url: string, opts: RequestInit, ms: number): Promise<Response> {
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

async function runPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      try { await fn(items[i]); } catch { /* */ }
    }
  });
  await Promise.all(workers);
}

function fmtPhone(phone: string): string {
  const r = String(phone).replace(/\D/g, "");
  if (!r) return "";
  if (r.startsWith("55") && r.length === 13) return `+${r.slice(0, 2)} ${r.slice(2, 4)} ${r.slice(4, 9)}-${r.slice(9)}`;
  if (r.startsWith("55") && r.length === 12) return `+${r.slice(0, 2)} ${r.slice(2, 4)} ${r.slice(4, 8)}-${r.slice(8)}`;
  if (r.startsWith("55") && r.length >= 10) return `+${r.slice(0, 2)} ${r.slice(2, 4)} ${r.slice(4, r.length - 4)}-${r.slice(r.length - 4)}`;
  return `+${r}`;
}

function normalizeProviderConnectionState(payload: any): { state: "connected" | "disconnected" | "transitional" | "unknown"; rawStatus: string; owner: string } {
  const inst = payload?.instance || payload?.data || payload || {};

  const statusObj = payload?.status;
  if (statusObj && typeof statusObj === "object" && statusObj.connected === true) {
    const owner = [inst?.owner, inst?.phone, inst?.number, inst?.jid, inst?.wid, statusObj?.jid]
      .map((v) => typeof v === "string" ? v.replace(/@.*$/, "").split(":")[0].trim() : "")
      .find((v) => v.replace(/\D/g, "").length >= 10) || "";
    return { state: "connected", rawStatus: "connected", owner };
  }
  if (statusObj && typeof statusObj === "object" && statusObj.connected === false) {
    return { state: "disconnected", rawStatus: "disconnected", owner: "" };
  }

  const rawStatus = [
    inst?.connectionStatus, inst?.status, payload?.connectionStatus, payload?.state,
  ].find((value) => typeof value === "string" && value.trim())?.toLowerCase().trim() || "";

  const owner = [inst?.owner, inst?.phone, inst?.number, inst?.jid, inst?.wid, payload?.phone, payload?.owner, payload?.number, payload?.jid, payload?.wid]
    .map((v) => typeof v === "string" ? v.replace(/@.*$/, "").trim() : "")
    .find((v) => v.replace(/\D/g, "").length >= 10) || "";

  const textBlob = [payload?.message, payload?.error, payload?.msg, payload?.details, payload?.data?.message, payload?.data?.error, inst?.message, inst?.error]
    .filter((v) => typeof v === "string" && v.trim()).join(" ").toLowerCase();

  const canonicalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rawCanon = canonicalize(rawStatus);

  const matches = (signal: string) => {
    const cs = canonicalize(signal);
    if (!cs) return false;
    if (rawCanon === cs || rawCanon.startsWith(`${cs}_`) || rawCanon.endsWith(`_${cs}`) || rawCanon.includes(`_${cs}_`)) return true;
    const ts = signal.toLowerCase().replace(/[_-]+/g, " ").trim();
    if (!ts) return false;
    return new RegExp(`(?:^|\\W)${escapeRegex(ts)}(?:$|\\W)`, "i").test(textBlob);
  };

  const has = (signals: string[]) => signals.some(matches);
  if (has(["disconnected", "closed", "close", "offline", "logout", "logged_out", "loggedout", "not_connected"])) return { state: "disconnected", rawStatus, owner };
  if (has(["connected", "authenticated", "open", "ready", "active", "online"])) return { state: "connected", rawStatus, owner };
  if (has(["connecting", "pairing", "waiting", "initializing", "starting", "syncing", "qr", "qrcode", "pending"])) return { state: "transitional", rawStatus, owner };
  return { state: "unknown", rawStatus, owner };
}

async function confirmProviderConnectionState(baseUrl: string, token: string) {
  try {
    const res = await fetchT(`${baseUrl}/instance/status?t=${Date.now()}`, {
      method: "GET",
      headers: { token, Accept: "application/json", "Cache-Control": "no-cache", Pragma: "no-cache" },
    }, 3500);
    if (!res.ok) { await res.text(); return null; }
    return normalizeProviderConnectionState(await res.json());
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // Get all active users who have at least one device with API config
    const { data: activeUsers, error: usersError } = await svc
      .from("devices")
      .select("user_id")
      .not("uazapi_token", "is", null)
      .not("uazapi_base_url", "is", null);

    if (usersError) throw usersError;

    const uniqueUserIds = [...new Set((activeUsers || []).map((d: any) => d.user_id).filter(Boolean))];
    console.log(`[sync-devices-cron] Processing ${uniqueUserIds.length} users`);

    let totalDevices = 0;
    let totalStatusChanges = 0;

    // Process users in batches of 5 to avoid overwhelming the edge function
    for (let i = 0; i < uniqueUserIds.length; i += 5) {
      if (Date.now() - startTime > 50_000) {
        console.log(`[sync-devices-cron] Deadline approaching, processed ${i}/${uniqueUserIds.length} users`);
        break;
      }

      const batch = uniqueUserIds.slice(i, i + 5);

      await Promise.all(batch.map(async (userId) => {
        try {
          // Fetch devices for this user
          const { data: devices } = await svc
            .from("devices")
            .select("id, name, number, status, uazapi_token, uazapi_base_url, login_type, user_id, profile_name, updated_at")
            .eq("user_id", userId)
            .not("uazapi_token", "is", null)
            .not("uazapi_base_url", "is", null);

          if (!devices?.length) return;

          // Skip devices in Loading status
          const syncable = devices.filter((d: any) => {
            const st = String(d.status || "").toLowerCase().trim();
            return st !== "loading";
          });

          totalDevices += syncable.length;

          const dbUpdates: { id: string; patch: Record<string, any> }[] = [];
          const opLogs: any[] = [];
          const warmupPauses: string[] = [];
          const warmupResumes: string[] = [];

          // Check each device status with provider
          await runPool(syncable, 10, async (device: any) => {
            if (Date.now() - startTime > 48_000) return;

            const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");
            try {
              const res = await fetchT(`${baseUrl}/instance/status?t=${Date.now()}`, {
                method: "GET",
                headers: { token: device.uazapi_token, Accept: "application/json", "Cache-Control": "no-cache", Pragma: "no-cache" },
              }, 5000);

              if (!res.ok) {
                await res.text();
                return;
              }

              const data = await res.json();
              const state = normalizeProviderConnectionState(data);
              const previousStatus = String(device.status || "").toLowerCase().trim();
              const wasReady = previousStatus === "ready";
              const wasDisconnected = previousStatus === "disconnected";

              const isConnected = state.state === "connected";
              const isDisconnected = state.state === "disconnected";

              // Only act on clear status changes
              if (isDisconnected && wasReady) {
                // Double-check before marking disconnected
                const confirmed = await confirmProviderConnectionState(baseUrl, device.uazapi_token);
                if (!confirmed || confirmed.state !== "disconnected") return;

                // Individual strike system: need 3 strikes in 5 min
                const { data: recentStrikes } = await svc
                  .from("operation_logs")
                  .select("id, created_at")
                  .eq("device_id", device.id)
                  .eq("event", "cron_disconnect_strike")
                  .gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
                  .order("created_at", { ascending: true });

                const strikes = (recentStrikes?.length || 0) + 1;
                const firstStrikeTime = recentStrikes?.[0]?.created_at
                  ? new Date(recentStrikes[0].created_at).getTime()
                  : Date.now();
                const timeSpread = Date.now() - firstStrikeTime;

                opLogs.push({
                  user_id: userId,
                  device_id: device.id,
                  event: "cron_disconnect_strike",
                  details: `[cron] Desconexão detectada "${device.name}" (${strikes}/3, spread=${Math.round(timeSpread / 1000)}s)`,
                });

                if (strikes >= 3 && timeSpread >= 60_000) {
                  dbUpdates.push({
                    id: device.id,
                    patch: { status: "Disconnected", updated_at: new Date().toISOString() },
                  });
                  warmupPauses.push(device.id);
                  opLogs.push({
                    user_id: userId,
                    device_id: device.id,
                    event: "instance_disconnected",
                    details: `[cron] "${device.name}" confirmado desconectado após ${strikes} verificações`,
                    meta: { previous: device.status, source: "cron" },
                  });
                }
              } else if (isConnected && wasDisconnected) {
                const phone = state.owner ? fmtPhone(state.owner) : (device.number || "");
                dbUpdates.push({
                  id: device.id,
                  patch: { status: "Ready", number: phone || device.number, updated_at: new Date().toISOString() },
                });
                warmupResumes.push(device.id);
                opLogs.push({
                  user_id: userId,
                  device_id: device.id,
                  event: "instance_connected",
                  details: `[cron] "${device.name}" reconectou`,
                  meta: { previous: device.status, source: "cron" },
                });
              }
            } catch {
              // Network error — skip silently
            }
          });

          // Apply DB updates
          if (dbUpdates.length > 0) {
            totalStatusChanges += dbUpdates.length;
            await runPool(dbUpdates, 5, async (u) => {
              await svc.from("devices").update(u.patch).eq("id", u.id);
            });
          }

          // Flush logs
          if (opLogs.length > 0) {
            await svc.from("operation_logs").insert(opLogs);
          }

          // Handle warmup pauses
          for (const devId of warmupPauses) {
            const { data: cycles } = await svc.from("warmup_cycles").select("id, phase")
              .eq("device_id", devId).eq("is_running", true)
              .neq("phase", "completed").neq("phase", "paused");
            for (const c of (cycles || [])) {
              await svc.from("warmup_cycles").update({
                is_running: false, phase: "paused", previous_phase: c.phase,
                last_error: "Auto-pausado: instância desconectada",
              }).eq("id", c.id);
              await svc.from("warmup_jobs").update({ status: "cancelled" }).eq("cycle_id", c.id).eq("status", "pending");
            }
          }

          // Handle warmup resumes
          for (const devId of warmupResumes) {
            const { data: cycles } = await svc.from("warmup_cycles")
              .select("id, first_24h_ends_at, user_id, device_id, previous_phase, last_error, day_index, days_total")
              .eq("device_id", devId).eq("phase", "paused").eq("is_running", false);
            for (const c of (cycles || [])) {
              if (c.last_error !== "Auto-pausado: instância desconectada") continue;
              let phase = c.previous_phase || "groups_only";
              if (phase === "completed") continue;
              if (new Date() < new Date(c.first_24h_ends_at)) phase = "pre_24h";
              if (["error", "paused"].includes(phase)) phase = "groups_only";
              await svc.from("warmup_cycles").update({
                is_running: true, phase, previous_phase: null, last_error: null,
                next_run_at: null, daily_interaction_budget_target: 0,
              }).eq("id", c.id);
            }
          }

          // Send WhatsApp notifications for status changes
          if (dbUpdates.length > 0) {
            try {
              const { data: rwConfig } = await svc.from("report_wa_configs")
                .select("device_id, alert_disconnect, group_id, connection_status, toggle_instances, connection_group_id")
                .eq("user_id", userId).not("device_id", "is", null).maybeSingle();

              if (rwConfig?.device_id && (rwConfig.alert_disconnect || rwConfig.toggle_instances)) {
                const targetGroup = (rwConfig.connection_group_id || "").trim() || rwConfig.group_id;
                if (targetGroup && rwConfig.connection_status === "connected") {
                  const { data: rwDevice } = await svc.from("devices")
                    .select("uazapi_token, uazapi_base_url")
                    .eq("id", rwConfig.device_id).single();

                  if (rwDevice?.uazapi_token && rwDevice?.uazapi_base_url) {
                    const rwBase = rwDevice.uazapi_base_url.replace(/\/+$/, "");
                    const nowBRT = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

                    for (const u of dbUpdates) {
                      const dev = syncable.find((d: any) => d.id === u.id);
                      if (!dev || dev.login_type === "report_wa") continue;
                      const isConn = u.patch.status === "Ready";
                      const rPhone = dev.number ? fmtPhone(dev.number) : "N/A";
                      const msg = isConn
                        ? `✅ CONECTADA\n🔹 ${dev.name}\n📞 ${rPhone}\n🟢 Online ${nowBRT}`
                        : `⚠️ DESCONECTADA\n🖥 ${dev.name}\n📞 ${rPhone}\n❌ Offline ${nowBRT}`;

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
                    }
                  }
                }
              }
            } catch { /* notification optional */ }
          }
        } catch (err) {
          console.error(`[sync-devices-cron] Error for user ${userId}:`, err);
        }
      }));
    }

    const elapsed = Date.now() - startTime;
    console.log(`[sync-devices-cron] done: users=${uniqueUserIds.length} devices=${totalDevices} changes=${totalStatusChanges} elapsed=${elapsed}ms`);

    return jsonRes({
      success: true,
      users: uniqueUserIds.length,
      devices: totalDevices,
      statusChanges: totalStatusChanges,
      elapsedMs: elapsed,
    });
  } catch (error: unknown) {
    console.error("[sync-devices-cron] Fatal:", error);
    return jsonRes({ error: error instanceof Error ? error.message : "Unknown" }, 500);
  }
});
