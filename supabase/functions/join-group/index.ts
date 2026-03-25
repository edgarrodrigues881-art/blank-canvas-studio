import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractInviteCode(link: string): string | null {
  try {
    const cleaned = link.trim()
      .replace(/^https?:\/\//, "")
      .replace(/^chat\.whatsapp\.com\//, "");
    const code = cleaned.split("?")[0].split("/")[0].trim();
    return code && code.length >= 10 ? code : null;
  } catch (_e) {
    return null;
  }
}

interface JoinRequest {
  groupLink: string;
  groupName: string;
  deviceId: string;
  deviceName: string;
}

interface JoinResult {
  device: string;
  group: string;
  status: "success" | "error" | "already_member" | "pending_approval";
  error?: string;
  responseStatus?: number;
  responseBody?: string;
  inviteCode?: string;
  durationMs?: number;
  attempt: number;
}

async function tryJoin(
  baseUrl: string,
  token: string,
  inviteCode: string,
  groupLink: string,
): Promise<{ ok: boolean; status: number; body: any; raw: string; endpoint: string }> {
  const headers: Record<string, string> = {
    token: token,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  // Clean group link: remove query params that may confuse the API
  const cleanLink = groupLink.split("?")[0];

  // UaZapi V2 documented endpoint: POST /group/join with { invitecode: "code_or_url" }
  const endpoints = [
    // Primary: POST /group/join with just the invite code (most reliable)
    { method: "POST", url: `${baseUrl}/group/join`, body: JSON.stringify({ invitecode: inviteCode }) },
    // Fallback: POST /group/join with clean URL (no query params)
    { method: "POST", url: `${baseUrl}/group/join`, body: JSON.stringify({ invitecode: cleanLink }) },
    // Legacy: PUT /group/acceptInviteGroup
    { method: "PUT", url: `${baseUrl}/group/acceptInviteGroup`, body: JSON.stringify({ inviteCode }) },
  ];

  for (const ep of endpoints) {
    try {
      console.log(`${ep.method} ${ep.url} body=${ep.body}`);
      const res = await fetch(ep.url, {
        method: ep.method,
        headers: ep.body ? headers : { token, Accept: "application/json" },
        ...(ep.body ? { body: ep.body } : {}),
      });
      const raw = await res.text();
      let body: any;
      try { body = JSON.parse(raw); } catch (_e) { body = { raw }; }
      console.log(`${ep.method} result: ${res.status} ${raw.substring(0, 300)}`);

      // If 405 Method Not Allowed, try next strategy
      if (res.status === 405) continue;
      // If 500 with generic error, try next strategy (might be wrong format)
      if (res.status === 500 && (body?.error === "error joining group" || body?.error === "internal server error")) continue;

      return { ok: res.ok, status: res.status, body, raw, endpoint: `${ep.method} ${ep.url}` };
    } catch (err) {
      console.error(`${ep.method} error:`, err);
      continue;
    }
  }

  return { ok: false, status: 500, body: { message: "Falha ao entrar no grupo — o convite pode estar expirado ou inválido" }, raw: "", endpoint: "all failed" };
}

function interpretResult(status: number, body: any): { joinStatus: JoinResult["status"]; error?: string } {
  if (status >= 200 && status < 300) {
    const msg = (body?.message || body?.msg || "").toLowerCase();
    if (msg.includes("already") || msg.includes("já")) {
      return { joinStatus: "already_member" };
    }
    if (msg.includes("pending") || msg.includes("approval") || msg.includes("aprovação")) {
      return { joinStatus: "pending_approval", error: "Aguardando aprovação do admin" };
    }
    return { joinStatus: "success" };
  }

  const msg = body?.message || body?.msg || JSON.stringify(body).substring(0, 200);

  if (status === 404) return { joinStatus: "error", error: "Convite inválido ou expirado" };
  if (status === 409) return { joinStatus: "already_member" };
  if (status === 429) return { joinStatus: "error", error: "Rate limited — tente novamente mais tarde" };
  if (status === 0) return { joinStatus: "error", error: msg };

  return { joinStatus: "error", error: `Erro ${status}: ${msg}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const {
      data: { user },
      error: authError,
    } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // ── PLAN CHECK ──
    const { data: activeSub } = await supabase
      .from("subscriptions")
      .select("expires_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: userProfile } = await supabase.from("profiles").select("status").eq("id", user.id).maybeSingle();
    const planExpired = !activeSub || new Date(activeSub.expires_at) < new Date();
    const accountBlocked = userProfile?.status === "suspended" || userProfile?.status === "cancelled";
    if (planExpired || accountBlocked) {
      return new Response(JSON.stringify({ error: "Seu plano está inativo. Ative um plano para continuar.", code: "NO_ACTIVE_PLAN" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Support both old format and new format
    const items: JoinRequest[] = body.items || [];
    if (!items.length && body.groupLinks?.length && body.deviceIds?.length) {
      // Legacy format: expand
      for (const deviceId of body.deviceIds) {
        for (const groupLink of body.groupLinks) {
          items.push({ groupLink, groupName: groupLink, deviceId, deviceName: deviceId });
        }
      }
    }

    if (!items.length) {
      return new Response(
        JSON.stringify({ error: "Nenhum item para processar" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Removed global UAZAPI fallbacks — each device must use its own token

    // Fetch all unique device IDs
    const deviceIds = [...new Set(items.map((i) => i.deviceId))];
    const { data: devices } = await supabase
      .from("devices")
      .select("id, name, number, status, uazapi_token, uazapi_base_url")
      .in("id", deviceIds)
      .eq("user_id", user.id);

    const deviceMap = new Map((devices || []).map((d: any) => [d.id, d]));

    const results: JoinResult[] = [];

    for (const item of items) {
      const startTime = Date.now();
      const device = deviceMap.get(item.deviceId);

      // Step 1: Validate device
      if (!device) {
        const r: JoinResult = {
          device: item.deviceName,
          group: item.groupName,
          status: "error",
          error: "Dispositivo não encontrado",
          attempt: 1,
          durationMs: Date.now() - startTime,
        };
        results.push(r);
        await logResult(supabase, user.id, item, r);
        continue;
      }

      const deviceToken = device.uazapi_token;
      const deviceBaseUrl = (device.uazapi_base_url || "").replace(/\/+$/, "");

      if (!deviceToken || !deviceBaseUrl) {
        const r: JoinResult = {
          device: device.name,
          group: item.groupName,
          status: "error",
          error: "Token ou URL não configurado para este dispositivo",
          attempt: 1,
          durationMs: Date.now() - startTime,
        };
        results.push(r);
        await logResult(supabase, user.id, item, r);
        continue;
      }

      const onlineStatuses = ["Connected", "authenticated", "Ready", "ready"];
      if (!onlineStatuses.includes(device.status)) {
        const r: JoinResult = {
          device: device.name,
          group: item.groupName,
          status: "error",
          error: "Instância desconectada",
          attempt: 1,
          durationMs: Date.now() - startTime,
        };
        results.push(r);
        await logResult(supabase, user.id, item, r);
        continue;
      }

      // Step 2: Extract invite code
      const inviteCode = extractInviteCode(item.groupLink);
      if (!inviteCode) {
        const r: JoinResult = {
          device: device.name,
          group: item.groupName,
          status: "error",
          error: "Link inválido — não foi possível extrair o código de convite",
          inviteCode: "",
          attempt: 1,
          durationMs: Date.now() - startTime,
        };
        results.push(r);
        await logResult(supabase, user.id, item, r);
        continue;
      }

      // Step 3: Join with retry
      let finalResult: JoinResult | null = null;
      const maxAttempts = 2;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const joinRes = await tryJoin(deviceBaseUrl, deviceToken, inviteCode, item.groupLink);
        const interpreted = interpretResult(joinRes.status, joinRes.body);

        const r: JoinResult = {
          device: device.name,
          group: item.groupName,
          status: interpreted.joinStatus,
          error: interpreted.error,
          responseStatus: joinRes.status,
          responseBody: joinRes.raw.substring(0, 500),
          inviteCode,
          attempt,
          durationMs: Date.now() - startTime,
        };

        // Don't retry for non-transient errors
        if (
          interpreted.joinStatus === "success" ||
          interpreted.joinStatus === "already_member" ||
          interpreted.joinStatus === "pending_approval" ||
          joinRes.status === 404 ||
          joinRes.status === 409
        ) {
          finalResult = r;
          break;
        }

        // Retry only for transient errors
        if (attempt < maxAttempts && (joinRes.status === 429 || joinRes.status >= 500 || joinRes.status === 0)) {
          await new Promise((res) => setTimeout(res, 3000));
          continue;
        }

        finalResult = r;
      }

      if (finalResult) {
        results.push(finalResult);
        await logResult(supabase, user.id, item, finalResult);
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("join-group error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function logResult(supabase: any, userId: string, item: JoinRequest, result: JoinResult) {
  try {
    await supabase.from("group_join_logs").insert({
      user_id: userId,
      device_id: item.deviceId,
      device_name: result.device,
      group_name: item.groupName,
      group_link: item.groupLink,
      invite_code: result.inviteCode || "",
      endpoint_called: "group/acceptInviteGroup",
      response_status: result.responseStatus || 0,
      response_body: (result.responseBody || "").substring(0, 1000),
      result: result.status,
      error_message: result.error || null,
      attempt: result.attempt,
      duration_ms: result.durationMs || 0,
    });
  } catch (e: any) {
    console.error("Failed to log join result:", e);
  }
}
