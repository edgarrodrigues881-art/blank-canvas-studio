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

async function deleteForEveryone(baseUrl: string, token: string, groupJid: string, waId: string) {
  const attempts: { url: string; body: any }[] = [
    { url: `${baseUrl}/message/delete`, body: { number: groupJid, messageid: waId, owner: true } },
    { url: `${baseUrl}/message/delete`, body: { number: groupJid, messageId: waId, forEveryone: true } },
    { url: `${baseUrl}/message/revoke`, body: { number: groupJid, messageid: waId } },
    { url: `${baseUrl}/chat/deleteMessage`, body: { number: groupJid, messageid: waId, revoke: true } },
  ];
  let lastErr = "";
  for (const a of attempts) {
    try {
      const res = await fetch(a.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", token },
        body: JSON.stringify(a.body),
      });
      const raw = await res.text();
      let parsed: any = {};
      try { parsed = raw ? JSON.parse(raw) : {}; } catch {}
      console.log(`[group-chat-delete] ${a.url} → ${res.status} ${raw.substring(0, 200)}`);
      if (res.ok && !parsed?.error) return { ok: true };
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
    const messageId = String(body?.message_id || "").trim();
    if (!messageId) return json({ error: "message_id é obrigatório" }, 400);

    const { data: msg } = await admin
      .from("group_messages")
      .select("id, user_id, device_id, group_jid, whatsapp_message_id, direction")
      .eq("id", messageId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!msg) return json({ error: "Mensagem não encontrada" }, 404);
    if (msg.direction !== "sent") return json({ error: "Só é possível apagar mensagens enviadas por você" }, 403);
    if (!msg.whatsapp_message_id || msg.whatsapp_message_id.startsWith("local-")) {
      // Just drop locally
      await admin.from("group_messages").update({ deleted_at: new Date().toISOString(), content: null, media_url: null }).eq("id", messageId);
      return json({ ok: true, local_only: true });
    }

    const { data: device } = await admin
      .from("devices")
      .select("id, uazapi_token, uazapi_base_url")
      .eq("id", msg.device_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!device) return json({ error: "Instância não encontrada" }, 404);

    const baseUrl = String(device.uazapi_base_url || "").replace(/\/+$/, "");
    const token = String(device.uazapi_token || "").trim();
    if (!baseUrl || !token) return json({ error: "Instância sem credenciais" }, 400);

    const result = await deleteForEveryone(baseUrl, token, msg.group_jid, msg.whatsapp_message_id);
    if (!result.ok) return json({ error: result.error || "Falha ao apagar" }, 502);

    await admin
      .from("group_messages")
      .update({ deleted_at: new Date().toISOString(), content: null, media_url: null })
      .eq("id", messageId);

    return json({ ok: true });
  } catch (e: any) {
    console.error("[group-chat-delete] fatal:", e);
    return json({ error: e?.message || "Erro interno" }, 500);
  }
});
