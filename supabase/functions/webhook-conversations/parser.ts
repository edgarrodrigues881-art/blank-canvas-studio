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
  mimeType: string | null;
  mediaKey: string | null;
  directPath: string | null;
  audioDuration: number | null;
  avatarUrl: string | null;
  quotedMessageId: string | null;
  quotedContent: string | null;
  buttonResponseId: string | null;
}

type JsonObject = Record<string, any>;

const PRIVATE_JID_SUFFIX = "@s.whatsapp.net";

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" ? value as JsonObject : {};
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function firstBoolean(...values: unknown[]): boolean | null {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return null;
}

function collectMessageNodes(body: JsonObject, payload: JsonObject, nestedMessage: JsonObject): JsonObject[] {
  const candidates = [
    nestedMessage,
    asObject(nestedMessage.message),
    asObject(nestedMessage.content),
    asObject(body.message),
    asObject(asObject(body.message).message),
    asObject(asObject(body.message).content),
    asObject(payload.message),
    asObject(asObject(payload.message).message),
    asObject(asObject(payload.message).content),
    asObject(body.data),
    asObject(asObject(body.data).message),
    asObject(asObject(asObject(body.data).message).message),
    asObject(asObject(asObject(body.data).message).content),
  ];

  const unique: JsonObject[] = [];
  const seen = new Set<JsonObject>();

  for (const candidate of candidates) {
    if (!candidate || Object.keys(candidate).length === 0 || seen.has(candidate)) continue;
    seen.add(candidate);
    unique.push(candidate);
  }

  return unique;
}

function inferMediaType(typeValue: string, mimeValue: string, urlValue: string): string | null {
  const typeStr = typeValue.toLowerCase();
  const mime = mimeValue.toLowerCase();
  const url = urlValue.toLowerCase();

  if (typeStr === "ptt" || typeStr === "audio" || typeStr === "voice") return "audio";
  if (typeStr === "image" || typeStr === "photo") return "image";
  if (typeStr === "video") return "video";
  if (typeStr === "document" || typeStr === "file") return "document";
  if (typeStr === "sticker") return "sticker";
  if (typeStr === "contact" || typeStr === "vcard") return "contact";
  if (typeStr === "location" || typeStr === "live_location") return "location";

  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.includes("pdf") || mime.includes("document") || mime.includes("sheet") || mime.includes("presentation") || mime.includes("application/")) return "document";

  if (/\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/.test(url)) return "image";
  if (/\.(mp3|ogg|wav|aac|m4a|opus|webm)(\?|$)/.test(url)) return "audio";
  if (/\.(mp4|mov|avi|mkv|webm)(\?|$)/.test(url)) return "video";
  if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt|csv)(\?|$)/.test(url)) return "document";

  return null;
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

function resolveMediaType(body: JsonObject, messageNodes: JsonObject[]): string | null {
  for (const node of messageNodes) {
    if (node.audioMessage || node.pttMessage || node.voiceMessage) return "audio";
    if (node.imageMessage) return "image";
    if (node.videoMessage) return "video";
    if (node.documentMessage || node.documentWithCaptionMessage) return "document";
    if (node.stickerMessage) return "sticker";
    if (node.contactMessage || node.contactsArrayMessage) return "contact";
    if (node.locationMessage || node.liveLocationMessage) return "location";
  }

  // UAZAPI-GO: check for content object with mimetype
  for (const node of messageNodes) {
    if (node.mimetype && node.URL) {
      const detected = inferMediaType("", String(node.mimetype), String(node.URL));
      if (detected) return detected;
    }
  }

  const typeStr = firstString(
    body.type,
    body.messageType,
    body.TypeMessage,
    body.data?.type,
    body.data?.message?.type,
    ...messageNodes.flatMap((node) => [node.type, node.messageType, node.TypeMessage]),
  );

  if (["", "text", "messages", "chat"].includes(typeStr.toLowerCase())) {
    const mimeStr = firstString(
      body.mimetype,
      body.mimeType,
      body.data?.mimetype,
      ...messageNodes.flatMap((node) => [
        node.mimetype,
        node.mimeType,
        node.content?.mimetype,
        node.content?.mimeType,
        node.audioMessage?.mimetype,
        node.pttMessage?.mimetype,
        node.imageMessage?.mimetype,
        node.videoMessage?.mimetype,
        node.documentMessage?.mimetype,
      ]),
    );

    const urlStr = firstString(
      body.mediaUrl,
      body.media_url,
      body.file,
      body.fileUrl,
      body.file_url,
      body.url,
      body.data?.mediaUrl,
      body.data?.media_url,
      body.data?.file,
      body.data?.fileUrl,
      body.data?.file_url,
      body.data?.url,
      ...messageNodes.flatMap((node) => [
        node.mediaUrl,
        node.media_url,
        node.file,
        node.fileUrl,
        node.file_url,
        node.url,
        node.link,
        node.URL,
        node.content?.URL,
        node.content?.url,
        node.audioMessage?.url,
        node.pttMessage?.url,
        node.imageMessage?.url,
        node.videoMessage?.url,
        node.documentMessage?.url,
      ]),
    );

    return inferMediaType(typeStr, mimeStr, urlStr);
  }

  return inferMediaType(typeStr, "", "");
}

function resolveMediaUrl(body: JsonObject, messageNodes: JsonObject[], mediaType: string | null): string | null {
  if (!mediaType) return null;

  const url = firstString(
    body.mediaUrl,
    body.media_url,
    body.file,
    body.fileUrl,
    body.file_url,
    body.url,
    body.link,
    body.data?.mediaUrl,
    body.data?.media_url,
    body.data?.file,
    body.data?.fileUrl,
    body.data?.file_url,
    body.data?.url,
    ...messageNodes.flatMap((node) => [
      node.mediaUrl,
      node.media_url,
      node.file,
      node.fileUrl,
      node.file_url,
      node.url,
      node.link,
      node.URL,
      node.content?.URL,
      node.content?.url,
      node.audioMessage?.url,
      node.pttMessage?.url,
      node.imageMessage?.url,
      node.videoMessage?.url,
      node.documentMessage?.url,
      node.image?.url,
      node.audio?.url,
      node.video?.url,
      node.document?.url,
    ]),
  );

  return url || null;
}

function resolveAudioDuration(body: JsonObject, messageNodes: JsonObject[]): number | null {
  const val =
    body.duration ||
    body.seconds ||
    body.data?.duration ||
    body.data?.seconds ||
    messageNodes.map((node) =>
      node.audioMessage?.seconds ||
      node.pttMessage?.seconds ||
      node.duration ||
      node.seconds ||
      node.audio?.seconds ||
      node.content?.seconds ||
      null
    ).find((value) => typeof value === "number" && value > 0) ||
    null;
  return typeof val === "number" && val > 0 ? val : null;
}

function resolveQuotedMessage(body: JsonObject, messageNodes: JsonObject[]): { id: string | null; content: string | null } {
  const ctx = [
    ...messageNodes.flatMap((node) => [
      node.contextInfo,
      node.content?.contextInfo,
      node.quotedMessage,
      node.content?.quotedMessage,
    ]),
    body.contextInfo,
    body.message?.contextInfo,
    body.message?.content?.contextInfo,
    body.data?.contextInfo,
    body.data?.message?.contextInfo,
    body.data?.message?.content?.contextInfo,
    body.quotedMsg,
    body.message?.quotedMsg,
    body.data?.quotedMsg,
    body.data?.message?.quotedMsg,
  ].find((value) => value && typeof value === "object") || null;

  const quotedId = firstString(
    ctx?.stanzaId,
    ctx?.stanzaID,
    ctx?.quotedMessageId,
    ctx?.id,
    body.quoted,
    body.message?.quoted,
    body.data?.quoted,
    body.data?.message?.quoted,
    ...messageNodes.flatMap((node) => [
      node.quoted,
      node.contextInfo?.stanzaId,
      node.contextInfo?.stanzaID,
      node.content?.contextInfo?.stanzaId,
      node.content?.contextInfo?.stanzaID,
    ]),
  ) || null;

  const quotedContent = firstString(
    ctx?.quotedMessage?.conversation,
    ctx?.quotedMessage?.extendedTextMessage?.text,
    ctx?.quotedMessage?.imageMessage?.caption,
    ctx?.quotedMessage?.videoMessage?.caption,
    ctx?.quotedMessage?.documentMessage?.caption,
    ctx?.quotedMessage?.documentMessage?.fileName,
    ctx?.body,
    ctx?.message,
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
  const messageNodes = collectMessageNodes(body, payload, nestedMessage);

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
    ...messageNodes.flatMap((node) => [node.sender_pn, node.remoteJid, node.chatId, node.from]),
    nestedMessage.chatid,
    nestedMessage.chatId,
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
  const mediaType = resolveMediaType(body, messageNodes);
  const mediaUrl = resolveMediaUrl(body, messageNodes, mediaType);

  const mimeType = firstString(
    body.mimetype,
    body.mimeType,
    body.data?.mimetype,
    ...messageNodes.flatMap((node) => [
      node.mimetype,
      node.mimeType,
      node.content?.mimetype,
      node.content?.mimeType,
      node.audioMessage?.mimetype,
      node.pttMessage?.mimetype,
      node.imageMessage?.mimetype,
      node.videoMessage?.mimetype,
      node.documentMessage?.mimetype,
    ]),
  ) || null;

  const mediaKey = firstString(
    body.mediaKey,
    body.data?.mediaKey,
    ...messageNodes.flatMap((node) => [
      node.mediaKey,
      node.content?.mediaKey,
      node.audioMessage?.mediaKey,
      node.pttMessage?.mediaKey,
      node.imageMessage?.mediaKey,
      node.videoMessage?.mediaKey,
      node.documentMessage?.mediaKey,
    ]),
  ) || null;

  const directPath = firstString(
    body.directPath,
    body.data?.directPath,
    ...messageNodes.flatMap((node) => [
      node.directPath,
      node.content?.directPath,
      node.audioMessage?.directPath,
      node.pttMessage?.directPath,
      node.imageMessage?.directPath,
      node.videoMessage?.directPath,
      node.documentMessage?.directPath,
    ]),
  ) || null;

  const audioDuration = mediaType === "audio" ? resolveAudioDuration(body, messageNodes) : null;

  const content = firstString(
    body.text,
    body.messageBody,
    body.body,
    body.caption,
    ...messageNodes.flatMap((node) => [
      node.conversation,
      node.text,
      node.body,
      typeof node.content === "string" ? node.content : (node.content?.caption || ""),
      node.content?.text || "",
      node.extendedTextMessage?.text,
      node.imageMessage?.caption,
      node.videoMessage?.caption,
      node.documentMessage?.caption,
      node.documentMessage?.fileName,
      node.buttonsResponseMessage?.selectedDisplayText,
      node.templateButtonReplyMessage?.selectedDisplayText,
      node.listResponseMessage?.title,
    ]),
  );

  const fromMe = Boolean(firstBoolean(
    key.fromMe,
    payload.fromMe,
    body.fromMe,
    body.isFromMe,
    body.wa_fromMe,
    ...messageNodes.map((node) => node.fromMe),
  ));

  const waId = firstString(
    key.id,
    payload.id?._serialized,
    payload.id?.id,
    nestedMessage.id,
    body.messageId,
    body.id,
    nestedMessage.msgId,
    nestedMessage.messageId,
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

  const quoted = resolveQuotedMessage(body, messageNodes);

  // ── Extract button response ID (when user clicks a button) ──
  const buttonResponseId = firstString(
    // UaZapi / Baileys: buttonsResponseMessage.selectedButtonId
    ...messageNodes.flatMap((node) => [
      node.buttonsResponseMessage?.selectedButtonId,
      node.templateButtonReplyMessage?.selectedId,
      node.templateButtonReplyMessage?.selectedIndex != null ? String(node.templateButtonReplyMessage.selectedIndex) : "",
      node.listResponseMessage?.singleSelectReply?.selectedRowId,
      node.listResponseMessage?.selectedRowId,
    ]),
    // Top-level alternatives
    body.selectedButtonId,
    body.buttonId,
    body.button_id,
    body.selectedId,
    body.data?.selectedButtonId,
    body.data?.buttonId,
    body.data?.button_id,
    body.message?.selectedButtonId,
    body.message?.buttonId,
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
    mimeType,
    mediaKey,
    directPath,
    audioDuration,
    avatarUrl,
    quotedMessageId: quoted.id,
    quotedContent: quoted.content,
    buttonResponseId,
  };
}
