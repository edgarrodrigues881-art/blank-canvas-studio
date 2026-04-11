import {
  GROUP_JID_SUFFIX,
  PRIVATE_JID_SUFFIX,
  areEquivalentChatIds,
  cleanNumber,
  isGroupJid,
  normalizeChatId,
} from "../_shared/phone-variants.ts";

export type SendAttempt = {
  path: string;
  body: Record<string, unknown>;
  expectedChatId?: string;
};

export { cleanNumber, isGroupJid };

export function getDestination(remoteJid: string) {
  const raw = String(remoteJid || "").trim();
  const group = isGroupJid(raw);
  const cleaned = cleanNumber(raw);
  const chatId = normalizeChatId(raw || cleaned, group);

  return {
    group,
    raw,
    number: cleaned,
    chatId,
  };
}

export function extractResponseChatId(parsed: any): string | null {
  const raw = [
    parsed?.chatid,
    parsed?.chatId,
    parsed?.jid,
    parsed?.key?.remoteJid,
    parsed?.message?.key?.remoteJid,
    parsed?.to,
  ].find((value) => typeof value === "string" && value.trim());

  if (!raw) return null;
  return normalizeChatId(String(raw), String(raw).includes(GROUP_JID_SUFFIX)) || null;
}

export function isResponseTargetMismatch(parsed: any, expectedChatId?: string) {
  if (!expectedChatId) return false;

  const normalizedExpected = normalizeChatId(expectedChatId, expectedChatId.includes(GROUP_JID_SUFFIX));
  const actualChatId = extractResponseChatId(parsed);

  return Boolean(actualChatId && normalizedExpected && !areEquivalentChatIds(actualChatId, normalizedExpected));
}

export function buildAttempts(
  type: string | undefined,
  destination: ReturnType<typeof getDestination>,
  content: string,
  fileName?: string,
  quotedMessageId?: string,
  caption?: string,
): SendAttempt[] {
  const targetChatId = destination.chatId;
  const directNumber = destination.number;

  const normalizedQuoteId = quotedMessageId
    ? (quotedMessageId.includes(":") ? quotedMessageId.split(":").pop()! : quotedMessageId)
    : undefined;
  const quoteFields = normalizedQuoteId ? { replyid: normalizedQuoteId } : {};
  const captionFields = caption?.trim() ? { caption: caption.trim(), text: caption.trim() } : {};
  const docFields = fileName?.trim() ? { docName: fileName.trim() } : {};

  if (type === "audio") {
    return [
      { path: "/send/media", body: { number: targetChatId, file: content, type: "audio", ptt: true, ...quoteFields }, expectedChatId: targetChatId },
      { path: "/send/media", body: { number: targetChatId, file: content, type: "ptt", ...quoteFields }, expectedChatId: targetChatId },
      { path: "/send/media", body: { number: targetChatId, media: content, type: "audio", ptt: true, ...quoteFields }, expectedChatId: targetChatId },
      { path: "/send/audio", body: { number: targetChatId, audio: content, ptt: true, ...quoteFields }, expectedChatId: targetChatId },
    ];
  }

  if (type === "image") {
    return [
      { path: "/send/media", body: { number: targetChatId, file: content, type: "image", ...captionFields, ...quoteFields }, expectedChatId: targetChatId },
      { path: "/send/media", body: { number: targetChatId, media: content, type: "image", ...captionFields, ...quoteFields }, expectedChatId: targetChatId },
    ];
  }

  if (type === "document") {
    return [
      { path: "/send/media", body: { number: targetChatId, file: content, type: "document", ...docFields, ...captionFields, ...quoteFields }, expectedChatId: targetChatId },
      { path: "/send/media", body: { number: targetChatId, media: content, type: "document", ...docFields, ...captionFields, ...quoteFields }, expectedChatId: targetChatId },
      { path: "/send/document", body: { number: targetChatId, document: content, ...docFields, ...captionFields, ...quoteFields }, expectedChatId: targetChatId },
    ];
  }

  const safeText = content.trim();

  if (destination.group) {
    return [
      { path: "/chat/send-text", body: { chatId: targetChatId, text: safeText, body: safeText, ...quoteFields }, expectedChatId: targetChatId },
      { path: "/send/text", body: { number: targetChatId, text: safeText, ...quoteFields }, expectedChatId: targetChatId },
    ];
  }

  return [
    { path: "/chat/send-text", body: { number: directNumber, to: directNumber, chatId: targetChatId, body: safeText, text: safeText, ...quoteFields }, expectedChatId: targetChatId },
    { path: "/message/sendText", body: { chatId: targetChatId, text: safeText, ...quoteFields }, expectedChatId: targetChatId },
    { path: "/send/text", body: { number: targetChatId, text: safeText, ...quoteFields }, expectedChatId: targetChatId },
  ];
}