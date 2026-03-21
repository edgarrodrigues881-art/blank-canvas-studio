import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function oplog(client: any, userId: string, event: string, details: string, deviceId?: string | null, meta?: any) {
  try { await client.from("operation_logs").insert({ user_id: userId, device_id: deviceId || null, event, details, meta: meta || {} }); } catch (_e) { /* ignore */ }
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
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
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
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
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
      const inserts: any[] = [];
      let idx = startIndex;

      for (const proxyId of (proxyIds || [])) {
        inserts.push({
          name: `${prefix} ${idx}`,
          login_type: "qr",
          user_id: user.id,
          proxy_id: proxyId,
        });
        idx++;
      }

      for (let i = 0; i < noProxyCount; i++) {
        inserts.push({
          name: `${prefix} ${idx}`,
          login_type: "qr",
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

    // ─── DELETE DEVICE ──────────────────────────────────────────
    if (action === "delete") {
      const { deviceId } = body;
      if (!deviceId) throw new Error("deviceId obrigatório.");

      // Verify ownership
      const { data: device } = await admin
        .from("devices")
        .select("id, proxy_id, user_id, uazapi_token, uazapi_base_url")
        .eq("id", deviceId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!device) {
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 1. Delete instance from UAZAPI provider directly
      const providerToken = device.uazapi_token;
      const providerBase = (device.uazapi_base_url || Deno.env.get("UAZAPI_BASE_URL") || "").replace(/\/+$/, "");
      const ADMIN_TOKEN = Deno.env.get("UAZAPI_TOKEN") || "";

      if (providerBase && providerToken) {
        try {
          // Disconnect first
          await fetch(`${providerBase}/instance/disconnect`, {
            method: "POST",
            headers: { token: providerToken, Accept: "application/json", "Content-Type": "application/json" },
          }).catch(() => {});

          // Try deleting via instance token
          const tokenHeaders = [
            { token: providerToken },
            { Authorization: `Bearer ${providerToken}` },
          ];
          let deleted = false;

          for (const h of tokenHeaders) {
            for (const ep of ["/instance", "/instance/delete"]) {
              try {
                const res = await fetch(`${providerBase}${ep}`, {
                  method: "DELETE",
                  headers: { ...h, Accept: "application/json", "Content-Type": "application/json" },
                });
                if (res.ok || res.status === 404) { deleted = true; break; }
              } catch { /* try next */ }
            }
            if (deleted) break;
          }

          // Fallback: admin token
          if (!deleted && ADMIN_TOKEN) {
            const adminHeaders = [
              { admintoken: ADMIN_TOKEN },
              { token: ADMIN_TOKEN },
              { Authorization: `Bearer ${ADMIN_TOKEN}` },
            ];
            // Get token label for admin delete
            const { data: tokenRow } = await admin.from("user_api_tokens")
              .select("label").eq("device_id", deviceId).maybeSingle();

            for (const ah of adminHeaders) {
              for (const payload of [
                { token: providerToken },
                ...(tokenRow?.label ? [{ name: tokenRow.label }] : []),
              ]) {
                try {
                  const res = await fetch(`${providerBase}/instance/delete`, {
                    method: "POST",
                    headers: { ...ah, Accept: "application/json", "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  });
                  if (res.ok || res.status === 404) { deleted = true; break; }
                } catch { /* next */ }
              }
              if (deleted) break;
            }
          }

          console.log(`[manage-devices:delete] Provider delete result: ${deleted ? "ok" : "failed"}`);
        } catch (e) {
          console.warn("[manage-devices:delete] Provider error (non-blocking):", e);
        }
      }

      // 2. Mark token as DELETED (not available — prevent reuse of orphaned tokens)
      await admin.from("user_api_tokens").update({
        status: "deleted",
        device_id: null,
        assigned_at: null,
      }).eq("device_id", deviceId);

      // 3. Clean up warmup data
      await admin.from("warmup_jobs").delete().eq("device_id", deviceId);
      await admin.from("warmup_audit_logs").delete().eq("device_id", deviceId);
      await admin.from("warmup_logs").delete().eq("device_id", deviceId);
      await admin.from("warmup_instance_groups").delete().eq("device_id", deviceId);
      await admin.from("warmup_community_membership").delete().eq("device_id", deviceId);
      await admin.from("warmup_sessions").delete().eq("device_id", deviceId);
      await admin.from("warmup_cycles").delete().eq("device_id", deviceId);

      // 4. Release proxy
      if (device.proxy_id) {
        await admin.from("proxies").update({ status: "USADA" }).eq("id", device.proxy_id);
        await oplog(admin, user.id, "proxy_released", `Proxy liberada → USADA`, deviceId, { proxy_id: device.proxy_id });
      }

      await oplog(admin, user.id, "instance_deleted", `Instância deletada + token removido do provedor`, deviceId);

      // 5. Delete device record
      const { error: delErr } = await admin.from("devices").delete().eq("id", deviceId);
      if (delErr) throw delErr;

      return new Response(
        JSON.stringify({ success: true }),
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
