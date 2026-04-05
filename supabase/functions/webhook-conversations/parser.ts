export interface ParsedConversationEvent {
  remoteJid: string;
  phone: string;
  name: string;
  content: string;
  fromMe: boolean;
  waId: string;
  timestamp: string;
  mediaType: string | null;
  mediaUrl: string | null;
  audioDuration: number | null;
  avatarUrl: string | null;
  quotedMessageId: string | null;
  quotedContent: string | null;
}

type JsonObject = Record<string, any>;

const PRIVATE_JID_SUFFIX = "@s.whatsapp.net";

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function normalizePhone(value: unknown): string {
  return firstString(value).replace(/\D/g, "");
}

export function normalizeRemoteJid(value: unknown): string {
  const raw = firstString(value);
  if (!raw) return "";
  if (raw.includes("@")) return raw;

  const phone = normalizePhone(raw);
  return phone ? `${phone}${PRIVATE_JID_SUFFIX}` : "";
}

function parseTimestamp(...values: unknown[]): string {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString();
    }

    if (typeof value === "string" && /[^\d]/.test(value)) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }

    const numeric = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      const millis = numeric < 1e12 ? numeric * 1000 : numeric;
      const parsed = new Date(millis);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

export function isApiSentMessage(body: JsonObject): boolean {
  const payload = body.data && typeof body.data === "object" ? body.data : {};
  const nestedMessage = body.message && typeof body.message === "object"
    ? body.message
    : payload.message && typeof payload.message === "object"
      ? payload.message
      : {};

  return body.wasSentByApi === true
    || body.wa_sentByApi === true
    || body.sentByApi === true
    || nestedMessage.wasSentByApi === true;
}

/**
 * Resolve the media type from multiple possible locations in the payload.
 * UAZAPI-GO uses `body.type` or `message.type` with values like "ptt", "audio", "image", etc.
 * Baileys uses `message.audioMessage`, `message.imageMessage`, etc.
 */
function resolveMediaType(body: JsonObject, nestedMessage: JsonObject): string | null {
  // Check Baileys-style nested message objects first
  if (nestedMessage.audioMessage || nestedMessage.pttMessage) return "audio";
  if (nestedMessage.imageMessage) return "image";
  if (nestedMessage.videoMessage) return "video";
  if (nestedMessage.documentMessage || nestedMessage.documentWithCaptionMessage) return "document";
  if (nestedMessage.stickerMessage) return "sticker";
  if (nestedMessage.contactMessage || nestedMessage.contactsArrayMessage) return "contact";
  if (nestedMessage.locationMessage || nestedMessage.liveLocationMessage) return "location";

  // Check UAZAPI-GO style type field (can be on body, message, or data)
  const typeStr = firstString(
    body.type,
    nestedMessage.type,
    body.messageType,
    nestedMessage.messageType,
    body.TypeMessage,
    body.data?.type,
  ).toLowerCase();

  if (!typeStr || typeStr === "text" || typeStr === "messages" || typeStr === "chat") return null;

  if (typeStr === "ptt" || typeStr === "audio" || typeStr === "voice") return "audio";
  if (typeStr === "image" || typeStr === "photo") return "image";
  if (typeStr === "video") return "video";
  if (typeStr === "document" || typeStr === "file") return "document";
  if (typeStr === "sticker") return "sticker";
  if (typeStr === "contact" || typeStr === "vcard") return "contact";
  if (typeStr === "location" || typeStr === "live_location") return "location";

  return null;
}

function resolveMediaUrl(body: JsonObject, nestedMessage: JsonObject, mediaType: string | null): string | null {
  if (!mediaType) return null;

  const url = firstString(
    // Direct body fields (UAZAPI-GO)
    body.mediaUrl,
    body.media_url,
    body.file,
    body.fileUrl,
    body.file_url,
    // Nested message fields
    nestedMessage.mediaUrl,
    nestedMessage.media_url,
    nestedMessage.file,
    nestedMessage.fileUrl,
    // Baileys-style nested
    nestedMessage.audioMessage?.url,
    nestedMessage.pttMessage?.url,
    nestedMessage.imageMessage?.url,
    nestedMessage.videoMessage?.url,
    nestedMessage.documentMessage?.url,
    // Data wrapper
    body.data?.mediaUrl,
    body.data?.media_url,
  );

  return url || null;
}

function resolveAudioDuration(body: JsonObject, nestedMessage: JsonObject): number | null {
  const val =
    nestedMessage.audioMessage?.seconds ||
    nestedMessage.pttMessage?.seconds ||
    body.duration ||
    body.seconds ||
    nestedMessage.duration ||
    nestedMessage.seconds ||
    body.data?.duration ||
    null;
  return typeof val === "number" && val > 0 ? val : null;
}

function resolveQuotedMessage(body: JsonObject, nestedMessage: JsonObject): { id: string | null; content: string | null } {
  const ctx =
    nestedMessage.contextInfo ||
    nestedMessage.quotedMessage ||
    body.contextInfo ||
    body.quotedMsg ||
    body.quoted ||
    null;

  if (!ctx || typeof ctx !== "object") return { id: null, content: null };

  const quotedId = firstString(
    ctx.stanzaId,
    ctx.quotedMessageId,
    ctx.id,
  ) || null;

  const quotedContent = firstString(
    ctx.quotedMessage?.conversation,
    ctx.quotedMessage?.extendedTextMessage?.text,
    ctx.body,
    ctx.message,
  ) || null;

  return { id: quotedId, content: quotedContent };
}

export function extractConversationEvent(body: JsonObject): ParsedConversationEvent | null {
  const event = firstString(body.event, body.EventType, body.type).toLowerCase();
  const payload = body.data && typeof body.data === "object" ? body.data : body;
  const chat = body.chat && typeof body.chat === "object" ? body.chat : {};
  const nestedMessage = body.message && typeof body.message === "object"
    ? body.message
    : payload.message && typeof payload.message === "object"
      ? payload.message
      : {};
  const key = payload.key && typeof payload.key === "object"
    ? payload.key
    : nestedMessage.key && typeof nestedMessage.key === "object"
      ? nestedMessage.key
      : body.key && typeof body.key === "object"
        ? body.key
        : {};

  const isMessageEvent = event.includes("message")
    || event.includes("msg")
    || !!firstString(key.remoteJid)
    || Object.keys(chat).length > 0;

  if (!isMessageEvent) return null;

  const rawRemoteJid = firstString(
    key.remoteJid,
    body.remoteJid,
    chat.JID,
    chat.jid,
    chat.remoteJid,
    chat.id && String(chat.id).includes("@") ? chat.id : "",
    payload.from,
    payload.chatId,
    body.from,
    chat.phoneNumber,
    chat.phone,
    nestedMessage.sender_pn,
    payload.phone,
    payload.number,
  );

  const remoteJid = normalizeRemoteJid(rawRemoteJid);
  if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid.includes("status@")) {
    return null;
  }

  const phone = remoteJid.replace(/@.*$/, "");
  const name = firstString(
    chat.lead_name,
    chat.Name,
    chat.name,
    chat.pushName,
    body.pushName,
    payload.pushName,
    payload.notify,
    payload.name,
    phone,
  ).substring(0, 255);

  // Resolve media first so we can generate a better content fallback
  const mediaType = resolveMediaType(body, nestedMessage);
  const mediaUrl = resolveMediaUrl(body, nestedMessage, mediaType);
  const audioDuration = mediaType === "audio" ? resolveAudioDuration(body, nestedMessage) : null;

  const content = firstString(
    body.text,
    body.messageBody,
    body.body,
    body.caption,
    nestedMessage.conversation,
    nestedMessage.text,
    nestedMessage.body,
    typeof nestedMessage.content === "string" ? nestedMessage.content : "",
    nestedMessage.content?.text,
    nestedMessage.extendedTextMessage?.text,
    nestedMessage.imageMessage?.caption,
    nestedMessage.videoMessage?.caption,
    nestedMessage.documentMessage?.caption,
    nestedMessage.documentMessage?.fileName,
    body.buttonsResponseMessage?.selectedDisplayText,
    body.templateButtonReplyMessage?.selectedDisplayText,
    nestedMessage.buttonsResponseMessage?.selectedDisplayText,
    nestedMessage.templateButtonReplyMessage?.selectedDisplayText,
    nestedMessage.listResponseMessage?.title,
  );

  const fromMe = Boolean(
    key.fromMe
    ?? payload.fromMe
    ?? body.fromMe
    ?? body.isFromMe
    ?? body.wa_fromMe
    ?? nestedMessage.fromMe,
  );

  const waId = firstString(
    key.id,
    payload.id?._serialized,
    payload.id?.id,
    nestedMessage.id,
    body.messageId,
    body.id,
  ) || `wh-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  const timestamp = parseTimestamp(
    payload.messageTimestamp,
    body.messageTimestamp,
    body.timestamp,
    body.t,
    nestedMessage.messageTimestamp,
    nestedMessage.timestamp,
    chat.updatedAt,
    chat.lastMessageTime,
  );

  const avatarUrl = firstString(
    chat.imagePreview,
    chat.image,
    chat.ProfilePicUrl,
    chat.profilePicUrl,
  ) || null;

  const quoted = resolveQuotedMessage(body, nestedMessage);

  return {
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
    quotedMessageId: quoted.id,
    quotedContent: quoted.content,
  };
}
