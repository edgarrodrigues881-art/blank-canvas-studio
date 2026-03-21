// sync-devices v7.0 — sharding support for 10k+ instances + persistent profile pics + circuit breaker
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonRes = (data: any, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SYNC_DEVICES_DISABLED = true;

async function fetchT(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { ...opts, signal: c.signal }); clearTimeout(t); return r; }
  catch (e) { clearTimeout(t); throw e; }
}

async function runPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) { const i = idx++; try { await fn(items[i]); } catch { /* */ } }
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

function parseProfileSnapshot(payload: any): { pic: string | null | undefined; name: string | undefined } {
  const picCandidates = [
    payload?.profilePictureUrl,
    payload?.profilePicUrl,
    payload?.profilePicture,
    payload?.picture,
    payload?.pictureUrl,
    payload?.imgUrl,
    payload?.image,
    payload?.data?.profilePictureUrl,
    payload?.data?.profilePicUrl,
    payload?.data?.profilePicture,
    payload?.data?.picture,
    payload?.data?.pictureUrl,
    payload?.data?.imgUrl,
    payload?.data?.image,
    payload?.instance?.profilePictureUrl,
    payload?.instance?.profilePicUrl,
    payload?.instance?.profilePicture,
    payload?.instance?.picture,
    payload?.instance?.imgUrl,
    payload?.instance?.image,
    payload?.profile?.profilePictureUrl,
    payload?.profile?.profilePicUrl,
    payload?.profile?.picture,
    payload?.profile?.pictureUrl,
    payload?.profile?.image,
  ];

  const nameCandidates = [
    payload?.profileName,
    payload?.pushname,
    payload?.name,
    payload?.data?.profileName,
    payload?.data?.pushname,
    payload?.data?.name,
    payload?.instance?.profileName,
    payload?.instance?.pushname,
    payload?.instance?.name,
    payload?.profile?.name,
  ];

  for (const p of picCandidates) {
    if (typeof p === "string" && p.trim()) return { pic: p.trim(), name: nameCandidates.find((n: any) => typeof n === "string" && n.trim())?.trim() };
  }

  const noPicMessage = [payload?.message, payload?.error, payload?.data?.message, payload?.data?.error]
    .filter((v) => typeof v === "string")
    .join(" ")
    .toLowerCase();
  const hasNoPicSignal = picCandidates.some((v) => v === null || v === "")
    || noPicMessage.includes("no profile")
    || noPicMessage.includes("sem foto")
    || noPicMessage.includes("not found");

  return {
    pic: hasNoPicSignal ? null : undefined,
    name: nameCandidates.find((n: any) => typeof n === "string" && n.trim())?.trim(),
  };
}

/**
 * Downloads a WhatsApp profile picture and uploads it to Supabase Storage.
 * Returns the public URL, or null if download/upload fails.
 */
async function persistProfilePic(
  svc: any,
  deviceId: string,
  whatsappUrl: string,
): Promise<string | null> {
  try {
    const res = await fetchT(whatsappUrl, { method: "GET" }, 6000);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size < 100) return null; // too small, likely error page
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : "jpg";
    const path = `profile-pictures/${deviceId}.${ext}`;
    const { error } = await svc.storage.from("avatars").upload(path, blob, {
      contentType,
      upsert: true,
      cacheControl: "3600",
    });
    if (error) return null;
    const { data: urlData } = svc.storage.from("avatars").getPublicUrl(path);
    // Append timestamp to bust cache on updates
    return urlData?.publicUrl ? `${urlData.publicUrl}?v=${Date.now()}` : null;
  } catch {
    return null;
  }
}

async function fetchFreshProfilePic(baseUrl: string, token: string, ownerRaw: string, numberRaw?: string): Promise<string | null | undefined> {
  const owner = (ownerRaw || "").toString().trim();
  const number = (numberRaw || "").toString().trim();
  const ownerDigits = owner.replace(/\D/g, "");
  const numberDigits = number.replace(/\D/g, "");
  const bestDigits = ownerDigits || numberDigits;
  const jid = bestDigits ? `${bestDigits}@s.whatsapp.net` : "";
  const candidates = Array.from(new Set([owner, number, bestDigits, jid].filter(Boolean)));

  const headers: HeadersInit = {
    token,
    Accept: "application/json",
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };

  let gotSuccessfulResponse = false;

  // 1) Own profile endpoints (no phone required)
  for (const path of ["/profile", "/profile/image", "/profile/picture", "/instance/profile"]) {
    try {
      const res = await fetchT(`${baseUrl}${path}?t=${Date.now()}`, { method: "GET", headers }, 3000);
      if (!res.ok) { await res.text(); continue; }
      const data = await res.json();
      gotSuccessfulResponse = true;
      const snap = parseProfileSnapshot(data);
      if (snap.pic !== undefined) return snap.pic;
    } catch {
      // keep trying
    }
  }

  // 2) Chat lookup endpoints (requires number/JID)
  if (candidates.length > 0) {
    const endpoints = [
      { path: "/chat/fetchProfilePictureUrl", mkBody: (n: string) => ({ number: n }) },
      { path: "/chat/fetchProfilePictureUrl", mkBody: (n: string) => ({ jid: n }) },
      { path: "/chat/fetchProfilePicUrl", mkBody: (n: string) => ({ number: n }) },
      { path: "/chat/fetchProfilePicUrl", mkBody: (n: string) => ({ remoteJid: n }) },
    ];

    for (const ep of endpoints) {
      for (const value of candidates) {
        try {
          const res = await fetchT(`${baseUrl}${ep.path}?t=${Date.now()}`, {
            method: "POST",
            headers,
            body: JSON.stringify(ep.mkBody(value)),
          }, 3500);
          if (!res.ok) { await res.text(); continue; }
          const data = await res.json();
          gotSuccessfulResponse = true;
          const snap = parseProfileSnapshot(data);
          if (snap.pic !== undefined) return snap.pic;
        } catch {
          // keep trying fallbacks
        }
      }
    }
  }

  // If we got successful responses from the provider but NO photo was found,
  // that means the user truly has no profile picture → return null (explicit removal)
  if (gotSuccessfulResponse) return null;

  return undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (SYNC_DEVICES_DISABLED) {
    console.log("[sync-devices] temporarily disabled for stability diagnostics");
    return jsonRes({ disabled: true, reason: "temporarily_disabled_for_stability" });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonRes({ error: "Unauthorized" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return jsonRes({ error: "Unauthorized" }, 401);

    const userId = user.id;
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── Shard support: split large device sets across multiple invocations ──
    let body: any = {};
    try { body = await req.json(); } catch { /* empty body ok */ }
    const shardIndex = body.shard ?? 0;     // 0-based shard index
    const shardTotal = body.shards ?? 1;    // total number of shards

    // ── Fetch all devices with pagination ──
    let devices: any[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await svc.from("devices")
        .select("id, name, number, status, uazapi_token, uazapi_base_url, proxy_id, instance_type, login_type, user_id, profile_name, profile_picture, updated_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data?.length) break;
      devices = devices.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    // Apply sharding: each shard processes a slice of devices
    if (shardTotal > 1) {
      const chunkSize = Math.ceil(devices.length / shardTotal);
      const start = shardIndex * chunkSize;
      devices = devices.slice(start, start + chunkSize);
    }

    const syncable = devices.filter(d => d.uazapi_token && d.uazapi_base_url);
    const skipped = devices.length - syncable.length;

    const deadline = Date.now() + 25_000;

    // ── Collect results per device ──
    interface SyncResult {
      device: any;
      httpStatus: number | null; // null = timeout/network error
      apiData?: any;
    }
    const results: SyncResult[] = [];

    // ── Phase 1: Fetch ALL statuses + profile data (no DB writes yet) ──
    // Reduced concurrency from 60→15 to prevent DB overload
    await runPool(syncable, 15, async (device) => {
      if (Date.now() > deadline) { results.push({ device, httpStatus: null }); return; }
      const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");
      const headers = { token: device.uazapi_token, Accept: "application/json" };
      try {
        const noCacheHeaders = { ...headers, "Cache-Control": "no-cache", Pragma: "no-cache" };
        const res = await fetchT(`${baseUrl}/instance/status?t=${Date.now()}`, {
          method: "GET", headers: noCacheHeaders,
        }, 5000);

        if (res.ok) {
          const data = await res.json();

          // Try to fetch fresh profile snapshot from dedicated endpoint
          try {
            const profileRes = await fetchT(`${baseUrl}/profile?t=${Date.now()}`, { method: "GET", headers: noCacheHeaders }, 4000);
            if (profileRes.ok) {
              const profileData = await profileRes.json();
              const snap = parseProfileSnapshot(profileData);
              if (typeof snap.pic === "string") {
                data.profilePicUrl = snap.pic;
                data.profilePicture = snap.pic;
              } else if (snap.pic === null) {
                // Explicit no-photo signal from provider
                data.profilePicUrl = null;
                data.profilePicture = null;
              }
              if (snap.name) {
                data.pushname = snap.name;
                data.profileName = snap.name;
              }
            } else { await profileRes.text(); }
          } catch { /* profile fetch optional */ }

          results.push({ device, httpStatus: 200, apiData: data });
        } else {
          await res.text(); // drain
          results.push({ device, httpStatus: res.status });
        }
      } catch {
        results.push({ device, httpStatus: null });
      }
    });

    // ── CIRCUIT BREAKER: if ≥40% of syncable devices return 404, it's a provider outage ──
    const total404 = results.filter(r => r.httpStatus === 404).length;
    const totalResponded = results.filter(r => r.httpStatus !== null).length;
    const circuitOpen = totalResponded >= 3 && (total404 / totalResponded) >= 0.4;

    const dbUpdates: { id: string; patch: Record<string, any> }[] = [];
    const opLogs: any[] = [];
    const warmupPauses: string[] = [];
    const warmupResumes: string[] = [];
    let synced = 0;
    let timeouts = 0;
    let errors = 0;

    // Limit expensive deep profile checks per run to protect high-concurrency scenarios
    let deepProfileChecks = 0;
    const MAX_DEEP_PROFILE_CHECKS = Math.min(10, Math.max(5, Math.ceil(syncable.length * 0.1)));

    if (circuitOpen) {
      // Log the provider outage but DON'T disconnect anything
      opLogs.push({
        user_id: userId,
        device_id: syncable[0]?.id || null,
        event: "sync_circuit_breaker",
        details: `Provedor instável: ${total404}/${totalResponded} retornaram 404 — sync ignorado para proteger instâncias`,
        meta: { total_404: total404, total_responded: totalResponded, total_syncable: syncable.length },
      });
      synced = totalResponded;
    }

    // ── Pre-fetch notification config once ──
    let rwConfig: any = null;
    let rwDevice: any = null;
    try {
      const { data } = await svc.from("report_wa_configs")
        .select("device_id, alert_disconnect, group_id, connection_status, toggle_instances, connection_group_id")
        .eq("user_id", userId).not("device_id", "is", null).maybeSingle();
      rwConfig = data;
      if (rwConfig?.device_id) {
        const { data: rd } = await svc.from("devices")
          .select("uazapi_token, uazapi_base_url")
          .eq("id", rwConfig.device_id).single();
        rwDevice = rd;
      }
    } catch { /* */ }

    const alertEnabled = rwConfig?.alert_disconnect || rwConfig?.toggle_instances;
    const targetGroup = (rwConfig?.connection_group_id || "").trim() || rwConfig?.group_id;
    const canNotify = alertEnabled && targetGroup && rwConfig?.connection_status === "connected"
      && rwDevice?.uazapi_token && rwDevice?.uazapi_base_url;

    // ── Phase 2: Process results (only if circuit is closed) ──
    if (!circuitOpen) {
      for (const r of results) {
        const device = r.device;

        // Timeout/network error — preserve status
        if (r.httpStatus === null) {
          timeouts++;
          continue;
        }

        // ── 401: token invalid ──
        if (r.httpStatus === 401) {
          dbUpdates.push({ id: device.id, patch: { status: "Disconnected", uazapi_token: null, uazapi_base_url: null, proxy_id: null } });
          svc.from("user_api_tokens").update({ status: "invalid", device_id: null, assigned_at: null }).eq("device_id", device.id).then(() => {});
          if (device.proxy_id) svc.from("proxies").update({ status: "USADA" }).eq("id", device.proxy_id).then(() => {});
          opLogs.push({ user_id: userId, device_id: device.id, event: "uazapi_error", details: `Token inválido (401) "${device.name}"` });
          synced++;
          continue;
        }

        // ── 404: strike system (5 strikes in 30 min window) ──
        if (r.httpStatus === 404) {
          const { data: recent404s } = await svc.from("operation_logs").select("id")
            .eq("device_id", device.id).eq("event", "sync_404_strike")
            .gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString());

          const strikes = (recent404s?.length || 0) + 1;
          opLogs.push({ user_id: userId, device_id: device.id, event: "sync_404_strike", details: `"${device.name}" 404 (${strikes}/5)`, meta: { strike: strikes } });

          if (strikes >= 5) {
            // Only after 5 consecutive 404s in 30 min, actually release
            dbUpdates.push({ id: device.id, patch: { status: "Disconnected", uazapi_token: null, uazapi_base_url: null, proxy_id: null } });
            svc.from("user_api_tokens").update({ status: "available", device_id: null, assigned_at: null, healthy: false }).eq("device_id", device.id).then(() => {});
            if (device.proxy_id) svc.from("proxies").update({ status: "USADA" }).eq("id", device.proxy_id).then(() => {});
            warmupPauses.push(device.id);
            opLogs.push({ user_id: userId, device_id: device.id, event: "instance_not_found", details: `"${device.name}" confirmado ausente após 5 strikes — token liberado` });
          }
          // Don't change status on early strikes — keep current status
          synced++;
          continue;
        }

        // ── Other errors ──
        if (!r.apiData) { errors++; synced++; continue; }

        // ── Parse status ──
        const data = r.apiData;
        const inst = data.instance || data || {};
        const state = inst.status || data.state;
        const isConnected = state === "connected" || state === "authenticated";
        const phone = inst.owner || inst.phone || data.phone || "";

        const newStatus = isConnected ? "Ready" : "Disconnected";
        const newPhone = isConnected && phone ? fmtPhone(phone) : (device.number || "");

        // ── Profile picture sync logic (tri-state to avoid accidental wipes) ──
        const picCandidates = [
          inst.profilePicUrl,
          inst.profilePicture,
          data.profilePicUrl,
          data.profilePicture,
        ];

        let providerPic: string | null | undefined = undefined;
        for (const candidate of picCandidates) {
          if (candidate === null) {
            providerPic = null;
            break;
          }
          if (typeof candidate === "string") {
            const trimmed = candidate.trim();
            if (trimmed) {
              providerPic = trimmed;
              break;
            }
            // Explicit empty string means provider explicitly says "no photo"
            providerPic = null;
            break;
          }
        }

        const providerNameRaw = (inst.profileName || inst.pushname || data.profileName || data.pushname || "").toString().trim();

        const currentPic = device.profile_picture || null;
        const currentName = (device.profile_name || "").toString();

        // Grace window: protect local edits only briefly (30s) to avoid long delays
        const updatedAtMs = device.updated_at ? new Date(device.updated_at).getTime() : 0;
        const justEdited = Number.isFinite(updatedAtMs)
          ? (Date.now() - updatedAtMs) < 30 * 1000
          : false;

        // Deep check: always re-fetch fresh profile pic from dedicated endpoints when:
        // 1. Status endpoint returned unknown/undefined pic state
        // 2. Current pic is already persisted in storage (need to detect changes)
        const alreadyPersistedInStorage = currentPic?.includes("/storage/") || currentPic?.includes("supabase");
        if (
          isConnected &&
          !justEdited &&
          device.uazapi_base_url &&
          device.uazapi_token &&
          deepProfileChecks < MAX_DEEP_PROFILE_CHECKS &&
          (
            providerPic === undefined ||
            alreadyPersistedInStorage
          )
        ) {
          deepProfileChecks++;
          const cleanBase = String(device.uazapi_base_url).replace(/\/+$/, "");
          const freshPic = await fetchFreshProfilePic(
            cleanBase,
            String(device.uazapi_token),
            String(phone || ""),
            String(device.number || "")
          );
          if (freshPic !== undefined) {
            providerPic = freshPic;
          }
        }

        let newPic: string | null;
        if (!isConnected) {
          newPic = currentPic;
        } else if (justEdited && currentPic && typeof providerPic === "string" && currentPic !== providerPic) {
          newPic = currentPic;
        } else if (providerPic === undefined) {
          newPic = currentPic;
        } else if (providerPic === null) {
          // Provider explicitly says no photo — remove from storage too
          try { await svc.storage.from("avatars").remove([`profile-pictures/${device.id}.jpg`, `profile-pictures/${device.id}.png`]); } catch { /* */ }
          newPic = null;
        } else {
          // New/updated WhatsApp URL — check if it's a pps.whatsapp.net URL that needs persisting
          const isWhatsAppUrl = providerPic.includes("pps.whatsapp.net") || providerPic.includes("mmg.whatsapp.net");
          const alreadyPersisted = currentPic?.includes("/storage/") || currentPic?.includes("supabase");
          
          if (isWhatsAppUrl) {
            // Always persist — download fresh and upload to storage (handles both new photos and photo changes)
            const storedUrl = await persistProfilePic(svc, device.id, providerPic);
            newPic = storedUrl || providerPic;
          } else {
            newPic = providerPic;
          }
        }

        const newName = isConnected
          ? (justEdited && currentName && currentName !== providerNameRaw
            ? currentName
            : (providerNameRaw || currentName))
          : currentName;

        const statusChanged = newStatus !== device.status;
        const anyChanged = statusChanged
          || newPhone !== (device.number || "")
          || newPic !== (device.profile_picture || null)
          || (newName || "") !== (device.profile_name || "");

        if (anyChanged) {
          dbUpdates.push({ id: device.id, patch: { status: newStatus, number: newPhone, profile_picture: newPic, profile_name: newName } });

          if (statusChanged) {
            opLogs.push({ user_id: userId, device_id: device.id, event: newStatus === "Disconnected" ? "instance_disconnected" : "instance_connected", details: `"${device.name}" → ${newStatus}`, meta: { previous: device.status } });

            if (newStatus === "Disconnected") warmupPauses.push(device.id);
            if (newStatus === "Ready") warmupResumes.push(device.id);

            // Fire-and-forget notification
            if (canNotify && device.login_type !== "report_wa") {
              const rwBase = rwDevice.uazapi_base_url.replace(/\/+$/, "");
              const nowBRT = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
              const chipName = newName || device.name;
              const rPhone = isConnected
                ? (newPhone && newPhone.trim() ? newPhone : (device.number && device.number.trim() ? fmtPhone(device.number) : "N/A"))
                : (device.number && device.number.trim() ? fmtPhone(device.number) : "N/A");
              const msg = isConnected
                ? `✅ CONECTADA\n🔹 ${device.name}\n📱 ${chipName}\n📞 ${rPhone}\n🟢 Online ${nowBRT}`
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
            }

            // Make webhook
            const makeUrl = Deno.env.get("MAKE_WEBHOOK_URL");
            if (makeUrl) {
              fetch(makeUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  event: newStatus === "Ready" ? "instance.connected" : "instance.disconnected",
                  client_id: userId,
                  instance: { id: device.id, name: device.name, status: newStatus === "Ready" ? "conectada" : "desconectada" },
                  timestamp: new Date().toISOString(),
                }),
              }).catch(() => {});
            }
          }
        }
        synced++;
      }
    }

    // ── Flush DB updates ──
    if (dbUpdates.length > 0) {
      await runPool(dbUpdates, 10, async (u) => {
        await svc.from("devices").update(u.patch).eq("id", u.id);
      });
    }

    // ── Flush operation logs ──
    if (opLogs.length > 0) {
      for (let i = 0; i < opLogs.length; i += 100) {
        await svc.from("operation_logs").insert(opLogs.slice(i, i + 100));
      }
    }

    // ── Handle warmup pauses ──
    if (warmupPauses.length > 0) {
      for (const devId of warmupPauses) {
        const { data: cycles } = await svc.from("warmup_cycles").select("id, phase")
          .eq("device_id", devId).eq("is_running", true)
          .neq("phase", "completed").neq("phase", "paused");
        for (const c of (cycles || [])) {
          await svc.from("warmup_cycles").update({
            is_running: false, phase: "paused", previous_phase: c.phase,
            last_error: "Auto-pausado: instância desconectada",
          }).eq("id", c.id);
          // MUST await to prevent race condition with resume
          await svc.from("warmup_jobs").update({ status: "cancelled" }).eq("cycle_id", c.id).eq("status", "pending");
        }
      }
    }

    // ── Handle warmup resumes ──
    if (warmupResumes.length > 0) {
      for (const devId of warmupResumes) {
        const { data: cycles } = await svc.from("warmup_cycles")
          .select("id, first_24h_ends_at, user_id, device_id, previous_phase, last_error, daily_interaction_budget_target, daily_interaction_budget_used, day_index, days_total, chip_state")
          .eq("device_id", devId).eq("phase", "paused").eq("is_running", false);
        for (const c of (cycles || [])) {
          if (c.last_error !== "Auto-pausado: instância desconectada") continue;
          const now = new Date();
          let phase = c.previous_phase || "groups_only";

          // If the cycle was already completed (all days done), keep it completed — don't restart
          if (phase === "completed") {
            await svc.from("warmup_cycles").update({
              is_running: false, phase: "completed", previous_phase: null, last_error: null,
              next_run_at: null,
            }).eq("id", c.id);
            console.log(`[sync-devices] Cycle ${c.id} was completed — keeping completed, not resuming`);
            continue;
          }

          if (now < new Date(c.first_24h_ends_at)) phase = "pre_24h";
          if (["error", "paused"].includes(phase)) phase = "groups_only";

          // On reconnection, ALWAYS defer to tomorrow's daily_reset — never schedule jobs immediately.
          // This prevents re-warming a chip that was already warmed today or creating duplicate jobs.
          await svc.from("warmup_cycles").update({
            is_running: true, phase, previous_phase: null, last_error: null,
            next_run_at: null, // No immediate scheduling
          }).eq("id", c.id);

          // Ensure a daily_reset job exists so the cycle advances to the next day
          const tomorrow = new Date();
          tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
          tomorrow.setUTCHours(9, 50, 0, 0);

          const { data: existingReset } = await svc.from("warmup_jobs")
            .select("id")
            .eq("cycle_id", c.id).eq("job_type", "daily_reset").eq("status", "pending")
            .limit(1);

          if (!existingReset?.length) {
            await svc.from("warmup_jobs").insert({
              user_id: c.user_id, device_id: c.device_id, cycle_id: c.id,
              job_type: "daily_reset", payload: {},
              run_at: tomorrow.toISOString(), status: "pending",
            });
          }

          console.log(`[sync-devices] Cycle ${c.id} resumed to phase=${phase} — deferred to tomorrow's daily_reset`);
        }
      }
    }

    // ── Sync proxy statuses ──
    const [{ data: devProxies }, { data: allProxies }] = await Promise.all([
      supabase.from("devices").select("proxy_id").eq("user_id", userId).not("proxy_id", "is", null),
      supabase.from("proxies").select("id, status").eq("user_id", userId),
    ]);
    const linkedIds = new Set((devProxies || []).map((d: any) => d.proxy_id));
    let proxiesUpdated = 0;
    for (const p of (allProxies || [])) {
      const correct = linkedIds.has(p.id) ? "USANDO" : (p.status === "USANDO" ? "USADA" : p.status);
      if (p.status !== correct) {
        await supabase.from("proxies").update({ status: correct } as any).eq("id", p.id);
        proxiesUpdated++;
      }
    }

    return jsonRes({
      success: true,
      total: devices.length,
      synced,
      skipped,
      timeouts,
      errors,
      proxiesUpdated,
      circuitOpen,
      total404,
      shard: shardIndex,
      shards: shardTotal,
    });
  } catch (error: unknown) {
    console.error("Sync error:", error);
    return jsonRes({ error: error instanceof Error ? error.message : "Unknown" }, 500);
  }
});
