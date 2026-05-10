import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildAttempts,
  extractResponseChatId,
  getDestination,
  isResponseTargetMismatch,
  type SendAttempt,
} from "./send-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MANUAL_CHAT_MIN_INTERVAL_MS = 900;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getConversationPreview(type?: string, content?: string, fileName?: string, caption?: string) {
  if (type === "audio") return "🎧 Áudio";
  if (type === "image") return caption?.trim() ? `📷 ${caption.trim()}` : "📷 Foto";
  if (type === "document") return `📎 ${fileName || "Arquivo"}`;
  return String(content || "").trim();
}


async function reserveDeviceSendSlot(admin: any, deviceId?: string | null) {
  if (!deviceId) return 0;

  const { data, error } = await admin.rpc("claim_device_send_slot", {
    p_device_id: deviceId,
    p_min_interval_ms: MANUAL_CHAT_MIN_INTERVAL_MS,
  });

  if (error) {
    console.error("[chat-send] claim_device_send_slot error:", error.message);
    return 0;
  }

  const waitMs = typeof data === "number" ? Math.max(0, data) : 0;
  if (waitMs > 0) {
    console.log(`[chat-send] Waiting ${waitMs}ms before sending on device ${deviceId}`);
  }
  return waitMs;
}

async function executeAttempts(baseUrl: string, token: string, attempts: SendAttempt[]) {
  const hardFailKeywords = [
    "not found",
    "invalid number",
    "disconnected",
    "blocked",
    "not on whatsapp",
    "privacidade",
    "saved contacts",
  ];

  let lastErr = "";

  for (const attempt of attempts) {
    try {
      const response = await fetch(`${baseUrl}${attempt.path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          token,
        },
        body: JSON.stringify(attempt.body),
      });

      const raw = await response.text();
      let parsed: any = {};
      try {
        parsed = raw ? JSON.parse(raw) : {};
      } catch {
        parsed = {};
      }

      const bodyLower = raw.toLowerCase();
      const hardFailed = hardFailKeywords.some((keyword) => bodyLower.includes(keyword));
      const explicitFailure = Boolean(
        parsed?.error ||
        parsed?.status === "error" ||
        parsed?.code === 404 ||
        hardFailed,
      );
      const actualChatId = extractResponseChatId(parsed);
      const targetMismatch = isResponseTargetMismatch(parsed, attempt.expectedChatId);

      console.log(
        `[chat-send] Attempt ${attempt.path} → ${response.status} expected=${attempt.expectedChatId || "-"} actual=${actualChatId || "-"}`,
        raw.substring(0, 400),
      );

      if (response.ok && !explicitFailure && !targetMismatch) {
        return { sent: true as const, parsed, path: attempt.path, actualChatId };
      }

      // Detect WhatsApp Reachout Timelock (Meta anti-spam protection)
      const timelock = parsed?.details?.reachout_timelock;
      if (timelock?.active) {
        const untilStr = timelock.until ? new Date(timelock.until).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "data desconhecida";
        lastErr = `O WhatsApp bloqueou o envio para esse contato via API até ${untilStr}. Peça para ele te enviar uma mensagem primeiro, ou aguarde a liberação. (Pelo celular continua funcionando normalmente.)`;
        break;
      }

      // Detect message quota exceeded
      const quota = parsed?.details?.new_chat_message_capping;
      if (quota && typeof quota.used_quota === "number" && typeof quota.total_quota === "number" && quota.total_quota > 0 && quota.used_quota >= quota.total_quota) {
        lastErr = `Cota de novas conversas do WhatsApp esgotada (${quota.used_quota}/${quota.total_quota}). Renova em ${quota.cycle_end ? new Date(quota.cycle_end).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "breve"}.`;
        break;
      }

      const parsedMessage =
        (typeof parsed?.message === "string" && parsed.message) ||
        (typeof parsed?.error === "string" && parsed.error) ||
        raw.substring(0, 240) ||
        `HTTP ${response.status}`;

      lastErr = targetMismatch
        ? `Destino divergente em ${attempt.path}: esperado ${attempt.expectedChatId}, retornado ${actualChatId || "desconhecido"}`
        : `${response.status} @ ${attempt.path}: ${parsedMessage}`;

      if (targetMismatch) {
        continue;
      }

      if (response.status === 401 || response.status === 403 || hardFailed) {
        break;
      }
    } catch (error: any) {
      lastErr = `${attempt.path}: ${error?.message || String(error)}`;
    }
  }

  return { sent: false as const, error: lastErr || "Falha ao enviar mensagem" };
}

async function handleDeleteMessage(
  admin: any,
  userId: string,
  body: any,
  fallbackBaseUrl: string,
  fallbackToken: string,
) {
  const conversationId = String(body?.conversation_id || "").trim();
  const messageId = String(body?.message_id || "").trim();
  const whatsappMessageId = String(body?.whatsapp_message_id || "").trim();

  if (!conversationId || !messageId) {
    return json({ error: "conversation_id e message_id são obrigatórios" }, 400);
  }

  const { data: convData, error: convErr } = await admin
    .from("conversations")
    .select("id, user_id, remote_jid, device_id, devices!conversations_device_id_fkey(uazapi_token, uazapi_base_url)")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .single();

  const conv: any = convData;

  if (convErr || !conv) return json({ error: "Conversa não encontrada" }, 404);

  const deviceConfig = Array.isArray(conv.devices) ? conv.devices[0] : conv.devices;
  const baseUrl = String(deviceConfig?.uazapi_base_url || fallbackBaseUrl || "").replace(/\/+$/, "");
  const token = String(deviceConfig?.uazapi_token || fallbackToken || "").trim();

  let deletedOnWhatsApp = false;
  if (baseUrl && token && whatsappMessageId) {
    try {
      const res = await fetch(`${baseUrl}/message/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token },
        body: JSON.stringify({ id: whatsappMessageId }),
      });
      const raw = await res.text();
      console.log(`[chat-send] delete attempt → ${res.status}`, raw.substring(0, 300));
      deletedOnWhatsApp = res.ok;
    } catch (e: any) {
      console.error("[chat-send] delete error:", e.message);
    }
  }

  await admin.from("conversation_messages").delete().eq("id", messageId);

  return json({ deleted: true, deletedOnWhatsApp });
}

async function handleEditMessage(
  admin: any,
  userId: string,
  body: any,
  fallbackBaseUrl: string,
  fallbackToken: string,
) {
  const conversationId = String(body?.conversation_id || "").trim();
  const messageId = String(body?.message_id || "").trim();
  const whatsappMessageId = String(body?.whatsapp_message_id || "").trim();
  const newText = String(body?.new_text || "").trim();

  if (!conversationId || !messageId || !newText) {
    return json({ error: "conversation_id, message_id e new_text são obrigatórios" }, 400);
  }

  const { data: convData, error: convErr } = await admin
    .from("conversations")
    .select("id, user_id, remote_jid, device_id, devices!conversations_device_id_fkey(uazapi_token, uazapi_base_url)")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .single();

  const conv: any = convData;

  if (convErr || !conv) return json({ error: "Conversa não encontrada" }, 404);

  const deviceConfig = Array.isArray(conv.devices) ? conv.devices[0] : conv.devices;
  const baseUrl = String(deviceConfig?.uazapi_base_url || fallbackBaseUrl || "").replace(/\/+$/, "");
  const token = String(deviceConfig?.uazapi_token || fallbackToken || "").trim();

  let editedOnWhatsApp = false;
  if (baseUrl && token && whatsappMessageId) {
    try {
      const res = await fetch(`${baseUrl}/message/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token },
        body: JSON.stringify({ id: whatsappMessageId, text: newText }),
      });
      const raw = await res.text();
      console.log(`[chat-send] edit attempt → ${res.status}`, raw.substring(0, 300));
      editedOnWhatsApp = res.ok;
    } catch (e: any) {
      console.error("[chat-send] edit error:", e.message);
    }
  }

  await admin.from("conversation_messages").update({ content: newText }).eq("id", messageId);

  return json({ edited: true, editedOnWhatsApp });
}

async function handleMarkRead(
  admin: any,
  userId: string,
  body: any,
  fallbackBaseUrl: string,
  fallbackToken: string,
) {
  const conversationId = String(body?.conversation_id || "").trim();
  if (!conversationId) return json({ error: "conversation_id obrigatório" }, 400);

  const { data: convData, error: convErr } = await admin
    .from("conversations")
    .select("id, user_id, remote_jid, device_id, devices!conversations_device_id_fkey(uazapi_token, uazapi_base_url)")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .single();

  const conv: any = convData;
  if (convErr || !conv) return json({ error: "Conversa não encontrada" }, 404);

  const deviceConfig = Array.isArray(conv.devices) ? conv.devices[0] : conv.devices;
  const baseUrl = String(deviceConfig?.uazapi_base_url || fallbackBaseUrl || "").replace(/\/+$/, "");
  const token = String(deviceConfig?.uazapi_token || fallbackToken || "").trim();
  const number = String(conv.remote_jid || "").replace(/@.*/, "");

  if (!baseUrl || !token || !number) {
    return json({ markedOnWhatsApp: false, reason: "missing_config" });
  }

  // Buscar últimas mensagens recebidas para marcar
  const { data: msgs } = await admin
    .from("conversation_messages")
    .select("whatsapp_message_id")
    .eq("conversation_id", conversationId)
    .eq("direction", "received")
    .not("whatsapp_message_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);

  const messageIds = (msgs || []).map((m: any) => m.whatsapp_message_id).filter(Boolean);

  const attempts: Array<{ path: string; body: any }> = [
    { path: "/chat/markChatUnread", body: { number, unread: false } },
    { path: "/message/markread", body: { number, read: true } },
  ];
  if (messageIds.length > 0) {
    attempts.push({ path: "/message/markread", body: { messageid: messageIds, read: true } });
    attempts.push({ path: "/message/markread", body: { id: messageIds[0], read: true } });
  }

  let marked = false;
  for (const a of attempts) {
    try {
      const res = await fetch(`${baseUrl}${a.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token },
        body: JSON.stringify(a.body),
      });
      const raw = await res.text();
      console.log(`[chat-send] markRead ${a.path} → ${res.status}`, raw.substring(0, 200));
      if (res.ok) { marked = true; break; }
    } catch (e: any) {
      console.error("[chat-send] markRead error:", e.message);
    }
  }

  return json({ markedOnWhatsApp: marked });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const fallbackBaseUrl = Deno.env.get("UAZAPI_BASE_URL") || "";
    const fallbackToken = Deno.env.get("UAZAPI_TOKEN") || "";

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authErr,
    } = await anonClient.auth.getUser();

    if (authErr || !user) return json({ error: "Não autenticado" }, 401);

    const admin: any = createClient(supabaseUrl, serviceKey);
    const body = await req.json();

    if (body?.action === "delete") {
      return handleDeleteMessage(admin, user.id, body, fallbackBaseUrl, fallbackToken);
    }

    if (body?.action === "edit") {
      return handleEditMessage(admin, user.id, body, fallbackBaseUrl, fallbackToken);
    }

    const conversationId = String(body?.conversation_id || "").trim();
    const content = String(body?.content || "").trim();
    const messageId = body?.message_id ? String(body.message_id) : null;
    const type = body?.type ? String(body.type) : undefined;
    const fileName = body?.file_name ? String(body.file_name) : undefined;
    const quotedMessageId = body?.quoted_message_id ? String(body.quoted_message_id) : undefined;
    const caption = typeof body?.caption === "string" ? body.caption : undefined;

    if (!conversationId || !content) {
      return json({ error: "conversation_id e content são obrigatórios" }, 400);
    }

    const { data: convData, error: convErr } = await admin
      .from("conversations")
      .select("id, user_id, remote_jid, device_id, devices!conversations_device_id_fkey(uazapi_token, uazapi_base_url)")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .single();

    const conv: any = convData;

    if (convErr || !conv) return json({ error: "Conversa não encontrada" }, 404);

    const deviceConfig = Array.isArray(conv.devices) ? conv.devices[0] : conv.devices;
    const baseUrl = String(deviceConfig?.uazapi_base_url || fallbackBaseUrl || "").replace(/\/+$/, "");
    const token = String(deviceConfig?.uazapi_token || fallbackToken || "").trim();

    if (!baseUrl || !token) {
      if (messageId) {
        await admin.from("conversation_messages").update({ status: "failed" }).eq("id", messageId);
      }
      return json({ error: "Dispositivo sem API configurada" }, 400);
    }

    const waitMs = await reserveDeviceSendSlot(admin, conv.device_id);
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    const destination = getDestination(conv.remote_jid);
    const attempts = buildAttempts(type, destination, content, fileName, quotedMessageId, caption);

    console.log(
      `[chat-send] Sending ${type || "text"} to ${destination.chatId} via ${baseUrl} device=${conv.device_id} waitMs=${waitMs} hasCaption=${Boolean(caption)}`,
    );

    const result = await executeAttempts(baseUrl, token, attempts);

    if (!result.sent) {
      if (messageId) {
        await admin.from("conversation_messages").update({ status: "failed" }).eq("id", messageId);
      }
      return json({
        sent: false,
        error: `Falha ao enviar: ${result.error}`,
        waitMs,
        targetChatId: destination.chatId,
      }, 200);
    }

    if (messageId) {
      const waMessageId =
        result.parsed?.messageid ||
        result.parsed?.key?.id ||
        result.parsed?.messageId ||
        result.parsed?.id ||
        null;

      await admin
        .from("conversation_messages")
        .update({ status: "sent", whatsapp_message_id: waMessageId })
        .eq("id", messageId);
    }

    await admin
      .from("conversations")
      .update({
        last_message: getConversationPreview(type, content, fileName, caption),
        last_message_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    return json({
      sent: true,
      messageId: result.parsed?.key?.id || result.parsed?.messageid || null,
      waitMs,
      targetChatId: destination.chatId,
    });
  } catch (err: any) {
    console.error("[chat-send] Error:", err);
    return json({ error: err.message || "Erro interno" }, 500);
  }
});
