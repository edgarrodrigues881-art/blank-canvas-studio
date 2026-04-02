// sync-devices v8.0 — fixed status detection + debug logging + always enabled
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonRes = (data: any, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// IMPORTANT: This must NEVER be set to true in production — it was the root cause of stale statuses
const SYNC_DEVICES_DISABLED = false;

async function fetchT(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { ...opts, signal: c.signal }); clearTimeout(t); return r; }
  catch (e: any) { clearTimeout(t); throw e; }
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

function normalizeProviderConnectionState(payload: any): { state: "connected" | "disconnected" | "transitional" | "unknown"; rawStatus: string; owner: string } {
  const inst = payload?.instance || payload?.data || payload || {};

  // DIRECT BOOLEAN CHECK: Uazapi returns { status: { connected: true, loggedIn: true } }
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
    inst?.connectionStatus,
    inst?.status,
    payload?.connectionStatus,
    payload?.state,
  ].find((value) => typeof value === "string" && value.trim())?.toLowerCase().trim() || "";

  const owner = [inst?.owner, inst?.phone, payload?.phone, payload?.owner]
    .find((value) => typeof value === "string" && value.trim())?.trim() || "";

  const textBlob = [
    payload?.message,
    payload?.error,
    payload?.msg,
    payload?.details,
    payload?.data?.message,
    payload?.data?.error,
    inst?.message,
    inst?.error,
  ]
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .toLowerCase();

  const canonicalizeStatus = (value: string) => value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rawStatusCanonical = canonicalizeStatus(rawStatus);

  const matchesSignal = (signal: string) => {
    const canonicalSignal = canonicalizeStatus(signal);
    if (!canonicalSignal) return false;

    const rawMatch = rawStatusCanonical === canonicalSignal
      || rawStatusCanonical.startsWith(`${canonicalSignal}_`)
      || rawStatusCanonical.endsWith(`_${canonicalSignal}`)
      || rawStatusCanonical.includes(`_${canonicalSignal}_`);

    if (rawMatch) return true;

    const textSignal = signal.toLowerCase().replace(/[_-]+/g, " ").trim();
    if (!textSignal) return false;

    const textPattern = new RegExp(`(?:^|\\W)${escapeRegex(textSignal)}(?:$|\\W)`, "i");
    return textPattern.test(textBlob);
  };

  const hasSignal = (signals: string[]) => signals.some(matchesSignal);
  const connectedSignals = ["connected", "authenticated", "open", "ready", "active", "online"];
  const disconnectedSignals = ["disconnected", "closed", "close", "offline", "logout", "logged_out", "loggedout", "not_connected"];
  const transitionalSignals = ["connecting", "pairing", "waiting", "initializing", "starting", "syncing", "qr", "qrcode", "pending"];

  if (hasSignal(disconnectedSignals)) return { state: "disconnected", rawStatus, owner };
  if (hasSignal(connectedSignals)) return { state: "connected", rawStatus, owner };
  if (hasSignal(transitionalSignals)) return { state: "transitional", rawStatus, owner };
  return { state: "unknown", rawStatus, owner };
}

async function confirmProviderConnectionState(
  baseUrl: string,
  token: string,
): Promise<{ state: "connected" | "disconnected" | "transitional" | "unknown"; rawStatus: string; owner: string } | null> {
  try {
    const res = await fetchT(`${baseUrl}/instance/status?t=${Date.now()}`, {
      method: "GET",
      headers: {
        token,
        Accept: "application/json",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    }, 3500);

    if (!res.ok) {
      await res.text();
      return null;
    }

    const data = await res.json();
    return normalizeProviderConnectionState(data);
  } catch {
    return null;
  }
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

    const successfulResults = results.filter((r) => r.httpStatus === 200 && r.apiData);
    const disconnectCandidateResults = !circuitOpen
      ? successfulResults.filter((r) => {
          const state = normalizeProviderConnectionState(r.apiData);
          return state.state === "disconnected" && String(r.device.status || "").toLowerCase().trim() === "ready";
        })
      : [];
    const disconnectCandidates = disconnectCandidateResults.length;
    const disconnectWaveOpen = !circuitOpen
      && successfulResults.length >= 4
      && disconnectCandidates >= Math.max(3, Math.ceil(successfulResults.length * 0.35));
    const disconnectWaveRequiredStrikes = 3;
    const disconnectWaveWindowMs = 15 * 60 * 1000;
    const disconnectWaveStrikeMap = new Map<string, number>();

    if (disconnectWaveOpen) {
      opLogs.push({
        user_id: userId,
        device_id: null,
        event: "sync_disconnect_wave",
        details: `Onda de falso offline detectada: ${disconnectCandidates}/${successfulResults.length} instâncias reportaram desconectadas na mesma rodada`,
        meta: { disconnect_candidates: disconnectCandidates, successful_results: successfulResults.length },
      });

      const candidateIds = Array.from(new Set(disconnectCandidateResults
        .map((row) => row.device?.id)
        .filter((id): id is string => typeof id === "string" && !!id)));

      if (candidateIds.length > 0) {
        const { data: recentWaveStrikes } = await svc
          .from("operation_logs")
          .select("device_id")
          .eq("user_id", userId)
          .eq("event", "sync_disconnect_wave_strike")
          .in("device_id", candidateIds)
          .gte("created_at", new Date(Date.now() - disconnectWaveWindowMs).toISOString());

        for (const row of (recentWaveStrikes || [])) {
          const key = String(row.device_id || "");
          if (!key) continue;
          disconnectWaveStrikeMap.set(key, (disconnectWaveStrikeMap.get(key) || 0) + 1);
        }
      }
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
          dbUpdates.push({ id: device.id, patch: { status: "Disconnected", uazapi_token: null, uazapi_base_url: null, proxy_id: null, updated_at: new Date().toISOString() } });
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
            // Only after 5 consecutive 404s in 30 min — mark disconnected but KEEP token
            dbUpdates.push({ id: device.id, patch: { status: "Disconnected", updated_at: new Date().toISOString() } });
            warmupPauses.push(device.id);
            opLogs.push({ user_id: userId, device_id: device.id, event: "instance_not_found", details: `"${device.name}" confirmado ausente após 5 strikes — mantendo token` });
          }
          // Don't change status on early strikes — keep current status
          synced++;
          continue;
        }

        // ── Other errors ──
        if (!r.apiData) { errors++; synced++; continue; }

        // ── Parse status ──
        const data = r.apiData;
        const inst = data?.instance || data?.data || data || {};
        const normalizedState = normalizeProviderConnectionState(data);
        let effectiveState = normalizedState;
        const previousStatus = String(device.status || "").toLowerCase().trim();
        const wasReady = previousStatus === "ready";
        const wasDisconnected = previousStatus === "disconnected";

        if (normalizedState.state === "disconnected" && !wasDisconnected) {
          let confirmedState: Awaited<ReturnType<typeof confirmProviderConnectionState>> = null;
          if (device.uazapi_base_url && device.uazapi_token) {
            confirmedState = await confirmProviderConnectionState(
              String(device.uazapi_base_url).replace(/\/+$/, ""),
              String(device.uazapi_token),
            );
          }

          if (disconnectWaveOpen && wasReady) {
            const strikes = (disconnectWaveStrikeMap.get(device.id) || 0) + 1;
            disconnectWaveStrikeMap.set(device.id, strikes);

            opLogs.push({
              user_id: userId,
              device_id: device.id,
              event: "sync_disconnect_wave_strike",
              details: `Desconexão em onda para "${device.name}" (${strikes}/${disconnectWaveRequiredStrikes})`,
              meta: {
                raw_status: normalizedState.rawStatus,
                required_strikes: disconnectWaveRequiredStrikes,
              },
            });

            if (confirmedState?.state === "disconnected" && strikes >= disconnectWaveRequiredStrikes) {
              effectiveState = confirmedState;
              opLogs.push({
                user_id: userId,
                device_id: device.id,
                event: "sync_disconnect_wave_confirmed",
                details: `Desconexão confirmada para "${device.name}" após ${strikes} confirmações`,
                meta: {
                  first_raw_status: normalizedState.rawStatus,
                  confirm_raw_status: confirmedState.rawStatus,
                  strikes,
                },
              });
            } else if (confirmedState && confirmedState.state !== "disconnected") {
              effectiveState = confirmedState;
              opLogs.push({
                user_id: userId,
                device_id: device.id,
                event: "sync_disconnect_ignored",
                details: `Falso offline ignorado para "${device.name}" após rechecagem`,
                meta: {
                  reason: "transient_false_disconnect",
                  first_raw_status: normalizedState.rawStatus,
                  confirm_raw_status: confirmedState.rawStatus,
                  confirm_state: confirmedState.state,
                },
              });
            } else {
              effectiveState = { ...normalizedState, state: "unknown" };
              opLogs.push({
                user_id: userId,
                device_id: device.id,
                event: "sync_disconnect_ignored",
                details: `Desconexão protegida para "${device.name}" enquanto valida consistência`,
                meta: {
                  reason: "disconnect_wave_guard",
                  raw_status: normalizedState.rawStatus,
                  strikes,
                  required_strikes: disconnectWaveRequiredStrikes,
                  confirm_state: confirmedState?.state || null,
                },
              });
            }
          } else {
            // ── Individual device disconnect: strike system (3 strikes in 5 min) ──
            const INDIVIDUAL_REQUIRED_STRIKES = 3;
            const INDIVIDUAL_STRIKE_WINDOW_MS = 5 * 60 * 1000;

            const { data: recentStrikes } = await svc
              .from("operation_logs")
              .select("id")
              .eq("device_id", device.id)
              .eq("event", "sync_individual_disconnect_strike")
              .gte("created_at", new Date(Date.now() - INDIVIDUAL_STRIKE_WINDOW_MS).toISOString());

            const strikes = (recentStrikes?.length || 0) + 1;

            opLogs.push({
              user_id: userId,
              device_id: device.id,
              event: "sync_individual_disconnect_strike",
              details: `Desconexão detectada para "${device.name}" (${strikes}/${INDIVIDUAL_REQUIRED_STRIKES})`,
              meta: {
                raw_status: normalizedState.rawStatus,
                confirm_state: confirmedState?.state || null,
                required_strikes: INDIVIDUAL_REQUIRED_STRIKES,
              },
            });

            if (confirmedState?.state === "disconnected" && strikes >= INDIVIDUAL_REQUIRED_STRIKES) {
              // Confirmed after multiple strikes — allow disconnect
              effectiveState = confirmedState;
              opLogs.push({
                user_id: userId,
                device_id: device.id,
                event: "sync_individual_disconnect_confirmed",
                details: `Desconexão confirmada para "${device.name}" após ${strikes} verificações consecutivas`,
                meta: {
                  first_raw_status: normalizedState.rawStatus,
                  confirm_raw_status: confirmedState.rawStatus,
                  strikes,
                },
              });
            } else if (confirmedState && confirmedState.state !== "disconnected") {
              // Re-check says connected — false alarm
              effectiveState = confirmedState;
              opLogs.push({
                user_id: userId,
                device_id: device.id,
                event: "sync_disconnect_ignored",
                details: `Falso offline ignorado para "${device.name}" após rechecagem`,
                meta: {
                  reason: "transient_false_disconnect",
                  first_raw_status: normalizedState.rawStatus,
                  confirm_raw_status: confirmedState.rawStatus,
                  confirm_state: confirmedState.state,
                },
              });
            } else {
              // Not enough strikes or confirm failed — hold status
              effectiveState = { ...normalizedState, state: "unknown" };
              opLogs.push({
                user_id: userId,
                device_id: device.id,
                event: "sync_disconnect_ignored",
                details: `Desconexão protegida para "${device.name}" — aguardando ${INDIVIDUAL_REQUIRED_STRIKES - strikes + 1} confirmação(ões)`,
                meta: {
                  reason: "individual_strike_guard",
                  raw_status: normalizedState.rawStatus,
                  strikes,
                  required_strikes: INDIVIDUAL_REQUIRED_STRIKES,
                  confirm_state: confirmedState?.state || null,
                },
              });
            }
          }
        }

        const rawState = effectiveState.rawStatus || normalizedState.rawStatus;
        const phone = effectiveState.owner || normalizedState.owner;
        const isConnected = effectiveState.state === "connected";
        const isDisconnected = effectiveState.state === "disconnected";

        // Debug log: first 5 devices to identify what Uazapi actually returns
        if (synced < 5) {
          console.log(`[sync-devices:debug] "${device.name}" rawState="${rawState}" normalized="${normalizedState.state}" isConnected=${isConnected} phone="${phone}" prev="${device.status}"`);
        }

        const newStatus = isConnected ? "Ready" : isDisconnected ? "Disconnected" : device.status;
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
          dbUpdates.push({ id: device.id, patch: { status: newStatus, number: newPhone, profile_picture: newPic, profile_name: newName, updated_at: new Date().toISOString() } });

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

          // On reconnection, schedule jobs for TODAY if within operating window
          // This prevents lost warmup days when chips reconnect mid-day
          const nowCheck = new Date();
          const brt7 = new Date(); brt7.setUTCHours(10, 0, 0, 0); // 07:00 BRT ≈ 10:00 UTC
          const brt19 = new Date(); brt19.setUTCHours(22, 0, 0, 0); // 19:00 BRT ≈ 22:00 UTC
          const withinWindow = nowCheck >= brt7 && nowCheck < brt19;

          await svc.from("warmup_cycles").update({
            is_running: true, phase, previous_phase: null, last_error: null,
            next_run_at: null,
            // Reset budget target to 0 so it gets recalculated for today's remaining window
            daily_interaction_budget_target: 0,
          }).eq("id", c.id);

          // Ensure a daily_reset job exists so the cycle advances to the next day
          const tomorrow = new Date();
          tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
          tomorrow.setUTCHours(9, 45, 0, 0);

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

          console.log(`[sync-devices] Cycle ${c.id} resumed to phase=${phase} — withinWindow=${withinWindow}, will be picked up by warmup-tick auto-resume`);
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

    const statusChanges = dbUpdates.filter(u => u.patch.status).length;
    console.log(`[sync-devices] done: total=${devices.length} synced=${synced} statusChanges=${statusChanges} timeouts=${timeouts} errors=${errors} circuitOpen=${circuitOpen}`);

    return jsonRes({
      success: true,
      total: devices.length,
      synced,
      skipped,
      timeouts,
      errors,
      statusChanges,
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
