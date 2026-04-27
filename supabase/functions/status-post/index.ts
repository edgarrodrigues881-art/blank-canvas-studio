import { createClient } from "npm:@supabase/supabase-js@2";
import { publishToDevices, type StatusType } from "../_shared/status-publish.ts";

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

    const body = await req.json();
    const validTypes: StatusType[] = ["text", "image", "video", "audio"];
    if (!validTypes.includes(body?.type)) return json({ error: "Tipo inválido" }, 400);
    if (body.type === "text" && !(body.text_content || "").trim()) return json({ error: "Texto obrigatório" }, 400);
    if (body.type !== "text" && !(body.media_url || "").trim()) return json({ error: "Mídia obrigatória" }, 400);
    if (!Array.isArray(body.device_ids) || body.device_ids.length === 0) return json({ error: "Selecione ao menos uma instância" }, 400);

    const admin: any = createClient(supabaseUrl, serviceKey);

    const result = await publishToDevices(
      admin,
      user.id,
      {
        type: body.type,
        text_content: body.text_content,
        media_url: body.media_url,
        caption: body.caption,
        background_color: body.background_color,
        font: body.font,
      },
      body.device_ids,
      fallbackBaseUrl,
      fallbackToken,
    );

    return json({ success: true, ...result });
  } catch (err: any) {
    console.error("[status-post] error", err);
    return json({ error: err?.message || "Erro interno" }, 500);
  }
});
