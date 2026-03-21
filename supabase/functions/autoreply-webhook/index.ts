import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// ──────────────────────────────────────────────────────────────
// UAZAPI HELPERS
// ──────────────────────────────────────────────────────────────

async function uazapiSend(baseUrl: string, token: string, endpoint: string, payload: any) {
  const url = `${baseUrl}${endpoint}`;
  console.log(`[autoreply] Sending to ${endpoint}: ${JSON.stringify(payload).substring(0, 200)}`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[autoreply] API error ${res.status}: ${text}`);
    throw new Error(`API error ${res.status}: ${text.substring(0, 200)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function sendFlowMessage(
  baseUrl: string,
  token: string,
  phone: string,
  text: string,
  imageUrl?: string,
  buttons?: { id: string; label: string }[]
) {
  const cleanPhone = phone.replace(/\D/g, "");

  const hasButtons = buttons && buttons.length > 0;
  if (hasButtons) {
    const choices = buttons!
      .map((b) => `${b.label}|${b.id}`)
      .filter(Boolean);

    const payload: any = {
      number: cleanPhone,
      type: "button",
      text,
      choices,
    };
    if (imageUrl) payload.imageButton = imageUrl;
    return await uazapiSend(baseUrl, token, "/send/menu", payload);
  }

  if (imageUrl) {
    return await uazapiSend(baseUrl, token, "/send/media", {
      number: cleanPhone,
      file: imageUrl,
      type: "image",
      caption: text,
    });
  }

  return await uazapiSend(baseUrl, token, "/send/text", {
    number: cleanPhone,
    text,
  });
}

// ──────────────────────────────────────────────────────────────
// FLOW GRAPH HELPERS
// ──────────────────────────────────────────────────────────────

interface FlowNode {
  id: string;
  type: string;
  data: {
    label?: string;
    trigger?: string;
    keyword?: string;
    text?: string;
    imageUrl?: string;
    imageCaption?: string;
    buttons?: { id: string; label: string; targetNodeId: string }[];
    delaySeconds?: number;
    action?: string;
    templateId?: string;
  };
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

// Find all next nodes from a given node (no handle filter)
function findNextNodes(nodeId: string, edges: FlowEdge[]): string[] {
  return edges
    .filter((e) => e.source === nodeId)
    .map((e) => e.target);
}

// Find the next node for a specific button handle
function findNextNodeForButton(nodeId: string, buttonId: string, edges: FlowEdge[]): string | null {
  // Edges from button handles use sourceHandle like "btn-{buttonId}"
  const possibleHandles = [
    `btn-${buttonId}`,
    buttonId,
  ];

  for (const handle of possibleHandles) {
    const edge = edges.find((e) => e.source === nodeId && e.sourceHandle === handle);
    if (edge) return edge.target;
  }

  // Also try partial match (handle contains buttonId)
  const partialMatch = edges.find(
    (e) => e.source === nodeId && e.sourceHandle && e.sourceHandle.includes(buttonId)
  );
  if (partialMatch) return partialMatch.target;

  return null;
}

function findNodeById(nodeId: string, nodes: FlowNode[]): FlowNode | undefined {
  return nodes.find((n) => n.id === nodeId);
}

// Check if a message matches a flow's trigger
function matchesTrigger(
  startNode: FlowNode,
  messageText: string,
  isFirstMessage: boolean
): boolean {
  const trigger = startNode.data.trigger || "any_message";

  switch (trigger) {
    case "any_message":
      return true;
    case "keyword": {
      const keyword = (startNode.data.keyword || "").trim().toLowerCase();
      if (!keyword) return false;
      const keywords = keyword.split(",").map((k) => k.trim()).filter(Boolean);
      const msgLower = messageText.toLowerCase().trim();
      return keywords.some((kw) => msgLower.includes(kw));
    }
    case "new_contact":
      return isFirstMessage;
    case "start_chat":
      return isFirstMessage;
    case "template":
      // Template trigger fires like any_message, but session guard (below) prevents re-triggering
      return true;
    default:
      return false;
  }
}

// ──────────────────────────────────────────────────────────────
// MAIN HANDLER
// ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();

    // ── Handle webhook registration request from frontend ──
    if (body.action === "register_webhook") {
      return await handleRegisterWebhook(supabase, body, req);
    }
    if (body.action === "disable_webhook") {
      return await handleDisableWebhook(supabase, body, req);
    }

    // ── Parse incoming message from UaZapi webhook ──
    const event = body.event || body.EventType || body.type || "";
    const msgData = body.data || body;

    // Log raw payload for debugging (first 3000 chars)
    console.log(`[autoreply] RAW event="${event}" payload=${JSON.stringify(body).substring(0, 3000)}`);
    
    // Log button-specific fields for debugging
    const btnDebug = {
      type: body.type, wa_type: body.wa_type, messageType: body.messageType,
      selectedButtonId: body.selectedButtonId, selectedId: body.selectedId,
      text: body.text?.substring?.(0, 50), messageBody: body.messageBody?.substring?.(0, 50),
      body_body: body.body?.substring?.(0, 50),
      fromMe: body.fromMe ?? body.isFromMe ?? body.wa_fromMe,
      wasSentByApi: body.wasSentByApi ?? body.wa_sentByApi,
      hasMessage: !!body.message, hasData: !!body.data,
    };
    console.log(`[autoreply] BTN_DEBUG: ${JSON.stringify(btnDebug)}`);

    // Extract message details
    let fromPhone = "";
    let messageText = "";
    let buttonResponseId = "";
    let isFromMe = false;
    let instanceToken = "";
    let deviceHeaderId = "";
    let hasButtonResponse = false;

    // Try to get instance identifiers from headers/body
    instanceToken = (
      req.headers.get("token") ||
      req.headers.get("x-instance-token") ||
      body.token ||
      body.instance_token ||
      ""
    ).trim().replace(/^Bearer\s+/i, "");

    deviceHeaderId = (
      req.headers.get("x-device-id") ||
      body.device_id ||
      body.instance_id ||
      body.deviceId ||
      ""
    ).trim();

    const webhookSecret = req.headers.get("x-webhook-secret") || "";
    const expectedWebhookSecret = Deno.env.get("WEBHOOK_SECRET") || "";
    if (!expectedWebhookSecret || !webhookSecret || webhookSecret !== expectedWebhookSecret) {
      return json({ error: "Unauthorized" }, 401);
    }

    // ── UaZapi NATIVE format (EventType + chat object) ──
    if (body.EventType === "messages" && body.chat) {
      const nestedMessage = body.message || {};

      // Skip messages sent by API (bot's own messages) - prevents loops
      if (
        body.wasSentByApi === true ||
        body.wa_sentByApi === true ||
        body.sentByApi === true ||
        nestedMessage.wasSentByApi === true
      ) {
        console.log("[autoreply] Skipping wasSentByApi message (anti-loop)");
        return json({ ok: true, skipped: true, reason: "sent_by_api" });
      }

      const chatPhone = body.chat.phoneNumber || body.chat.phone || nestedMessage.sender_pn || "";
      const chatName = body.chat.lead_name || body.chat.name || body.chat.pushName || "";
      const ownerPhone = (body.chat.owner || nestedMessage.owner || "").replace(/\D/g, "");

      if (chatPhone) {
        fromPhone = String(chatPhone).replace(/\D/g, "");
      }

      if (ownerPhone && fromPhone && ownerPhone === fromPhone) {
        console.log(`[autoreply] Skipping: phone matches owner ${ownerPhone} (self-message)`);
        return json({ ok: true, skipped: true, reason: "owner_self_message" });
      }

      isFromMe = body.isFromMe === true || body.fromMe === true || body.wa_fromMe === true || nestedMessage.fromMe === true;

      messageText = body.text || body.messageBody || body.body || body.caption || "";
      if (!messageText && nestedMessage) {
        const content = nestedMessage.content;
        messageText =
          nestedMessage.conversation ||
          nestedMessage.text ||
          nestedMessage.body ||
          (typeof content === "string" ? content : "") ||
          content?.text ||
          nestedMessage.selectedDisplayText ||
          "";
      }

      buttonResponseId =
        body.selectedButtonId ||
        body.selectedId ||
        body.buttonId ||
        nestedMessage.buttonOrListid ||
        nestedMessage.selectedButtonId ||
        nestedMessage.selectedId ||
        nestedMessage.buttonId ||
        "";

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

      console.log(`[autoreply] UaZapi native parse: phone="${fromPhone}" text="${messageText}" btnId="${buttonResponseId}" fromMe=${isFromMe} owner="${ownerPhone}" chatName="${chatName}"`);
    }
    // ── Baileys / Evolution API format (key.remoteJid) ──
    else if (msgData.key) {
      fromPhone = (msgData.key.remoteJid || "").replace(/@.*$/, "");
      isFromMe = msgData.key.fromMe === true;
      
      if (msgData.message) {
        const msg = msgData.message;
        messageText =
          msg.conversation ||
          msg.extendedTextMessage?.text ||
          msg.imageMessage?.caption ||
          msg.videoMessage?.caption ||
          msg.documentMessage?.caption ||
          "";

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
      } else if (msgData.body || msgData.text || msgData.messageBody) {
        messageText = msgData.body || msgData.text || msgData.messageBody || "";
      }
    }
    // ── Generic fallback ──
    else {
      fromPhone = (msgData.from || msgData.phone || msgData.number || body.chat?.phoneNumber || "").toString().replace(/\D/g, "");
      messageText = msgData.body || msgData.text || msgData.messageBody || "";
    }

    // Also check for button response at top level (any format)
    if (!buttonResponseId) {
      buttonResponseId = msgData.selectedButtonId || msgData.buttonId || msgData.buttonOrListid || body.selectedButtonId || body.selectedId || "";
      if (buttonResponseId) hasButtonResponse = true;
    }

    // Skip group messages but ALLOW fromMe if it's a button response (user clicked our button)
    if (!fromPhone || fromPhone.includes("g.us")) {
      return json({ ok: true, skipped: true, reason: "group_or_empty" });
    }
    if (isFromMe && !hasButtonResponse) {
      return json({ ok: true, skipped: true, reason: "self_message" });
    }

    // Skip empty messages without button response (likely bot's own sent messages echoed back)
    if (!messageText && !hasButtonResponse) {
      console.log(`[autoreply] Skipping empty message without button response. fromMe=${isFromMe} fromPhone=${fromPhone} bodyKeys=${Object.keys(body).join(",")}`);
      return json({ ok: true, skipped: true, reason: "empty_no_button" });
    }

    // Skip non-message events
    if (event && !event.includes("message") && !event.includes("Message") && event !== "") {
      console.log(`[autoreply] Skipping non-message event: "${event}"`);
      return json({ ok: true, skipped: true, reason: "non_message_event" });
    }

    console.log(`[autoreply] Incoming from ${fromPhone}: "${messageText}" buttonId: "${buttonResponseId}" token: ${instanceToken ? "yes" : "no"} deviceId: ${deviceHeaderId || "no"}`);

    // ── Find the device by explicit device id, fallback to token ──
    if (!deviceHeaderId && !instanceToken) {
      console.log("[autoreply] SKIP: no device identifier (no token, no deviceId header)");
      return json({ ok: true, skipped: true, reason: "no_device_identifier" });
    }

    let device: { id: string; user_id: string; uazapi_token: string | null; uazapi_base_url: string | null; status: string; number: string | null } | null = null;

    if (deviceHeaderId) {
      const { data } = await supabase
        .from("devices")
        .select("id, user_id, uazapi_token, uazapi_base_url, status, number")
        .eq("id", deviceHeaderId)
        .maybeSingle();
      device = data;
      if (device) console.log(`[autoreply] Device found by header id: ${device.id}`);
    }

    if (!device && instanceToken) {
      // Try direct token match first
      const { data } = await supabase
        .from("devices")
        .select("id, user_id, uazapi_token, uazapi_base_url, status, number")
        .eq("uazapi_token", instanceToken)
        .maybeSingle();
      device = data;
      
      // If not found, try via user_api_tokens pool
      if (!device) {
        const { data: poolRow } = await supabase
          .from("user_api_tokens")
          .select("device_id, token")
          .eq("token", instanceToken)
          .eq("status", "in_use")
          .maybeSingle();
        
        if (poolRow?.device_id) {
          const { data: poolDevice } = await supabase
            .from("devices")
            .select("id, user_id, uazapi_token, uazapi_base_url, status, number")
            .eq("id", poolRow.device_id)
            .maybeSingle();
          device = poolDevice;
          if (device) {
            // Use the pool token for sending
            device.uazapi_token = poolRow.token;
            console.log(`[autoreply] Device found via token pool: ${device.id}`);
          }
        }
      } else {
        console.log(`[autoreply] Device found by token: ${device.id}`);
      }
    }

    if (!device) {
      console.log(`[autoreply] SKIP: Device not found for token=${instanceToken?.substring(0, 8)}... deviceId=${deviceHeaderId}`);
      return json({ ok: true, skipped: true, reason: "device_not_found" });
    }

    const deviceId = device.id;
    const userId = device.user_id;
    const baseUrl = (device.uazapi_base_url || "").replace(/\/+$/, "");
    const deviceToken = device.uazapi_token!;

    // ── Anti-loop: check if the incoming phone matches the device's own number ──
    if (device.number) {
      const deviceNumber = device.number.replace(/\D/g, "");
      if (deviceNumber && fromPhone && (fromPhone === deviceNumber || fromPhone.endsWith(deviceNumber) || deviceNumber.endsWith(fromPhone))) {
        console.log(`[autoreply] Skipping: fromPhone ${fromPhone} matches device number ${deviceNumber}`);
        return json({ ok: true, skipped: true, reason: "device_own_number" });
      }
    }

    // ── Anti-loop: skip messages from OTHER devices owned by the same user (warmup/chip-conversation) ──
    {
      const { data: userDevices } = await supabase
        .from("devices")
        .select("number")
        .eq("user_id", userId)
        .neq("id", deviceId);

      if (userDevices && userDevices.length > 0) {
        const senderIsOwnDevice = userDevices.some((d) => {
          if (!d.number) return false;
          const dn = d.number.replace(/\D/g, "");
          return dn && fromPhone && (fromPhone === dn || fromPhone.endsWith(dn) || dn.endsWith(fromPhone));
        });
        if (senderIsOwnDevice) {
          console.log(`[autoreply] Skipping: fromPhone ${fromPhone} matches another device of same user (warmup/internal)`);
          return json({ ok: true, skipped: true, reason: "internal_device_message" });
        }
      }
    }

    // ── Anti-loop cooldown: prevent processing same contact/message more than once per 30 seconds ──
    const { data: recentSession } = await supabase
      .from("autoreply_sessions")
      .select("last_message_at, current_node_id")
      .eq("device_id", deviceId)
      .eq("contact_phone", fromPhone)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentSession?.last_message_at) {
      const lastMs = new Date(recentSession.last_message_at).getTime();
      const nowMs = Date.now();
      if (nowMs - lastMs < 30000 && !hasButtonResponse) {
        console.log(`[autoreply] Anti-loop cooldown: ${nowMs - lastMs}ms since last message`);
        return json({ ok: true, skipped: true, reason: "cooldown" });
      }
    }

    // ── Find active flows for this device ──
    const { data: flows } = await supabase
      .from("autoreply_flows")
      .select("id, nodes, edges, device_id")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (!flows || flows.length === 0) {
      console.log(`[autoreply] SKIP: No active flows for user ${userId}`);
      return json({ ok: true, skipped: true, reason: "no_active_flows" });
    }

    // Filter flows assigned to this device (or no device = all devices)
    const matchingFlows = flows.filter(
      (f) => !f.device_id || f.device_id === deviceId
    );

    console.log(`[autoreply] Device ${deviceId}: ${flows.length} active flows, ${matchingFlows.length} matching this device`);

    if (matchingFlows.length === 0) {
      console.log(`[autoreply] SKIP: No flows matching device ${deviceId}. Flow device_ids: ${flows.map((f: any) => f.device_id).join(", ")}`);
      return json({ ok: true, skipped: true, reason: "no_matching_flows" });
    }

    // ── Check for existing session (button click continuation) ──
    if (buttonResponseId) {
      const { data: session } = await supabase
        .from("autoreply_sessions")
        .select("*")
        .eq("device_id", deviceId)
        .eq("contact_phone", fromPhone)
        .in("status", ["active", "paused"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (session) {
        const flow = matchingFlows.find((f) => f.id === session.flow_id);
        if (flow) {
          const nodes = flow.nodes as FlowNode[];
          const edges = flow.edges as FlowEdge[];
          const currentNode = findNodeById(session.current_node_id, nodes);

          if (currentNode?.data.buttons) {
            const clickedButton = currentNode.data.buttons.find(
              (b) => b.id === buttonResponseId || b.label === buttonResponseId
            );

            // 1. Try explicit targetNodeId on the button
            if (clickedButton?.targetNodeId) {
              console.log(`[autoreply] Button "${clickedButton.label}" → targetNodeId ${clickedButton.targetNodeId}`);
              await processNodeChain(supabase, baseUrl, deviceToken, fromPhone, clickedButton.targetNodeId, nodes, edges, session.id, flow.id, deviceId, userId);
              return json({ ok: true, action: "button_navigation" });
            }

            // 2. Try resolving via edge sourceHandle (the correct approach for flow editor)
            if (clickedButton) {
              const targetFromEdge = findNextNodeForButton(currentNode.id, clickedButton.id, edges);
              if (targetFromEdge) {
                console.log(`[autoreply] Button "${clickedButton.label}" → edge target ${targetFromEdge}`);
                await processNodeChain(supabase, baseUrl, deviceToken, fromPhone, targetFromEdge, nodes, edges, session.id, flow.id, deviceId, userId);
                return json({ ok: true, action: "button_edge_navigation" });
              }
            }

            // 3. Also try matching by label text in button response
            if (!clickedButton) {
              const labelMatch = currentNode.data.buttons.find(
                (b) => b.label.toLowerCase() === messageText.toLowerCase().trim()
              );
              if (labelMatch) {
                const targetFromEdge = findNextNodeForButton(currentNode.id, labelMatch.id, edges);
                if (targetFromEdge) {
                  console.log(`[autoreply] Button label match "${labelMatch.label}" → edge target ${targetFromEdge}`);
                  await processNodeChain(supabase, baseUrl, deviceToken, fromPhone, targetFromEdge, nodes, edges, session.id, flow.id, deviceId, userId);
                  return json({ ok: true, action: "button_label_navigation" });
                }
                if (labelMatch.targetNodeId) {
                  await processNodeChain(supabase, baseUrl, deviceToken, fromPhone, labelMatch.targetNodeId, nodes, edges, session.id, flow.id, deviceId, userId);
                  return json({ ok: true, action: "button_label_target_navigation" });
                }
              }
            }
          }

          // Fallback: try next nodes in sequence (first edge from current node)
          const nextNodes = findNextNodes(session.current_node_id, edges);
          if (nextNodes.length > 0) {
            console.log(`[autoreply] Button fallback → first edge target ${nextNodes[0]}`);
            await processNodeChain(supabase, baseUrl, deviceToken, fromPhone, nextNodes[0], nodes, edges, session.id, flow.id, deviceId, userId);
            return json({ ok: true, action: "sequence_next" });
          }
        }
      }
    }

    // ── Check for existing active session with text matching a button label ──
    {
      const { data: activeSession } = await supabase
        .from("autoreply_sessions")
        .select("*")
        .eq("device_id", deviceId)
        .eq("contact_phone", fromPhone)
        .in("status", ["active", "paused"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeSession && messageText) {
        const flow = matchingFlows.find((f) => f.id === activeSession.flow_id);
        if (flow) {
          const nodes = flow.nodes as FlowNode[];
          const edges = flow.edges as FlowEdge[];
          const currentNode = findNodeById(activeSession.current_node_id, nodes);

          // Check if the text matches a button label (user typed the button text)
          if (currentNode?.data.buttons?.length) {
            const labelMatch = currentNode.data.buttons.find(
              (b) => b.label.toLowerCase().trim() === messageText.toLowerCase().trim()
            );
            if (labelMatch) {
              const targetFromEdge = findNextNodeForButton(currentNode.id, labelMatch.id, edges);
              const targetNode = targetFromEdge || labelMatch.targetNodeId || null;
              if (targetNode) {
                console.log(`[autoreply] Text matches button label "${labelMatch.label}" → ${targetNode}`);
                await processNodeChain(supabase, baseUrl, deviceToken, fromPhone, targetNode, nodes, edges, activeSession.id, flow.id, deviceId, userId);
                return json({ ok: true, action: "text_as_button" });
              }
            }
          }
        }
      }
    }

    // ── Check for existing active session (text response continuation) ──
    {
      const { data: existingSession } = await supabase
        .from("autoreply_sessions")
        .select("*")
        .eq("device_id", deviceId)
        .eq("contact_phone", fromPhone)
        .eq("status", "waiting_response")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingSession) {
        const flow = matchingFlows.find((f) => f.id === existingSession.flow_id);
        if (flow) {
          const nodes = flow.nodes as FlowNode[];
          const edges = flow.edges as FlowEdge[];
          const nextNodes = findNextNodes(existingSession.current_node_id, edges);

          if (nextNodes.length > 0) {
            await processNodeChain(supabase, baseUrl, deviceToken, fromPhone, nextNodes[0], nodes, edges, existingSession.id, flow.id, deviceId, userId);
            return json({ ok: true, action: "waiting_response_continued" });
          }
        }
      }
    }

    // ── No active session — check if message matches any flow trigger ──
    // Guard: only block re-trigger if there's an ACTIVE session (not completed/paused)
    // Completed/paused sessions should allow re-triggering the flow
    const { data: recentExistingSession } = await supabase
      .from("autoreply_sessions")
      .select("id, status, last_message_at")
      .eq("device_id", deviceId)
      .eq("contact_phone", fromPhone)
      .eq("status", "active")
      .gte("last_message_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentExistingSession) {
      console.log(`[autoreply] SKIP re-trigger: active session ${recentExistingSession.id} for ${fromPhone} (last msg ${recentExistingSession.last_message_at})`);
      return json({ ok: true, skipped: true, reason: "recent_session_exists" });
    }

    const { count: priorSessions } = await supabase
      .from("autoreply_sessions")
      .select("id", { count: "exact", head: true })
      .eq("device_id", deviceId)
      .eq("contact_phone", fromPhone);

    const isFirstMessage = (priorSessions || 0) === 0;

    for (const flow of matchingFlows) {
      const nodes = flow.nodes as FlowNode[];
      const edges = flow.edges as FlowEdge[];

      const startNode = nodes.find((n) => n.type === "startNode");
      if (!startNode) {
        console.log(`[autoreply] Flow ${flow.id} has no startNode, skipping`);
        continue;
      }

      const triggerType = startNode.data.trigger || "any_message";
      if (!matchesTrigger(startNode, messageText, isFirstMessage)) {
        console.log(`[autoreply] Flow ${flow.id} trigger "${triggerType}" did NOT match text "${messageText.substring(0, 50)}" (keyword="${startNode.data.keyword || ""}")`);
        continue;
      }

      console.log(`[autoreply] ✅ Flow ${flow.id} MATCHED for ${fromPhone} (trigger=${triggerType})`);

      // Create or reset session
      const { data: newSession, error: sessErr } = await supabase
        .from("autoreply_sessions")
        .upsert(
          {
            flow_id: flow.id,
            device_id: deviceId,
            user_id: userId,
            contact_phone: fromPhone,
            current_node_id: startNode.id,
            status: "active",
            last_message_at: new Date().toISOString(),
          },
          { onConflict: "flow_id,contact_phone" }
        )
        .select("id")
        .single();

      if (sessErr) {
        console.error("[autoreply] Session create error:", sessErr.message);
        continue;
      }

      // If start node has text (template mode), send it first
      if (startNode.data.text) {
        try {
          await sendFlowMessage(
            baseUrl,
            deviceToken,
            fromPhone,
            startNode.data.text,
            startNode.data.imageUrl || undefined,
            startNode.data.buttons?.map((b) => ({ id: b.id, label: b.label }))
          );
          console.log(`[autoreply] Start message sent to ${fromPhone}`);
        } catch (sendErr) {
          console.error(`[autoreply] Failed to send start message: ${sendErr}`);
          return json({ error: "Failed to send start message", details: sendErr instanceof Error ? sendErr.message : String(sendErr) }, 502);
        }

        await supabase
          .from("autoreply_sessions")
          .update({
            current_node_id: startNode.id,
            status: "active",
            last_message_at: new Date().toISOString(),
          })
          .eq("id", newSession!.id);

        if (startNode.data.buttons?.length) {
          return json({ ok: true, action: "start_with_buttons" });
        }
      }

      // Process the chain of connected nodes
      const nextNodes = findNextNodes(startNode.id, edges);
      if (nextNodes.length > 0) {
        console.log(`[autoreply] Processing chain from startNode → ${nextNodes[0]}`);
        await processNodeChain(supabase, baseUrl, deviceToken, fromPhone, nextNodes[0], nodes, edges, newSession!.id, flow.id, deviceId, userId);
      } else {
        console.log(`[autoreply] No edges from startNode, flow has no next steps`);
      }

      return json({ ok: true, action: "flow_started" });
    }

    console.log(`[autoreply] SKIP: No trigger matched for "${messageText.substring(0, 50)}" on device ${deviceId}`);
  } catch (err) {
    console.error("[autoreply] Error:", err);
    return json({ error: "Internal error", details: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// ──────────────────────────────────────────────────────────────
// PROCESS NODE CHAIN
// ──────────────────────────────────────────────────────────────

async function processNodeChain(
  supabase: any,
  baseUrl: string,
  token: string,
  phone: string,
  startNodeId: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
  sessionId: string,
  flowId: string,
  deviceId: string,
  userId: string
) {
  let currentNodeId = startNodeId;
  let maxSteps = 20;

  while (currentNodeId && maxSteps-- > 0) {
    const node = findNodeById(currentNodeId, nodes);
    if (!node) break;

    switch (node.type) {
      case "messageNode": {
        const text = node.data.text || "";
        if (text) {
          try {
            await sendFlowMessage(
              baseUrl,
              token,
              phone,
              text,
              node.data.imageUrl || undefined,
              node.data.buttons?.map((b) => ({ id: b.id, label: b.label }))
            );
            console.log(`[autoreply] Message sent: "${text.substring(0, 50)}..." to ${phone}`);
          } catch (sendErr) {
            console.error(`[autoreply] Failed to send message node ${node.id}: ${sendErr}`);
            // Don't break chain for send errors - log and continue
          }
        }

        // Update session
        await supabase
          .from("autoreply_sessions")
          .update({
            current_node_id: node.id,
            last_message_at: new Date().toISOString(),
            status: "active",
          })
          .eq("id", sessionId);

        // If node has buttons with targets or edge connections, wait for button click
        const hasButtonTargets = node.data.buttons?.some((b) => b.targetNodeId);
        const hasButtonEdges = node.data.buttons?.some((b) => findNextNodeForButton(node.id, b.id, edges));
        if (hasButtonTargets || hasButtonEdges) {
          return; // Stop chain, wait for button response
        }

        // If has buttons at all (even without mapped targets), still wait
        if (node.data.buttons?.length) {
          return;
        }

        // Continue to next node
        const nextNodes = findNextNodes(node.id, edges);
        currentNodeId = nextNodes[0] || "";
        break;
      }

      case "delayNode": {
        const delaySeconds = node.data.delaySeconds || 5;
        const cappedDelay = Math.min(delaySeconds, 30);
        await new Promise((r) => setTimeout(r, cappedDelay * 1000));

        // Update session
        await supabase
          .from("autoreply_sessions")
          .update({
            current_node_id: node.id,
            last_message_at: new Date().toISOString(),
          })
          .eq("id", sessionId);

        const nextNodes = findNextNodes(node.id, edges);
        currentNodeId = nextNodes[0] || "";
        break;
      }

      case "endNode": {
        await supabase
          .from("autoreply_sessions")
          .update({
            current_node_id: node.id,
            status: "completed",
            last_message_at: new Date().toISOString(),
          })
          .eq("id", sessionId);

        if (node.data.action === "wait_response") {
          await supabase
            .from("autoreply_sessions")
            .update({ status: "waiting_response" })
            .eq("id", sessionId);
        }
        return;
      }

      default: {
        const nextNodes = findNextNodes(node.id, edges);
        currentNodeId = nextNodes[0] || "";
        break;
      }
    }
  }

  // Chain ended
  await supabase
    .from("autoreply_sessions")
    .update({ status: "completed" })
    .eq("id", sessionId);
}

// ──────────────────────────────────────────────────────────────
// WEBHOOK REGISTRATION ON UAZAPI
// ──────────────────────────────────────────────────────────────

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
    const { data: device } = await supabase
      .from("devices")
      .select("id, user_id, uazapi_token, uazapi_base_url")
      .eq("id", device_id)
      .single();
    if (!device?.uazapi_token || !device?.uazapi_base_url) {
      return json({ error: "Device not configured" }, 400);
    }
    return await doRegisterWebhook(device);
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(bearerToken);
  if (authErr || !user) {
    return json({ error: "Not authenticated" }, 401);
  }

  const { data: device } = await supabase
    .from("devices")
    .select("id, uazapi_token, uazapi_base_url")
    .eq("id", device_id)
    .eq("user_id", user.id)
    .single();

  if (!device?.uazapi_token || !device?.uazapi_base_url) {
    return json({ error: "Device not configured" }, 400);
  }

  return await doRegisterWebhook(device);
}

async function handleDisableWebhook(supabase: any, body: any, req: Request) {
  const { device_id } = body;
  const authHeader = req.headers.get("authorization") ?? "";
  const bearerToken = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(bearerToken);
  if (authErr || !user) return json({ error: "Not authenticated" }, 401);

  const { data: device } = await supabase
    .from("devices")
    .select("id, uazapi_token, uazapi_base_url")
    .eq("id", device_id)
    .eq("user_id", user.id)
    .single();

  if (!device?.uazapi_token || !device?.uazapi_base_url) {
    return json({ error: "Device not configured" }, 400);
  }

  const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const webhookUrl = `${supabaseUrl}/functions/v1/autoreply-webhook`;
  const headers: Record<string, string> = { "Content-Type": "application/json", token: device.uazapi_token };

  try {
    const putRes = await fetch(`${baseUrl}/webhook`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ url: webhookUrl, enabled: false, events: ["messages"] }),
    });
    const putText = await putRes.text();
    console.log(`[autoreply] DISABLE PUT /webhook: ${putRes.status} ${putText.substring(0, 300)}`);
  } catch (err) {
    console.log(`[autoreply] Disable webhook failed: ${err}`);
  }

  return json({ ok: true, disabled: true });
}

async function doRegisterWebhook(device: any) {
  const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const webhookUrl = `${supabaseUrl}/functions/v1/autoreply-webhook`;
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET") || "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    token: device.uazapi_token,
  };

  const webhookHeaders: Record<string, string> = {
    token: device.uazapi_token,
    "x-device-id": device.id,
  };
  if (webhookSecret) {
    webhookHeaders["x-webhook-secret"] = webhookSecret;
  }

  const desiredBody = {
    url: webhookUrl,
    enabled: true,
    events: ["messages"],
    excludeMessages: ["wasSentByApi", "isGroupYes"],
    addUrlEvents: true,
    addUrlTypesMessages: true,
    headers: webhookHeaders,
  };

  // Step 1: GET existing webhooks to check if ours exists
  try {
    const getRes = await fetch(`${baseUrl}/webhook`, { method: "GET", headers });
    const getText = await getRes.text();
    console.log(`[autoreply] GET /webhook: ${getRes.status} ${getText.substring(0, 500)}`);

    if (getRes.ok) {
      try {
        const parsed = JSON.parse(getText);
        const arr = Array.isArray(parsed) ? parsed : [];
        const existing = arr.find((w: any) => w.url === webhookUrl);

        if (existing) {
          // Webhook exists — update it via PUT with its id
          console.log(`[autoreply] Found existing webhook id=${existing.id}, enabled=${existing.enabled}. Updating via PUT...`);
          const putRes = await fetch(`${baseUrl}/webhook`, {
            method: "PUT",
            headers,
            body: JSON.stringify({ ...desiredBody, id: existing.id }),
          });
          const putText = await putRes.text();
          console.log(`[autoreply] PUT /webhook: ${putRes.status} ${putText.substring(0, 500)}`);

          if (putRes.ok) {
            return json({ ok: true, webhook_url: webhookUrl, method: "PUT_UPDATE", webhook_id: existing.id });
          }

          // PUT failed — try PATCH
          const patchRes = await fetch(`${baseUrl}/webhook`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ ...desiredBody, id: existing.id }),
          });
          const patchText = await patchRes.text();
          console.log(`[autoreply] PATCH /webhook: ${patchRes.status} ${patchText.substring(0, 500)}`);

          if (patchRes.ok) {
            return json({ ok: true, webhook_url: webhookUrl, method: "PATCH_UPDATE", webhook_id: existing.id });
          }

          // Try DELETE + POST (recreate)
          console.log(`[autoreply] PUT/PATCH failed. Trying DELETE + POST to recreate...`);
          const delRes = await fetch(`${baseUrl}/webhook`, {
            method: "DELETE",
            headers,
            body: JSON.stringify({ id: existing.id }),
          });
          const delText = await delRes.text();
          console.log(`[autoreply] DELETE /webhook: ${delRes.status} ${delText.substring(0, 300)}`);
        }
      } catch (parseErr) {
        console.log(`[autoreply] Could not parse GET response, proceeding with POST`);
      }
    }
  } catch (getErr) {
    console.log(`[autoreply] GET /webhook failed: ${getErr}, proceeding with POST`);
  }

  // Step 2: POST to create new webhook
  try {
    const postRes = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers,
      body: JSON.stringify(desiredBody),
    });
    const postText = await postRes.text();
    console.log(`[autoreply] POST /webhook: ${postRes.status} ${postText.substring(0, 500)}`);

    if (postRes.ok) {
      // Verify it was actually enabled
      try {
        const parsed = JSON.parse(postText);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        const ours = arr.find((w: any) => w.url === webhookUrl);
        if (ours && ours.enabled === false) {
          console.warn(`[autoreply] POST returned success but webhook still disabled. Manual config may be needed.`);
          return json({
            ok: false,
            warning: "Webhook criado mas não habilitado automaticamente",
            webhook_url: webhookUrl,
            manual_setup: `Acesse o painel UaZapi, ative o webhook com URL: ${webhookUrl}`,
          });
        }
      } catch {}
      return json({ ok: true, webhook_url: webhookUrl, method: "POST_CREATE" });
    }
  } catch (postErr) {
    console.error(`[autoreply] POST /webhook error: ${postErr}`);
  }

  // Step 3: Try /webhook/set endpoint (legacy)
  try {
    const setRes = await fetch(`${baseUrl}/webhook/set`, {
      method: "POST",
      headers,
      body: JSON.stringify(desiredBody),
    });
    const setText = await setRes.text();
    console.log(`[autoreply] POST /webhook/set: ${setRes.status} ${setText.substring(0, 300)}`);

    if (setRes.ok) {
      return json({ ok: true, webhook_url: webhookUrl, method: "POST_SET" });
    }
  } catch {}

  console.error(`[autoreply] All webhook registration attempts failed`);
  return json({
    error: "Falha ao registrar webhook",
    webhook_url: webhookUrl,
    manual_setup: `Configure manualmente no painel UaZapi: URL = ${webhookUrl}, Eventos = messages, Ativar = Sim`,
  }, 502);
}
