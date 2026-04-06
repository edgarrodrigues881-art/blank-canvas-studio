// ══════════════════════════════════════════════════════════
// VPS Engine — Autoreply Processor
// Polls autoreply_queue and processes flow-based autoreplies
// ══════════════════════════════════════════════════════════

import { SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "./lib/logger";
import { config } from "./config";

const log = createLogger("autoreply");

let _lastTickAt: Date | null = null;
let _processing = false;
let _stats = { processed: 0, errors: 0, skipped: 0 };

export function getAutoreplyStatus() {
  return { ..._stats, lastTick: _lastTickAt?.toISOString() || null };
}

export { _lastTickAt as lastAutoreplyTickAt };

// ── UAZAPI Helpers ──

async function uazapiSend(baseUrl: string, token: string, endpoint: string, payload: any) {
  const url = `${baseUrl}${endpoint}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.apiTimeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`API error ${res.status}: ${text.substring(0, 200)}`);
    try { return JSON.parse(text); } catch { return { raw: text }; }
  } finally {
    clearTimeout(timeout);
  }
}

async function sendFlowMessage(
  baseUrl: string, token: string, phone: string, text: string,
  imageUrl?: string, buttons?: { id: string; label: string }[]
) {
  const cleanPhone = phone.replace(/\D/g, "");
  if (buttons && buttons.length > 0) {
    const choices = buttons.map(b => `${b.label}|${b.id}`).filter(Boolean);
    const payload: any = { number: cleanPhone, type: "button", text, choices };
    if (imageUrl) payload.imageButton = imageUrl;
    return uazapiSend(baseUrl, token, "/send/menu", payload);
  }
  if (imageUrl) {
    return uazapiSend(baseUrl, token, "/send/media", { number: cleanPhone, file: imageUrl, type: "image", caption: text });
  }
  return uazapiSend(baseUrl, token, "/send/text", { number: cleanPhone, text });
}

// ── Flow Graph Helpers ──

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

function findNextNodes(nodeId: string, edges: FlowEdge[]): string[] {
  return edges.filter(e => e.source === nodeId).map(e => e.target);
}

function findNextNodeForButton(nodeId: string, buttonId: string, edges: FlowEdge[]): string | null {
  for (const handle of [`btn-${buttonId}`, buttonId]) {
    const edge = edges.find(e => e.source === nodeId && e.sourceHandle === handle);
    if (edge) return edge.target;
  }
  const partial = edges.find(e => e.source === nodeId && e.sourceHandle?.includes(buttonId));
  return partial?.target || null;
}

function findNodeById(nodeId: string, nodes: FlowNode[]): FlowNode | undefined {
  return nodes.find(n => n.id === nodeId);
}

function matchesTrigger(startNode: FlowNode, messageText: string, isFirstMessage: boolean): boolean {
  const trigger = startNode.data.trigger || "any_message";
  switch (trigger) {
    case "any_message": return true;
    case "keyword": {
      const keyword = (startNode.data.keyword || "").trim().toLowerCase();
      if (!keyword) return false;
      const keywords = keyword.split(",").map(k => k.trim()).filter(Boolean);
      return keywords.some(kw => messageText.toLowerCase().trim().includes(kw));
    }
    case "new_contact":
    case "start_chat":
      return isFirstMessage;
    case "template":
      return true;
    default: return false;
  }
}

// ── Process Node Chain ──

async function processNodeChain(
  db: SupabaseClient, baseUrl: string, token: string, phone: string,
  startNodeId: string, nodes: FlowNode[], edges: FlowEdge[],
  sessionId: string, flowId: string, deviceId: string, userId: string
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
            await sendFlowMessage(baseUrl, token, phone, text,
              node.data.imageUrl || undefined,
              node.data.buttons?.map(b => ({ id: b.id, label: b.label })));
            log.info(`Message sent: "${text.substring(0, 50)}" to ${phone}`);
          } catch (err: any) {
            log.error(`Failed to send message node ${node.id}: ${err.message}`);
          }
        }
        await db.from("autoreply_sessions").update({
          current_node_id: node.id, last_message_at: new Date().toISOString(), status: "active",
        }).eq("id", sessionId);

        const hasButtonTargets = node.data.buttons?.some(b => b.targetNodeId);
        const hasButtonEdges = node.data.buttons?.some(b => findNextNodeForButton(node.id, b.id, edges));
        if (hasButtonTargets || hasButtonEdges || (node.data.buttons?.length ?? 0) > 0) return;

        const nextNodes = findNextNodes(node.id, edges);
        currentNodeId = nextNodes[0] || "";
        break;
      }
      case "delayNode": {
        const delaySeconds = Math.min(node.data.delaySeconds || 5, 30);
        await new Promise(r => setTimeout(r, delaySeconds * 1000));
        await db.from("autoreply_sessions").update({
          current_node_id: node.id, last_message_at: new Date().toISOString(),
        }).eq("id", sessionId);
        const nextNodes = findNextNodes(node.id, edges);
        currentNodeId = nextNodes[0] || "";
        break;
      }
      case "endNode": {
        await db.from("autoreply_sessions").update({
          current_node_id: node.id, status: "completed", last_message_at: new Date().toISOString(),
        }).eq("id", sessionId);
        if (node.data.action === "wait_response") {
          await db.from("autoreply_sessions").update({ status: "waiting_response" }).eq("id", sessionId);
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

  await db.from("autoreply_sessions").update({ status: "completed" }).eq("id", sessionId);
}

// ── Process a single queue item ──

async function processQueueItem(db: SupabaseClient, item: any): Promise<void> {
  const { device_id: deviceId, user_id: userId, from_phone: fromPhone,
    message_text: messageText, button_response_id: buttonResponseId,
    has_button_response: hasButtonResponse } = item;

  // Lookup device
  const { data: device } = await db.from("devices")
    .select("id, user_id, uazapi_token, uazapi_base_url, status, number")
    .eq("id", deviceId).maybeSingle();

  if (!device?.uazapi_token || !device?.uazapi_base_url) {
    throw new Error("Device not configured");
  }

  const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");
  let deviceToken = device.uazapi_token;

  // Check token pool
  if (!deviceToken) {
    const { data: poolRow } = await db.from("user_api_tokens")
      .select("token").eq("device_id", deviceId).eq("status", "in_use").maybeSingle();
    if (poolRow?.token) deviceToken = poolRow.token;
  }

  if (!deviceToken) throw new Error("No token for device");

  // ── Anti-loop: device own number ──
  if (device.number) {
    const dn = device.number.replace(/\D/g, "");
    if (dn && fromPhone && (fromPhone === dn || fromPhone.endsWith(dn) || dn.endsWith(fromPhone))) {
      log.info(`Skipping: fromPhone ${fromPhone} matches device number`);
      return;
    }
  }

  // ── Anti-loop: other devices of same user ──
  const { data: userDevices } = await db.from("devices")
    .select("number").eq("user_id", userId).neq("id", deviceId);
  if (userDevices?.some(d => {
    if (!d.number) return false;
    const dn = d.number.replace(/\D/g, "");
    return dn && fromPhone && (fromPhone === dn || fromPhone.endsWith(dn) || dn.endsWith(fromPhone));
  })) {
    log.info(`Skipping: fromPhone ${fromPhone} matches another device of same user`);
    return;
  }

  // ── Anti-loop cooldown ──
  const { data: recentSession } = await db.from("autoreply_sessions")
    .select("last_message_at, current_node_id")
    .eq("device_id", deviceId).eq("contact_phone", fromPhone)
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();

  if (recentSession?.last_message_at) {
    const elapsed = Date.now() - new Date(recentSession.last_message_at).getTime();
    if (elapsed < 30000 && !hasButtonResponse) {
      log.info(`Anti-loop cooldown: ${elapsed}ms since last message`);
      return;
    }
  }

  // ── Find active flows ──
  const { data: flows } = await db.from("autoreply_flows")
    .select("id, nodes, edges, device_id")
    .eq("user_id", userId).eq("is_active", true);

  if (!flows?.length) return;

  const matchingFlows = flows.filter(f => !f.device_id || f.device_id === deviceId);
  if (!matchingFlows.length) return;

  // ── Button click continuation ──
  if (buttonResponseId) {
    const { data: session } = await db.from("autoreply_sessions")
      .select("*").eq("device_id", deviceId).eq("contact_phone", fromPhone)
      .in("status", ["active", "paused"])
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();

    if (session) {
      const flow = matchingFlows.find(f => f.id === session.flow_id);
      if (flow) {
        const nodes = flow.nodes as FlowNode[];
        const edges = flow.edges as FlowEdge[];
        const currentNode = findNodeById(session.current_node_id, nodes);

        if (currentNode?.data.buttons) {
          const clickedButton = currentNode.data.buttons.find(
            b => b.id === buttonResponseId || b.label === buttonResponseId
          );

          if (clickedButton?.targetNodeId) {
            await processNodeChain(db, baseUrl, deviceToken, fromPhone, clickedButton.targetNodeId, nodes, edges, session.id, flow.id, deviceId, userId);
            return;
          }
          if (clickedButton) {
            const targetFromEdge = findNextNodeForButton(currentNode.id, clickedButton.id, edges);
            if (targetFromEdge) {
              await processNodeChain(db, baseUrl, deviceToken, fromPhone, targetFromEdge, nodes, edges, session.id, flow.id, deviceId, userId);
              return;
            }
          }
          if (!clickedButton) {
            const labelMatch = currentNode.data.buttons.find(b => b.label.toLowerCase() === messageText.toLowerCase().trim());
            if (labelMatch) {
              const target = findNextNodeForButton(currentNode.id, labelMatch.id, edges) || labelMatch.targetNodeId;
              if (target) {
                await processNodeChain(db, baseUrl, deviceToken, fromPhone, target, nodes, edges, session.id, flow.id, deviceId, userId);
                return;
              }
            }
          }
        }

        const nextNodes = findNextNodes(session.current_node_id, edges);
        if (nextNodes.length > 0) {
          await processNodeChain(db, baseUrl, deviceToken, fromPhone, nextNodes[0], nodes, edges, session.id, flow.id, deviceId, userId);
          return;
        }
      }
    }
  }

  // ── Text matching button label in active session ──
  {
    const { data: activeSession } = await db.from("autoreply_sessions")
      .select("*").eq("device_id", deviceId).eq("contact_phone", fromPhone)
      .in("status", ["active", "paused"])
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();

    if (activeSession && messageText) {
      const flow = matchingFlows.find(f => f.id === activeSession.flow_id);
      if (flow) {
        const nodes = flow.nodes as FlowNode[];
        const edges = flow.edges as FlowEdge[];
        const currentNode = findNodeById(activeSession.current_node_id, nodes);
        if (currentNode?.data.buttons?.length) {
          const labelMatch = currentNode.data.buttons.find(b => b.label.toLowerCase().trim() === messageText.toLowerCase().trim());
          if (labelMatch) {
            const target = findNextNodeForButton(currentNode.id, labelMatch.id, edges) || labelMatch.targetNodeId;
            if (target) {
              await processNodeChain(db, baseUrl, deviceToken, fromPhone, target, nodes, edges, activeSession.id, flow.id, deviceId, userId);
              return;
            }
          }
        }
      }
    }
  }

  // ── Waiting response continuation ──
  {
    const { data: waitSession } = await db.from("autoreply_sessions")
      .select("*").eq("device_id", deviceId).eq("contact_phone", fromPhone)
      .eq("status", "waiting_response")
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();

    if (waitSession) {
      const flow = matchingFlows.find(f => f.id === waitSession.flow_id);
      if (flow) {
        const nodes = flow.nodes as FlowNode[];
        const edges = flow.edges as FlowEdge[];
        const nextNodes = findNextNodes(waitSession.current_node_id, edges);
        if (nextNodes.length > 0) {
          await processNodeChain(db, baseUrl, deviceToken, fromPhone, nextNodes[0], nodes, edges, waitSession.id, flow.id, deviceId, userId);
          return;
        }
      }
    }
  }

  // ── No active session — match trigger ──
  const { data: recentExisting } = await db.from("autoreply_sessions")
    .select("id, status, last_message_at")
    .eq("device_id", deviceId).eq("contact_phone", fromPhone).eq("status", "active")
    .gte("last_message_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();

  if (recentExisting) {
    log.info(`Skip re-trigger: active session for ${fromPhone}`);
    return;
  }

  const { count: priorSessions } = await db.from("autoreply_sessions")
    .select("id", { count: "exact", head: true })
    .eq("device_id", deviceId).eq("contact_phone", fromPhone);

  const isFirstMessage = (priorSessions || 0) === 0;

  for (const flow of matchingFlows) {
    const nodes = flow.nodes as FlowNode[];
    const edges = flow.edges as FlowEdge[];
    const startNode = nodes.find(n => n.type === "startNode");
    if (!startNode) continue;
    if (!matchesTrigger(startNode, messageText, isFirstMessage)) continue;

    log.info(`Flow ${flow.id} matched for ${fromPhone}`);

    const { data: newSession, error: sessErr } = await db.from("autoreply_sessions")
      .upsert({
        flow_id: flow.id, device_id: deviceId, user_id: userId,
        contact_phone: fromPhone, current_node_id: startNode.id,
        status: "active", last_message_at: new Date().toISOString(),
      }, { onConflict: "flow_id,contact_phone" })
      .select("id").single();

    if (sessErr) { log.error(`Session create error: ${sessErr.message}`); continue; }

    // Send start message if exists
    if (startNode.data.text) {
      try {
        await sendFlowMessage(baseUrl, deviceToken, fromPhone, startNode.data.text,
          startNode.data.imageUrl || undefined,
          startNode.data.buttons?.map(b => ({ id: b.id, label: b.label })));
      } catch (err: any) {
        log.error(`Failed to send start message: ${err.message}`);
        return;
      }

      await db.from("autoreply_sessions").update({
        current_node_id: startNode.id, status: "active", last_message_at: new Date().toISOString(),
      }).eq("id", newSession!.id);

      if (startNode.data.buttons?.length) return;
    }

    const nextNodes = findNextNodes(startNode.id, edges);
    if (nextNodes.length > 0) {
      await processNodeChain(db, baseUrl, deviceToken, fromPhone, nextNodes[0], nodes, edges, newSession!.id, flow.id, deviceId, userId);
    }
    return;
  }

  log.info(`No trigger matched for "${messageText.substring(0, 50)}" on device ${deviceId.substring(0, 8)}`);
}

// ── Main tick: poll queue ──

export async function autoreplyTick(db: SupabaseClient): Promise<void> {
  if (_processing) return;
  _processing = true;

  try {
    // Fetch pending items (batch of 20)
    const { data: items, error } = await db.from("autoreply_queue")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(20);

    if (error) { log.error(`Queue fetch error: ${error.message}`); return; }
    if (!items?.length) return;

    // Mark as processing
    const ids = items.map(i => i.id);
    await db.from("autoreply_queue")
      .update({ status: "processing" })
      .in("id", ids);

    for (const item of items) {
      try {
        await processQueueItem(db, item);
        await db.from("autoreply_queue")
          .update({ status: "done", processed_at: new Date().toISOString() })
          .eq("id", item.id);
        _stats.processed++;
      } catch (err: any) {
        log.error(`Queue item ${item.id} error: ${err.message}`);
        await db.from("autoreply_queue")
          .update({ status: "failed", error_message: err.message?.substring(0, 500), processed_at: new Date().toISOString() })
          .eq("id", item.id);
        _stats.errors++;
      }
    }

    _lastTickAt = new Date();

    // Cleanup old processed items (>24h)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await db.from("autoreply_queue")
      .delete()
      .in("status", ["done", "failed"])
      .lt("created_at", cutoff);

  } finally {
    _processing = false;
  }
}
