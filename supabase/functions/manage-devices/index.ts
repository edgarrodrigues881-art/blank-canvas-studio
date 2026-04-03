import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function oplog(client: any, userId: string, event: string, details: string, deviceId?: string | null, meta?: any) {
  try { await client.from("operation_logs").insert({ user_id: userId, device_id: deviceId || null, event, details, meta: meta || {} }); } catch (_e) { /* ignore */ }
}

async function fetchWithTimeout(url: string, opts: RequestInit, ms = 5000): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...opts, signal: c.signal }); }
  finally { clearTimeout(t); }
}

async function deleteOneFromProvider(providerBase: string, providerToken: string | null, adminToken: string, label: string | null): Promise<boolean> {
  if (!providerBase) return false;
  
  // Quick disconnect attempt
  if (providerToken) {
    try {
      await fetchWithTimeout(`${providerBase}/instance/disconnect`, {
        method: "POST",
        headers: { token: providerToken, Accept: "application/json", "Content-Type": "application/json" },
      }, 3000);
    } catch { /* ignore */ }
  }

  // Try delete with instance token (fast path)
  if (providerToken) {
    try {
      const res = await fetchWithTimeout(`${providerBase}/instance`, {
        method: "DELETE",
        headers: { token: providerToken, Accept: "application/json", "Content-Type": "application/json" },
      }, 5000);
      if (res.ok || res.status === 404) return true;
    } catch { /* continue */ }
  }

  // Fallback: admin token with name/label
  if (adminToken && (providerToken || label)) {
    const payloads = [
      ...(providerToken ? [{ token: providerToken }] : []),
      ...(label ? [{ name: label }] : []),
    ];
    for (const payload of payloads) {
      try {
        const res = await fetchWithTimeout(`${providerBase}/instance/delete`, {
          method: "POST",
          headers: { admintoken: adminToken, Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }, 5000);
        if (res.ok || res.status === 404) return true;
      } catch { /* next */ }
    }
  }
  return false;
}

async function deleteDevices(admin: any, userId: string, deviceIds: string[]): Promise<{ id: string; ok: boolean; error?: string }[]> {
  // Fetch all devices at once
  const { data: devices } = await admin
    .from("devices")
    .select("id, name, number, proxy_id, uazapi_token, uazapi_base_url")
    .eq("user_id", userId)
    .in("id", deviceIds);

  if (!devices || devices.length === 0) {
    return deviceIds.map(id => ({ id, ok: true }));
  }

  const ADMIN_TOKEN = Deno.env.get("UAZAPI_TOKEN") || "";
  const DEFAULT_BASE = (Deno.env.get("UAZAPI_BASE_URL") || "").replace(/\/+$/, "");

  // Fetch all token labels at once
  const { data: tokenRows } = await admin
    .from("user_api_tokens")
    .select("device_id, label")
    .in("device_id", deviceIds);
  const labelMap = new Map((tokenRows || []).map((r: any) => [r.device_id, r.label]));

  const results: { id: string; ok: boolean; error?: string }[] = [];

  // Process devices in batches of 5 concurrently
  const BATCH = 5;
  for (let i = 0; i < devices.length; i += BATCH) {
    const batch = devices.slice(i, i + BATCH);
    const batchResults = await Promise.allSettled(batch.map(async (device: any) => {
      try {
        const providerBase = (device.uazapi_base_url || DEFAULT_BASE).replace(/\/+$/, "");
        const providerLabel = labelMap.get(device.id) || null;
        
        // 1. Delete from provider (non-blocking — don't fail if provider is down)
        const providerDeleted = await deleteOneFromProvider(
          providerBase, device.uazapi_token, ADMIN_TOKEN, providerLabel
        );
        console.log(`[bulk-delete] ${device.id}: provider=${providerDeleted ? "ok" : "skip"}`);

        const requiresProviderDelete = Boolean(device.uazapi_token || providerLabel);
        if (requiresProviderDelete && !providerDeleted) {
          throw new Error("Falha ao excluir instância na UAZAPI.");
        }

        // 2-5. DB cleanup in parallel
        const proxyId = device.proxy_id;
        await Promise.allSettled([
          admin.from("user_api_tokens").update({ status: "deleted", device_id: null, assigned_at: null }).eq("device_id", device.id),
          admin.from("warmup_jobs").delete().eq("device_id", device.id),
          admin.from("warmup_audit_logs").delete().eq("device_id", device.id),
          admin.from("warmup_logs").delete().eq("device_id", device.id),
          admin.from("warmup_instance_groups").delete().eq("device_id", device.id),
          admin.from("warmup_community_membership").delete().eq("device_id", device.id),
          admin.from("warmup_sessions").delete().eq("device_id", device.id),
          admin.from("warmup_cycles").delete().eq("device_id", device.id),
          ...(proxyId ? [admin.from("proxies").update({ status: "USADA" }).eq("id", proxyId)] : []),
        ]);

        // Delete device record
        const { error: deleteError } = await admin.from("devices").delete().eq("id", device.id);
        if (deleteError) throw deleteError;

        const { data: remainingDevice, error: verifyError } = await admin
          .from("devices")
          .select("id")
          .eq("id", device.id)
          .maybeSingle();
        if (verifyError) throw verifyError;
        if (remainingDevice) throw new Error("A instância continuou no banco após a exclusão.");
        
        // Log (fire and forget)
        oplog(admin, userId, "instance_deleted", `Instância \"${device.name}\" deletada (bulk)`, device.id, {
          device_name: device.name,
          device_number: device.number || null,
          provider_label: providerLabel,
          provider_deleted: providerDeleted,
          proxy_id: proxyId || null,
        }).catch(() => {});

        return { id: device.id, ok: true };
      } catch (e: any) {
        console.error(`[bulk-delete] ${device.id} error:`, e.message);
        return { id: device.id, ok: false, error: e.message };
      }
    }));

    for (const r of batchResults) {
      results.push(r.status === "fulfilled" ? r.value : { id: "unknown", ok: false, error: "unexpected" });
    }
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

  // Authenticate user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({
      error: "Invalid or expired user token",
      details: authError?.message ?? null,
    }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const body = await req.json();
  const { action } = body;

  try {
    // ─── CREATE SINGLE DEVICE ──────────────────────────────────
    if (action === "create") {
      const { name, login_type = "qr" } = body;
      if (!name?.trim()) throw new Error("Nome é obrigatório.");

      // 1. Check plan limits
      const { data: sub } = await admin
        .from("subscriptions")
        .select("max_instances, expires_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!sub || new Date(sub.expires_at) < new Date()) {
        throw new Error("Você não possui um plano ativo.");
      }

      const { data: profile } = await admin
        .from("profiles")
        .select("instance_override, status")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.status === "suspended" || profile?.status === "cancelled") {
        throw new Error("Conta suspensa/cancelada.");
      }

      const { count: currentCount } = await admin
        .from("devices")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .neq("login_type", "report_wa");

      const maxAllowed = (sub.max_instances ?? 0) + (profile?.instance_override ?? 0);
      if ((currentCount ?? 0) >= maxAllowed) {
        throw new Error(`Limite de instâncias atingido (${currentCount} de ${maxAllowed}).`);
      }

      // 2. Create device record WITHOUT token — token will be generated on-demand at connect/QR time
      const { data: newDevice, error: insertErr } = await admin
        .from("devices")
        .insert({
          name: name.trim(),
          login_type,
          instance_type: login_type === "contingencia" ? "contingencia" : login_type === "report_wa" ? "notificacao" : "principal",
          user_id: user.id,
        })
        .select("id, name, status, login_type, number, proxy_id, profile_picture, profile_name, created_at, updated_at, instance_type")
        .single();
      if (insertErr) throw insertErr;

      await oplog(admin, user.id, "instance_created", `Instância "${newDevice.name}" criada (token será gerado ao conectar)`, newDevice.id);

      return new Response(
        JSON.stringify({ device: { ...newDevice, has_api_config: false } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── BULK CREATE DEVICES ───────────────────────────────────
    if (action === "bulk-create") {
      const { prefix = "Instância", proxyIds = [], noProxyCount = 0, startIndex = 1 } = body;
      const totalCount = (proxyIds?.length || 0) + (noProxyCount || 0);
      if (totalCount === 0) throw new Error("Nenhuma instância para criar.");

      // Check plan limits
      const { data: sub } = await admin
        .from("subscriptions")
        .select("max_instances, expires_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!sub || new Date(sub.expires_at) < new Date()) {
        throw new Error("Sem plano ativo.");
      }

      const { data: profile } = await admin
        .from("profiles")
        .select("instance_override")
        .eq("id", user.id)
        .maybeSingle();

      const { count: currentCount } = await admin
        .from("devices")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .neq("login_type", "report_wa");

      const maxAllowed = (sub.max_instances ?? 0) + (profile?.instance_override ?? 0);
      if ((currentCount ?? 0) + totalCount > maxAllowed) {
        throw new Error(`Limite excedido. Disponível: ${maxAllowed - (currentCount ?? 0)}.`);
      }

      // Build inserts WITHOUT tokens — tokens will be generated on-demand at connect/QR time
      // CRITICAL: Filter out proxies already assigned to other devices to prevent duplication
      const { data: usedProxyDevices } = await admin
        .from("devices")
        .select("proxy_id")
        .eq("user_id", user.id)
        .not("proxy_id", "is", null);
      const usedProxyIds = new Set((usedProxyDevices || []).map((d: any) => d.proxy_id));

      const inserts: any[] = [];
      let idx = startIndex;
      let skippedProxies = 0;

      for (const proxyId of (proxyIds || [])) {
        if (usedProxyIds.has(proxyId)) {
          console.log(`[bulk-create] skipping proxy ${proxyId} — already assigned to another device`);
          skippedProxies++;
          continue;
        }
        inserts.push({
          name: `${prefix} ${idx}`,
          login_type: "qr",
          instance_type: "principal",
          user_id: user.id,
          proxy_id: proxyId,
        });
        usedProxyIds.add(proxyId); // prevent within-batch duplication
        idx++;
      }

      for (let i = 0; i < noProxyCount; i++) {
        inserts.push({
          name: `${prefix} ${idx}`,
          login_type: "qr",
          instance_type: "principal",
          user_id: user.id,
          proxy_id: null,
        });
        idx++;
      }

      const { data: newDevices, error: bulkErr } = await admin
        .from("devices")
        .insert(inserts)
        .select("id, name, status, login_type, number, proxy_id, profile_picture, profile_name, created_at, updated_at, instance_type");

      if (bulkErr) throw bulkErr;

      // Mark assigned proxies as USANDO in parallel
      const parallelOps: Promise<any>[] = [];
      const assignedProxyIds = (newDevices || [])
        .map((d: any) => d.proxy_id)
        .filter(Boolean);
      if (assignedProxyIds.length > 0) {
        parallelOps.push(admin.from("proxies").update({ status: "USANDO" }).in("id", assignedProxyIds));
      }
      await Promise.allSettled(parallelOps);

      // Log bulk creation in background
      Promise.allSettled((newDevices || []).map((d: any) => {
        const ops = [oplog(admin, user.id, "instance_created", `Instância "${d.name}" criada (bulk, token lazy)`, d.id, { proxy_id: d.proxy_id })];
        if (d.proxy_id) ops.push(oplog(admin, user.id, "proxy_assigned", `Proxy atribuída → USANDO`, d.id, { proxy_id: d.proxy_id }));
        return Promise.all(ops);
      })).catch(() => {});

      const safeDevices = (newDevices || []).map((d: any) => ({
        ...d,
        has_api_config: false,
      }));

      return new Response(
        JSON.stringify({ devices: safeDevices, count: safeDevices.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── DELETE DEVICE (single) ────────────────────────────────
    if (action === "delete") {
      const { deviceId } = body;
      if (!deviceId) throw new Error("deviceId obrigatório.");
      const results = await deleteDevices(admin, user.id, [deviceId]);
      if (!results[0]?.ok) {
        return new Response(
          JSON.stringify({ error: results[0]?.error || "Erro ao excluir instância", results }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ success: true, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── BULK DELETE DEVICES ────────────────────────────────────
    if (action === "bulk-delete") {
      const { deviceIds } = body;
      if (!Array.isArray(deviceIds) || deviceIds.length === 0) throw new Error("deviceIds obrigatório.");
      const results = await deleteDevices(admin, user.id, deviceIds);
      return new Response(
        JSON.stringify({ success: true, deleted: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── CREATE REPORT_WA DEVICE ──────────────────────────────
    if (action === "create-report") {
      // Check if user already has a report_wa device
      const { data: existing } = await admin
        .from("devices")
        .select("id, uazapi_token")
        .eq("user_id", user.id)
        .eq("login_type", "report_wa")
        .limit(1)
        .maybeSingle();

      if (existing) {
        // Already exists — just return it, don't create another
        return new Response(
          JSON.stringify({ device: existing, reused: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const ADMIN_BASE_URL = (Deno.env.get("UAZAPI_BASE_URL") || "").replace(/\/+$/, "");
      const ADMIN_TOKEN = Deno.env.get("UAZAPI_TOKEN") || "";

      if (!ADMIN_BASE_URL || !ADMIN_TOKEN) {
        throw new Error("Configuração do provedor incompleta. Contate o administrador.");
      }

      // Check if profile already has a token (reuse it instead of creating new)
      const { data: profile } = await admin.from("profiles").select("full_name, whatsapp_monitor_token").eq("id", user.id).maybeSingle();
      let provisionedToken = profile?.whatsapp_monitor_token || null;

      if (!provisionedToken) {
        // Only create new instance on provider if no token exists
        const clientName = (profile?.full_name || user.email || "cliente").replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 20);
        const instanceName = `${clientName}_report_wa`;

        const headerVariants = [
          { admintoken: ADMIN_TOKEN },
          { token: ADMIN_TOKEN },
          { Authorization: `Bearer ${ADMIN_TOKEN}` },
        ];

        for (const authHeaders of headerVariants) {
          const res = await fetch(`${ADMIN_BASE_URL}/instance/init`, {
            method: "POST",
            headers: { ...authHeaders, Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({ name: instanceName }),
          });
          if (res.status === 401) continue;
          const resData = await res.json().catch(() => ({}));
          if (res.ok) {
            provisionedToken = resData.token || resData.instance?.token || resData.data?.token;
            break;
          }
          throw new Error(`Falha ao criar instância no provedor [${res.status}]: ${JSON.stringify(resData).substring(0, 200)}`);
        }

        if (!provisionedToken) {
          throw new Error("Falha na autenticação com o provedor. Contate o administrador.");
        }

        // Save token to profile
        await admin.from("profiles").update({ whatsapp_monitor_token: provisionedToken }).eq("id", user.id);
      }

      console.log(`[create-report] Token: reused=${!!profile?.whatsapp_monitor_token}`);

      const { data: newDevice, error: insertErr } = await admin
        .from("devices")
        .insert({
          name: "Relatorio Via Whatsapp",
          login_type: "report_wa",
          user_id: user.id,
          status: "Disconnected",
          instance_type: "notificacao",
          uazapi_token: provisionedToken,
          uazapi_base_url: ADMIN_BASE_URL,
        })
        .select("id, name, status, login_type, created_at")
        .single();

      if (insertErr) throw insertErr;

      await oplog(admin, user.id, "report_wa_provisioned", `Instância report_wa criada`, newDevice.id, { token_reused: !!profile?.whatsapp_monitor_token });

      return new Response(
        JSON.stringify({ device: newDevice }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("manage-devices error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
