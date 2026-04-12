import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const { deviceId, groupJid, content, type, caption } = body;

    if (!deviceId || !groupJid || !content) {
      return json({ error: "deviceId, groupJid e content são obrigatórios" }, 400);
    }

    // Get device with token
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: device } = await admin
      .from("devices")
      .select("uazapi_token, uazapi_base_url")
      .eq("id", deviceId)
      .eq("user_id", user.id)
      .single();

    if (!device?.uazapi_token || !device?.uazapi_base_url) {
      return json({ error: "Dispositivo não configurado" }, 404);
    }

    const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");
    const headers = {
      token: device.uazapi_token,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    let sendBody: Record<string, unknown>;
    let endpoint: string;

    if (type === "text" || !type) {
      endpoint = `${baseUrl}/send/text`;
      sendBody = { number: groupJid, text: content };
    } else if (type === "image" || type === "video" || type === "document" || type === "audio") {
      endpoint = `${baseUrl}/send/media`;
      sendBody = {
        number: groupJid,
        file: content,
        type,
        ...(caption?.trim() ? { caption: caption.trim(), text: caption.trim() } : {}),
      };
    } else {
      endpoint = `${baseUrl}/send/text`;
      sendBody = { number: groupJid, text: content };
    }

    console.log(`[group-carousel] Sending ${type || "text"} to ${groupJid} via ${endpoint}`);

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(sendBody),
    });

    const resText = await res.text();
    console.log(`[group-carousel] Response: ${res.status} ${resText.substring(0, 200)}`);

    if (!res.ok) {
      // Try fallback endpoint
      const fallbackEndpoint = type === "text" || !type
        ? `${baseUrl}/chat/send-text`
        : `${baseUrl}/send/media`;

      const fallbackBody = type === "text" || !type
        ? { chatId: groupJid, text: content, body: content }
        : { number: groupJid, media: content, type, ...(caption?.trim() ? { caption: caption.trim() } : {}) };

      const fallbackRes = await fetch(fallbackEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(fallbackBody),
      });

      const fallbackText = await fallbackRes.text();
      console.log(`[group-carousel] Fallback: ${fallbackRes.status} ${fallbackText.substring(0, 200)}`);

      if (!fallbackRes.ok) {
        return json({ ok: false, error: `Falha ao enviar: ${fallbackText.substring(0, 100)}` });
      }
    }

    return json({ ok: true });
  } catch (e: any) {
    console.error("[group-carousel] Error:", e);
    return json({ error: e.message }, 500);
  }
});
