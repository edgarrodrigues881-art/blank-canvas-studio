// evolution-connect v3.0 — optimized for 300 instances
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ── UaZapi helper with retry + timeout ─────────────────────────────────
async function uazapi(
  baseUrl: string,
  endpoint: string,
  token: string,
  method: "GET" | "POST" | "DELETE" | "PUT" | "PATCH" = "POST",
  body?: any,
  opts?: { timeoutMs?: number; retries?: number },
): Promise<{ ok: boolean; status: number; data: any }> {
  const { timeoutMs = 8000, retries = 2 } = opts || {};
  const headers: Record<string, string> = {
    token,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  let lastErr: any = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), timeoutMs);

      const fetchOpts: RequestInit = { method, headers, signal: controller.signal };
      if (body && method !== "GET") fetchOpts.body = JSON.stringify(body);

      const res = await fetch(`${baseUrl}${endpoint}`, fetchOpts);
      clearTimeout(tid);

      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { raw: text.substring(0, 500) }; }

      // Don't retry on auth errors or success
      if (res.ok || res.status === 401 || res.status === 403 || res.status === 404) {
        return { ok: res.ok, status: res.status, data };
      }

      // Retry on 5xx or rate limit
      if (res.status >= 500 || res.status === 429) {
        lastErr = { status: res.status, data };
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 4000);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }
      return { ok: res.ok, status: res.status, data };
    } catch (err: any) {
      lastErr = err;
      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 4000);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
    }
  }
  return { ok: false, status: 0, data: { error: lastErr?.message || "Request failed after retries" } };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    let chunkBinary = "";
    for (let j = 0; j < chunk.length; j++) {
      chunkBinary += String.fromCharCode(chunk[j]);
    }
    binary += chunkBinary;
  }
  return btoa(binary);
}

async function resolveProfileImageVariants(input: string): Promise<string[]> {
  const trimmed = (input || "").trim();
  if (!trimmed) return [];
  if (trimmed === "remove") return ["remove"];

  const variants = new Set<string>([trimmed]);

  // data URI -> also try raw base64
  if (trimmed.startsWith("data:image/")) {
    const base64Part = trimmed.split(",")[1]?.trim();
    if (base64Part) variants.add(base64Part);
    return Array.from(variants);
  }

  // URL -> download and convert to base64/data-uri for providers that reject direct URL
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(trimmed, { method: "GET", signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        const mime = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim() || "image/jpeg";
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.length > 0) {
          const b64 = bytesToBase64(bytes);
          variants.add(b64);
          variants.add(`data:${mime};base64,${b64}`);
          console.log(`[profile-pic] downloaded image URL and generated base64 variant (${bytes.length} bytes)`);
        }
      } else {
        console.log(`[profile-pic] could not download image URL: status=${res.status}`);
      }
    } catch (err: any) {
      console.log(`[profile-pic] URL->base64 conversion failed: ${err?.message || String(err)}`);
    }
  }

  return Array.from(variants);
}

// ── Admin helper: create instance on UaZapi ─────────────────────────────
async function adminCreateInstance(
  baseUrl: string,
  adminToken: string,
  name: string,
): Promise<{ ok: boolean; token?: string; error?: string }> {
  const headerVariants = [
    { admintoken: adminToken },
    { token: adminToken },
    { Authorization: `Bearer ${adminToken}` },
  ];

  const errors: string[] = [];
  for (const authHeaders of headerVariants) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 10000);
      const authType = Object.keys(authHeaders)[0];
      console.log(`[adminCreateInstance] trying auth=${authType} for name=${name}`);
      const res = await fetch(`${baseUrl}/instance/init`, {
        method: "POST",
        headers: { ...authHeaders, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
        signal: controller.signal,
      });
      clearTimeout(tid);

      if (res.status === 401) {
        errors.push(`${authType}: 401`);
        continue;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const instanceToken = data.token || data.instance?.token;
        console.log(`[adminCreateInstance] success with auth=${authType}, hasToken=${!!instanceToken}`);
        return { ok: true, token: instanceToken };
      }
      const errMsg = `UaZapi [${res.status}]: ${JSON.stringify(data).substring(0, 200)}`;
      errors.push(errMsg);
      return { ok: false, error: errMsg };
    } catch (e: any) {
      errors.push(`${Object.keys(authHeaders)[0]}: ${e?.message || String(e)}`);
      if (e?.name === "AbortError") continue;
    }
  }
  return { ok: false, error: `All auth methods failed: ${errors.join('; ')}` };
}

// ── Proxy connectivity test ──────────────────────────────────────────────
async function testProxyConnectivity(
  proxy: { host: string; port: string; username?: string; password?: string; type?: string },
): Promise<{ alive: boolean; error?: string }> {
  const TIMEOUT_MS = 3000; // Fast feedback — 3s max
  try {
    const conn = await Promise.race([
      Deno.connect({ hostname: proxy.host, port: Number(proxy.port) }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("TCP timeout")), TIMEOUT_MS)),
    ]);

    const authHeader = proxy.username
      ? `Proxy-Authorization: Basic ${btoa(`${proxy.username}:${proxy.password || ""}`)}\r\n`
      : "";
    const httpReq = `GET http://httpbin.org/ip HTTP/1.1\r\nHost: httpbin.org\r\n${authHeader}Connection: close\r\n\r\n`;

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    await conn.write(encoder.encode(httpReq));

    const buf = new Uint8Array(4096);
    const n = await Promise.race([
      conn.read(buf),
      new Promise<null>((_, rej) => setTimeout(() => rej(new Error("Read timeout")), TIMEOUT_MS)),
    ]);

    try { conn.close(); } catch { /* ignore */ }

    if (!n || n === 0) return { alive: false, error: "Proxy retornou resposta vazia" };

    const response = decoder.decode(buf.subarray(0, n));
    const statusCode = parseInt((response.split("\r\n")[0] || "").split(" ")[1] || "0", 10);

    if (statusCode >= 200 && statusCode < 400) return { alive: true };
    if (statusCode === 407) return { alive: false, error: "Proxy requer autenticação (credenciais inválidas)" };
    return { alive: false, error: `Proxy retornou status ${statusCode}` };
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (msg.includes("timeout") || msg.includes("TCP")) return { alive: false, error: "Proxy inacessível (timeout)" };
    if (msg.includes("refused")) return { alive: false, error: "Conexão recusada pela proxy" };
    return { alive: false, error: `Erro: ${msg.substring(0, 100)}` };
  }
}

// ── Proxy setter ─────────────────────────────────────────────────────────
async function setProxy(
  baseUrl: string,
  token: string,
  proxy: { host: string; port: string; username?: string; password?: string; type?: string },
): Promise<{ ok: boolean; error?: string }> {
  const test = await testProxyConnectivity(proxy);
  if (!test.alive) return { ok: false, error: test.error || "Proxy inválida" };

  const payload = {
    host: proxy.host, port: proxy.port,
    username: proxy.username || "", password: proxy.password || "",
    type: (proxy.type || "HTTP").toLowerCase(),
  };
  // Try all endpoints in PARALLEL — first success wins
  const endpoints = ["/instance/proxy", "/proxy/set", "/settings/proxy"];
  const results = await Promise.allSettled(
    endpoints.map(ep => uazapi(baseUrl, ep, token, "POST", payload, { timeoutMs: 4000, retries: 0 }))
  );
  if (results.some(r => r.status === "fulfilled" && r.value.ok)) return { ok: true };
  return { ok: false, error: "Falha ao configurar proxy no provedor" };
}

function formatBrPhone(phone: string): string {
  const raw = String(phone).replace(/\D/g, "");
  if (!raw) return "";
  if (raw.startsWith("55") && raw.length === 13)
    return `+${raw.slice(0, 2)} ${raw.slice(2, 4)} ${raw.slice(4, 9)}-${raw.slice(9)}`;
  if (raw.startsWith("55") && raw.length === 12)
    return `+${raw.slice(0, 2)} ${raw.slice(2, 4)} ${raw.slice(4, 8)}-${raw.slice(8)}`;
  if (raw.startsWith("55") && raw.length >= 10)
    return `+${raw.slice(0, 2)} ${raw.slice(2, 4)} ${raw.slice(4, raw.length - 4)}-${raw.slice(raw.length - 4)}`;
  return `+${raw}`;
}

async function oplog(client: any, userId: string, event: string, details: string, deviceId?: string | null, meta?: any) {
  try { await client.from("operation_logs").insert({ user_id: userId, device_id: deviceId || null, event, details, meta: meta || {} }); } catch { /* ignore */ }
}

// ── Fire-and-forget notification helper ─────────────────────────────────
async function notifyConnectionChange(svc: any, userId: string, deviceName: string, phone: string, profileName: string, isConnected: boolean) {
  try {
    const { data: rwConfig } = await svc
      .from("report_wa_configs")
      .select("device_id, alert_disconnect, group_id, connection_status, toggle_instances, connection_group_id")
      .eq("user_id", userId).not("device_id", "is", null).maybeSingle();

    const alertEnabled = rwConfig?.alert_disconnect || rwConfig?.toggle_instances;
    const targetGroup = (rwConfig?.connection_group_id || "").trim() || rwConfig?.group_id;
    if (!alertEnabled || !targetGroup || rwConfig?.connection_status !== "connected") return;

    const { data: rwDevice } = await svc.from("devices").select("uazapi_token, uazapi_base_url").eq("id", rwConfig.device_id).single();
    if (!rwDevice?.uazapi_token || !rwDevice?.uazapi_base_url) return;

    const rwBase = rwDevice.uazapi_base_url.replace(/\/+$/, "");
    const nowBRT = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
    const chipName = profileName || deviceName;

    const msg = isConnected
      ? `✅ INSTÂNCIA CONECTADA\n\n🔹 Instância: ${deviceName}\n📱 Chip: ${chipName}\n📞 Número: ${phone || "N/A"}\n\n🟢 Status: Online\n⏱ Conectado às: ${nowBRT}`
      : `⚠️ ALERTA DE CONEXÃO\n\n🖥 Instância: ${deviceName}\n📞 Número: ${phone || "N/A"}\n\n❌ Status: Desconectado\n⏱ Horário: ${nowBRT}\n\nA instância perdeu a conexão.\nPara voltar a funcionar, é necessário reconectar.`;

    for (const ep of [
      { path: "/chat/send-text", body: { to: targetGroup, body: msg } },
      { path: "/send/text", body: { number: targetGroup, text: msg } },
    ]) {
      try {
        const r = await fetch(`${rwBase}${ep.path}`, {
          method: "POST",
          headers: { token: rwDevice.uazapi_token, "Content-Type": "application/json" },
          body: JSON.stringify(ep.body),
        });
        if (r.ok) {
          await svc.from("report_wa_logs").insert({
            user_id: userId, level: isConnected ? "INFO" : "WARN",
            message: `Instância "${deviceName}" ${isConnected ? "conectada" : "desconectada"} — alerta enviado`,
          });
          return;
        }
        await r.text();
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

// ── Helper: check duplicate phone ───────────────────────────────────────
async function checkDuplicatePhone(svc: any, userId: string, deviceId: string, phone: string): Promise<{ isDuplicate: boolean; existingDeviceName?: string }> {
  if (!phone) return { isDuplicate: false };
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return { isDuplicate: false };
  const { data: existing } = await svc
    .from("devices")
    .select("id, name, number, status")
    .eq("user_id", userId).neq("id", deviceId)
    .not("number", "is", null)
    .in("status", ["Connected", "Ready", "authenticated"]);
  if (!existing?.length) return { isDuplicate: false };
  const match = existing.find((d: any) => {
    const dDigits = (d.number || "").replace(/\D/g, "");
    return dDigits.length >= 10 && dDigits === digits;
  });
  return match ? { isDuplicate: true, existingDeviceName: match.name } : { isDuplicate: false };
}

// ── Helper: handle "already connected" response ─────────────────────────
async function handleAlreadyConnected(
  svc: any, userId: string, deviceId: string, deviceName: string,
  phone: string, profileName: string, loginType: string,
  instanceUrl: string, instanceToken: string,
): Promise<Response | null> {
  const fmt = phone ? formatBrPhone(phone) : "";
  const dup = await checkDuplicatePhone(svc, userId, deviceId, phone);
  if (dup.isDuplicate) {
    await uazapi(instanceUrl, "/instance/disconnect", instanceToken, "POST", undefined, { timeoutMs: 5000, retries: 0 });
    return json({ success: false, error: `Este número já está conectado na instância "${dup.existingDeviceName}". Desconecte lá primeiro.`, code: "DUPLICATE_PHONE" });
  }
  await svc.from("devices").update({ status: "Ready", number: fmt, profile_name: profileName || "" }).eq("id", deviceId);

  // Fire-and-forget notification
  if (loginType !== "report_wa") {
    notifyConnectionChange(svc, userId, deviceName, fmt, profileName, true).catch(() => {});
  }

  return json({ success: true, alreadyConnected: true, phone: fmt, status: "authenticated" });
}

// ══════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, deviceId } = body;
    console.log(`[evolution-connect] action=${action} device=${deviceId?.substring(0, 8) || "none"}`);

    // ── Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[evolution-connect] missing bearer token");
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const jwt = authHeader.replace("Bearer ", "");
    let userId: string | null = null;
    let userEmail: string | null = null;

    try {
      const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(jwt);
      if (!claimsError && claimsData?.claims?.sub) {
        userId = claimsData.claims.sub;
        userEmail = (claimsData.claims.email as string) || null;
      }
    } catch (claimsErr: any) {
      console.warn("[evolution-connect] getClaims failed:", claimsErr?.message || String(claimsErr));
    }

    if (!userId) {
      const { data: { user: authUser }, error: userError } = await userClient.auth.getUser();
      if (userError || !authUser) {
        console.error("[evolution-connect] auth failed:", userError?.message || "no_user");
        return json({ error: "Unauthorized" }, 401);
      }
      userId = authUser.id;
      userEmail = authUser.email || null;
    }

    const user = { id: userId, email: userEmail };
    const svc = createClient(supabaseUrl, serviceRoleKey);

    const BASE_URL = (Deno.env.get("UAZAPI_BASE_URL") || "").replace(/\/+$/, "");
    const ADMIN_TOKEN = Deno.env.get("UAZAPI_TOKEN") || "";

    // ── getBaseUrl ──
    if (action === "getBaseUrl") return json({ success: true, baseUrl: BASE_URL });

    // ── createInstance ── BLOCKED
    if (action === "createInstance") {
      return json({ error: "Criação ad-hoc desabilitada. Tokens via pool.", code: "CREATE_BLOCKED" }, 403);
    }

    // ── Resolve device ──
    if (!deviceId) return json({ error: "deviceId obrigatório" }, 400);

    const { data: device } = await svc
      .from("devices")
      .select("name, uazapi_token, uazapi_base_url, login_type, profile_name, profile_picture, number, status")
      .eq("id", deviceId)
      .single();

    let instanceUrl = (device?.uazapi_base_url || "").replace(/\/+$/, "");
    let instanceToken = device?.uazapi_token || "";
    const deviceName = device?.name || "instance";
    const isReportDevice = device?.login_type === "report_wa";

    // ── Plan check ──
    if (!["deleteInstance", "status", "getBaseUrl", "logout", "listGroups", "sendText"].includes(action) && !isReportDevice) {
      const { data: activeSub } = await svc
        .from("subscriptions").select("expires_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const { data: userProfile } = await svc.from("profiles").select("status").eq("id", user.id).maybeSingle();
      const planExpired = !activeSub || new Date(activeSub.expires_at) < new Date();
      const accountBlocked = userProfile?.status === "suspended" || userProfile?.status === "cancelled";
      if (planExpired || accountBlocked) {
        return json({ error: "Plano inativo. Ative para continuar.", code: "NO_ACTIVE_PLAN" }, 403);
      }
    }

    if (!instanceToken && !["connect", "deleteInstance", "logout"].includes(action)) {
      return json({ error: "Instância sem token. Conecte primeiro.", code: "NO_TOKEN" }, 400);
    }

    // ── Quick status check helper ──
    const checkStatus = async (timeout = 6000): Promise<{ valid: boolean; status: string; qrcode?: string; owner?: string; profileName?: string; profilePicUrl?: string }> => {
      if (!instanceToken) return { valid: false, status: "no_token" };
      const r = await uazapi(instanceUrl, "/instance/status", instanceToken, "GET", undefined, { timeoutMs: timeout, retries: 1 });
      if (r.status === 401) return { valid: false, status: "token_invalid" };
      if (!r.ok) return { valid: false, status: "error" };
      const inst = r.data?.instance || r.data || {};
      return {
        valid: true,
        status: inst.status || r.data?.status || "unknown",
        qrcode: inst.qrcode || r.data?.qrcode,
        owner: inst.owner || inst.phone || r.data?.phone || "",
        profileName: inst.profileName || inst.pushname || "",
        profilePicUrl: inst.profilePicUrl || "",
      };
    };

    // ════════════════════════════════════════════════════════════════════
    // ── connect ──
    // ════════════════════════════════════════════════════════════════════
    if (action === "connect") {
      // Track which token was auto-assigned so we can rollback on failure
      let autoAssignedTokenId: string | null = null;

      // Auto-assign token if needed
      if (!instanceToken) {
        // ── report_wa: use isolated monitor token from profiles first ──
        if (isReportDevice) {
          const { data: prof } = await svc.from("profiles")
            .select("whatsapp_monitor_token")
            .eq("id", user.id).maybeSingle();
          if (prof?.whatsapp_monitor_token) {
            await svc.from("devices").update({
              uazapi_token: prof.whatsapp_monitor_token, uazapi_base_url: BASE_URL,
            }).eq("id", deviceId);
            instanceToken = prof.whatsapp_monitor_token;
            instanceUrl = BASE_URL;
            console.log(`[evolution-connect] monitor_token_assigned for report_wa ${deviceId.substring(0, 8)}`);
            await oplog(svc, user.id, "monitor_token_assigned", `Token monitor atribuído para "${deviceName}"`, deviceId);
          }
        }

        // ── Regular devices (or report_wa without monitor token): use pool ──
        if (!instanceToken) {
          let poolToken: any = null;
          for (const st of ["available", "blocked"]) {
            const { data } = await svc.from("user_api_tokens")
              .select("id, token")
              .eq("user_id", user.id).eq("status", st).is("device_id", null)
              .limit(1).maybeSingle();
            if (data) { poolToken = data; break; }
          }

          if (poolToken) {
            await Promise.all([
              svc.from("user_api_tokens").update({
                device_id: deviceId, status: "in_use", assigned_at: new Date().toISOString(),
              }).eq("id", poolToken.id),
              svc.from("devices").update({
                uazapi_token: poolToken.token, uazapi_base_url: BASE_URL,
              }).eq("id", deviceId),
            ]);

            instanceToken = poolToken.token;
            instanceUrl = BASE_URL;
            autoAssignedTokenId = poolToken.id;
            console.log(`[evolution-connect] token_auto_assigned for ${deviceId.substring(0, 8)}`);
            await oplog(svc, user.id, "token_auto_assigned", `Token atribuído para "${deviceName}"`, deviceId, { tokenId: poolToken.id });
          }
        }
      }

      // Auto-create instance on provider if no pool token available
      if (!instanceToken) {
        console.log(`[evolution-connect] no pool token for device=${deviceId.substring(0, 8)}, attempting on-demand creation. BASE_URL=${BASE_URL ? 'set' : 'MISSING'}, ADMIN_TOKEN=${ADMIN_TOKEN ? 'set' : 'MISSING'}`);
        if (BASE_URL && ADMIN_TOKEN) {
          // Get client name for label
          const { data: prof } = await svc.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
          const clientLabel = (prof?.full_name || user.email || "cliente").replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 20);
          const { count: tokenCount } = await svc.from("user_api_tokens")
            .select("id", { count: "exact", head: true }).eq("user_id", user.id);
          const instName = `${clientLabel}_${(tokenCount ?? 0) + 1}`;

          console.log(`[evolution-connect] creating instance: ${instName} at ${BASE_URL}`);
          const createResult = await adminCreateInstance(BASE_URL, ADMIN_TOKEN, instName);
          console.log(`[evolution-connect] createResult ok=${createResult.ok} hasToken=${!!createResult.token} error=${createResult.error || 'none'}`);
          if (createResult.ok && createResult.token) {
            // Check idempotency
            const { data: dup } = await svc.from("user_api_tokens")
              .select("id").eq("token", createResult.token).maybeSingle();

            let newTokenId: string;
            if (dup) {
              newTokenId = dup.id;
              await svc.from("user_api_tokens").update({
                status: "in_use", device_id: deviceId,
                assigned_at: new Date().toISOString(),
              }).eq("id", dup.id);
            } else {
              const { data: ins } = await svc.from("user_api_tokens").insert({
                user_id: user.id, token: createResult.token, admin_id: user.id,
                device_id: deviceId, status: "in_use", healthy: true,
                label: instName, assigned_at: new Date().toISOString(),
                last_checked_at: new Date().toISOString(),
              }).select("id").single();
              newTokenId = ins?.id || "";
            }

            await svc.from("devices").update({
              uazapi_token: createResult.token, uazapi_base_url: BASE_URL,
            }).eq("id", deviceId);

            instanceToken = createResult.token;
            instanceUrl = BASE_URL;
            autoAssignedTokenId = newTokenId;
            console.log(`[evolution-connect] on-demand token created: ${instName} for ${deviceId.substring(0, 8)}`);
            await oplog(svc, user.id, "token_on_demand", `Token gerado sob demanda: ${instName}`, deviceId, { label: instName });
          } else {
            console.log(`[evolution-connect] on-demand creation FAILED: ${createResult.error}`);
            await oplog(svc, user.id, "token_on_demand_failed", `Falha ao criar token sob demanda: ${createResult.error}`, deviceId);
          }
        } else {
          console.log(`[evolution-connect] cannot create on-demand: BASE_URL=${BASE_URL ? 'set' : 'MISSING'} ADMIN_TOKEN=${ADMIN_TOKEN ? 'set' : 'MISSING'}`);
        }
      }

      if (!instanceToken) {
        console.log(`[evolution-connect] NO TOKEN AVAILABLE for device=${deviceId.substring(0, 8)} user=${user.id.substring(0, 8)}`);
        return json({ error: "Nenhum token disponível. Solicite ao administrador.", code: "NO_TOKEN" }, 400);
      }

      // Set proxy if provided — BLOCKING
      if (body.proxyConfig?.host) {
        const proxyResult = await setProxy(instanceUrl, instanceToken, body.proxyConfig);
        await oplog(svc, user.id, proxyResult.ok ? "proxy_configured" : "proxy_failed",
          `Proxy ${proxyResult.ok ? "OK" : "FALHA"} para "${deviceName}"`, deviceId,
          { host: body.proxyConfig.host, success: proxyResult.ok, error: proxyResult.error });
        if (!proxyResult.ok) {
          if (body.proxyId) await svc.from("proxies").update({ status: "INVALID" }).eq("id", body.proxyId);
          return json({ error: proxyResult.error || "Proxy inválida. QR bloqueado.", code: "PROXY_FAILED" }, 400);
        }
      }

      // ── Try connect, with auto-retry loop on 401 (up to 5 tokens) ──
      let currentToken = instanceToken;
      let currentTokenId = autoAssignedTokenId;
      const MAX_TOKEN_RETRIES = 5;
      let tokenAttempt = 0;
      let connectRes: any = null;

      while (tokenAttempt < MAX_TOKEN_RETRIES) {
        tokenAttempt++;
        connectRes = await uazapi(instanceUrl, "/instance/connect", currentToken, "POST", {}, { timeoutMs: 8000, retries: 1 });
        
        if (connectRes.status !== 401) break; // Success or non-token error — exit loop

        // ── ROLLBACK: mark token as invalid and release from device ──
        console.log(`[evolution-connect] 401 rollback for device=${deviceId.substring(0, 8)} token=${currentToken.substring(0, 8)} attempt=${tokenAttempt}`);
        await Promise.all([
          svc.from("user_api_tokens").update({
            status: "invalid", healthy: false, device_id: null,
            last_checked_at: new Date().toISOString(),
          }).eq("token", currentToken),
          svc.from("devices").update({
            uazapi_token: null, uazapi_base_url: null,
          }).eq("id", deviceId),
        ]);
        await oplog(svc, user.id, "token_invalid_rollback", `Token inválido revertido para "${deviceName}" (tentativa ${tokenAttempt})`, deviceId);

        // ── Find next available token ──
        let nextToken: any = null;
        for (const st of ["available", "blocked"]) {
          const { data } = await svc.from("user_api_tokens")
            .select("id, token")
            .eq("user_id", user.id).eq("status", st).is("device_id", null)
            .limit(1).maybeSingle();
          if (data) { nextToken = data; break; }
        }

        if (!nextToken) {
          return json({ error: "Todos os tokens inválidos. Solicite novos tokens ao administrador.", code: "TOKEN_INVALID" }, 401);
        }

        // Assign next token
        await Promise.all([
          svc.from("user_api_tokens").update({
            device_id: deviceId, status: "in_use", assigned_at: new Date().toISOString(),
          }).eq("id", nextToken.id),
          svc.from("devices").update({
            uazapi_token: nextToken.token, uazapi_base_url: BASE_URL,
          }).eq("id", deviceId),
        ]);
        console.log(`[evolution-connect] retry with token=${nextToken.token.substring(0, 8)} attempt=${tokenAttempt + 1}`);

        currentToken = nextToken.token;
        currentTokenId = nextToken.id;
        instanceToken = currentToken;
        instanceUrl = BASE_URL;
      }

      // If we exhausted all retries and last was still 401
      if (connectRes?.status === 401) {
        return json({ error: "Todos os tokens testados são inválidos. Solicite novos tokens ao administrador.", code: "TOKEN_INVALID" }, 401);
      }

      const connInst = connectRes.data?.instance || connectRes.data || {};
      const connStatus = connInst.status || connectRes.data?.status;

      // Already connected?
      if (connStatus === "connected") {
        const phone = connInst.owner || connInst.phone || "";
        const pName = connInst.profileName || connInst.pushname || "";
        const resp = await handleAlreadyConnected(svc, user.id, deviceId, deviceName, phone, pName, device?.login_type || "", instanceUrl, instanceToken);
        if (resp) return resp;
      }

      let qr = connInst.qrcode || connectRes.data?.qrcode;

      // Poll for QR if not returned immediately (up to 3 attempts, ~3s total)
      if (!qr) {
        for (let attempt = 0; attempt < 3 && !qr; attempt++) {
          await new Promise(r => setTimeout(r, 800));
          const poll = await uazapi(instanceUrl, "/instance/status", instanceToken, "GET", undefined, { timeoutMs: 4000, retries: 0 });
          const pi = poll.data?.instance || poll.data || {};
          qr = pi.qrcode || poll.data?.qrcode;
          const st = pi.status || poll.data?.status;
          if (st === "connected") {
            const phone = pi.owner || pi.phone || "";
            const pName = pi.profileName || pi.pushname || "";
            const resp = await handleAlreadyConnected(svc, user.id, deviceId, deviceName, phone, pName, device?.login_type || "", instanceUrl, instanceToken);
            if (resp) return resp;
            break;
          }
          if (qr) break;
        }
      }

      return json({
        success: true,
        base64: qr || null,
        qr: qr || null,
        status: qr ? "connecting" : "waiting",
        instanceToken,
      });
    }

    // ════════════════════════════════════════════════════════════════════
    // ── requestPairingCode ──
    // ════════════════════════════════════════════════════════════════════
    if (action === "requestPairingCode") {
      const phoneNumber = body.phoneNumber?.replace(/\D/g, "");
      if (!phoneNumber || phoneNumber.length < 10) return json({ error: "Número inválido." }, 400);

      const currentCheck = await checkStatus(5000);
      if (!currentCheck.valid) return json({ error: "Token inválido.", code: "TOKEN_INVALID" }, 401);

      // Set proxy if needed
      if (body.proxyConfig?.host) {
        const proxyResult = await setProxy(instanceUrl, instanceToken, body.proxyConfig);
        if (!proxyResult.ok) {
          if (body.proxyId) await svc.from("proxies").update({ status: "INVALID" }).eq("id", body.proxyId);
          return json({ error: proxyResult.error || "Proxy inválida.", code: "PROXY_FAILED" }, 400);
        }
      }

      // Already connected?
      if (currentCheck.status === "connected") {
        const fmt = currentCheck.owner ? formatBrPhone(currentCheck.owner) : "";
        await svc.from("devices").update({ status: "Ready", number: fmt }).eq("id", deviceId);
        return json({ success: true, alreadyConnected: true, phone: fmt, status: "authenticated" });
      }

      // Disconnect if needed
      if (currentCheck.status !== "disconnected" && currentCheck.status) {
        await uazapi(instanceUrl, "/instance/disconnect", instanceToken, "POST", undefined, { timeoutMs: 5000, retries: 0 });
        await new Promise(r => setTimeout(r, 1000));
      }

      // Request pairing code
      const connectRes = await uazapi(instanceUrl, "/instance/connect", instanceToken, "POST", { phone: phoneNumber }, { timeoutMs: 10000, retries: 1 });

      const extractCode = (obj: any): string | null => {
        if (!obj || typeof obj !== "object") return null;
        for (const key of ["pairingCode", "pairing_code", "paircode", "code"]) {
          const val = obj[key];
          if (val && typeof val === "string" && val.length >= 4 && val.length <= 20) return val;
        }
        if (obj.instance) return extractCode(obj.instance);
        return null;
      };

      let pairingCode = extractCode(connectRes.data);

      // Poll 3 times max (reduced from 5)
      if (!pairingCode) {
        for (let i = 0; i < 3; i++) {
          await new Promise(r => setTimeout(r, 800));
          const poll = await uazapi(instanceUrl, "/instance/status", instanceToken, "GET", undefined, { timeoutMs: 4000, retries: 0 });
          pairingCode = extractCode(poll.data);
          if (pairingCode) break;
          const st = poll.data?.instance?.status || poll.data?.status;
          if (st === "connected") {
            const phone = poll.data?.instance?.owner || poll.data?.instance?.phone || "";
            const fmt = phone ? formatBrPhone(phone) : "";
            await svc.from("devices").update({ status: "Ready", number: fmt }).eq("id", deviceId);
            return json({ success: true, alreadyConnected: true, phone: fmt, status: "authenticated" });
          }
        }
      }

      if (pairingCode) return json({ success: true, pairingCode, status: "connecting" });

      // Fallback: suggest QR
      const fallback = await checkStatus(4000);
      if (fallback.qrcode) {
        return json({ success: false, error: "Servidor não suporta código de pareamento. Use QR Code.", suggestQr: true, qrCode: fallback.qrcode }, 200);
      }

      return json({ error: "Não foi possível gerar código. Use QR Code.", suggestQr: true }, 200);
    }

    // ════════════════════════════════════════════════════════════════════
    // ── refreshQr ──
    // ════════════════════════════════════════════════════════════════════
    if (action === "refreshQr") {
      const statusCheck = await checkStatus(5000);

      if (statusCheck.status === "connected") {
        const phone = statusCheck.owner || "";
        const fmt = phone ? formatBrPhone(phone) : "";
        const dup = await checkDuplicatePhone(svc, user.id, deviceId, phone);
        if (dup.isDuplicate) {
          await uazapi(instanceUrl, "/instance/disconnect", instanceToken, "POST", undefined, { timeoutMs: 5000, retries: 0 });
          return json({ success: false, error: `Número já conectado em "${dup.existingDeviceName}".`, code: "DUPLICATE_PHONE" });
        }
        return json({ success: true, alreadyConnected: true, phone: fmt, status: "authenticated" });
      }

      if (!statusCheck.valid) return json({ error: "Token expirado.", code: "TOKEN_INVALID" }, 401);
      if (statusCheck.status === "connecting" && statusCheck.qrcode) {
        return json({ success: true, base64: statusCheck.qrcode, qr: statusCheck.qrcode, status: "connecting" });
      }

      // Request new QR with retry
      const connectRes = await uazapi(instanceUrl, "/instance/connect", instanceToken, "POST", {}, { timeoutMs: 8000, retries: 1 });
      const connInst = connectRes.data?.instance || connectRes.data || {};
      let qr = connInst.qrcode || connectRes.data?.qrcode;

      // Single poll if no QR
      if (!qr) {
        await new Promise(r => setTimeout(r, 600));
        const poll = await uazapi(instanceUrl, "/instance/status", instanceToken, "GET", undefined, { timeoutMs: 4000, retries: 0 });
        const pi = poll.data?.instance || poll.data || {};
        qr = pi.qrcode || poll.data?.qrcode;
        if ((pi.status || poll.data?.status) === "connected") {
          return json({ success: true, alreadyConnected: true, status: "authenticated" });
        }
      }

      return json({ success: true, base64: qr || null, qr: qr || null, status: qr ? "connecting" : "waiting" });
    }

    // ════════════════════════════════════════════════════════════════════
    // ── keepAlive — lightweight, no reconnect ──
    // ════════════════════════════════════════════════════════════════════
    if (action === "keepAlive") {
      const check = await checkStatus(5000);
      if (check.status === "connected") return json({ success: true, status: "authenticated", alive: true });

      await svc.from("devices").update({ status: "Disconnected" }).eq("id", deviceId);
      return json({ success: true, status: check.status, alive: false });
    }

    // ════════════════════════════════════════════════════════════════════
    // ── status — lightweight polling during QR scan ──
    // ════════════════════════════════════════════════════════════════════
    if (action === "status") {
      const check = await checkStatus(5000);
      if (!check.valid) return json({ success: true, status: "token_invalid", tokenInvalid: true });

      const isConnected = check.status === "connected";

      if (isConnected && check.owner) {
        const fmt = formatBrPhone(check.owner);

        // Check if status actually changed
        const wasDisconnected = device?.status !== "Ready" && device?.status !== "Connected";

        await svc.from("devices").update({
          status: "Ready", number: fmt,
          profile_name: check.profileName || device?.profile_name || "",
        }).eq("id", deviceId);

        if (wasDisconnected && device?.login_type !== "report_wa") {
          notifyConnectionChange(svc, user.id, deviceName, fmt, check.profileName || "", true).catch(() => {});
        }
      }

      return json({
        success: true,
        status: isConnected ? "authenticated" : check.status,
        phone: check.owner || "",
        base64: check.qrcode || null,
        qr: check.qrcode || null,
        profileName: check.profileName || "",
        profilePicUrl: check.profilePicUrl || "",
      });
    }

    // ════════════════════════════════════════════════════════════════════
    // ── logout ──
    // ════════════════════════════════════════════════════════════════════
    if (action === "logout") {
      const phoneForAlert = device?.number || "";

      // Disconnect from WhatsApp
      if (instanceToken && instanceUrl) {
        await uazapi(instanceUrl, "/instance/disconnect", instanceToken, "POST", undefined, { timeoutMs: 8000, retries: 1 });
      }

      // Clear session, keep token
      await svc.from("devices").update({
        status: "Disconnected", number: null, profile_picture: null, profile_name: null,
      }).eq("id", deviceId);

      // Fire-and-forget notification
      if (device?.login_type !== "report_wa") {
        notifyConnectionChange(svc, user.id, deviceName, phoneForAlert, device?.profile_name || "", false).catch(() => {});
      }

      return json({ success: true });
    }

    // ════════════════════════════════════════════════════════════════════
    // ── sendText ──
    // ════════════════════════════════════════════════════════════════════
    if (action === "sendText") {
      const { number, text } = body;
      if (!number || !text) return json({ error: "number e text obrigatórios" }, 400);
      const r = await uazapi(instanceUrl, "/send/text", instanceToken, "POST", {
        number: number.replace(/\D/g, ""), text,
      }, { timeoutMs: 10000, retries: 1 });
      if (!r.ok) return json({ error: `sendText falhou [${r.status}]`, details: r.data }, r.status);
      return json({ success: true, data: r.data });
    }

    // ════════════════════════════════════════════════════════════════════
    // ── updateProfileName ──
    // ════════════════════════════════════════════════════════════════════
    if (action === "updateProfileName") {
      const { profileName } = body;
      if (!profileName) return json({ error: "profileName obrigatório" }, 400);

      for (const ep of [
        { path: "/profile/name", payload: { name: profileName } },
        { path: "/profile/update-name", payload: { name: profileName } },
        { path: "/instance/profile/name", payload: { name: profileName } },
        { path: "/profile-name", payload: { value: profileName } },
      ]) {
        const r = await uazapi(instanceUrl, ep.path, instanceToken, "POST", ep.payload, { timeoutMs: 6000, retries: 1 });
        if (r.ok) {
          await svc.from("devices").update({ profile_name: profileName }).eq("id", deviceId);
          return json({ success: true, endpoint: ep.path, ...r.data });
        }
      }
      await svc.from("devices").update({ profile_name: profileName }).eq("id", deviceId);
      return json({ success: false, error: "Nenhum endpoint de nome funcionou" });
    }

    // ════════════════════════════════════════════════════════════════════
    // ── updateProfilePicture ──
    // ════════════════════════════════════════════════════════════════════
    if (action === "updateProfilePicture") {
      const { profilePictureData } = body;
      const normalizedPicture = typeof profilePictureData === "string" ? profilePictureData.trim() : "";
      if (!normalizedPicture) return json({ error: "profilePictureData obrigatório" }, 400);

      const imageVariants = await resolveProfileImageVariants(normalizedPicture);
      if (imageVariants.length === 0) {
        return json({ success: false, error: "Imagem inválida para atualização de foto." });
      }

      const failures: Array<{ path: string; method: string; status: number; error: string | null }> = [];

      for (const imageValue of imageVariants) {
        const isRemove = imageValue === "remove";

        const attempts = [
          // uazapiGO canonical endpoint
          { path: "/profile/image", method: "POST" as const, payload: { image: imageValue } },
          // alternate accepted payload keys in some providers
          { path: "/profile/image", method: "POST" as const, payload: { picture: imageValue } },
          { path: "/profile/image", method: "POST" as const, payload: { url: imageValue } },
          { path: "/profile/image", method: "POST" as const, payload: { imageUrl: imageValue } },
          { path: "/profile/image", method: "POST" as const, payload: { file: imageValue } },
          { path: "/profile/image", method: "PUT" as const, payload: { image: imageValue } },
          // legacy fallbacks
          { path: "/profile/picture", method: "POST" as const, payload: { image: imageValue } },
          { path: "/profile-picture", method: "POST" as const, payload: { image: imageValue } },
        ];

        for (const ep of attempts) {
          const r = await uazapi(instanceUrl, ep.path, instanceToken, ep.method, ep.payload, { timeoutMs: 10000, retries: 1 });
          console.log(`[profile-pic] ${ep.method} ${ep.path} => ${r.status} ok=${r.ok}`, JSON.stringify(r.data).substring(0, 250));

          if (r.ok) {
            const dbValue = normalizedPicture === "remove" || isRemove ? null : normalizedPicture;
            await svc.from("devices").update({ profile_picture: dbValue }).eq("id", deviceId);
            return json({ success: true, endpoint: ep.path, method: ep.method, ...r.data });
          }

          failures.push({
            path: ep.path,
            method: ep.method,
            status: r.status,
            error: (r.data?.error || r.data?.message || r.data?.raw || null) as string | null,
          });
        }
      }

      return json({
        success: false,
        error: normalizedPicture === "remove"
          ? "Não foi possível remover a foto no provedor."
          : "A imagem não foi aceita pelo WhatsApp. Use uma foto JPG quadrada, mínimo 192×192px e máximo 5MB.",
        attempts: failures,
      });
    }

    // ── updateProfileStatus ──
    if (action === "updateProfileStatus") {
      const { profileStatus } = body;
      for (const ep of [
        { path: "/profile/status", payload: { status: profileStatus } },
        { path: "/profile/about", payload: { about: profileStatus } },
      ]) {
        const r = await uazapi(instanceUrl, ep.path, instanceToken, "POST", ep.payload, { timeoutMs: 6000, retries: 1 });
        if (r.ok) return json({ success: true, ...r.data });
      }
      return json({ error: "Não foi possível atualizar o recado." }, 500);
    }

    // ════════════════════════════════════════════════════════════════════
    // ── listGroups ──
    // ════════════════════════════════════════════════════════════════════
    if (action === "listGroups") {
      const allGroups: any[] = [];
      const seenIds = new Set<string>();

      for (let page = 0; page < 10; page++) {
        const r = await uazapi(instanceUrl, `/group/list?GetParticipants=false&page=${page}&count=200`, instanceToken, "GET", undefined, { timeoutMs: 10000, retries: 1 });
        if (!r.ok) break;
        const arr = Array.isArray(r.data) ? r.data : r.data?.groups || r.data?.data || [];
        if (!Array.isArray(arr) || arr.length === 0) break;
        for (const g of arr) {
          const gid = g.id || g.jid || "";
          if (gid && !seenIds.has(gid)) {
            seenIds.add(gid);
            allGroups.push({ id: gid, name: g.subject || g.name || g.groupName || "Sem nome", participants: g.participants?.length || g.size || 0 });
          }
        }
        if (arr.length < 200) break;
      }

      if (allGroups.length === 0) {
        const r2 = await uazapi(instanceUrl, "/group/listAll", instanceToken, "GET", undefined, { timeoutMs: 10000, retries: 1 });
        if (r2.ok) {
          const arr2 = Array.isArray(r2.data) ? r2.data : r2.data?.groups || [];
          for (const g of arr2) {
            const gid = g.id || g.jid || "";
            if (gid && !seenIds.has(gid)) {
              seenIds.add(gid);
              allGroups.push({ id: gid, name: g.subject || g.name || g.groupName || "Sem nome", participants: g.participants?.length || g.size || 0 });
            }
          }
        }
      }

      return json({ success: true, groups: allGroups });
    }

    // ── sendMedia ──
    if (action === "sendMedia") {
      const { number, mediaUrl, caption, type: mediaType } = body;
      if (!number || !mediaUrl) return json({ error: "number e mediaUrl obrigatórios" }, 400);
      const endpoint = mediaType === "document" ? "/send/document" : "/send/media";
      const r = await uazapi(instanceUrl, endpoint, instanceToken, "POST", {
        number: number.replace(/\D/g, ""), media: mediaUrl, caption: caption || "",
      }, { timeoutMs: 15000, retries: 1 });
      if (!r.ok) return json({ error: `sendMedia falhou [${r.status}]`, details: r.data }, r.status);
      return json({ success: true, data: r.data });
    }

    // ════════════════════════════════════════════════════════════════════
    // ── deleteInstance ──
    // ════════════════════════════════════════════════════════════════════
    if (action === "deleteInstance") {
      let deleted = false;

      if (instanceToken) {
        await uazapi(instanceUrl, "/instance/disconnect", instanceToken, "POST", undefined, { timeoutMs: 5000, retries: 0 }).catch(() => {});

        for (const ep of ["/instance/delete", "/instance/remove"]) {
          for (const m of ["DELETE" as const, "POST" as const]) {
            const r = await uazapi(instanceUrl, ep, instanceToken, m, undefined, { timeoutMs: 8000, retries: 0 });
            if (r.ok) { deleted = true; break; }
          }
          if (deleted) break;
        }
      }

      if (!deleted && BASE_URL && ADMIN_TOKEN) {
        const headerVariants = [
          { admintoken: ADMIN_TOKEN },
          { token: ADMIN_TOKEN },
          { Authorization: `Bearer ${ADMIN_TOKEN}` },
        ];
        outer:
        for (const ep of ["/instance/delete", "/instance/remove"]) {
          for (const method of ["DELETE", "POST"] as const) {
            for (const authHeaders of headerVariants) {
              try {
                const controller = new AbortController();
                const tid = setTimeout(() => controller.abort(), 8000);
                const res = await fetch(`${BASE_URL}${ep}`, {
                  method,
                  headers: { ...authHeaders, Accept: "application/json", "Content-Type": "application/json" },
                  body: JSON.stringify({ token: instanceToken }),
                  signal: controller.signal,
                });
                clearTimeout(tid);
                await res.text();
                if (res.ok) { deleted = true; break outer; }
                if (res.status === 401) continue;
                if (res.status === 405) break;
              } catch { /* ignore */ }
            }
          }
        }
      }

      // Release token back to pool
      await Promise.all([
        svc.from("user_api_tokens").update({ status: "available", device_id: null, assigned_at: null }).eq("device_id", deviceId),
        svc.from("devices").update({ uazapi_token: null, uazapi_base_url: null }).eq("id", deviceId),
      ]);

      return json({ success: true, deleted });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (err: any) {
    console.error("Edge function error:", err);
    return json({ error: err.message || "Erro interno" }, 500);
  }
});
