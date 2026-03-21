import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const onlineStatuses = new Set(["connected", "Connected", "Ready", "ready", "authenticated"]);

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

interface FlowNode {
  id: string;
  type: string;
  data: {
    trigger?: string;
    keyword?: string;
    text?: string;
    imageUrl?: string;
    imageCaption?: string;
    delay?: number;
    buttons?: { id: string; label: string; targetNodeId?: string }[];
    delaySeconds?: number;
    action?: string;
  };
}

interface FlowEdge {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
}

interface DraftFlowPayload {
  name?: string;
  nodes?: FlowNode[];
  edges?: FlowEdge[];
}

function findNextNodes(nodeId: string, edges: FlowEdge[]): string[] {
  return edges.filter((e) => e.source === nodeId).map((e) => e.target);
}

function findNodeById(nodeId: string, nodes: FlowNode[]) {
  return nodes.find((node) => node.id === nodeId);
}

function matchesTrigger(startNode: FlowNode, messageText: string, isFirstMessage: boolean) {
  const trigger = startNode.data.trigger || "any_message";
  switch (trigger) {
    case "any_message":
    case "template":
      return true;
    case "keyword": {
      const keyword = (startNode.data.keyword || "").trim().toLowerCase();
      if (!keyword) return false;
      const keywords = keyword.split(",").map((item) => item.trim()).filter(Boolean);
      const msgLower = messageText.toLowerCase().trim();
      return keywords.some((kw) => msgLower.includes(kw));
    }
    case "new_contact":
    case "start_chat":
      return isFirstMessage;
    default:
      return false;
  }
}

function collectFlowMessages(nodes: FlowNode[], edges: FlowEdge[], startNode: FlowNode) {
  const visited = new Set<string>();
  const messages: { text: string; imageUrl?: string; imageCaption?: string; delay?: number; buttons?: { id: string; label: string }[] }[] = [];
  let currentNodeId = startNode.id;
  let terminalNodeId = startNode.id;
  let maxSteps = 30;

  while (currentNodeId && maxSteps-- > 0 && !visited.has(currentNodeId)) {
    visited.add(currentNodeId);
    const node = findNodeById(currentNodeId, nodes);
    if (!node) break;
    terminalNodeId = node.id;

    if (node.type === "messageNode" || (node.type === "startNode" && node.data.text)) {
      const text = (node.data.text || "").trim();
      if (text || node.data.imageUrl) {
        messages.push({
          text,
          imageUrl: node.data.imageUrl || undefined,
          imageCaption: node.data.imageCaption || undefined,
          delay: node.data.delay || 0,
          buttons: node.data.buttons?.length ? node.data.buttons : undefined,
        });
      }
      if (node.data.buttons?.length) break;
    }

    if (node.type === "endNode") break;

    const nextNodes = findNextNodes(node.id, edges);
    currentNodeId = nextNodes[0] || "";
  }

  return { messages, terminalNodeId };
}

function isValidDraftFlow(draftFlow: DraftFlowPayload | null | undefined) {
  return !!draftFlow && Array.isArray(draftFlow.nodes) && Array.isArray(draftFlow.edges) && draftFlow.nodes.length > 0;
}

async function sendMessage(
  baseUrl: string,
  token: string,
  phone: string,
  text: string,
  imageUrl?: string,
  buttons?: { id: string; label: string }[]
) {
  const cleanPhone = phone.replace(/\D/g, "");
  const url = `${baseUrl}/send/text`;
  const payload: Record<string, unknown> = { number: cleanPhone, text };

  if (buttons?.length) {
    const menuPayload: Record<string, unknown> = {
      number: cleanPhone,
      type: "button",
      text,
      choices: buttons.slice(0, 3).map((b) => `${b.label}|${b.id}`),
    };
    if (imageUrl) menuPayload.imageButton = imageUrl;
    console.log(`[test-autoreply] Sending menu/buttons to ${cleanPhone}`);
    const resp = await fetch(`${baseUrl}/send/menu`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify(menuPayload),
    });
    const body = await resp.text();
    console.log(`[test-autoreply] Menu response: ${resp.status} ${body.slice(0, 200)}`);
    return { ok: resp.ok, status: resp.status, body };
  }

  if (imageUrl) {
    const imgUrl = `${baseUrl}/send/image`;
    const imgPayload = { number: cleanPhone, image: imageUrl, caption: text || "" };
    console.log(`[test-autoreply] Sending image to ${cleanPhone}`);
    const resp = await fetch(imgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify(imgPayload),
    });
    const body = await resp.text();
    console.log(`[test-autoreply] Image response: ${resp.status} ${body.slice(0, 200)}`);
    return { ok: resp.ok, status: resp.status, body };
  }

  console.log(`[test-autoreply] Sending text to ${cleanPhone}`);
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify(payload),
  });
  const body = await resp.text();
  console.log(`[test-autoreply] Text response: ${resp.status} ${body.slice(0, 200)}`);
  return { ok: resp.ok, status: resp.status, body };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    let user = null;
    const claimsResult = await supabase.auth.getClaims(token);
    user = claimsResult.data?.claims ? { id: claimsResult.data.claims.sub as string } : null;

    if (!user) {
      const userResult = await supabase.auth.getUser(token);
      user = userResult.data.user;
    }

    if (!user) {
      return json({ error: "Não autenticado" }, 401);
    }

    const body = await req.json();
    const deviceId = body.device_id as string | undefined;
    const flowId = body.flow_id as string | undefined;
    const incomingText = String(body.incoming_text || body.message_text || "").trim();
    const draftFlow = (body.draft_flow || null) as DraftFlowPayload | null;

    if (!deviceId) {
      return json({ error: "Selecione uma instância antes de testar" }, 400);
    }

    if (!flowId) {
      return json({ error: "Salve a automação antes de testar os botões" }, 400);
    }

    if (!incomingText) {
      return json({ error: "Defina uma mensagem de entrada para simular o teste" }, 400);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", user.id)
      .single();

    if (!profile?.phone) {
      return json({ error: "Cadastre seu telefone no perfil para receber a mensagem de teste" }, 400);
    }

    const phone = normalizePhone(profile.phone);
    if (phone.length < 10) {
      return json({ error: "O telefone do perfil é inválido para o teste" }, 400);
    }

    const { data: device } = await supabase
      .from("devices")
      .select("id, status, uazapi_token, uazapi_base_url")
      .eq("id", deviceId)
      .single();

    if (!device) {
      return json({ error: "Instância não encontrada" }, 404);
    }

    if (!onlineStatuses.has(device.status)) {
      return json({ error: "A instância selecionada está offline. Reconecte antes de testar." }, 400);
    }

    let apiToken = device.uazapi_token;
    let baseUrl = device.uazapi_base_url;

    if (!apiToken) {
      const { data: poolToken } = await supabase
        .from("user_api_tokens")
        .select("token")
        .eq("device_id", deviceId)
        .eq("status", "in_use")
        .limit(1)
        .single();

      if (poolToken) apiToken = poolToken.token;
    }

    if (!baseUrl) {
      baseUrl = Deno.env.get("UAZAPI_BASE_URL") || null;
    }

    if (!apiToken || !baseUrl) {
      return json({ error: "A instância não possui credenciais configuradas. Reconecte o dispositivo." }, 400);
    }

    const cleanBaseUrl = baseUrl.replace(/\/+$/, "");

    const { data: persistedFlow } = await supabase
      .from("autoreply_flows")
      .select("id, name, nodes, edges, device_id, is_active")
      .eq("id", flowId)
      .eq("user_id", user.id)
      .single();

    if (!persistedFlow) {
      return json({ error: "Fluxo não encontrado para teste" }, 404);
    }

    const flow = isValidDraftFlow(draftFlow)
      ? {
          id: persistedFlow.id,
          name: draftFlow?.name || persistedFlow.name,
          device_id: persistedFlow.device_id,
          nodes: draftFlow?.nodes || persistedFlow.nodes,
          edges: draftFlow?.edges || persistedFlow.edges,
        }
      : persistedFlow;

    const nodes = Array.isArray(flow.nodes) ? (flow.nodes as unknown as FlowNode[]) : [];
    const edges = Array.isArray(flow.edges) ? (flow.edges as unknown as FlowEdge[]) : [];
    const startNode = nodes.find((node) => node.type === "startNode");

    if (!startNode) {
      return json({ error: "Fluxo sem nó inicial" }, 400);
    }
    if (!matchesTrigger(startNode, incomingText, true)) {
      return json({ error: `A mensagem "${incomingText}" não corresponde ao gatilho configurado.` }, 400);
    }

    const { messages, terminalNodeId } = collectFlowMessages(nodes, edges, startNode);

    if (messages.length === 0) {
      return json({ error: "O fluxo não possui mensagens para enviar. Adicione blocos de mensagem após o início." }, 400);
    }

    await supabase
      .from("autoreply_sessions")
      .delete()
      .eq("device_id", deviceId)
      .eq("contact_phone", phone)
      .eq("flow_id", flow.id);

    const initialNodeId = startNode.data.text ? startNode.id : terminalNodeId;

    const { error: sessionError } = await supabase
      .from("autoreply_sessions")
      .insert({
        flow_id: flow.id,
        device_id: deviceId,
        user_id: user.id,
        contact_phone: phone,
        current_node_id: initialNodeId,
        status: "active",
        last_message_at: new Date().toISOString(),
      });

    if (sessionError) {
      return json({ error: "Falha ao preparar a sessão de teste", details: sessionError.message }, 500);
    }

    console.log(`[test-autoreply] Sending ${messages.length} message(s) to ${phone} via flow "${flow.name}"`);

    let sentCount = 0;
    let lastError = "";

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (i > 0) {
        const delayMs = Math.max((msg.delay || 1) * 1000, 1000);
        await sleep(Math.min(delayMs, 10000));
      }

      try {
        const result = await sendMessage(cleanBaseUrl, apiToken, phone, msg.text, msg.imageUrl, msg.buttons);
        if (result.ok) {
          sentCount++;
        } else {
          lastError = `Erro ${result.status}: ${result.body.slice(0, 100)}`;
          console.error(`[test-autoreply] Send failed: ${lastError}`);
        }
      } catch (err: any) {
        lastError = err.message || String(err);
        console.error(`[test-autoreply] Send exception: ${lastError}`);
      }
    }

    if (sentCount === 0) {
      return json({ error: "Falha ao enviar mensagem de teste", details: lastError }, 500);
    }

    return json({
      success: true,
      phone,
      trigger: incomingText,
      flow_id: flow.id,
      flow_name: flow.name,
      messages_sent: sentCount,
      messages_total: messages.length,
      message: `Teste enviado com sucesso! ${sentCount} mensagem${sentCount > 1 ? "s" : ""} enviada${sentCount > 1 ? "s" : ""} para ${phone}.`,
    });
  } catch (err) {
    console.error("[test-autoreply] error:", err);
    return json({ error: "Erro interno", details: err instanceof Error ? err.message : String(err) }, 500);
  }
});
