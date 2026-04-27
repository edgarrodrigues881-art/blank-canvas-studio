// Sends WhatsApp presence indicators (typing / recording) for the manual chat.
// Mirrors what the autoreply engine does, but triggered from the agent's UI.
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

async function uazapiPresence(
  baseUrl: string, token: string, phone: string,
  kind: "composing" | "recording" | "paused", delayMs?: number,
) {
  const cleanPhone = String(phone).replace(/\D/g, "");
  const payload: Record<string, unknown> = { number: cleanPhone, presence: kind };
  if (delayMs && delayMs > 0) payload.delay = delayMs;
  const headers = { "Content-Type": "application/json", token } as const;

  // Try canonical endpoint first, fall back silently.
  for (const path of ["/message/presence", "/sendPresence"]) {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method: "POST", headers, body: JSON.stringify(payload),
      });
      if (res.ok) return true;
    } catch { /* try next */ }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const auth = req.headers.get("Authorization") ?? "";
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData } = await anonClient.auth.getUser();
    if (!userData?.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const conversationId = String(body?.conversation_id || "").trim();
    const kindRaw = String(body?.kind || "composing").trim();
    const kind: "composing" | "recording" | "paused" =
      kindRaw === "recording" ? "recording" : kindRaw === "paused" ? "paused" : "composing";
    const delayMs = Math.max(0, Math.min(30_000, Number(body?.delay_ms) || 8_000));

    if (!conversationId) return json({ error: "conversation_id obrigatório" }, 400);

    const { data: conv, error: convErr } = await admin
      .from("conversations")
      .select("id, user_id, remote_jid, device_id, devices!conversations_device_id_fkey(uazapi_token, uazapi_base_url)")
      .eq("id", conversationId)
      .maybeSingle();

    if (convErr || !conv) return json({ error: "conversa não encontrada" }, 404);
    if (conv.user_id !== userData.user.id) return json({ error: "forbidden" }, 403);

    const deviceConfig: any = Array.isArray(conv.devices) ? conv.devices[0] : conv.devices;
    const baseUrl = String(deviceConfig?.uazapi_base_url || "").replace(/\/+$/, "");
    const token = String(deviceConfig?.uazapi_token || "").trim();
    if (!baseUrl || !token) return json({ error: "device sem credenciais" }, 400);

    const phone = String(conv.remote_jid || "").split("@")[0];
    if (!phone) return json({ error: "destino inválido" }, 400);

    const ok = await uazapiPresence(baseUrl, token, phone, kind, delayMs);
    return json({ ok });
  } catch (err) {
    console.error("[chat-presence] error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
