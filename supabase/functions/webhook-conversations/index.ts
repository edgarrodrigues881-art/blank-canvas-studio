import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = await req.json();
    console.log("Webhook received:", JSON.stringify(body).substring(0, 800));

    const admin = createClient(supabaseUrl, serviceKey);

    // ── Handle action: setup_all_webhooks ──
    if (body.action === "setup_all_webhooks") {
      return await handleSetupWebhooks(req, admin, body);
    }

    // ── Extract event data ──
    const event = body.event || body.EventType || body.type || "";
    const data = body.data || body.message || body;

    // ── Find the device - multiple strategies ──
    let device: any = null;

    // Strategy 1: device_id from query param
    const url = new URL(req.url);
    const deviceIdParam = url.searchParams.get("device_id");
    if (deviceIdParam) {
      const { data: d } = await admin.from("devices").select("id, user_id, name, uazapi_base_url").eq("id", deviceIdParam).single();
      device = d;
    }

    // Strategy 2: token from header
    if (!device) {
      const headerToken = req.headers.get("token") || req.headers.get("x-instance-token") || "";
      if (headerToken) {
        const { data: d } = await admin.from("devices").select("id, user_id, name, uazapi_base_url").eq("uazapi_token", headerToken).single();
        device = d;
      }
    }

    // Strategy 3: instanceId/token from body
    if (!device) {
      const instanceId = body.instanceId || body.instance || body.token || "";
      if (instanceId) {
        const { data: d } = await admin.from("devices").select("id, user_id, name, uazapi_base_url").eq("uazapi_token", instanceId).single();
        device = d;
        if (!device) {
          const { data: devices2 } = await admin.from("devices").select("id, user_id, name, uazapi_base_url")
            .or(`name.eq.${instanceId},uazapi_base_url.ilike.%${instanceId}%`).limit(1);
          device = devices2?.[0];
        }
      }
    }

    if (!device) {
      console.error("Device not found. Headers:", JSON.stringify(Object.fromEntries(req.headers.entries())));
      return json({ ok: true, skipped: "device_not_found" });
    }

    console.log(`Device matched: ${device.name} (${device.id})`);

    // ── Handle message events ──
    const chatData = body.chat || {};
    const msgData = body.message || data.message || {};
    const keyData = data.key || msgData.key || body.key || {};
    const isMessageEvent = event.includes("message") || event.includes("msg") || keyData.remoteJid || chatData.JID || body.chat;

    if (isMessageEvent) {
      const remoteJid = keyData.remoteJid || chatData.JID || chatData.jid || data.from || data.chatId || body.from || "";
      if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid.includes("status@")) {
        return json({ ok: true, skipped: "group_or_status" });
      }

      // Anti-loop
      if (body.wasSentByApi === true || body.wa_sentByApi === true || body.sentByApi === true) {
        console.log("Skipping wasSentByApi");
        return json({ ok: true, skipped: "sent_by_api" });
      }

      const fromMe = keyData.fromMe ?? data.fromMe ?? body.fromMe ?? body.isFromMe ?? false;
      const phone = remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
      const name = (body.pushName || data.pushName || chatData.Name || chatData.name || data.notify || data.name || phone).substring(0, 255);

      // Extract content
      const content = msgData.conversation
        || msgData.extendedTextMessage?.text
        || msgData.imageMessage?.caption
        || msgData.videoMessage?.caption
        || body.text || body.body || body.messageBody
        || data.body || data.text || data.caption || "";

      const waId = keyData.id || data.id?._serialized || body.messageId || `wh-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

      const rawTs = data.messageTimestamp || body.messageTimestamp || body.timestamp || body.t;
      const timestamp = rawTs
        ? new Date((typeof rawTs === "number" && rawTs < 1e12 ? rawTs * 1000 : Number(rawTs) < 1e12 ? Number(rawTs) * 1000 : Number(rawTs))).toISOString()
        : new Date().toISOString();

      // Media detection
      let mediaType: string | null = null;
      let mediaUrl: string | null = null;
      let audioDuration: number | null = null;

      if (msgData.imageMessage || body.type === "image") {
        mediaType = "image"; mediaUrl = msgData.imageMessage?.url || body.mediaUrl || null;
      } else if (msgData.audioMessage || body.type === "audio" || body.type === "ptt") {
        mediaType = "audio"; audioDuration = msgData.audioMessage?.seconds || body.duration || null; mediaUrl = body.mediaUrl || null;
      } else if (msgData.videoMessage || body.type === "video") {
        mediaType = "video"; mediaUrl = msgData.videoMessage?.url || body.mediaUrl || null;
      } else if (msgData.documentMessage || body.type === "document") {
        mediaType = "document"; mediaUrl = msgData.documentMessage?.url || body.mediaUrl || null;
      } else if (msgData.stickerMessage || body.type === "sticker") {
        mediaType = "sticker";
      }

      const displayContent = content || (mediaType ? `[${mediaType}]` : "");

      // Upsert conversation
      const { data: conv, error: convErr } = await admin
        .from("conversations")
        .upsert({
          user_id: device.user_id, device_id: device.id, remote_jid: remoteJid,
          name, phone,
          last_message: displayContent.substring(0, 500),
          last_message_at: timestamp,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,device_id,remote_jid" })
        .select("id")
        .single();

      let conversationId = conv?.id;

      if (convErr && !conversationId) {
        console.error("Conversation upsert error:", convErr);
        const { data: existing } = await admin.from("conversations").select("id")
          .eq("user_id", device.user_id).eq("device_id", device.id).eq("remote_jid", remoteJid).single();
        conversationId = existing?.id;
      }

      if (!conversationId) {
        return json({ error: "Failed to upsert conversation" }, 500);
      }

      // Update unread count
      if (!fromMe) {
        const { data: cur } = await admin.from("conversations").select("unread_count").eq("id", conversationId).single();
        await admin.from("conversations").update({ unread_count: (cur?.unread_count || 0) + 1 }).eq("id", conversationId);
      }

      // Insert message
      const { error: msgErr } = await admin.from("conversation_messages").upsert({
        conversation_id: conversationId,
        user_id: device.user_id,
        remote_jid: remoteJid,
        content: displayContent.substring(0, 5000),
        direction: fromMe ? "sent" : "received",
        status: fromMe ? "sent" : "received",
        media_type: mediaType,
        media_url: mediaUrl,
        audio_duration: audioDuration,
        whatsapp_message_id: waId,
        created_at: timestamp,
      }, { onConflict: "whatsapp_message_id", ignoreDuplicates: true });

      if (msgErr) console.error("Message upsert error:", msgErr);

      console.log(`Message saved: ${fromMe ? "sent" : "received"} from ${phone} on ${device.name}: "${displayContent.substring(0, 80)}"`);
    }

    return json({ ok: true });
  } catch (err: any) {
    console.error("webhook-conversations error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Setup webhooks on all user devices ──
async function handleSetupWebhooks(req: Request, admin: any, body: any) {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await anonClient.auth.getUser();
  if (userErr || !user) return json({ error: "Unauthorized" }, 401);

  const { data: devices } = await admin.from("devices")
    .select("id, name, uazapi_base_url, uazapi_token, status")
    .eq("user_id", user.id).neq("login_type", "report_wa");

  if (!devices?.length) return json({ configured: 0, total: 0 });

  const webhookBaseUrl = `${supabaseUrl}/functions/v1/webhook-conversations`;
  let configured = 0;
  const errors: string[] = [];

  for (const dev of devices) {
    if (!dev.uazapi_base_url || !dev.uazapi_token) continue;
    if (!["Ready", "Connected", "authenticated"].includes(dev.status)) continue;

    const base = dev.uazapi_base_url.replace(/\/+$/, "");
    const webhookUrl = `${webhookBaseUrl}?device_id=${dev.id}`;

    try {
      // Check existing webhooks
      const getRes = await fetch(`${base}/webhook`, { headers: { token: dev.uazapi_token, Accept: "application/json" } });
      const getText = await getRes.text();
      let existing: any[] = [];
      try { existing = JSON.parse(getText) || []; } catch {}
      if (!Array.isArray(existing)) existing = [];

      // Check if already configured
      const ours = existing.find((w: any) => w.url?.includes("webhook-conversations") && w.enabled);
      if (ours) {
        console.log(`[${dev.name}] Already configured`);
        configured++;
        continue;
      }

      // Remove old webhook-conversations entries
      for (const w of existing.filter((w: any) => w.url?.includes("webhook-conversations"))) {
        try { await fetch(`${base}/webhook/${w.id}`, { method: "DELETE", headers: { token: dev.uazapi_token } }); } catch {}
      }

      // Create new webhook
      const postRes = await fetch(`${base}/webhook`, {
        method: "POST",
        headers: { token: dev.uazapi_token, "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl, enabled: true, events: ["messages"] }),
      });
      const postText = await postRes.text();
      console.log(`[${dev.name}] POST /webhook: ${postRes.status} ${postText.substring(0, 200)}`);
      if (postRes.ok) configured++;
      else errors.push(`${dev.name}: ${postRes.status}`);
    } catch (e: any) {
      errors.push(`${dev.name}: ${e.message}`);
    }
  }

  return json({ configured, total: devices.length, errors });
}
