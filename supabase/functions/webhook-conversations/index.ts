import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { extractConversationEvent, isApiSentMessage } from "./parser.ts";
import { persistIncomingMedia } from "./media.ts";
import { buildEquivalentChatIds } from "../_shared/phone-variants.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function extractUuid(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = String(value).match(UUID_RE);
  return match?.[0] ?? null;
}

function getMediaLabel(mediaType: string | null): string {
  if (!mediaType) return "";
  switch (mediaType) {
    case "audio": return "🎧 Áudio";
    case "image": return "📷 Foto";
    case "video": return "🎬 Vídeo";
    case "document": return "📎 Arquivo";
    case "sticker": return "🏷️ Figurinha";
    case "contact": return "👤 Contato";
    case "location": return "📍 Localização";
    default: return `[${mediaType}]`;
  }
}

async function findConversationByEquivalentJid(admin: any, userId: string, deviceId: string, remoteJid: string) {
  const candidates = buildEquivalentChatIds(remoteJid);
  if (candidates.length === 0) return null;

  const { data } = await admin
    .from("conversations")
    .select("id, remote_jid, phone, name, created_at")
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .in("remote_jid", candidates)
    .order("created_at", { ascending: true })
    .limit(5);

  return data?.[0] ?? null;
}

interface FlowButtonConfig {
  id?: string;
  label?: string;
  targetNodeId?: string;
}

interface FlowNodeConfig {
  id?: string;
  type?: string;
  data?: {
    buttons?: FlowButtonConfig[];
  };
}

interface ActiveFlowConfig {
  id: string;
  device_id: string | null;
  nodes: unknown;
}

interface SessionPhoneMatch {
  id: string;
  contact_phone: string;
  status: string;
  updated_at: string;
}

const ACTIVE_SESSION_STATUSES = new Set(["active", "paused", "waiting_response"]);

function findFlowButtonOrigin(flows: ActiveFlowConfig[], buttonResponseId: string, deviceId: string) {
  const matches: Array<{ flowId: string; nodeId: string; deviceId: string | null }> = [];

  for (const flow of flows) {
    const nodes = Array.isArray(flow.nodes) ? flow.nodes as FlowNodeConfig[] : [];
    for (const node of nodes) {
      if (!node?.id) continue;
      const buttons = Array.isArray(node.data?.buttons) ? node.data.buttons : [];
      if (buttons.some((button) => button?.id === buttonResponseId)) {
        matches.push({ flowId: flow.id, nodeId: node.id, deviceId: flow.device_id ?? null });
      }
    }
  }

  matches.sort((a, b) => Number(b.deviceId === deviceId) - Number(a.deviceId === deviceId));
  return matches[0] ?? null;
}

function getPhoneVariants(phone: string): string[] {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return [];

  const variants = new Set<string>([digits]);

  const addBrazilVariants = (country: string, area: string, local: string) => {
    if (area.length !== 2) return;
    if (local.length === 9 && local.startsWith("9")) variants.add(`${country}${area}${local.slice(1)}`);
    if (local.length === 8) variants.add(`${country}${area}9${local}`);
  };

  if (digits.startsWith("55")) {
    addBrazilVariants("55", digits.slice(2, 4), digits.slice(4));
  } else {
    addBrazilVariants("55", digits.slice(0, 2), digits.slice(2));
  }

  return [...variants];
}

function pickBestSessionMatch(sessions: SessionPhoneMatch[] | null | undefined) {
  if (!sessions?.length) return null;

  const byUpdatedDesc = (a: SessionPhoneMatch, b: SessionPhoneMatch) =>
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();

  const active = sessions
    .filter((session) => ACTIVE_SESSION_STATUSES.has(session.status))
    .sort(byUpdatedDesc)[0];

  return active ?? [...sessions].sort(byUpdatedDesc)[0] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = await req.json();

    const admin = createClient(supabaseUrl, serviceKey);

    // ── Handle action: setup_all_webhooks ──
    if (body.action === "setup_all_webhooks") {
      return await handleSetupWebhooks(req, admin, body);
    }

    // Log FULL payload for debugging media extraction issues
    try {
      const safeBody = { ...body };
      // Truncate chat object (huge) but keep everything else
      if (safeBody.chat && typeof safeBody.chat === "object") {
        safeBody.chat = { JID: safeBody.chat.JID, jid: safeBody.chat.jid, phoneNumber: safeBody.chat.phoneNumber, Name: safeBody.chat.Name, name: safeBody.chat.name };
      }
      console.log("FULL_PAYLOAD:", JSON.stringify(safeBody).substring(0, 3000));
    } catch { console.log("Could not stringify payload"); }

    // ── Find the device - multiple strategies ──
    let device: any = null;

    const url = new URL(req.url);
    const headerDeviceId = extractUuid(req.headers.get("x-device-id"));
    const deviceIdParam = extractUuid(url.searchParams.get("device_id"));
    const directDeviceId = headerDeviceId || deviceIdParam;

    if (directDeviceId) {
      const { data: d } = await admin
        .from("devices")
        .select("id, user_id, name, uazapi_base_url")
        .eq("id", directDeviceId)
        .maybeSingle();
      device = d;
    }

    if (!device) {
      const headerToken = req.headers.get("token") || req.headers.get("x-instance-token") || "";
      if (headerToken) {
        const { data: d } = await admin
          .from("devices")
          .select("id, user_id, name, uazapi_base_url")
          .eq("uazapi_token", headerToken)
          .maybeSingle();
        device = d;
      }
    }

    if (!device) {
      const instanceId = String(body.instanceId || body.instance || body.token || "").trim();
      if (instanceId) {
        const { data: d } = await admin
          .from("devices")
          .select("id, user_id, name, uazapi_base_url")
          .eq("uazapi_token", instanceId)
          .maybeSingle();
        device = d;
        if (!device) {
          const { data: devices2 } = await admin
            .from("devices")
            .select("id, user_id, name, uazapi_base_url")
            .or(`name.eq.${instanceId},uazapi_base_url.ilike.%${instanceId}%`)
            .limit(1);
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
    // Skip only messages sent by our own API (not phone-sent messages)
    if (isApiSentMessage(body)) {
      console.log("Skipping wasSentByApi");
      return json({ ok: true, skipped: "sent_by_api" });
    }

    // Also skip status/receipt updates that aren't actual messages
    const eventType = (body.event || body.EventType || body.type || "").toString().toLowerCase();
    if (eventType.includes("status") || eventType.includes("ack") || eventType.includes("receipt") || eventType.includes("presence")) {
      return json({ ok: true, skipped: "status_event" });
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
      mimeType,
      mediaKey,
      directPath,
      audioDuration,
      avatarUrl,
      quotedMessageId,
      quotedContent,
      buttonResponseId,
    } = parsed;

    // Use a readable label for media messages instead of [mensagem]
    const mediaLabel = getMediaLabel(mediaType);
    const displayContent = content || mediaLabel || "[mensagem]";

    console.log(`Parsed: type=${mediaType}, url=${mediaUrl?.substring(0,60)}, duration=${audioDuration}, content="${content.substring(0,40)}", display="${displayContent.substring(0,40)}"`);

    // ── Detect autosave/warmup messages ──
    let messageOrigin = "whatsapp";
    if (fromMe) {
      const phoneDigits = phone.replace(/\D/g, "");
      const { data: autosaveHit } = await admin
        .from("warmup_autosave_contacts")
        .select("id")
        .eq("user_id", device.user_id)
        .eq("is_active", true)
        .or(`phone_e164.eq.${phoneDigits},phone_e164.eq.+${phoneDigits}`)
        .limit(1)
        .maybeSingle();
      if (autosaveHit) {
        messageOrigin = "warmup";
        console.log(`Autosave contact detected: ${phoneDigits} → origin=warmup`);
      }
    }
    const existingConversation = await findConversationByEquivalentJid(admin, device.user_id, device.id, remoteJid);

    let conversationId = existingConversation?.id;

    if (existingConversation) {
      const preferredName = existingConversation.name && existingConversation.name !== existingConversation.phone
        ? existingConversation.name
        : name;

      const { error: updateErr } = await admin
        .from("conversations")
        .update({
          name: preferredName,
          phone: existingConversation.phone || phone,
          avatar_url: avatarUrl,
          last_message: displayContent.substring(0, 500),
          last_message_at: timestamp,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingConversation.id);

      if (updateErr) {
        console.error("Conversation update error:", updateErr);
      }
    } else {
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

      conversationId = conv?.id;

      if (convErr && !conversationId) {
        console.error("Conversation upsert error:", convErr);
        const { data: existing } = await admin.from("conversations").select("id")
          .eq("user_id", device.user_id)
          .eq("device_id", device.id)
          .eq("remote_jid", remoteJid)
          .single();
        conversationId = existing?.id;
      }
    }

    if (!conversationId) {
      return json({ error: "Failed to upsert conversation" }, 500);
    }

    if (!fromMe) {
      const { data: cur } = await admin.from("conversations").select("unread_count").eq("id", conversationId).single();
      await admin.from("conversations").update({ unread_count: (cur?.unread_count || 0) + 1 }).eq("id", conversationId);
    } else {
      // User replied from phone — clear unread since they've seen the chat
      await admin.from("conversations").update({ unread_count: 0 }).eq("id", conversationId);
    }

    // Check for duplicate before inserting
    if (waId) {
      const { data: existing } = await admin.from("conversation_messages")
        .select("id").eq("whatsapp_message_id", waId).maybeSingle();
      if (existing) {
        console.log(`Duplicate message skipped: ${waId}`);
        return json({ ok: true, skipped: "duplicate" });
      }
    }

    // Persist incoming media to Supabase Storage (decrypt if needed)
    const persistedMediaUrl = await persistIncomingMedia(admin, {
      userId: device.user_id,
      messageId: waId,
      mediaType,
      sourceUrl: mediaUrl,
      mimeType,
      mediaKey,
      directPath,
    });

    const { error: msgErr } = await admin.from("conversation_messages").insert({
      conversation_id: conversationId,
      user_id: device.user_id,
      remote_jid: remoteJid,
      content: displayContent.substring(0, 5000),
      direction: fromMe ? "sent" : "received",
      status: fromMe ? "sent" : "received",
      media_type: mediaType,
      media_url: persistedMediaUrl,
      audio_duration: audioDuration,
      whatsapp_message_id: waId,
      quoted_message_id: quotedMessageId,
      quoted_content: quotedContent,
      created_at: timestamp,
      origin: messageOrigin,
    });

    if (msgErr) console.error("Message insert error:", msgErr);

    console.log(`Message saved: ${fromMe ? "sent" : "received"} from ${phone} on ${device.name}: media=${mediaType} "${displayContent.substring(0, 80)}"`);

    // ── Auto Lead Capture: minimal auto-creation, no data inference ──
    try {
      // Use WhatsApp pushName as contact name (only if it's not just digits)
      const contactName = (name && name !== phone && !/^\d+$/.test(name)) ? name.substring(0, 255) : null;

      const { data: contactId, error: upsertErr } = await admin.rpc("upsert_service_contact", {
        p_user_id: device.user_id,
        p_phone: phone,
        p_name: contactName,
        p_origin: "WhatsApp",
        p_conversation_id: conversationId,
        p_last_message_content: displayContent.substring(0, 500),
        p_message_timestamp: timestamp,
      });

      if (upsertErr) {
        console.error("Lead upsert error:", upsertErr);
      } else {
        console.log(`Lead upserted: ${contactId} (${phone})`);
      }
    } catch (leadErr) {
      console.error("Auto lead capture error:", leadErr);
    }

    // Trigger welcome automation for new conversations (first received message)
    if (!fromMe) {
      const { data: recentReceived } = await admin
        .from("conversation_messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("direction", "received")
        .order("created_at", { ascending: false })
        .limit(2);

      if ((recentReceived?.length || 0) <= 1) {
        // First message received — trigger welcome automation
        try {
          const automationUrl = `${supabaseUrl}/functions/v1/conversation-automations`;
          const waitPromise = fetch(automationUrl, {
            method: "POST",
            headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "trigger",
              user_id: device.user_id,
              conversation_id: conversationId,
              automation_type: "welcome",
              device_id: device.id,
              remote_jid: remoteJid,
            }),
          });
          if (typeof (globalThis as any).EdgeRuntime?.waitUntil === "function") {
            (globalThis as any).EdgeRuntime.waitUntil(waitPromise);
          } else {
            await waitPromise;
          }
        } catch (e) {
          console.error("Welcome automation trigger error:", e);
        }
      }

      // ── Enqueue for flow-based autoreply (visual flow builder) ──
      try {
        const { data: activeFlows } = await admin
          .from("autoreply_flows")
          .select("id, device_id, nodes")
          .eq("user_id", device.user_id)
          .eq("is_active", true)
          .or(`device_id.eq.${device.id},device_id.is.null`)
          .limit(100);

        if (activeFlows && activeFlows.length > 0) {
          const phoneCandidates = getPhoneVariants(phone);
          let queuePhone = phone;

          if (buttonResponseId) {
            const { data: recentSessions } = await admin
              .from("autoreply_sessions")
              .select("id, status, contact_phone, updated_at")
              .eq("device_id", device.id)
              .in("contact_phone", phoneCandidates.length ? phoneCandidates : [phone])
              .order("updated_at", { ascending: false })
              .limit(10);

            const activeSession = pickBestSessionMatch(recentSessions as SessionPhoneMatch[] | null | undefined);

            if (activeSession?.contact_phone && activeSession.contact_phone !== phone) {
              queuePhone = activeSession.contact_phone;
              console.log(`Resolved session phone ${phone} -> ${queuePhone}`);
            }

            // If the most recent session is completed, skip recovery and don't enqueue
            // This prevents repeated button clicks from re-triggering the flow
            if (activeSession?.status === "completed") {
              console.log(`Button click ignored: session already completed for ${phone}`);
              // Skip enqueue entirely for completed flows
              return json({ ok: true, skipped: "button_already_used" });
            }

            const isActive = !!activeSession && ACTIVE_SESSION_STATUSES.has(activeSession.status);

            if (!isActive) {
              const recovered = findFlowButtonOrigin(activeFlows as ActiveFlowConfig[], buttonResponseId, device.id);
              if (recovered) {
                const { error: sessionErr } = await admin.from("autoreply_sessions").upsert({
                  flow_id: recovered.flowId,
                  device_id: device.id,
                  user_id: device.user_id,
                  contact_phone: queuePhone,
                  current_node_id: recovered.nodeId,
                  status: "active",
                  last_message_at: new Date().toISOString(),
                }, { onConflict: "flow_id,device_id,contact_phone" });

                if (sessionErr) {
                  console.error("autoreply session recovery error:", sessionErr);
                } else {
                  console.log(`Recovered autoreply session for button ${buttonResponseId} on flow ${recovered.flowId}`);
                }
              } else {
                console.log(`No autoreply node matched button ${buttonResponseId} on ${device.name}`);
              }
            }
          }

          const { error: queueErr } = await admin.from("autoreply_queue").insert({
            device_id: device.id,
            user_id: device.user_id,
            from_phone: queuePhone,
            message_text: content || displayContent || "",
            status: "pending",
            device_header_id: device.id,
            instance_token: null,
            raw_payload: buttonResponseId ? body : null,
            button_response_id: buttonResponseId || null,
            has_button_response: !!buttonResponseId,
          });
          if (queueErr) {
            console.error("autoreply_queue insert error:", queueErr);
          } else {
            console.log(`Enqueued for flow autoreply: ${phone} on ${device.name}`);
          }
        }
      } catch (e) {
        console.error("Flow autoreply enqueue error:", e);
      }

      // Trigger AI auto-reply for all incoming messages
      try {
        const aiReplyUrl = `${supabaseUrl}/functions/v1/ai-autoreply`;
        const aiPromise = fetch(aiReplyUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: device.user_id,
            conversation_id: conversationId,
            device_id: device.id,
            remote_jid: remoteJid,
            contact_name: name,
            message_content: content || displayContent,
            media_type: mediaType,
          }),
        });
        if (typeof (globalThis as any).EdgeRuntime?.waitUntil === "function") {
          (globalThis as any).EdgeRuntime.waitUntil(aiPromise);
        } else {
          await aiPromise;
        }
      } catch (e) {
        console.error("AI autoreply trigger error:", e);
      }
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
async function handleSetupWebhooks(req: Request, admin: any, _body: any) {
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
    if (!["Ready", "Connected", "authenticated", "connected", "open"].includes(dev.status)) continue;

    const base = dev.uazapi_base_url.replace(/\/+$/, "");
    const webhookUrl = webhookBaseUrl;
    const webhookHeaders: Record<string, string> = {
      token: dev.uazapi_token,
      "x-device-id": dev.id,
    };
    if (webhookSecret) webhookHeaders["x-webhook-secret"] = webhookSecret;

    const desiredBody = {
      url: webhookUrl,
      enabled: true,
      events: ["messages"],
      excludeMessages: ["isGroupYes"],
      addUrlEvents: true,
      addUrlTypesMessages: true,
      fromMe: true,
      sendFromMe: true,
      allMessages: true,
      headers: webhookHeaders,
    };

    try {
      const getRes = await fetch(`${base}/webhook`, { headers: { token: dev.uazapi_token, Accept: "application/json" } });
      const getText = await getRes.text();
      let existing: any[] = [];
      try { existing = JSON.parse(getText) || []; } catch {}
      if (!Array.isArray(existing)) existing = [];

      const ours = existing.find((w: any) => w.url?.includes("webhook-conversations"));
      const alreadyConfigured = !!ours
        && ours.url === webhookUrl
        && ours.enabled === true
        && (Array.isArray(ours.events) ? ours.events.includes("messages") : true)
        && (ours.addUrlEvents === true || ours.add_url_events === true)
        && (ours.addUrlTypesMessages === true || ours.add_url_types_messages === true);

      if (alreadyConfigured) {
        console.log(`[${dev.name}] Already configured`);
        configured++;
        continue;
      }

      for (const w of existing.filter((w: any) => w.url?.includes("webhook-conversations"))) {
        try { await fetch(`${base}/webhook/${w.id}`, { method: "DELETE", headers: { token: dev.uazapi_token } }); } catch {}
      }

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
