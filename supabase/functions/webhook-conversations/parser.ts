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
    body.buttonsResponseMessage?.selectedDisplayText,
    body.templateButtonReplyMessage?.selectedDisplayText,
    nestedMessage.buttonsResponseMessage?.selectedDisplayText,
    nestedMessage.templateButtonReplyMessage?.selectedDisplayText,
    nestedMessage.listResponseMessage?.title,
  );

  let mediaType: string | null = null;
  let mediaUrl: string | null = null;
  let audioDuration: number | null = null;

  if (nestedMessage.imageMessage || body.type === "image") {
    mediaType = "image";
    mediaUrl = firstString(nestedMessage.imageMessage?.url, body.mediaUrl) || null;
  } else if (nestedMessage.audioMessage || body.type === "audio" || body.type === "ptt") {
    mediaType = "audio";
    mediaUrl = firstString(body.mediaUrl) || null;
    audioDuration = nestedMessage.audioMessage?.seconds || body.duration || null;
  } else if (nestedMessage.videoMessage || body.type === "video") {
    mediaType = "video";
    mediaUrl = firstString(nestedMessage.videoMessage?.url, body.mediaUrl) || null;
  } else if (nestedMessage.documentMessage || body.type === "document") {
    mediaType = "document";
    mediaUrl = firstString(nestedMessage.documentMessage?.url, body.mediaUrl) || null;
  } else if (nestedMessage.stickerMessage || body.type === "sticker") {
    mediaType = "sticker";
  }

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
  };
}