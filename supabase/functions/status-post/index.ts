import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type StatusType = "text" | "image" | "video" | "audio";

interface PostBody {
  type: StatusType;
  text_content?: string;
  media_url?: string;
  caption?: string;
  background_color?: string;
  font?: number;
  device_ids: string[];
}

function buildAttempts(payload: PostBody): { path: string; body: Record<string, unknown> }[] {
  const { type, text_content, media_url, caption, background_color, font } = payload;

  if (type === "text") {
    const text = (text_content || "").trim();
    return [
      {
        path: "/send/status",
        body: {
          type: "text",
          text,
          backgroundColor: background_color || "#25D366",
          font: font ?? 1,
        },
      },
      {
        path: "/message/sendStatus",
        body: {
          type: "text",
          text,
          backgroundColor: background_color || "#25D366",
          font: font ?? 1,
        },
      },
    ];
  }

  if (type === "image") {
    return [
      { path: "/send/status", body: { type: "image", file: media_url, caption: caption || "" } },
      { path: "/send/status", body: { type: "image", media: media_url, caption: caption || "" } },
      { path: "/message/sendStatus", body: { type: "image", file: media_url, caption: caption || "" } },
    ];
  }

  if (type === "video") {
    return [
      { path: "/send/status", body: { type: "video", file: media_url, caption: caption || "" } },
      { path: "/send/status", body: { type: "video", media: media_url, caption: caption || "" } },
      { path: "/message/sendStatus", body: { type: "video", file: media_url, caption: caption || "" } },
    ];
  }

  // audio
  return [
    { path: "/send/status", body: { type: "audio", file: media_url } },
    { path: "/send/status", body: { type: "audio", media: media_url } },
    { path: "/message/sendStatus", body: { type: "audio", file: media_url } },
  ];
}

async function postOnce(baseUrl: string, token: string, payload: PostBody) {
  const attempts = buildAttempts(payload);
  let lastErr = "";

  for (const attempt of attempts) {
    try {
      const res = await fetch(`${baseUrl}${attempt.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", token },
        body: JSON.stringify(attempt.body),
      });
      const raw = await res.text();
      let parsed: any = {};
      try { parsed = raw ? JSON.parse(raw) : {}; } catch {}

      console.log(`[status-post] ${attempt.path} → ${res.status}`, raw.substring(0, 300));

      const explicitFailure = Boolean(parsed?.error || parsed?.status === "error" || parsed?.code === 404);

      if (res.ok && !explicitFailure) {
        return { sent: true as const, parsed };
      }

      lastErr = `${res.status} @ ${attempt.path}: ${(typeof parsed?.message === "string" && parsed.message) || (typeof parsed?.error === "string" && parsed.error) || raw.substring(0, 200)}`;

      if (res.status === 401 || res.status === 403) break;
    } catch (e: any) {
      lastErr = `${attempt.path}: ${e?.message || String(e)}`;
    }
  }

  return { sent: false as const, error: lastErr || "Falha ao publicar status" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const fallbackBaseUrl = Deno.env.get("UAZAPI_BASE_URL") || "";
    const fallbackToken = Deno.env.get("UAZAPI_TOKEN") || "";

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) return json({ error: "Não autenticado" }, 401);

    const body = (await req.json()) as PostBody;

    // Basic validation
    const validTypes: StatusType[] = ["text", "image", "video", "audio"];
    if (!body || !validTypes.includes(body.type)) {
      return json({ error: "Tipo inválido" }, 400);
    }
    if (body.type === "text" && !(body.text_content || "").trim()) {
      return json({ error: "Texto obrigatório" }, 400);
    }
    if (body.type !== "text" && !(body.media_url || "").trim()) {
      return json({ error: "Mídia obrigatória" }, 400);
    }
    if (!Array.isArray(body.device_ids) || body.device_ids.length === 0) {
      return json({ error: "Selecione ao menos uma instância" }, 400);
    }

    const admin: any = createClient(supabaseUrl, serviceKey);

    // Create record
    const { data: post, error: insErr } = await admin
      .from("status_posts")
      .insert({
        user_id: user.id,
        type: body.type,
        text_content: body.text_content || null,
        media_url: body.media_url || null,
        media_type: body.type !== "text" ? body.type : null,
        caption: body.caption || null,
        background_color: body.background_color || null,
        font: body.font ?? null,
        device_ids: body.device_ids,
        status: "sending",
      })
      .select()
      .single();

    if (insErr || !post) {
      return json({ error: "Falha ao criar registro: " + (insErr?.message || "") }, 500);
    }

    // Fetch devices
    const { data: devices } = await admin
      .from("devices")
      .select("id, name, number, uazapi_token, uazapi_base_url")
      .eq("user_id", user.id)
      .in("id", body.device_ids);

    const results: any[] = [];
    let success = 0;
    let errors = 0;

    for (const dev of (devices || [])) {
      const baseUrl = String(dev.uazapi_base_url || fallbackBaseUrl || "").replace(/\/+$/, "");
      const token = String(dev.uazapi_token || fallbackToken || "").trim();

      if (!baseUrl || !token) {
        results.push({ device_id: dev.id, name: dev.name, success: false, error: "API não configurada" });
        errors++;
        continue;
      }

      const r = await postOnce(baseUrl, token, body);
      if (r.sent) {
        success++;
        results.push({ device_id: dev.id, name: dev.name, success: true });
      } else {
        errors++;
        results.push({ device_id: dev.id, name: dev.name, success: false, error: r.error });
      }
    }

    const finalStatus = errors === 0 ? "completed" : success === 0 ? "failed" : "completed";

    await admin
      .from("status_posts")
      .update({
        status: finalStatus,
        success_count: success,
        error_count: errors,
        results,
      })
      .eq("id", post.id);

    return json({
      success: true,
      post_id: post.id,
      success_count: success,
      error_count: errors,
      results,
    });
  } catch (err: any) {
    console.error("[status-post] error", err);
    return json({ error: err?.message || "Erro interno" }, 500);
  }
});
