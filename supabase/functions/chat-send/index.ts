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


async function reserveDeviceSendSlot(admin: ReturnType<typeof createClient>, deviceId?: string | null) {
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
  admin: ReturnType<typeof createClient>,
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

  const { data: conv, error: convErr } = await admin
    .from("conversations")
    .select("id, user_id, remote_jid, device_id, devices!conversations_device_id_fkey(uazapi_token, uazapi_base_url)")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .single();

  if (convErr || !conv) return json({ error: "Conversa não encontrada" }, 404);

  const baseUrl = String(conv.devices?.uazapi_base_url || fallbackBaseUrl || "").replace(/\/+$/, "");
  const token = String(conv.devices?.uazapi_token || fallbackToken || "").trim();

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
  admin: ReturnType<typeof createClient>,
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

  const { data: conv, error: convErr } = await admin
    .from("conversations")
    .select("id, user_id, remote_jid, device_id, devices!conversations_device_id_fkey(uazapi_token, uazapi_base_url)")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .single();

  if (convErr || !conv) return json({ error: "Conversa não encontrada" }, 404);

  const baseUrl = String(conv.devices?.uazapi_base_url || fallbackBaseUrl || "").replace(/\/+$/, "");
  const token = String(conv.devices?.uazapi_token || fallbackToken || "").trim();

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

    const admin = createClient(supabaseUrl, serviceKey);
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

    const { data: conv, error: convErr } = await admin
      .from("conversations")
      .select("id, user_id, remote_jid, device_id, devices!conversations_device_id_fkey(uazapi_token, uazapi_base_url)")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .single();

    if (convErr || !conv) return json({ error: "Conversa não encontrada" }, 404);

    const baseUrl = String(conv.devices?.uazapi_base_url || fallbackBaseUrl || "").replace(/\/+$/, "");
    const token = String(conv.devices?.uazapi_token || fallbackToken || "").trim();

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
