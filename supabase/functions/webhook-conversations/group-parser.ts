// Lightweight parser for WhatsApp GROUP messages (@g.us).
// Reuses the same shape conventions as parser.ts but stays isolated to keep
// the 1-to-1 conversation pipeline untouched.

type JsonObject = Record<string, any>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" ? (value as JsonObject) : {};
}

function firstString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function firstBoolean(...values: unknown[]): boolean | null {
  for (const v of values) if (typeof v === "boolean") return v;
  return null;
}

function parseTimestamp(...values: unknown[]): string {
  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    const num = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(num) && num > 0) {
      const ms = num < 1e12 ? num * 1000 : num;
      return new Date(ms).toISOString();
    }
    if (typeof v === "string") {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }
  return new Date().toISOString();
}

function collectMessageNodes(body: JsonObject, payload: JsonObject, nestedMessage: JsonObject): JsonObject[] {
  const cands = [
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
  ];
  const seen = new Set<JsonObject>();
  const uniq: JsonObject[] = [];
  for (const c of cands) {
    if (!c || Object.keys(c).length === 0 || seen.has(c)) continue;
    seen.add(c); uniq.push(c);
  }
  return uniq;
}

function inferMediaType(typeStr: string, mime: string, url: string): string | null {
  const t = typeStr.toLowerCase(); const m = mime.toLowerCase(); const u = url.toLowerCase();
  if (t === "sticker" || m === "image/webp") return "sticker";
  if (t === "ptt" || t === "audio" || t === "voice") return "audio";
  if (t === "image" || t === "photo") return "image";
  if (t === "video") return "video";
  if (t === "document" || t === "file") return "document";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.includes("pdf") || m.includes("application/")) return "document";
  if (/\.(jpg|jpeg|png|gif)(\?|$)/.test(u)) return "image";
  if (/\.(mp3|ogg|opus|m4a|aac|wav)(\?|$)/.test(u)) return "audio";
  if (/\.(mp4|mov|webm|mkv)(\?|$)/.test(u)) return "video";
  if (/\.(pdf|docx?|xlsx?|pptx?|zip|rar|txt|csv)(\?|$)/.test(u)) return "document";
  return null;
}

function resolveMediaType(body: JsonObject, nodes: JsonObject[]): string | null {
  for (const n of nodes) {
    if (n.stickerMessage) return "sticker";
    if (n.audioMessage || n.pttMessage || n.voiceMessage) return "audio";
    if (n.imageMessage) return "image";
    if (n.videoMessage) return "video";
    if (n.documentMessage || n.documentWithCaptionMessage) return "document";
  }
  const typeStr = firstString(body.type, body.messageType, body.data?.type, ...nodes.flatMap(n => [n.type, n.messageType]));
  const mime = firstString(body.mimetype, body.mimeType, body.data?.mimetype, ...nodes.flatMap(n => [n.mimetype, n.mimeType]));
  const url = firstString(body.mediaUrl, body.url, body.file, body.data?.mediaUrl, ...nodes.flatMap(n => [n.url, n.URL, n.mediaUrl]));
  return inferMediaType(typeStr, mime, url);
}

function resolveMediaUrl(body: JsonObject, nodes: JsonObject[]): string | null {
  return firstString(
    body.mediaUrl, body.media_url, body.file, body.fileUrl, body.url,
    body.data?.mediaUrl, body.data?.url, body.data?.file,
    ...nodes.flatMap(n => [n.mediaUrl, n.url, n.URL, n.file, n.fileUrl, n.audioMessage?.url, n.imageMessage?.url, n.videoMessage?.url, n.documentMessage?.url, n.stickerMessage?.url]),
  ) || null;
}

export interface ParsedGroupEvent {
  groupJid: string;
  senderJid: string | null;
  senderName: string | null;
  content: string;
  fromMe: boolean;
  waId: string;
  timestamp: string;
  mediaType: string | null;
  mediaUrl: string | null;
  mimeType: string | null;
}

export function extractGroupConversationEvent(body: JsonObject): ParsedGroupEvent | null {
  const event = firstString(body.event, body.EventType, body.type).toLowerCase();
  const payload = asObject(body.data);
  const chat = asObject(body.chat);
  const nestedMessage = asObject(body.message ?? payload.message);
  const key = asObject(payload.key ?? nestedMessage.key ?? body.key);
  const nodes = collectMessageNodes(body, payload, nestedMessage);

  const isMessageEvent = event.includes("message") || event.includes("msg") || !!firstString(key.remoteJid) || Object.keys(chat).length > 0;
  if (!isMessageEvent) return null;

  const rawJid = firstString(
    key.remoteJid, body.remoteJid, chat.JID, chat.jid, chat.remoteJid,
    chat.id && String(chat.id).includes("@") ? chat.id : "",
    payload.from, payload.chatId, body.from,
    nestedMessage.chatid, nestedMessage.chatId,
    ...nodes.flatMap(n => [n.remoteJid, n.chatId, n.from]),
  );
  if (!rawJid || !rawJid.endsWith("@g.us")) return null;

  const fromMe = Boolean(firstBoolean(key.fromMe, payload.fromMe, body.fromMe, ...nodes.map(n => n.fromMe)));

  // Sender JID inside the group (Baileys: key.participant; UAZAPI: sender / sender_pn)
  const senderJidRaw = firstString(
    key.participant, payload.participant, body.participant,
    payload.sender, body.sender, nestedMessage.sender_pn, payload.sender_pn,
    ...nodes.flatMap(n => [n.participant, n.sender, n.sender_pn]),
  );
  const senderJid = senderJidRaw ? (senderJidRaw.includes("@") ? senderJidRaw : `${senderJidRaw.replace(/\D/g, "")}@s.whatsapp.net`) : null;

  const senderName = firstString(body.pushName, payload.pushName, payload.notify, payload.name, chat.pushName) || null;

  const mediaType = resolveMediaType(body, nodes);
  const mediaUrl = resolveMediaUrl(body, nodes);
  const mimeType = firstString(body.mimetype, body.mimeType, body.data?.mimetype, ...nodes.flatMap(n => [n.mimetype, n.mimeType])) || null;

  const content = firstString(
    body.text, body.body, body.caption, body.messageBody,
    body.message?.conversation, body.data?.text, body.data?.body, body.data?.caption,
    ...nodes.flatMap(n => [
      n.conversation, n.text, n.body,
      typeof n.content === "string" ? n.content : (n.content?.caption || ""),
      n.content?.text,
      n.extendedTextMessage?.text,
      n.imageMessage?.caption, n.videoMessage?.caption, n.documentMessage?.caption, n.documentMessage?.fileName,
    ]),
  );

  const waId = firstString(key.id, payload.id?._serialized, payload.id?.id, nestedMessage.id, body.messageId, body.id) || `wh-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  const timestamp = parseTimestamp(
    payload.messageTimestamp, body.messageTimestamp, body.timestamp, body.t,
    nestedMessage.messageTimestamp, chat.updatedAt, chat.lastMessageTime,
  );

  return {
    groupJid: rawJid,
    senderJid,
    senderName,
    content,
    fromMe,
    waId,
    timestamp,
    mediaType,
    mediaUrl,
    mimeType,
  };
}
