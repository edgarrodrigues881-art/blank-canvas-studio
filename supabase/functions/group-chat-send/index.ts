import { createClient } from "npm:@supabase/supabase-js@2";
import { buildAttempts, getDestination, type SendAttempt } from "../chat-send/send-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_INTERVAL_MS = 900;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function reserveSlot(admin: any, deviceId: string) {
  const { data } = await admin.rpc("claim_device_send_slot", {
    p_device_id: deviceId,
    p_min_interval_ms: MIN_INTERVAL_MS,
  });
  const wait = typeof data === "number" ? Math.max(0, data) : 0;
  if (wait > 0) await sleep(wait);
}

async function executeAttempts(baseUrl: string, token: string, attempts: SendAttempt[]) {
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
      console.log(`[group-chat-send] ${attempt.path} → ${res.status} ${raw.substring(0, 200)}`);
      if (res.ok && !parsed?.error) {
        const waId = parsed?.id || parsed?.messageid || parsed?.message?.key?.id || parsed?.key?.id || null;
        return { ok: true, waId, raw: parsed };
      }
      lastErr = parsed?.error || raw.substring(0, 200) || `HTTP ${res.status}`;
    } catch (e: any) {
      lastErr = e?.message || String(e);
    }
  }
  return { ok: false, error: lastErr };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json();

    const deviceId = String(body?.device_id || "").trim();
    const groupJid = String(body?.group_jid || "").trim();
    const type = body?.type ? String(body.type) : undefined; // text | image | audio | document
    const content = String(body?.content || "").trim();
    const fileName = body?.file_name ? String(body.file_name) : undefined;
    const caption = body?.caption ? String(body.caption) : undefined;

    if (!deviceId || !groupJid || !content) {
      return json({ error: "device_id, group_jid e content são obrigatórios" }, 400);
    }
    if (!groupJid.endsWith("@g.us")) return json({ error: "group_jid inválido" }, 400);

    const { data: device, error: devErr } = await admin
      .from("devices")
      .select("id, user_id, uazapi_token, uazapi_base_url")
      .eq("id", deviceId)
      .eq("user_id", userId)
      .maybeSingle();

    if (devErr || !device) return json({ error: "Instância não encontrada" }, 404);

    const baseUrl = String(device.uazapi_base_url || "").replace(/\/+$/, "");
    const token = String(device.uazapi_token || "").trim();
    if (!baseUrl || !token) return json({ error: "Instância sem credenciais UAZAPI" }, 400);

    await reserveSlot(admin, deviceId);

    const dest = getDestination(groupJid);
    const attempts = buildAttempts(type, dest, content, fileName, undefined, caption);
    const result = await executeAttempts(baseUrl, token, attempts);

    if (!result.ok) {
      return json({ error: result.error || "Falha ao enviar" }, 502);
    }

    // Persist sent message locally
    const waId = result.waId || `local-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const mediaType = (type === "text" || !type) ? null : type;
    const stored = {
      user_id: userId,
      device_id: deviceId,
      group_jid: groupJid,
      sender_jid: null,
      sender_name: "Você",
      content: mediaType ? (caption || "") : content,
      media_type: mediaType,
      media_url: mediaType ? content : null,
      mime_type: null,
      direction: "sent",
      whatsapp_message_id: waId,
      sent_at: new Date().toISOString(),
    };

    const { error: insErr } = await admin.from("group_messages").insert(stored);
    if (insErr) console.error("[group-chat-send] insert error:", insErr);

    return json({ ok: true, whatsapp_message_id: waId });
  } catch (e: any) {
    console.error("[group-chat-send] fatal:", e);
    return json({ error: e?.message || "Erro interno" }, 500);
  }
});
