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
}
...
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
...
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
  };
}
