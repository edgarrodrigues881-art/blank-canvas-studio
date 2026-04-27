// ══════════════════════════════════════════════════════════
// VPS Engine — Autoreply Processor
// Polls autoreply_queue and processes flow-based autoreplies
// ══════════════════════════════════════════════════════════

import { SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "../core/logger";
import { config } from "../core/config";

const log = createLogger("autoreply");

let _lastTickAt: Date | null = null;
let _processing = false;
let _stats = { processed: 0, errors: 0, skipped: 0, deduplicated: 0 };

// ── Deduplication cache (in-memory, device+phone → timestamp) ──
const _recentlyProcessed = new Map<string, number>();
const DEDUP_TTL_MS = 60_000; // 60s window

function deduplicationKey(deviceId: string, phone: string, text: string): string {
  // Use first 50 chars of text to avoid collisions on different messages
  return `${deviceId}:${phone}:${text.substring(0, 50).toLowerCase().trim()}`;
}

function isDuplicate(key: string): boolean {
  const lastProcessed = _recentlyProcessed.get(key);
  if (!lastProcessed) return false;
  if (Date.now() - lastProcessed > DEDUP_TTL_MS) {
    _recentlyProcessed.delete(key);
    return false;
  }
  return true;
}

function markProcessed(key: string): void {
  _recentlyProcessed.set(key, Date.now());
  // Periodic cleanup
  if (_recentlyProcessed.size > 5000) {
    const now = Date.now();
    for (const [k, ts] of _recentlyProcessed) {
      if (now - ts > DEDUP_TTL_MS) _recentlyProcessed.delete(k);
    }
  }
}

// ── Inter-message spacing ──
// Envio ultra-instantâneo: 0ms de espaçamento. As mensagens são despachadas
// em sequência imediata. A ordem é garantida pelo await sequencial e pela
// própria UAZAPI processar o socket FIFO por device.
const INTER_MESSAGE_SPACING_MS = 0;

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

type FlowBtnPayload = { id: string; label: string; type?: "reply" | "url" | "phone"; url?: string; phone?: string };

function buildChoice(b: FlowBtnPayload): string {
  const label = (b.label || "").trim();
  if (b.type === "url" && b.url) {
    return `${label}|${b.url.trim()}`;
  }
  if (b.type === "phone" && b.phone) {
    const ph = b.phone.replace(/[^\d+]/g, "");
    return `${label}|${ph}`;
  }
  return `${label}|${b.id}`;
}

// ── Variable interpolation ──
// Replaces {nome}, {numero}, {email}, {empresa} (and {{var}} variants) using
// data from the conversations/service_contacts tables. First name only for {nome}.
interface LeadVars {
  nome: string;
  numero: string;
  email: string;
  empresa: string;
}

async function loadLeadVars(db: SupabaseClient, userId: string, phone: string): Promise<LeadVars> {
  const cleanPhone = phone.replace(/\D/g, "");
  const vars: LeadVars = { nome: "", numero: cleanPhone, email: "", empresa: "" };

  try {
    const { data: conv } = await db.from("conversations")
      .select("name, email, company")
      .eq("user_id", userId)
      .eq("phone", cleanPhone)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (conv) {
      vars.nome = (conv.name || "").trim();
      vars.email = (conv.email || "").trim();
      vars.empresa = (conv.company || "").trim();
    }
  } catch {}

  if (!vars.nome) {
    try {
      const { data: sc } = await db.from("service_contacts")
        .select("name, email, company")
        .eq("user_id", userId)
        .eq("phone", cleanPhone)
        .limit(1)
        .maybeSingle();
      if (sc) {
        vars.nome = vars.nome || (sc.name || "").trim();
        vars.email = vars.email || (sc.email || "").trim();
        vars.empresa = vars.empresa || (sc.company || "").trim();
      }
    } catch {}
  }

  // Use only the first name to soar humanization
  if (vars.nome) vars.nome = vars.nome.split(/\s+/)[0];
  // Fallback when no name is known: empty string (avoid raw "{nome}")
  return vars;
}

function interpolate(text: string, vars: LeadVars): string {
  if (!text) return text;
  return text
    .replace(/\{\{?\s*nome\s*\}?\}/gi, vars.nome)
    .replace(/\{\{?\s*numero\s*\}?\}/gi, vars.numero)
    .replace(/\{\{?\s*email\s*\}?\}/gi, vars.email)
    .replace(/\{\{?\s*empresa\s*\}?\}/gi, vars.empresa);
}

async function sendFlowMessage(
  baseUrl: string, token: string, phone: string, text: string,
  imageUrl?: string, buttons?: FlowBtnPayload[],
  isFirst: boolean = false
) {
  const cleanPhone = phone.replace(/\D/g, "");

  // Envio instantâneo: a primeira mensagem dispara imediatamente; as
  // subsequentes recebem apenas um espaçamento mínimo para ordenação.
  if (!isFirst) {
    await new Promise(r => setTimeout(r, INTER_MESSAGE_SPACING_MS));
  }

  if (buttons && buttons.length > 0) {
    const choices = buttons.map(buildChoice).filter(Boolean);
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
    buttons?: { id: string; label: string; targetNodeId: string; type?: "reply" | "url" | "phone"; url?: string; phone?: string }[];
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
  sessionId: string, flowId: string, deviceId: string, userId: string,
  vars?: LeadVars
) {
  if (!vars) vars = await loadLeadVars(db, userId, phone);
  let currentNodeId = startNodeId;
  let maxSteps = 20;

  while (currentNodeId && maxSteps-- > 0) {
    const node = findNodeById(currentNodeId, nodes);
    if (!node) break;

    switch (node.type) {
      case "messageNode": {
        const rawText = node.data.text || "";
        const text = interpolate(rawText, vars);
        const hasMedia = !!node.data.imageUrl;
        const hasButtons = (node.data.buttons?.length ?? 0) > 0;
        // Send if there is any payload (text, media, or buttons)
        if (text || hasMedia || hasButtons) {
          try {
            await sendFlowMessage(baseUrl, token, phone, text,
              node.data.imageUrl || undefined,
              hasButtons ? node.data.buttons!.map(b => ({ id: b.id, label: interpolate(b.label, vars), type: b.type, url: b.url, phone: b.phone })) : undefined);
            log.info(`Message sent: "${text.substring(0, 50) || '[media/buttons]'}" to ${phone}`);
          } catch (err: any) {
            log.error(`Failed to send message node ${node.id}: ${err.message}`);
          }
        }
        await db.from("autoreply_sessions").update({
          current_node_id: node.id, last_message_at: new Date().toISOString(), status: "active",
        }).eq("id", sessionId);

        // Only pause flow when buttons truly route somewhere (await user click).
        // Reply-buttons without target nodes/edges: keep walking the chain.
        const hasButtonTargets = node.data.buttons?.some(b => b.targetNodeId);
        const hasButtonEdges = node.data.buttons?.some(b => findNextNodeForButton(node.id, b.id, edges));
        if (hasButtonTargets || hasButtonEdges) return;

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

  // ── Find active flows before anti-loop checks ──
  const { data: flows } = await db.from("autoreply_flows")
    .select("id, nodes, edges, device_id")
    .eq("user_id", userId).eq("is_active", true);

  if (!flows?.length) return;

  const matchingFlows = flows.filter(f => !f.device_id || f.device_id === deviceId);
  if (!matchingFlows.length) return;

  const hasExplicitKeywordTrigger = matchingFlows.some(flow => {
    const nodes = flow.nodes as FlowNode[];
    const startNode = nodes.find(n => n.type === "startNode");
    return startNode?.data.trigger === "keyword" && matchesTrigger(startNode, messageText || "", false);
  });

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
    if (hasButtonResponse || hasExplicitKeywordTrigger) {
      log.info(`Internal device allowed: explicit autoreply intent from ${fromPhone}`);
    } else {
    log.info(`Skipping: fromPhone ${fromPhone} matches another device of same user`);
    return;
    }
  }

  // ── Anti-loop cooldown ──
  const { data: recentSession } = await db.from("autoreply_sessions")
    .select("last_message_at, current_node_id")
    .eq("device_id", deviceId).eq("contact_phone", fromPhone)
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();

  if (recentSession?.last_message_at) {
    const elapsed = Date.now() - new Date(recentSession.last_message_at).getTime();
    // Cooldown mínimo (1s) só para absorver webhooks duplicados imediatos.
    // A guarda de "sessão ativa" abaixo previne re-trigger real do fluxo.
    if (elapsed < 1000 && !hasButtonResponse) {
      log.info(`Anti-loop cooldown: ${elapsed}ms since last message`);
      return;
    }
  }

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
          // Label fallback disabled — only real button clicks advance the flow
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
  // DISABLED: Only real button clicks (with button_response_id) should
  // continue button flows. Typed text that matches a label is ignored
  // so that the flow only advances on actual button taps.
  // If needed in the future, re-enable by uncommenting below.

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

  // Load lead variables once for the whole flow execution
  const vars = await loadLeadVars(db, userId, fromPhone);

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
      }, { onConflict: "flow_id,device_id,contact_phone" })
      .select("id").single();

    if (sessErr) { log.error(`Session create error: ${sessErr.message}`); continue; }

    // Send start message if exists
    if (startNode.data.text) {
      try {
        await sendFlowMessage(baseUrl, deviceToken, fromPhone, interpolate(startNode.data.text, vars),
          startNode.data.imageUrl || undefined,
          startNode.data.buttons?.map(b => ({ id: b.id, label: interpolate(b.label, vars), type: b.type, url: b.url, phone: b.phone })),
          true);
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
      await processNodeChain(db, baseUrl, deviceToken, fromPhone, nextNodes[0], nodes, edges, newSession!.id, flow.id, deviceId, userId, vars);
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
      // ── Deduplication check ──
      const dedupKey = deduplicationKey(item.device_id, item.from_phone, item.message_text || "");
      if (isDuplicate(dedupKey)) {
        log.info(`Deduplicated: ${item.from_phone} on ${item.device_id.substring(0, 8)}`);
        await db.from("autoreply_queue")
          .update({ status: "done", processed_at: new Date().toISOString(), error_message: "deduplicated" })
          .eq("id", item.id);
        _stats.deduplicated++;
        continue;
      }

      try {
        await processQueueItem(db, item);
        markProcessed(dedupKey);
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
