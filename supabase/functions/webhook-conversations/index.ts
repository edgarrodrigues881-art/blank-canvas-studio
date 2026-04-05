import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { extractConversationEvent, isApiSentMessage } from "./parser.ts";

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
    if (isApiSentMessage(body)) {
      console.log("Skipping wasSentByApi");
      return json({ ok: true, skipped: "sent_by_api" });
    }

    const parsed = extractConversationEvent(body);
    if (!parsed) {
      console.log("Skipping webhook: no private chat payload could be extracted");
      return json({ ok: true, skipped: "group_or_unrecognized" });
    }

    const {
      remoteJid,
      phone,
      name,
      content,
      fromMe,
      waId,
      timestamp,
      mediaType,
      mediaUrl,
      audioDuration,
      avatarUrl,
    } = parsed;

    const displayContent = content || (mediaType ? `[${mediaType}]` : "[mensagem]");

    const { data: conv, error: convErr } = await admin
      .from("conversations")
      .upsert({
        user_id: device.user_id,
        device_id: device.id,
        remote_jid: remoteJid,
        name,
        phone,
        avatar_url: avatarUrl,
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
        .eq("user_id", device.user_id)
        .eq("device_id", device.id)
        .eq("remote_jid", remoteJid)
        .single();
      conversationId = existing?.id;
    }

    if (!conversationId) {
      return json({ error: "Failed to upsert conversation" }, 500);
    }

    if (!fromMe) {
      const { data: cur } = await admin.from("conversations").select("unread_count").eq("id", conversationId).single();
      await admin.from("conversations").update({ unread_count: (cur?.unread_count || 0) + 1 }).eq("id", conversationId);
    }

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
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET") || "";
  let configured = 0;
  const errors: string[] = [];

  for (const dev of devices) {
    if (!dev.uazapi_base_url || !dev.uazapi_token) continue;
    if (!["Ready", "Connected", "authenticated"].includes(dev.status)) continue;

    const base = dev.uazapi_base_url.replace(/\/+$/, "");
    const webhookUrl = `${webhookBaseUrl}?device_id=${dev.id}`;
    const webhookHeaders: Record<string, string> = {
      token: dev.uazapi_token,
      "x-device-id": dev.id,
    };
    if (webhookSecret) webhookHeaders["x-webhook-secret"] = webhookSecret;

    const desiredBody = {
      url: webhookUrl,
      enabled: true,
      events: ["messages"],
      excludeMessages: ["wasSentByApi", "isGroupYes"],
      addUrlEvents: true,
      addUrlTypesMessages: true,
      headers: webhookHeaders,
    };

    try {
      // Check existing webhooks
      const getRes = await fetch(`${base}/webhook`, { headers: { token: dev.uazapi_token, Accept: "application/json" } });
      const getText = await getRes.text();
      let existing: any[] = [];
      try { existing = JSON.parse(getText) || []; } catch {}
      if (!Array.isArray(existing)) existing = [];

      // Check if already configured with the richer payload options we need
      const ours = existing.find((w: any) => w.url?.includes("webhook-conversations"));
      const alreadyConfigured = !!ours
        && ours.enabled === true
        && (Array.isArray(ours.events) ? ours.events.includes("messages") : true)
        && (ours.addUrlEvents === true || ours.add_url_events === true)
        && (ours.addUrlTypesMessages === true || ours.add_url_types_messages === true);

      if (alreadyConfigured) {
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
        body: JSON.stringify(desiredBody),
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
