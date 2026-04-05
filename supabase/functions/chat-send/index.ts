import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
    const uazapiBaseUrl = Deno.env.get("UAZAPI_BASE_URL") || "";
    const uazapiToken = Deno.env.get("UAZAPI_TOKEN") || "";

    // Verify user
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) return json({ error: "Não autenticado" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { conversation_id, content, message_id, type, file_name } = body;

    if (!conversation_id || !content) {
      return json({ error: "conversation_id e content são obrigatórios" }, 400);
    }

    // Get conversation with device info
    const { data: conv, error: convErr } = await admin
      .from("conversations")
      .select("*, devices!conversations_device_id_fkey(name, uazapi_token, uazapi_base_url)")
      .eq("id", conversation_id)
      .eq("user_id", user.id)
      .single();

    if (convErr || !conv) return json({ error: "Conversa não encontrada" }, 404);

    const instanceName = conv.devices?.name;
    const instanceToken = conv.devices?.uazapi_token;
    const deviceBaseUrl = conv.devices?.uazapi_base_url;
    const remoteJid = conv.remote_jid;

    if (!instanceName) {
      if (message_id) {
        await admin.from("conversation_messages").update({ status: "failed" }).eq("id", message_id);
      }
      return json({ error: "Dispositivo sem nome configurado" }, 400);
    }

    const baseUrl = (deviceBaseUrl || uazapiBaseUrl).replace(/\/+$/, "");
    const token = instanceToken || uazapiToken;

    // Determine endpoint and payload based on type
    let sendUrl: string;
    let sendBody: Record<string, unknown>;

    if (type === "audio") {
      sendUrl = `${baseUrl}/send/audio`;
      sendBody = { number: remoteJid, audio: content, ptt: true };
    } else if (type === "image") {
      sendUrl = `${baseUrl}/send/image`;
      sendBody = { number: remoteJid, image: content, caption: "" };
    } else if (type === "document") {
      sendUrl = `${baseUrl}/send/document`;
      sendBody = { number: remoteJid, document: content, fileName: file_name || "arquivo" };
    } else {
      sendUrl = `${baseUrl}/send/text`;
      sendBody = { number: remoteJid, text: content };
    }

    console.log(`[chat-send] Sending ${type || "text"} to ${remoteJid} via ${baseUrl}`);

    const uazRes = await fetch(sendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token: token,
      },
      body: JSON.stringify(sendBody),
    });

    const uazBody = await uazRes.text();
    console.log(`[chat-send] UAZAPI response (${uazRes.status}):`, uazBody.substring(0, 500));

    let parsed: any = {};
    try { parsed = JSON.parse(uazBody); } catch {}

    // Detect failures — be careful not to false-positive on normal response fields
    const hardFailKeywords = ["not found", "invalid number", "disconnected", "blocked", "not on whatsapp", "privacidade"];
    const bodyLower = uazBody.toLowerCase();
    const hasFailed = !uazRes.ok || hardFailKeywords.some((k) => bodyLower.includes(k));

    if (hasFailed) {
      const errorMsg = parsed?.message || parsed?.error || uazBody.substring(0, 200);
      // Update message to failed
      if (message_id) {
        await admin.from("conversation_messages").update({ status: "failed" }).eq("id", message_id);
      }
      return json({ error: `Falha ao enviar: ${errorMsg}`, sent: false }, 200);
    }

    // Success — update message to sent
    if (message_id) {
      const waMessageId = parsed?.messageid || parsed?.key?.id || parsed?.messageId || parsed?.id || null;
      await admin.from("conversation_messages").update({
        status: "sent",
        whatsapp_message_id: waMessageId,
      }).eq("id", message_id);
    }

    // Update conversation last message
    await admin.from("conversations").update({
      last_message: content,
      last_message_at: new Date().toISOString(),
    }).eq("id", conversation_id);

    return json({ sent: true, messageId: parsed?.key?.id || null });
  } catch (err: any) {
    console.error("[chat-send] Error:", err);
    return json({ error: err.message }, 500);
  }
});
