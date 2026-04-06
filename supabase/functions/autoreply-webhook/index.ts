// ══════════════════════════════════════════════════════════
// Autoreply Webhook — Edge Function LEVE
// Apenas parseia o webhook e enfileira para a VPS processar
// ══════════════════════════════════════════════════════════

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-device-id, token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const body = await req.json();

    // ── Handle webhook registration/disable (keep in Edge — frontend actions) ──
    if (body.action === "register_webhook") {
      return await handleRegisterWebhook(supabase, body, req);
    }
    if (body.action === "disable_webhook") {
      return await handleDisableWebhook(supabase, body, req);
    }

    // ── Validate webhook secret ──
    const webhookSecret = req.headers.get("x-webhook-secret") || "";
    const expectedSecret = Deno.env.get("WEBHOOK_SECRET") || "";
    if (!expectedSecret || !webhookSecret || webhookSecret !== expectedSecret) {
      return json({ error: "Unauthorized" }, 401);
    }

    // ── Extract identifiers ──
    const instanceToken = (
      req.headers.get("token") || req.headers.get("x-instance-token") ||
      body.token || body.instance_token || ""
    ).trim().replace(/^Bearer\s+/i, "");

    const deviceHeaderId = (
      req.headers.get("x-device-id") || body.device_id ||
      body.instance_id || body.deviceId || ""
    ).trim();

    if (!deviceHeaderId && !instanceToken) {
      return json({ ok: true, skipped: true, reason: "no_device_identifier" });
    }

    // ── Quick parse: extract fromPhone, messageText, buttonResponseId ──
    const event = body.event || body.EventType || body.type || "";
    const msgData = body.data || body;

    let fromPhone = "";
    let messageText = "";
    let buttonResponseId = "";
    let isFromMe = false;
    let hasButtonResponse = false;

    // UaZapi native format
    if (body.EventType === "messages" && body.chat) {
      const nestedMessage = body.message || {};
      if (body.wasSentByApi || body.wa_sentByApi || body.sentByApi || nestedMessage.wasSentByApi) {
        return json({ ok: true, skipped: true, reason: "sent_by_api" });
      }
      const chatPhone = body.chat.phoneNumber || body.chat.phone || nestedMessage.sender_pn || "";
      const ownerPhone = (body.chat.owner || nestedMessage.owner || "").replace(/\D/g, "");
      fromPhone = String(chatPhone).replace(/\D/g, "");
      if (ownerPhone && fromPhone && (fromPhone === ownerPhone || fromPhone.endsWith(ownerPhone) || ownerPhone.endsWith(fromPhone))) {
        return json({ ok: true, skipped: true, reason: "owner_self_message" });
      }
      isFromMe = body.isFromMe === true || body.fromMe === true || body.wa_fromMe === true || nestedMessage.fromMe === true;
      messageText = body.text || body.messageBody || body.body || body.caption || "";
      if (!messageText && nestedMessage) {
        const c = nestedMessage.content;
        messageText = nestedMessage.conversation || nestedMessage.text || nestedMessage.body ||
          (typeof c === "string" ? c : "") || c?.text || nestedMessage.selectedDisplayText || "";
      }
      buttonResponseId = body.selectedButtonId || body.selectedId || body.buttonId ||
        nestedMessage.buttonOrListid || nestedMessage.selectedButtonId || nestedMessage.selectedId || nestedMessage.buttonId || "";
      if (body.buttonsResponseMessage || body.templateButtonReplyMessage || nestedMessage.buttonsResponseMessage || nestedMessage.templateButtonReplyMessage || buttonResponseId) {
        hasButtonResponse = true;
      }
      if (body.buttonsResponseMessage) {
        buttonResponseId = body.buttonsResponseMessage.selectedButtonId || buttonResponseId;
        messageText = body.buttonsResponseMessage.selectedDisplayText || messageText;
      }
      if (body.templateButtonReplyMessage) {
        buttonResponseId = body.templateButtonReplyMessage.selectedId || buttonResponseId;
        messageText = body.templateButtonReplyMessage.selectedDisplayText || messageText;
      }
      if (nestedMessage.buttonsResponseMessage) {
        buttonResponseId = nestedMessage.buttonsResponseMessage.selectedButtonId || buttonResponseId;
        messageText = nestedMessage.buttonsResponseMessage.selectedDisplayText || messageText;
        hasButtonResponse = true;
      }
      if (nestedMessage.templateButtonReplyMessage) {
        buttonResponseId = nestedMessage.templateButtonReplyMessage.selectedId || buttonResponseId;
        messageText = nestedMessage.templateButtonReplyMessage.selectedDisplayText || messageText;
        hasButtonResponse = true;
      }
    }
    // Baileys / Evolution API
    else if (msgData.key) {
      fromPhone = (msgData.key.remoteJid || "").replace(/@.*$/, "");
      isFromMe = msgData.key.fromMe === true;
      if (msgData.message) {
        const msg = msgData.message;
        messageText = msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption ||
          msg.videoMessage?.caption || msg.documentMessage?.caption || "";
        if (msg.buttonsResponseMessage) {
          buttonResponseId = msg.buttonsResponseMessage.selectedButtonId || "";
          messageText = msg.buttonsResponseMessage.selectedDisplayText || messageText;
          hasButtonResponse = true;
        }
        if (msg.templateButtonReplyMessage) {
          buttonResponseId = msg.templateButtonReplyMessage.selectedId || "";
          messageText = msg.templateButtonReplyMessage.selectedDisplayText || messageText;
          hasButtonResponse = true;
        }
        if (msg.listResponseMessage) {
          buttonResponseId = msg.listResponseMessage.singleSelectReply?.selectedRowId || "";
          messageText = msg.listResponseMessage.title || messageText;
          hasButtonResponse = true;
        }
      } else {
        messageText = msgData.body || msgData.text || msgData.messageBody || "";
      }
    }
    // Generic fallback
    else {
      fromPhone = (msgData.from || msgData.phone || msgData.number || body.chat?.phoneNumber || "").toString().replace(/\D/g, "");
      messageText = msgData.body || msgData.text || msgData.messageBody || "";
    }

    if (!buttonResponseId) {
      buttonResponseId = msgData.selectedButtonId || msgData.buttonId || msgData.buttonOrListid || body.selectedButtonId || body.selectedId || "";
      if (buttonResponseId) hasButtonResponse = true;
    }

    // ── Quick filters (skip groups, self, empty) ──
    if (!fromPhone || fromPhone.includes("g.us")) {
      return json({ ok: true, skipped: true, reason: "group_or_empty" });
    }
    if (isFromMe && !hasButtonResponse) {
      return json({ ok: true, skipped: true, reason: "self_message" });
    }
    if (!messageText && !hasButtonResponse) {
      return json({ ok: true, skipped: true, reason: "empty_no_button" });
    }
    if (event && !event.includes("message") && !event.includes("Message") && event !== "") {
      return json({ ok: true, skipped: true, reason: "non_message_event" });
    }

    // ── Find device (quick lookup) ──
    let deviceId = deviceHeaderId;
    let userId = "";

    if (deviceHeaderId) {
      const { data } = await supabase.from("devices")
        .select("id, user_id").eq("id", deviceHeaderId).maybeSingle();
      if (data) { deviceId = data.id; userId = data.user_id; }
      else { deviceId = ""; }
    }

    if (!deviceId && instanceToken) {
      const { data } = await supabase.from("devices")
        .select("id, user_id").eq("uazapi_token", instanceToken).maybeSingle();
      if (data) { deviceId = data.id; userId = data.user_id; }
      else {
        const { data: poolRow } = await supabase.from("user_api_tokens")
          .select("device_id").eq("token", instanceToken).eq("status", "in_use").maybeSingle();
        if (poolRow?.device_id) {
          const { data: dev } = await supabase.from("devices")
            .select("id, user_id").eq("id", poolRow.device_id).maybeSingle();
          if (dev) { deviceId = dev.id; userId = dev.user_id; }
        }
      }
    }

    if (!deviceId || !userId) {
      return json({ ok: true, skipped: true, reason: "device_not_found" });
    }

    // ── Enqueue for VPS processing ──
    const { error: queueErr } = await supabase.from("autoreply_queue").insert({
      device_id: deviceId,
      user_id: userId,
      from_phone: fromPhone,
      message_text: messageText,
      button_response_id: buttonResponseId || "",
      has_button_response: hasButtonResponse,
      instance_token: instanceToken,
      device_header_id: deviceHeaderId,
      status: "pending",
    });

    if (queueErr) {
      console.error("[autoreply] Queue insert error:", queueErr.message);
      return json({ error: "Queue insert failed" }, 500);
    }

    console.log(`[autoreply] Queued: ${fromPhone} → device ${deviceId.substring(0, 8)} text="${messageText.substring(0, 40)}"`);
    return json({ ok: true, queued: true });

  } catch (err: any) {
    console.error("[autoreply] Error:", err.message);
    return json({ error: "Internal error" }, 500);
  }
});

// ══════════════════════════════════════════════════════════
// WEBHOOK REGISTRATION (kept in Edge — frontend actions)
// ══════════════════════════════════════════════════════════

async function handleRegisterWebhook(supabase: any, body: any, req: Request) {
  const { device_id } = body;
  const authHeader = req.headers.get("authorization") ?? "";
  const bearerToken = authHeader.replace("Bearer ", "");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const internalSecret = Deno.env.get("INTERNAL_TICK_SECRET") || "";
  const cronSecret = req.headers.get("x-cron-secret") || body._internal_secret || "";
  const isServiceRole = bearerToken === serviceRoleKey;
  const isInternal = internalSecret && cronSecret === internalSecret;

  if (isServiceRole || isInternal) {
    const { data: device } = await supabase.from("devices")
      .select("id, user_id, uazapi_token, uazapi_base_url").eq("id", device_id).single();
    if (!device?.uazapi_token || !device?.uazapi_base_url) return json({ error: "Device not configured" }, 400);
    return await doRegisterWebhook(device);
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(bearerToken);
  if (authErr || !user) return json({ error: "Not authenticated" }, 401);

  const { data: device } = await supabase.from("devices")
    .select("id, uazapi_token, uazapi_base_url").eq("id", device_id).eq("user_id", user.id).single();
  if (!device?.uazapi_token || !device?.uazapi_base_url) return json({ error: "Device not configured" }, 400);
  return await doRegisterWebhook(device);
}

async function handleDisableWebhook(supabase: any, body: any, req: Request) {
  const { device_id } = body;
  const authHeader = req.headers.get("authorization") ?? "";
  const bearerToken = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(bearerToken);
  if (authErr || !user) return json({ error: "Not authenticated" }, 401);

  const { data: device } = await supabase.from("devices")
    .select("id, uazapi_token, uazapi_base_url").eq("id", device_id).eq("user_id", user.id).single();
  if (!device?.uazapi_token || !device?.uazapi_base_url) return json({ error: "Device not configured" }, 400);

  const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const webhookUrl = `${supabaseUrl}/functions/v1/autoreply-webhook`;
  try {
    await fetch(`${baseUrl}/webhook`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", token: device.uazapi_token },
      body: JSON.stringify({ url: webhookUrl, enabled: false, events: ["messages"] }),
    });
  } catch {}
  return json({ ok: true, disabled: true });
}

async function doRegisterWebhook(device: any) {
  const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const webhookUrl = `${supabaseUrl}/functions/v1/autoreply-webhook`;
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET") || "";
  const headers: Record<string, string> = { "Content-Type": "application/json", token: device.uazapi_token };
  const webhookHeaders: Record<string, string> = { token: device.uazapi_token, "x-device-id": device.id };
  if (webhookSecret) webhookHeaders["x-webhook-secret"] = webhookSecret;

  const desiredBody = {
    url: webhookUrl, enabled: true, events: ["messages"],
    excludeMessages: ["wasSentByApi", "isGroupYes"],
    addUrlEvents: true, addUrlTypesMessages: true, headers: webhookHeaders,
  };

  // Try GET existing → PUT update → POST create
  try {
    const getRes = await fetch(`${baseUrl}/webhook`, { method: "GET", headers });
    if (getRes.ok) {
      const parsed = JSON.parse(await getRes.text());
      const arr = Array.isArray(parsed) ? parsed : [];
      const existing = arr.find((w: any) => w.url === webhookUrl);
      if (existing) {
        const putRes = await fetch(`${baseUrl}/webhook`, {
          method: "PUT", headers, body: JSON.stringify({ ...desiredBody, id: existing.id }),
        });
        if (putRes.ok) return json({ ok: true, webhook_url: webhookUrl, method: "PUT_UPDATE" });
        // Try DELETE + POST
        await fetch(`${baseUrl}/webhook`, { method: "DELETE", headers, body: JSON.stringify({ id: existing.id }) });
      }
    }
  } catch {}

  try {
    const postRes = await fetch(`${baseUrl}/webhook`, { method: "POST", headers, body: JSON.stringify(desiredBody) });
    if (postRes.ok) return json({ ok: true, webhook_url: webhookUrl, method: "POST_CREATE" });
  } catch {}

  try {
    const setRes = await fetch(`${baseUrl}/webhook/set`, { method: "POST", headers, body: JSON.stringify(desiredBody) });
    if (setRes.ok) return json({ ok: true, webhook_url: webhookUrl, method: "POST_SET" });
  } catch {}

  return json({ error: "Falha ao registrar webhook", webhook_url: webhookUrl }, 502);
}
