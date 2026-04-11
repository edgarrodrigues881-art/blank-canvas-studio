import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const cleanNumber = (value: string) => String(value || "").replace(/\D/g, "");
const isGroupJid = (value: string) => String(value || "").includes("@g.us");

function getDestination(remoteJid: string) {
  const raw = String(remoteJid || "").trim();
  const group = isGroupJid(raw);
  const cleaned = cleanNumber(raw);
  const chatId = raw.includes("@") ? raw : `${cleaned}${group ? "@g.us" : "@s.whatsapp.net"}`;

  return {
    group,
    raw,
    number: group ? chatId : cleaned,
    chatId,
  };
}

function getConversationPreview(type?: string, content?: string, fileName?: string) {
  if (type === "audio") return "🎧 Áudio";
  if (type === "image") return "📷 Foto";
  if (type === "document") return `📎 ${fileName || "Arquivo"}`;
  return String(content || "").trim();
}

type SendAttempt = {
  path: string;
  body: Record<string, unknown>;
};

function buildAttempts(
  type: string | undefined,
  destination: ReturnType<typeof getDestination>,
  content: string,
  fileName?: string,
  quotedMessageId?: string,
  caption?: string,
): SendAttempt[] {
  const target = destination.group ? destination.chatId : destination.number;

  const normalizedQuoteId = quotedMessageId
    ? (quotedMessageId.includes(":") ? quotedMessageId.split(":").pop()! : quotedMessageId)
    : undefined;
  const quoteFields = normalizedQuoteId ? { replyid: normalizedQuoteId } : {};
  const textFields = caption?.trim() ? { text: caption.trim() } : {};
  const docFields = fileName?.trim() ? { docName: fileName.trim() } : {};

  if (type === "audio") {
    return [
      { path: "/send/media", body: { number: target, file: content, type: "audio", ptt: true, ...quoteFields } },
      { path: "/send/media", body: { number: target, file: content, type: "ptt", ...quoteFields } },
      { path: "/send/media", body: { number: target, media: content, type: "audio", ptt: true, ...quoteFields } },
      { path: "/send/audio", body: { number: target, audio: content, ptt: true, ...quoteFields } },
    ];
  }

  if (type === "image") {
    return [
      { path: "/send/media", body: { number: target, file: content, type: "image", ...textFields, ...quoteFields } },
      { path: "/send/media", body: { number: target, media: content, type: "image", ...textFields, ...quoteFields } },
    ];
  }

  if (type === "document") {
    return [
      { path: "/send/media", body: { number: target, file: content, type: "document", ...docFields, ...textFields, ...quoteFields } },
      { path: "/send/media", body: { number: target, media: content, type: "document", ...docFields, ...textFields, ...quoteFields } },
      { path: "/send/document", body: { number: target, document: content, ...docFields, ...textFields, ...quoteFields } },
    ];
  }

  const safeText = content.trim();

  if (destination.group) {
    return [
      { path: "/send/text", body: { number: destination.chatId, text: safeText, ...quoteFields } },
      { path: "/chat/send-text", body: { chatId: destination.chatId, text: safeText, body: safeText, ...quoteFields } },
    ];
  }

  return [
    { path: "/send/text", body: { number: destination.number, text: safeText, ...quoteFields } },
    { path: "/chat/send-text", body: { number: destination.number, to: destination.number, chatId: destination.chatId, body: safeText, text: safeText, ...quoteFields } },
  ];
}

async function executeAttempts(baseUrl: string, token: string, attempts: SendAttempt[]) {
  const hardFailKeywords = [
    "not found",
    "invalid number",
    "disconnected",
    "blocked",
    "not on whatsapp",
    "privacidade",
    "method not allowed",
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
      const explicitFailure = Boolean(
        parsed?.error ||
        parsed?.status === "error" ||
        parsed?.code === 404 ||
        hardFailKeywords.some((keyword) => bodyLower.includes(keyword)),
      );

      console.log(`[chat-send] Attempt ${attempt.path} → ${response.status}`, raw.substring(0, 400));

      if (response.ok && !explicitFailure) {
        return { sent: true as const, parsed, path: attempt.path };
      }

      const parsedMessage =
        (typeof parsed?.message === "string" && parsed.message) ||
        (typeof parsed?.error === "string" && parsed.error) ||
        raw.substring(0, 240) ||
        `HTTP ${response.status}`;

      lastErr = `${response.status} @ ${attempt.path}: ${parsedMessage}`;

      if (response.status !== 404 && response.status !== 405) {
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
  const messageId = String(body?.message_id || "").trim(); // our DB id
  const whatsappMessageId = String(body?.whatsapp_message_id || "").trim();

  if (!conversationId || !messageId) {
    return json({ error: "conversation_id e message_id são obrigatórios" }, 400);
  }

  const { data: conv, error: convErr } = await admin
    .from("conversations")
    .select("id, user_id, remote_jid, devices!conversations_device_id_fkey(uazapi_token, uazapi_base_url)")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .single();

  if (convErr || !conv) return json({ error: "Conversa não encontrada" }, 404);

  const baseUrl = String(conv.devices?.uazapi_base_url || fallbackBaseUrl || "").replace(/\/+$/, "");
  const token = String(conv.devices?.uazapi_token || fallbackToken || "").trim();

  // Try to delete on WhatsApp if we have the WA message ID
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

  // Delete from our DB
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
    .select("id, user_id, remote_jid, devices!conversations_device_id_fkey(uazapi_token, uazapi_base_url)")
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

  // Update in our DB
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

    // ── DELETE action ──
    if (body?.action === "delete") {
      return handleDeleteMessage(admin, user.id, body, fallbackBaseUrl, fallbackToken);
    }

    // ── EDIT action ──
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
      .select("id, user_id, remote_jid, devices!conversations_device_id_fkey(uazapi_token, uazapi_base_url)")
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

    const destination = getDestination(conv.remote_jid);
    const attempts = buildAttempts(type, destination, content, fileName, quotedMessageId, caption);

    console.log(`[chat-send] Sending ${type || "text"} to ${destination.chatId} via ${baseUrl} hasCaption=${Boolean(caption)}`);

    const result = await executeAttempts(baseUrl, token, attempts);

    if (!result.sent) {
      if (messageId) {
        await admin.from("conversation_messages").update({ status: "failed" }).eq("id", messageId);
      }
      return json({ error: `Falha ao enviar: ${result.error}`, sent: false }, 200);
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
        last_message: getConversationPreview(type, content, fileName),
        last_message_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    return json({ sent: true, messageId: result.parsed?.key?.id || result.parsed?.messageid || null });
  } catch (err: any) {
    console.error("[chat-send] Error:", err);
    return json({ error: err.message || "Erro interno" }, 500);
  }
});
