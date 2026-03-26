import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function oplog(client: any, userId: string, event: string, details: string, deviceId?: string | null, meta?: any) {
  try { await client.from("operation_logs").insert({ user_id: userId, device_id: deviceId || null, event, details, meta: meta || {} }); } catch (_e) { /* ignore */ }
}

function onlyDigits(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

async function wasRecentlyDeleted(adminClient: any, clientId: string, instanceName?: string | null, phoneNumber?: string | null) {
  const normalizedName = String(instanceName || "").trim().toLowerCase();
  const normalizedPhone = onlyDigits(phoneNumber);

  if (!normalizedName && !normalizedPhone) return false;

  const { data, error } = await adminClient.from("operation_logs")
    .select("details, meta, created_at")
    .eq("user_id", clientId)
    .eq("event", "instance_deleted")
    .gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data?.length) return false;

  return data.some((row: any) => {
    const meta = row?.meta && typeof row.meta === "object" ? row.meta : {};
    const candidateNames = [meta?.provider_label, meta?.device_name, row?.details]
      .filter((value: unknown) => typeof value === "string" && value.trim())
      .map((value: string) => value.trim().toLowerCase());
    const candidatePhones = [meta?.device_number]
      .filter((value: unknown) => typeof value === "string" && value.trim())
      .map((value: string) => onlyDigits(value));

    const nameMatch = normalizedName ? candidateNames.includes(normalizedName) : false;
    const phoneMatch = normalizedPhone ? candidatePhones.includes(normalizedPhone) : false;
    return nameMatch || phoneMatch;
  });
}

async function dispatchWebhook(payload: Record<string, unknown>) {
  const makeUrl = Deno.env.get("MAKE_WEBHOOK_URL");
  if (!makeUrl) return;
  try {
    const res = await fetch(makeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    console.log(`[webhook-dispatch] ${payload.event} -> ${res.status}`);
    await res.text();
  } catch (e: any) {
    console.error("[webhook-dispatch] Error:", e.message);
  }
}

// ──────────────────────────────────────────────────────────────
// TOKEN POOL MANAGEMENT
// ──────────────────────────────────────────────────────────────
// 
// POOL TOKEN (user_api_tokens): Pre-allocated by admins. Each token
// maps 1:1 to a UAZAPI instance. Statuses: available → in_use → available.
// 
// INSTANCE TOKEN (devices.uazapi_token): The UAZAPI credential stored
// on the device record. Always comes FROM the pool — never created ad-hoc.
// 
// Flow: findAvailablePoolToken → insert device with token → reservePoolToken
// Delete: release pool token back to available, clear device credentials
// ──────────────────────────────────────────────────────────────

/**
 * Finds the first available pool token for a user.
 * Prefers healthy tokens, then unchecked ones.
 */
async function findAvailablePoolToken(adminClient: any, userId: string) {
  const { data: healthy } = await adminClient.from("user_api_tokens")
    .select("id, token, user_id, admin_id, status, healthy, label")
    .eq("user_id", userId)
    .eq("status", "available")
    .eq("healthy", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (healthy) return healthy;

  const { data: unchecked } = await adminClient.from("user_api_tokens")
    .select("id, token, user_id, admin_id, status, healthy, label")
    .eq("user_id", userId)
    .eq("status", "available")
    .is("healthy", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return unchecked || null;
}

/**
 * Atomically reserves a pool token by marking it as in_use and linking to a device.
 * Returns true if reservation succeeded, false if token was already taken (race condition).
 */
async function reservePoolToken(adminClient: any, tokenId: string, deviceId: string): Promise<boolean> {
  const { data, error } = await adminClient.from("user_api_tokens")
    .update({
      status: "in_use",
      device_id: deviceId,
      assigned_at: new Date().toISOString(),
    })
    .eq("id", tokenId)
    .eq("status", "available") // Only reserve if still available (race guard)
    .select("id");

  if (error || !data || data.length === 0) {
    console.warn(`[token-pool] Race condition: token ${tokenId.substring(0, 8)} already reserved`);
    return false;
  }
  return true;
}

/**
 * Releases a pool token back to available, clearing device link.
 */
async function releasePoolToken(adminClient: any, deviceId: string) {
  const { data } = await adminClient.from("user_api_tokens")
    .update({
      status: "available",
      device_id: null,
      assigned_at: null,
    })
    .eq("device_id", deviceId)
    .eq("status", "in_use")
    .select("id");

  return data && data.length > 0;
}

// ──────────────────────────────────────────────────────────────
// INSTANCE CREATION
// ──────────────────────────────────────────────────────────────

interface CreateInstanceParams {
  adminClient: any;
  clientId: string;
  instanceName: string;
  instanceType: "principal" | "notificacao";
  loginType: string;
  phoneNumber?: string | null;
  baseUrl: string;
}

async function createInstance(params: CreateInstanceParams): Promise<{ ok: boolean; device?: any; poolTokenId?: string; error?: string; status?: number }> {
  const { adminClient, clientId, instanceName, instanceType, loginType, phoneNumber, baseUrl } = params;

  // Step 1: Find available pool token
  const poolToken = await findAvailablePoolToken(adminClient, clientId);
  if (!poolToken) {
    return { ok: false, error: "NO_TOKEN_AVAILABLE", status: 422 };
  }

  // Step 2: Create device with pool token credentials
  const { data: device, error: devError } = await adminClient.from("devices").insert({
    user_id: clientId,
    name: instanceName,
    login_type: loginType,
    instance_type: instanceType,
    status: "Disconnected",
    number: phoneNumber || null,
    uazapi_token: poolToken.token,       // Instance token = pool token value
    uazapi_base_url: baseUrl || null,     // Shared platform URL
  }).select("id, name, status, instance_type, created_at").single();

  if (devError) {
    console.error(`[create-instance] DB error: ${devError.message}`);
    return { ok: false, error: devError.message, status: 500 };
  }

  // Step 3: Reserve pool token atomically (race-condition safe)
  const reserved = await reservePoolToken(adminClient, poolToken.id, device.id);
  if (!reserved) {
    // Token was taken by another request — rollback device creation
    console.error(`[create-instance] Token race condition, rolling back device ${device.id}`);
    await adminClient.from("devices").delete().eq("id", device.id);
    return { ok: false, error: "NO_TOKEN_AVAILABLE", status: 422 };
  }

  // Step 4: Audit log
  await adminClient.from("admin_logs").insert({
    admin_id: clientId,
    target_user_id: clientId,
    action: "webhook-create-instance",
    details: `Instância ${instanceType} criada via webhook: ${device.name} (pool token: ${poolToken.id.substring(0, 8)}...)`,
  });

  await oplog(adminClient, clientId, "instance_created",
    `Instância "${device.name}" (${instanceType}) criada via webhook`,
    device.id, { pool_token_id: poolToken.id, instance_type: instanceType });

  return { ok: true, device, poolTokenId: poolToken.id };
}

// ──────────────────────────────────────────────────────────────
// INSTANCE DELETION
// ──────────────────────────────────────────────────────────────

async function deleteInstance(adminClient: any, instanceId: string): Promise<{ ok: boolean; error?: string; status?: number }> {
  const { data: device } = await adminClient.from("devices")
    .select("id, name, user_id, proxy_id")
    .eq("id", instanceId)
    .maybeSingle();

  if (!device) return { ok: false, error: "INSTANCE_NOT_FOUND", status: 404 };

  // Step 1: Release pool token back to available
  const tokenReleased = await releasePoolToken(adminClient, instanceId);

  // Step 2: Release proxy
  if (device.proxy_id) {
    await adminClient.from("proxies").update({ status: "USADA" }).eq("id", device.proxy_id);
  }

  // Step 3: Cancel active warmup cycles
  await adminClient.from("warmup_cycles").update({
    is_running: false, phase: "paused",
    last_error: "Instância deletada via webhook",
  }).eq("device_id", instanceId).eq("is_running", true);

  await adminClient.from("warmup_jobs").update({ status: "cancelled" })
    .eq("device_id", instanceId).in("status", ["pending", "running"]);

  // Step 4: Delete device record
  await adminClient.from("devices").delete().eq("id", instanceId);

  // Step 5: Audit
  await adminClient.from("admin_logs").insert({
    admin_id: device.user_id,
    target_user_id: device.user_id,
    action: "webhook-delete-instance",
    details: `Instância deletada via webhook: ${device.name}`,
  });

  await oplog(adminClient, device.user_id, "instance_deleted",
    `Instância "${device.name}" deletada via webhook`,
    instanceId, { proxy_released: !!device.proxy_id, token_released: tokenReleased });

  await dispatchWebhook({
    event: "instance.deleted",
    client_id: device.user_id,
    instance: { id: instanceId, name: device.name },
  });

  return { ok: true };
}

// ──────────────────────────────────────────────────────────────
// MAIN HANDLER
// ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate via X-Webhook-Secret
    const secret = req.headers.get("x-webhook-secret") || "";
    const expectedSecret = Deno.env.get("WEBHOOK_SECRET") || "";
    if (!expectedSecret || secret !== expectedSecret) {
      return json({ ok: false, error: "UNAUTHORIZED" }, 401);
    }

    const body = await req.json();
    const { event, client_id, instance_name, phone_number, type } = body;
    console.log("[webhook-instances] Event:", event, "client:", client_id, "type:", type);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);
    const PLATFORM_BASE_URL = (Deno.env.get("UAZAPI_BASE_URL") || "").replace(/\/+$/, "");

    // ─── DELETE ───
    if (event === "instance.delete") {
      const { instance_id } = body;
      if (!instance_id) return json({ ok: false, error: "MISSING_INSTANCE_ID" }, 400);

      const result = await deleteInstance(adminClient, instance_id);
      return json({ ok: result.ok, deleted: result.ok, error: result.error }, result.status || 200);
    }

    // ─── CREATE ───
    if (event !== "instance.create") {
      return json({ ok: false, error: "UNKNOWN_EVENT", message: `Event '${event}' not supported` }, 400);
    }

    // Validate client
    const { data: profile } = await adminClient.from("profiles")
      .select("id, status, instance_override, full_name, client_type")
      .eq("id", client_id).maybeSingle();
    if (!profile) return json({ ok: false, error: "CLIENT_NOT_FOUND" }, 404);
    if (profile.status === "suspended" || profile.status === "cancelled") {
      return json({ ok: false, error: "CLIENT_BLOCKED", message: `Client status: ${profile.status}` }, 403);
    }

    if (await wasRecentlyDeleted(adminClient, client_id, instance_name, phone_number)) {
      console.log("[webhook-instances] Ignoring late create for recently deleted instance", { client_id, instance_name, phone_number });
      return json({ ok: false, error: "RECENTLY_DELETED", message: "Instância removida recentemente; ignorando recriação tardia." }, 409);
    }

    const { data: subscription } = await adminClient.from("subscriptions")
      .select("id, plan_name, max_instances, expires_at, plan_price")
      .eq("user_id", client_id)
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle();

    const instanceType = (type || "principal") as "principal" | "notificacao";

    // ─── NOTIFICATION INSTANCE ───
    if (instanceType === "notificacao") {
      const { data: existingNotif } = await adminClient.from("devices")
        .select("id").eq("user_id", client_id).eq("instance_type", "notificacao");

      if (existingNotif && existingNotif.length > 0) {
        return json({ ok: false, error: "NOTIFICATION_EXISTS" }, 409);
      }

      const result = await createInstance({
        adminClient, clientId: client_id,
        instanceName: instance_name || "Notificação WhatsApp",
        instanceType: "notificacao", loginType: "report_wa",
        phoneNumber: phone_number, baseUrl: PLATFORM_BASE_URL,
      });

      if (!result.ok) return json({ ok: false, error: result.error }, result.status);

      await dispatchWebhook({
        event: "instance.created", client_id,
        plan: subscription?.plan_name || null,
        instance: { id: result.device.id, name: result.device.name, type: "notificacao", status: "desconectada", created_at: result.device.created_at },
      });

      return json({ ok: true, instance_id: result.device.id, status: "created" });
    }

    // ─── PRINCIPAL INSTANCE ───
    if (!subscription) return json({ ok: false, error: "NO_PLAN" }, 403);
    if (new Date(subscription.expires_at) < new Date()) return json({ ok: false, error: "PLAN_EXPIRED" }, 403);

    const maxInstances = subscription.max_instances + (profile.instance_override || 0);
    const { count: currentCount } = await adminClient.from("devices")
      .select("id", { count: "exact", head: true })
      .eq("user_id", client_id)
      .neq("instance_type", "notificacao");

    if ((currentCount || 0) >= maxInstances) {
      return json({ ok: false, error: "LIMIT_REACHED", max: maxInstances, current: currentCount }, 429);
    }

    const result = await createInstance({
      adminClient, clientId: client_id,
      instanceName: instance_name || `Instância ${(currentCount || 0) + 1}`,
      instanceType: "principal", loginType: "qr",
      phoneNumber: phone_number, baseUrl: PLATFORM_BASE_URL,
    });

    if (!result.ok) return json({ ok: false, error: result.error }, result.status);

    const { data: authUser } = await adminClient.auth.admin.getUserById(client_id);

    await dispatchWebhook({
      event: "instance.created", client_id,
      client_email: authUser?.user?.email || null,
      plan: subscription.plan_name,
      instance: { id: result.device.id, name: result.device.name, type: "principal", status: "desconectada", created_at: result.device.created_at },
    });

    return json({ ok: true, instance_id: result.device.id, status: "created" });

  } catch (error) {
    console.error("[webhook-instances] ERROR:", error.message, error.stack);
    return json({ ok: false, error: "INTERNAL_ERROR", message: error.message }, 500);
  }
});
