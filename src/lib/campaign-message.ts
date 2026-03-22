export type ComposerButtonType = "reply" | "url" | "phone";

export interface ComposerButton {
  id: number;
  type: ComposerButtonType;
  text: string;
  value: string;
}

export interface NormalizedComposerMessage {
  source: "manual" | "template_import";
  templateId: string | null;
  messageVariants: string[];
  rotationMode: "random" | "all";
  combinedMessage: string;
  primaryText: string;
  mediaUrl: string;
  mediaName: string;
  mediaKind: string | null;
  buttons: ComposerButton[];
  hasButtons: boolean;
  hasMedia: boolean;
  textFieldsFound: string[];
}

function detectMediaKind(url: string): string | null {
  const clean = (url || "").toLowerCase().split("?")[0];
  if (!clean) return null;
  if (/(mp4|mov|avi|mkv|webm|3gp)$/.test(clean)) return "video";
  if (/(mp3|wav|ogg|m4a|opus|aac|mpeg)$/.test(clean)) return "audio";
  if (/(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|csv|txt)$/.test(clean)) return "document";
  return "image";
}

export function splitStoredMessageContent(content: string | null | undefined): {
  messageVariants: string[];
  rotationMode: "random" | "all";
  combinedMessage: string;
} {
  const raw = typeof content === "string" ? content : "";
  const rotationMode = raw.includes("|&&|") ? "all" : "random";
  const messageVariants = raw.includes("|&&|")
    ? raw.split("|&&|").map((part) => part.trim()).filter(Boolean)
    : raw.includes("|||")
      ? raw.split("|||").map((part) => part.trim()).filter(Boolean)
      : raw.trim()
        ? [raw]
        : [];

  return {
    messageVariants,
    rotationMode,
    combinedMessage: messageVariants.length > 1
      ? (rotationMode === "all" ? messageVariants.join("|&&|") : messageVariants.join("|||"))
      : (messageVariants[0] || ""),
  };
}

export function parseStoredMedia(mediaUrl: string | null | undefined): {
  url: string;
  name: string;
  kind: string | null;
} {
  if (!mediaUrl) {
    return { url: "", name: "", kind: null };
  }

  try {
    const parsed = JSON.parse(mediaUrl);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0] || {};
      const url = typeof first.url === "string" ? first.url : "";
      const name = typeof first.name === "string" ? first.name : (url.split("/").pop() || "Mídia");
      const kind = typeof first.type === "string" ? first.type : detectMediaKind(url);
      return { url, name, kind };
    }
  } catch {
    // plain URL
  }

  return {
    url: mediaUrl,
    name: mediaUrl.split("/").pop() || "Mídia",
    kind: detectMediaKind(mediaUrl),
  };
}

export function normalizeComposerButtons(buttons: unknown): ComposerButton[] {
  if (!Array.isArray(buttons)) return [];

  return buttons
    .map((button, index) => {
      const raw = (button || {}) as Record<string, unknown>;
      const type = raw.type === "url" || raw.type === "phone" ? raw.type : "reply";
      return {
        id: Number(raw.id) || Date.now() + index,
        type,
        text: typeof raw.text === "string" ? raw.text : "",
        value: typeof raw.value === "string" ? raw.value : "",
      } satisfies ComposerButton;
    })
    .filter((button) => button.text.trim().length > 0);
}

export function normalizeComposerMessage(input: {
  content?: string | null;
  media_url?: string | null;
  buttons?: unknown;
  source: "manual" | "template_import";
  templateId?: string | null;
}): NormalizedComposerMessage {
  const split = splitStoredMessageContent(input.content);
  const media = parseStoredMedia(input.media_url);
  const buttons = normalizeComposerButtons(input.buttons);
  const primaryText = split.messageVariants[0]?.trim() || "";
  const textFieldsFound = [primaryText ? "content" : "", media.url ? "media_url" : "", buttons.length > 0 ? "buttons" : ""].filter(Boolean);

  return {
    source: input.source,
    templateId: input.templateId || null,
    messageVariants: split.messageVariants,
    rotationMode: split.rotationMode,
    combinedMessage: split.combinedMessage,
    primaryText,
    mediaUrl: media.url,
    mediaName: media.name,
    mediaKind: media.kind,
    buttons,
    hasButtons: buttons.length > 0,
    hasMedia: Boolean(media.url),
    textFieldsFound,
  };
}

export function validateNormalizedComposerMessage(message: NormalizedComposerMessage): string[] {
  const errors: string[] = [];

  if (message.hasButtons && !message.primaryText.trim()) {
    errors.push("Mensagens com botão exigem copy/texto principal. O sistema não aplica mais 'Escolha uma opção' automaticamente.");
  }

  return errors;
}

export function serializeTemplateMedia(mediaUrl: string | null | undefined, mediaName?: string | null): string | undefined {
  if (!mediaUrl) return undefined;

  return JSON.stringify([
    {
      url: mediaUrl,
      type: detectMediaKind(mediaUrl) || "image",
      name: mediaName || mediaUrl.split("/").pop() || "Mídia",
      sendMode: "with",
    },
  ]);
}
