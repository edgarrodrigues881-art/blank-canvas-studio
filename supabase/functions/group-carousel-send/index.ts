import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_TIMEOUT_MS = 25_000;
const mediaExtensions = {
  image: ["jpg", "jpeg", "png", "gif"],
  video: ["mp4", "mov", "webm", "3gp"],
  document: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"],
  audio: ["mp3", "ogg", "wav", "m4a", "aac"],
} as const;

const CarouselButtonSchema = z.object({
  type: z.string().optional(),
  text: z.string().optional(),
  value: z.string().optional(),
});

const CarouselCardSchema = z.object({
  id: z.string().optional(),
  position: z.number().optional(),
  text: z.string().optional(),
  mediaUrl: z.string().optional(),
  mediaType: z.string().nullable().optional(),
  buttons: z.array(CarouselButtonSchema).optional().default([]),
});

const BodySchema = z.object({
  deviceId: z.string().uuid("deviceId inválido"),
  groupJid: z.string().trim().regex(/@g\.us$/, "groupJid inválido"),
  content: z.string().optional().default(""),
  type: z.enum(["text", "image", "video", "document", "audio", "buttons"]).optional().default("text"),
  caption: z.string().optional(),
  headerText: z.string().optional(),
  mediaUrl: z.string().optional(),
  buttons: z.array(CarouselButtonSchema).optional().default([]),
  cards: z.array(CarouselCardSchema).max(4, "Máximo de 4 cards").optional(),
  mentionAll: z.boolean().optional().default(false),
});

type MediaType = z.infer<typeof BodySchema>["type"];
type MediaOnlyType = Exclude<MediaType, "text" | "buttons">;
type CarouselButton = z.infer<typeof CarouselButtonSchema>;
type CarouselCard = z.infer<typeof CarouselCardSchema>;
type SendAttempt = {
  endpoint: string;
  body: Record<string, unknown>;
  label?: string;
};
type ToggleGroupAnnounceResult = {
  ok: boolean;
  status: number;
  error?: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function createHttpError(message: string, status = 400) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = API_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error(`Timeout: a API não respondeu em ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function getUrlExtension(value: string) {
  const pathname = new URL(value).pathname.toLowerCase();
  const fileName = pathname.split("/").filter(Boolean).pop() || "";
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex + 1) : "";
}

function getFileName(value: string) {
  const pathname = new URL(value).pathname;
  return pathname.split("/").filter(Boolean).pop() || undefined;
}

function getMediaTypeLabel(type: MediaOnlyType) {
  if (type === "image") return "imagem";
  if (type === "video") return "vídeo";
  if (type === "audio") return "áudio";
  return "documento";
}

function detectMediaTypeFromUrl(url: string): MediaOnlyType {
  const lower = (url || "").toLowerCase().split("?")[0];
  if (/\.(ogg|mp3|wav|m4a|aac|opus|mpeg)$/.test(lower)) return "audio";
  if (/\.(mp4|mov|avi|mkv|webm|3gp)$/.test(lower)) return "video";
  if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|csv|txt)$/.test(lower)) return "document";
  return "image";
}

function matchesContentType(type: MediaOnlyType, contentType: string, extension: string) {
  if (type === "document") {
    return contentType.startsWith("application/")
      || contentType === "text/plain"
      || contentType === "text/csv"
      || mediaExtensions.document.includes(extension as never);
  }

  return contentType.startsWith(`${type}/`) || mediaExtensions[type].includes(extension as never);
}

function extractResponseChatId(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    const candidate = [
      parsed?.chatid,
      parsed?.chatId,
      parsed?.jid,
      parsed?.key?.remoteJid,
      parsed?.message?.key?.remoteJid,
      parsed?.to,
    ].find((value) => typeof value === "string" && value.trim());

    return candidate ? String(candidate).trim() : null;
  } catch {
    return null;
  }
}

async function inspectMediaUrl(value: string, type: MediaOnlyType) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    return { ok: false as const, error: "A mídia precisa ser uma URL pública começando com http:// ou https://." };
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return { ok: false as const, error: "A mídia precisa usar http:// ou https://." };
  }

  const extension = getUrlExtension(parsedUrl.toString());
  if (type === "image" && ["svg", "avif"].includes(extension)) {
    return { ok: false as const, error: "A UAZAPI não aceitou esse formato de imagem. Use um link direto JPG, JPEG, PNG ou GIF." };
  }

  let probe: Response;

  try {
    probe = await fetchWithTimeout(parsedUrl.toString(), { method: "HEAD", redirect: "follow" }, 10_000);
    if (!probe.ok || !probe.headers.get("content-type")) {
      if (probe.body) await probe.body.cancel();
      probe = await fetchWithTimeout(parsedUrl.toString(), { method: "GET", redirect: "follow" }, 10_000);
    }
  } catch (error: any) {
    return {
      ok: false as const,
      error: `Não consegui acessar essa URL de mídia. ${error?.message || "Verifique se o link é público."}`,
    };
  }

  const contentType = probe.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || "";
  if (probe.body) await probe.body.cancel();

  if (!probe.ok) {
    return {
      ok: false as const,
      error: `Não consegui baixar a mídia (HTTP ${probe.status}). Use um link público direto do arquivo.`,
    };
  }

  if (contentType.startsWith("text/html")) {
    return {
      ok: false as const,
      error: "A URL informada aponta para uma página do site, não para um arquivo direto. Use o link direto da imagem, vídeo ou documento.",
    };
  }

  if (!matchesContentType(type, contentType, extension)) {
    return {
      ok: false as const,
      error: `A URL informada não parece ser um ${getMediaTypeLabel(type)} válido. Recebi ${contentType || "um tipo desconhecido"}.`,
    };
  }

  return {
    ok: true as const,
    normalizedUrl: parsedUrl.toString(),
    fileName: getFileName(parsedUrl.toString()),
  };
}

function normalizeCarouselCards(rawCards: CarouselCard[]) {
  return rawCards
    .map((raw, index) => ({
      id: typeof raw.id === "string" ? raw.id : `card-${index + 1}`,
      position: typeof raw.position === "number" ? raw.position : index,
      text: typeof raw.text === "string" ? raw.text.trim() : "",
      mediaUrl: typeof raw.mediaUrl === "string" ? raw.mediaUrl.trim() : "",
      mediaType: typeof raw.mediaType === "string" ? raw.mediaType : null,
      buttons: Array.isArray(raw.buttons)
        ? raw.buttons
            .map((button) => ({
              type: typeof button.type === "string" ? button.type : "reply",
              text: typeof button.text === "string" ? button.text.trim() : "",
              value: typeof button.value === "string" ? button.value.trim() : "",
            }))
            .filter((button) => button.text)
        : [],
    }))
    .filter((card) => card.text || card.mediaUrl || card.buttons.length > 0)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

function normalizeCarouselUrl(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function buildCarouselButton(button: CarouselButton, index: number) {
  const text = (button.text || "").trim();
  if (!text) return null;

  const normalizedType = (button.type || "reply").toLowerCase();
  const rawValue = (button.value || "").trim();

  if (normalizedType === "url") {
    const normalizedUrl = normalizeCarouselUrl(rawValue);
    if (!normalizedUrl) return null;
    return { id: normalizedUrl, label: text, text, url: normalizedUrl, type: "URL" };
  }

  if (normalizedType === "phone" || normalizedType === "call") {
    if (!rawValue) return null;
    return { id: rawValue, label: text, text, phone: rawValue, type: "CALL" };
  }

  if (normalizedType === "copy") {
    return { id: rawValue || text, label: text, text, type: "COPY" };
  }

  return { id: rawValue || `card_btn_${index + 1}`, label: text, text, type: "REPLY" };
}

function buildCarouselChoice(button: CarouselButton) {
  const text = (button.text || "").trim();
  if (!text) return null;

  const normalizedType = (button.type || "reply").toLowerCase();
  const rawValue = (button.value || "").trim();

  if (normalizedType === "url") {
    return rawValue ? `${text}|url:${rawValue}` : null;
  }

  if (normalizedType === "phone" || normalizedType === "call") {
    return rawValue ? `${text}|call:${rawValue}` : null;
  }

  if (normalizedType === "copy") {
    return `${text}|copy:${rawValue || text}`;
  }

  return rawValue ? `${text}|${rawValue}` : text;
}

function buildMessageAttempts(
  baseUrl: string,
  groupJid: string,
  content: string,
  type: MediaType,
  caption?: string,
  fileName?: string,
): SendAttempt[] {
  const cleanCaption = caption?.trim();
  const captionFields = cleanCaption ? { caption: cleanCaption, text: cleanCaption } : {};
  const docFields = fileName?.trim() ? { docName: fileName.trim() } : {};
  const targetFields = { number: groupJid, chatId: groupJid };

  if (type === "audio") {
    return [
      { endpoint: `${baseUrl}/send/media`, body: { ...targetFields, file: content, type: "audio", ptt: true } },
      { endpoint: `${baseUrl}/send/media`, body: { ...targetFields, media: content, type: "audio", ptt: true } },
      { endpoint: `${baseUrl}/send/audio`, body: { ...targetFields, audio: content, ptt: true } },
    ];
  }

  if (type === "image") {
    return [
      { endpoint: `${baseUrl}/send/media`, body: { ...targetFields, file: content, type: "image", ...captionFields } },
      { endpoint: `${baseUrl}/send/media`, body: { ...targetFields, media: content, type: "image", ...captionFields } },
    ];
  }

  if (type === "video") {
    return [
      { endpoint: `${baseUrl}/send/media`, body: { ...targetFields, file: content, type: "video", ...captionFields } },
      { endpoint: `${baseUrl}/send/media`, body: { ...targetFields, media: content, type: "video", ...captionFields } },
    ];
  }

  if (type === "document") {
    return [
      { endpoint: `${baseUrl}/send/media`, body: { ...targetFields, file: content, type: "document", ...docFields, ...captionFields } },
      { endpoint: `${baseUrl}/send/document`, body: { ...targetFields, document: content, ...docFields, ...captionFields } },
      { endpoint: `${baseUrl}/send/media`, body: { ...targetFields, media: content, type: "document", ...docFields, ...captionFields } },
    ];
  }

  const safeText = content.trim();
  return [
    { endpoint: `${baseUrl}/chat/send-text`, body: { chatId: groupJid, text: safeText, body: safeText } },
    { endpoint: `${baseUrl}/message/sendText`, body: { chatId: groupJid, text: safeText } },
    { endpoint: `${baseUrl}/send/text`, body: { ...targetFields, text: safeText } },
    { endpoint: `${baseUrl}/message/sendText`, body: { to: groupJid, text: safeText } },
  ];
}

function buildCarouselAttempts(baseUrl: string, groupJid: string, headerText: string | undefined, cards: CarouselCard[]): SendAttempt[] {
  const normalizedCards = normalizeCarouselCards(cards);
  if (normalizedCards.length === 0) {
    throw new Error("Carrossel sem cards configurados.");
  }

  const targetFields = { phone: groupJid, number: groupJid };
  const legacyTargetFields = { number: groupJid, chatId: groupJid };
  const primaryText = headerText?.trim();

  const structuredCards = normalizedCards.map((card) => ({
    text: card.text,
    ...(card.mediaUrl ? { image: card.mediaUrl } : {}),
    buttons: card.buttons
      .map((button, index) => buildCarouselButton(button, index))
      .filter(Boolean),
  }));

  const structuredPayload: Record<string, unknown> = {
    ...targetFields,
    ...(primaryText ? { message: primaryText, text: primaryText } : {}),
    carousel: structuredCards,
  };

  const legacyStructuredPayload: Record<string, unknown> = {
    ...legacyTargetFields,
    ...(primaryText ? { text: primaryText } : {}),
    carousel: structuredCards,
  };

  const menuChoices = normalizedCards.flatMap((card, index) => {
    const title = card.text || `Card ${index + 1}`;
    const lines = [`[${title}]`];
    if (card.mediaUrl) {
      lines.push(`{${card.mediaUrl}}`);
    }
    lines.push(...card.buttons.map((button) => buildCarouselChoice(button)).filter(Boolean) as string[]);
    return lines;
  });

  const hasUrlButtons = normalizedCards.some((card) =>
    card.buttons.some((button) => (button.type || "").toLowerCase() === "url"),
  );

  return [
    {
      endpoint: `${baseUrl}/send/carousel`,
      body: structuredPayload,
      label: "structured_carousel",
    },
    {
      endpoint: `${baseUrl}/send/carousel`,
      body: legacyStructuredPayload,
      label: "structured_carousel_legacy",
    },
    {
      endpoint: `${baseUrl}/send/menu`,
      body: {
        ...targetFields,
        type: hasUrlButtons ? "list" : "carousel",
        ...(primaryText ? { message: primaryText, text: primaryText } : {}),
        choices: menuChoices,
      },
      label: "menu_fallback",
    },
    {
      endpoint: `${baseUrl}/send/menu`,
      body: {
        ...legacyTargetFields,
        type: hasUrlButtons ? "list" : "carousel",
        ...(primaryText ? { text: primaryText } : {}),
        choices: menuChoices,
      },
      label: "menu_fallback_legacy",
    },
  ];
}

function normalizeButtons(rawButtons: CarouselButton[] = []) {
  return rawButtons
    .map((button) => ({
      type: typeof button.type === "string" ? button.type : "reply",
      text: typeof button.text === "string" ? button.text.trim() : "",
      value: typeof button.value === "string" ? button.value.trim() : "",
    }))
    .filter((button) => button.text);
}

function buildMenuChoice(button: CarouselButton, index: number) {
  const text = (button.text || "").trim();
  if (!text) return null;

  const normalizedType = (button.type || "reply").toLowerCase();
  const rawValue = (button.value || "").trim();

  if (normalizedType === "url") {
    const normalizedUrl = normalizeCarouselUrl(rawValue);
    return normalizedUrl ? `${text}|url:${normalizedUrl}` : text;
  }

  if (normalizedType === "phone" || normalizedType === "call") {
    return rawValue ? `${text}|call:${rawValue}` : text;
  }

  if (normalizedType === "copy") {
    return `${text}|copy:${rawValue || text}`;
  }

  return `${text}|${rawValue || `btn_${index + 1}`}`;
}

function buildButtonsAttempts(
  baseUrl: string,
  groupJid: string,
  content: string,
  buttons: CarouselButton[],
  imageButton?: string,
) {
  const text = content.trim();
  if (!text) {
    throw new Error("Mensagens com botão exigem copy/texto principal.");
  }

  const choices = normalizeButtons(buttons)
    .map((button, index) => buildMenuChoice(button, index))
    .filter((choice): choice is string => Boolean(choice));

  if (choices.length === 0) {
    throw new Error("Adicione pelo menos um botão válido.");
  }

  const targetFields = { phone: groupJid, number: groupJid };
  const legacyTargetFields = { number: groupJid, chatId: groupJid };
  const imageFields = imageButton ? { imageButton } : {};

  return [
    {
      endpoint: `${baseUrl}/send/menu`,
      body: {
        ...targetFields,
        type: "button",
        text,
        message: text,
        choices,
        ...imageFields,
      },
      label: imageButton ? "buttons_menu_image" : "buttons_menu",
    },
    {
      endpoint: `${baseUrl}/send/menu`,
      body: {
        ...legacyTargetFields,
        type: "button",
        text,
        choices,
        ...imageFields,
      },
      label: imageButton ? "buttons_menu_image_legacy" : "buttons_menu_legacy",
    },
  ];
}

function extractGroupInfoPayload(raw: any) {
  return raw?.group || raw?.data?.group || raw?.data || raw || null;
}

function extractGroupName(rawInfo: any): string {
  const candidates = getGroupInfoCandidates(rawInfo);
  for (const info of candidates) {
    const name = info?.Subject || info?.subject || info?.Name || info?.name || info?.groupName || info?.title || "";
    const trimmed = String(name).trim();
    if (trimmed && !trimmed.includes("@g.us")) return trimmed;
  }
  return "";
}

function isTruthyGroupFlag(value: unknown) {
  if (value === true || value === 1 || value === "1") return true;
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

function isFalsyGroupFlag(value: unknown) {
  if (value === false || value === 0 || value === "0") return true;
  return typeof value === "string" && value.trim().toLowerCase() === "false";
}

function extractProviderActionFailure(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    const flags = [
      parsed?.ok,
      parsed?.success,
      parsed?.data?.ok,
      parsed?.data?.success,
      parsed?.result?.ok,
      parsed?.result?.success,
    ];

    if (flags.some((flag) => isFalsyGroupFlag(flag))) {
      return extractProviderError(raw);
    }
  } catch {
    // ignore JSON parse errors
  }

  return null;
}

function isRestrictedGroupPermissionError(message?: string) {
  const normalized = String(message || "").toLowerCase();
  return [
    "not-authorized",
    "not authorized",
    "forbidden",
    "não é administrador",
    "nao e administrador",
    "administrator",
    "only admins",
    "somente administradores",
    "apenas administradores",
  ].some((term) => normalized.includes(term));
}

function getGroupInfoCandidates(rawInfo: any) {
  const root = extractGroupInfoPayload(rawInfo);
  return [
    root,
    root?.GroupInfo,
    root?.group,
    root?.data,
    rawInfo?.group,
    rawInfo?.data,
    rawInfo?.data?.group,
    rawInfo?.data?.GroupInfo,
  ].filter((value, index, array) => value && typeof value === "object" && array.indexOf(value) === index);
}

function isRestrictedGroup(rawInfo: any) {
  const candidates = getGroupInfoCandidates(rawInfo);

  return candidates.some((info) => {
    const positiveFlags = [
      info?.adminOnlyMessage,
      info?.adminOnlyMessages,
      info?.adminOnly,
      info?.onlyAdminsCanSend,
      info?.onlyAdminCanSend,
      info?.isGroupAnnouncement,
      info?.isAnnouncement,
      info?.announcement,
      info?.announce,
      info?.Announce,
      info?.isAnnounce,
      info?.IsAnnounce,
      info?.restrictMessage,
      info?.restrictMessages,
      info?.sendMessagesAdminOnly,
    ];

    const negativeFlags = [
      info?.OwnerCanSendMessage,
      info?.ownerCanSendMessage,
      info?.canSendMessage,
      info?.canSendMessages,
      info?.CanSendMessage,
      info?.CanSendMessages,
      info?.membersCanSendMessage,
      info?.membersCanSendMessages,
    ];

    return positiveFlags.some((flag) => isTruthyGroupFlag(flag))
      || negativeFlags.some((flag) => isFalsyGroupFlag(flag));
  });
}

async function fetchGroupDeliveryMode(baseUrl: string, headers: Record<string, string>, groupJid: string): Promise<{ mode: "default" | "restricted"; groupName: string }> {
  const attempts = [
    {
      method: "POST",
      url: `${baseUrl}/group/info`,
      body: JSON.stringify({ groupjid: groupJid }),
    },
    {
      method: "GET",
      url: `${baseUrl}/group/info?groupjid=${encodeURIComponent(groupJid)}`,
    },
    {
      method: "POST",
      url: `${baseUrl}/chat/info`,
      body: JSON.stringify({ chatId: groupJid }),
    },
  ];

  let resolvedName = "";

  for (const attempt of attempts) {
    try {
      const response = await fetchWithTimeout(
        attempt.url,
        {
          method: attempt.method,
          headers,
          ...(attempt.body ? { body: attempt.body } : {}),
        },
        10_000,
      );

      if (!response.ok) continue;

      const raw = await response.text();
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      const info = extractGroupInfoPayload(parsed);
      const keyPreview = info && typeof info === "object"
        ? Object.keys(info).slice(0, 12).join(",")
        : "no-keys";
      console.log(`[group-carousel] Group inspect ${attempt.method} ${new URL(attempt.url).pathname} keys=${keyPreview}`);

      if (!resolvedName) {
        resolvedName = extractGroupName(parsed);
      }

      if (isRestrictedGroup(parsed)) {
        console.log(`[group-carousel] Restricted group detected for ${groupJid}`);
        return { mode: "restricted", groupName: resolvedName };
      }
    } catch (error) {
      console.warn(`[group-carousel] Failed to inspect group mode for ${groupJid}:`, error);
    }
  }

  return { mode: "default", groupName: resolvedName };
}

async function toggleGroupAnnounce(
  baseUrl: string,
  headers: Record<string, string>,
  groupJid: string,
  announce: boolean,
): Promise<ToggleGroupAnnounceResult> {
  try {
    console.log(`[group-carousel] Setting announce=${announce} for ${groupJid}`);
    const response = await fetchWithTimeout(
      `${baseUrl}/group/updateAnnounce`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ groupjid: groupJid, announce }),
      },
      10_000,
    );
    const raw = await response.text();
    console.log(`[group-carousel] updateAnnounce response: ${response.status} ${raw.substring(0, 200)}`);
    const providerFailure = extractProviderActionFailure(raw);

    if (response.ok && !providerFailure) {
      return { ok: true, status: response.status };
    }

    return {
      ok: false,
      status: response.status,
      error: providerFailure || extractProviderError(raw),
    };
  } catch (error: any) {
    const message = error?.message || "Falha ao alterar as permissões do grupo.";
    console.warn(`[group-carousel] Failed to toggle announce for ${groupJid}:`, message);
    return { ok: false, status: 0, error: message };
  }
}

async function sendToRestrictedGroup(
  baseUrl: string,
  headers: Record<string, string>,
  groupJid: string,
  sendFn: () => Promise<void>,
): Promise<void> {
  const unlockResult = await toggleGroupAnnounce(baseUrl, headers, groupJid, false);
  if (!unlockResult.ok) {
    const details = unlockResult.error || "Não foi possível alterar as permissões do grupo.";

    if (unlockResult.status === 403 || isRestrictedGroupPermissionError(details)) {
      throw createHttpError(
        "Sua instância não é administradora deste grupo privado. Como o grupo está configurado para apenas admins enviarem mensagens, o WhatsApp/UAZAPI bloqueia o envio.",
        403,
      );
    }

    throw createHttpError(`Não foi possível liberar temporariamente o grupo para envio. ${details}`.trim(), 502);
  }

  if (unlockResult.ok) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  try {
    await sendFn();
  } finally {
    if (unlockResult.ok) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const relockResult = await toggleGroupAnnounce(baseUrl, headers, groupJid, true);
      if (!relockResult.ok) {
        console.warn(`[group-carousel] Failed to restore announce=true for ${groupJid}: ${relockResult.error || "unknown error"}`);
      }
    }
  }
}

function renderCarouselAsTextFallback(headerText: string | undefined, cards: CarouselCard[]) {
  const normalizedCards = normalizeCarouselCards(cards);
  const parts: string[] = [];
  const intro = headerText?.trim();

  if (intro) {
    parts.push(intro);
  }

  normalizedCards.forEach((card, index) => {
    const lines = [`*${index + 1}. ${card.text || `Card ${index + 1}`}*`];

    if (card.mediaUrl) {
      lines.push(card.mediaUrl);
    }

    card.buttons.forEach((button) => {
      const label = (button.text || "").trim();
      if (!label) return;

      const normalizedType = (button.type || "reply").toLowerCase();
      const rawValue = (button.value || "").trim();

      if (normalizedType === "url") {
        const normalizedUrl = normalizeCarouselUrl(rawValue);
        if (normalizedUrl) lines.push(`${label}: ${normalizedUrl}`);
        return;
      }

      if (normalizedType === "phone" || normalizedType === "call") {
        if (rawValue) lines.push(`${label}: ${rawValue}`);
        return;
      }

      if (normalizedType === "copy") {
        lines.push(`${label}: ${rawValue || label}`);
        return;
      }

      lines.push(rawValue ? `${label}: ${rawValue}` : label);
    });

    parts.push(lines.join("\n"));
  });

  return parts.filter(Boolean).join("\n\n");
}

function extractProviderError(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.error === "string" && parsed.error.trim()) return parsed.error.trim();
    if (typeof parsed?.message === "string" && parsed.message.trim()) return parsed.message.trim();
  } catch {
    // ignore JSON parse errors
  }

  return raw.trim() || "Falha ao enviar mensagem para o grupo.";
}

function isMethodNotAllowedProviderError(message?: string) {
  const normalized = String(message || "").trim().toLowerCase();
  return normalized.includes("method not allowed") || normalized === "405";
}

function normalizeMentionPhone(raw: unknown): string {
  const value = String(raw || "").trim();
  if (!value || value.endsWith("@g.us")) return "";
  const digits = value.replace(/@.*$/, "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : "";
}

function normalizeMentionJid(raw: unknown): string {
  const value = String(raw || "").trim();
  if (!value || !value.includes("@") || value.endsWith("@g.us")) return "";
  return value;
}

function buildMentionFields(mentionParticipants: string[]) {
  const numbers = Array.from(new Set(
    mentionParticipants
      .map((participant) => normalizeMentionPhone(participant))
      .filter(Boolean),
  ));

  const jids = Array.from(new Set(
    mentionParticipants.flatMap((participant) => {
      const variants = new Set<string>();
      const rawJid = normalizeMentionJid(participant);
      const digits = normalizeMentionPhone(participant);

      if (rawJid) variants.add(rawJid);
      if (digits) {
        variants.add(`${digits}@s.whatsapp.net`);
        variants.add(`${digits}@c.us`);
      }

      return Array.from(variants);
    }),
  ));

  const aliases = Array.from(new Set([...numbers, ...jids]));
  const payload: Record<string, unknown> = {
    mentionsEveryOne: true,
    mentions: "all",
  };

  if (numbers.length > 0) {
    payload.mentionUsers = numbers.join(",");
  }

  if (aliases.length > 0) {
    payload.mentioned = aliases;
  }

  if (jids.length > 0) {
    payload.mentionedJid = jids;
    payload.mentionedJidList = jids;
    payload.contextInfo = {
      mentionedJid: jids,
      mentionedJidList: jids,
      mentions: jids,
      mentionsEveryOne: true,
    };
  }

  return {
    count: Math.max(numbers.length, jids.length),
    numbers,
    jids,
    mentionUsers: numbers.join(","),
    payload,
  };
}

function buildBlindMentionFields() {
  return {
    mentions: "all",
    mentionsEveryOne: true,
    contextInfo: {
      mentionsEveryOne: true,
    },
  };
}

function dedupeAttempts(attempts: SendAttempt[]) {
  const seen = new Set<string>();

  return attempts.filter((attempt) => {
    const key = `${attempt.endpoint}::${JSON.stringify(attempt.body)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildMentionTextAttempts(baseUrl: string, groupJid: string, text: string, mentionParticipants: string[]): SendAttempt[] {
  const cleanText = text.trim();
  const mentionFields = buildMentionFields(mentionParticipants);
  const attempts: SendAttempt[] = [];

  const pushAttempt = (label: string, body: Record<string, unknown>) => {
    attempts.push({
      endpoint: `${baseUrl}/send/text`,
      body,
      label,
    });
  };

  pushAttempt("mentions_all", {
    number: groupJid,
    text: cleanText,
    mentions: "all",
  });

  if (mentionFields.mentionUsers) {
    pushAttempt("mentions_explicit_numbers", {
      number: groupJid,
      text: cleanText,
      mentions: mentionFields.mentionUsers,
    });
  }

  if (mentionFields.mentionUsers) {
    pushAttempt("mention_users_hidden", {
      number: groupJid,
      text: cleanText,
      mentionUsers: mentionFields.mentionUsers,
    });
  }

  if (mentionFields.mentionUsers && mentionFields.jids.length > 0) {
    pushAttempt("mentions_all_with_context", {
      number: groupJid,
      text: cleanText,
      mentions: "all",
      contextInfo: {
        mentionedJid: mentionFields.jids,
        mentionedJidList: mentionFields.jids,
      },
    });
  }

  if (mentionFields.mentionUsers && mentionFields.jids.length > 0) {
    pushAttempt("mention_users_context_hidden", {
      number: groupJid,
      text: cleanText,
      mentionUsers: mentionFields.mentionUsers,
      contextInfo: {
        mentionedJid: mentionFields.jids,
        mentionedJidList: mentionFields.jids,
      },
    });
  }

  if (mentionFields.jids.length > 0) {
    pushAttempt("mentioned_jid_hidden", {
      number: groupJid,
      text: cleanText,
      mentionedJid: mentionFields.jids,
      mentionedJidList: mentionFields.jids,
    });
  }

  if (attempts.length === 0) {
    pushAttempt("plain_text_fallback", {
      number: groupJid,
      text: cleanText,
    });
  }

  return dedupeAttempts(attempts);
}

function extractGroupJid(value: any): string {
  const candidate = [
    value?.JID,
    value?.jid,
    value?.id,
    value?.groupId,
    value?.groupJid,
    value?.chatId,
    value?.remoteJid,
  ].find((entry) => typeof entry === "string" && entry.trim());

  return candidate ? String(candidate).trim() : "";
}

function tryExtractParticipantPhone(value: any): string | null {
  if (!value || typeof value !== "object") return null;

  const candidates = [
    value?.participantLid,
    value?.participantPn,
    value?.sender_lid,
    value?.sender_pn,
    value?.contactJid,
    value?.userJid,
    value?.PhoneNumber,
    value?.phoneNumber,
    value?.phone,
    value?.number,
    value?.Phone,
    value?.Number,
    value?.wid,
    value?.wa_id,
    value?.waId,
    value?.pn,
    value?.lid,
    value?.user,
    value?.participant,
    value?.jid,
    value?.JID,
    value?.id,
  ];

  for (const candidate of candidates) {
    const jid = normalizeMentionJid(candidate);
    if (jid) return jid;

    const normalized = normalizeMentionPhone(candidate);
    if (normalized) return normalized;
  }

  const displayName = String(
    value?.DisplayName || value?.displayName || value?.name || value?.pushName || value?.notify || value?.Name || "",
  );
  const digitsFromDisplayName = normalizeMentionPhone(displayName);
  return digitsFromDisplayName || null;
}

function collectParticipantsFromValue(value: any, participants: Set<string>) {
  if (!value) return;

  if (Array.isArray(value)) {
    value.forEach((entry) => collectParticipantsFromValue(entry, participants));
    return;
  }

  if (typeof value !== "object") return;

  const nestedParticipants = [
    value?.Participants,
    value?.participants,
    value?.members,
    value?.data?.participants,
    value?.data?.Participants,
    value?.group?.participants,
    value?.data?.group?.participants,
  ].find((entry) => Array.isArray(entry));

  if (Array.isArray(nestedParticipants)) {
    nestedParticipants.forEach((entry) => collectParticipantsFromValue(entry, participants));
    return;
  }

  const phone = tryExtractParticipantPhone(value);
  if (phone) participants.add(phone);
}

function extractGroupsCollection(payload: any): any[] {
  const groups = [
    payload,
    payload?.groups,
    payload?.data,
    payload?.data?.groups,
    payload?.result,
    payload?.result?.groups,
    payload?.chats,
    payload?.data?.chats,
  ].find((entry) => Array.isArray(entry));

  return Array.isArray(groups) ? groups : [];
}

function extractAttemptText(body: Record<string, unknown>): string {
  const candidate = [body.text, body.body, body.message, body.caption, body.headerText]
    .find((value) => typeof value === "string" && value.trim());

  return candidate ? String(candidate).trim() : "";
}

function extractAttemptTarget(body: Record<string, unknown>): string {
  const candidate = [body.number, body.chatId, body.to, body.phone]
    .find((value) => typeof value === "string" && value.trim());

  return candidate ? String(candidate).trim() : "";
}

function responseContainsMentionEvidence(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw);
    const directMentionFields = [
      parsed?.mentions,
      parsed?.mentioned,
      parsed?.mentionedJid,
      parsed?.mentionedJidList,
      parsed?.content?.mentions,
      parsed?.content?.mentioned,
      parsed?.data?.mentions,
      parsed?.data?.mentioned,
      parsed?.data?.mentionedJid,
      parsed?.data?.mentionedJidList,
    ];

    if (directMentionFields.some((value) => Array.isArray(value) && value.length > 0)) {
      return true;
    }

    const candidates = [
      parsed?.contextInfo,
      parsed?.content?.contextInfo,
      parsed?.message?.extendedTextMessage?.contextInfo,
      parsed?.message?.imageMessage?.contextInfo,
      parsed?.message?.videoMessage?.contextInfo,
      parsed?.message?.documentMessage?.contextInfo,
      parsed?.message?.conversation?.contextInfo,
      parsed?.data?.contextInfo,
      parsed?.data?.message?.extendedTextMessage?.contextInfo,
    ].filter(Boolean);

    return candidates.some((context) => {
      const mentioned = [
        context?.mentionedJid,
        context?.mentionedJidList,
        context?.groupMentions,
        context?.mentions,
        context?.mentioned,
      ].find((value) => Array.isArray(value) && value.length > 0);

      return Boolean(mentioned) || context?.mentionsEveryOne === true;
    });
  } catch {
    return false;
  }
}

async function sendWithFallbacks(attempts: SendAttempt[], headers: Record<string, string>, expectedGroupJid: string, mentionPhones: string[] = []) {
  const finalAttempts = mentionPhones.length > 0 ? injectMentionsIntoAttempts(attempts, mentionPhones) : attempts;
  let lastError = "Falha ao enviar mensagem para o grupo.";

  for (const attempt of finalAttempts) {
    try {
      console.log(`[group-carousel] Sending via ${attempt.endpoint}${attempt.label ? ` (${attempt.label})` : ""}${mentionPhones.length > 0 ? ` (mentioning ${mentionPhones.length})` : ""}`);
      const response = await fetchWithTimeout(attempt.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(attempt.body),
      });

      const raw = await response.text();
      console.log(`[group-carousel] Response: ${response.status} ${raw.substring(0, 200)}`);

      if (response.ok) {
        if (mentionPhones.length > 0 && !responseContainsMentionEvidence(raw)) {
          console.warn(`[group-carousel] Provider accepted ${attempt.endpoint}${attempt.label ? ` (${attempt.label})` : ""}, but the response did not echo mention metadata`);
        }

        const actualChatId = extractResponseChatId(raw);
        if (actualChatId && actualChatId !== expectedGroupJid) {
          lastError = `A API respondeu com outro grupo (${actualChatId}).`;
          console.warn(`[group-carousel] Target mismatch: expected ${expectedGroupJid}, got ${actualChatId}`);
          continue;
        }
        return;
      }

      lastError = extractProviderError(raw);
    } catch (error: any) {
      lastError = error?.message || "Falha ao enviar mensagem para o grupo.";
      console.error(`[group-carousel] Attempt failed: ${attempt.endpoint}`, error);
    }
  }

  throw new Error(lastError);
}

async function fetchGroupParticipants(baseUrl: string, headers: Record<string, string>, groupJid: string): Promise<string[]> {
  const attempts = [
    {
      label: "GET /group/list?GetParticipants=true&count=500",
      method: "GET",
      url: `${baseUrl}/group/list?GetParticipants=true&count=500`,
      resolve: (payload: any) => extractGroupsCollection(payload).find((group) => extractGroupJid(group) === groupJid) || null,
    },
    {
      label: "GET /group/fetchAllGroups",
      method: "GET",
      url: `${baseUrl}/group/fetchAllGroups`,
      resolve: (payload: any) => extractGroupsCollection(payload).find((group) => extractGroupJid(group) === groupJid) || null,
    },
    {
      label: "POST /group/info (groupJid)",
      method: "POST",
      url: `${baseUrl}/group/info`,
      body: JSON.stringify({ groupJid: groupJid }),
      resolve: (payload: any) => payload,
    },
    {
      label: "POST /group/info (groupjid)",
      method: "POST",
      url: `${baseUrl}/group/info`,
      body: JSON.stringify({ groupjid: groupJid }),
      resolve: (payload: any) => payload,
    },
    {
      label: "GET /group/info?groupJid=",
      method: "GET",
      url: `${baseUrl}/group/info?groupJid=${encodeURIComponent(groupJid)}`,
      resolve: (payload: any) => payload,
    },
    {
      label: "GET /group/info?groupjid=",
      method: "GET",
      url: `${baseUrl}/group/info?groupjid=${encodeURIComponent(groupJid)}`,
      resolve: (payload: any) => payload,
    },
    {
      label: "POST /chat/info",
      method: "POST",
      url: `${baseUrl}/chat/info`,
      body: JSON.stringify({ chatId: groupJid }),
      resolve: (payload: any) => payload,
    },
    {
      label: "POST /group/participants (groupJid)",
      method: "POST",
      url: `${baseUrl}/group/participants`,
      body: JSON.stringify({ groupJid: groupJid }),
      resolve: (payload: any) => payload,
    },
    {
      label: "POST /group/participants (groupjid)",
      method: "POST",
      url: `${baseUrl}/group/participants`,
      body: JSON.stringify({ groupjid: groupJid }),
      resolve: (payload: any) => payload,
    },
    {
      label: "GET /group/participants?groupJid=",
      method: "GET",
      url: `${baseUrl}/group/participants?groupJid=${encodeURIComponent(groupJid)}`,
      resolve: (payload: any) => payload,
    },
    {
      label: "GET /group/participants?groupjid=",
      method: "GET",
      url: `${baseUrl}/group/participants?groupjid=${encodeURIComponent(groupJid)}`,
      resolve: (payload: any) => payload,
    },
  ];

  const diagnostics: string[] = [];

  for (const attempt of attempts) {
    try {
      const response = await fetchWithTimeout(attempt.url, {
        method: attempt.method,
        headers,
        ...(attempt.body ? { body: attempt.body } : {}),
      }, 10_000);

      if (!response.ok) {
        diagnostics.push(`${attempt.label}: HTTP ${response.status}`);
        continue;
      }

      const raw = await response.text();
      if (!raw) {
        diagnostics.push(`${attempt.label}: resposta vazia`);
        continue;
      }

      const parsed = JSON.parse(raw);
      const source = attempt.resolve(parsed);
      if (!source) {
        diagnostics.push(`${attempt.label}: grupo não encontrado`);
        continue;
      }

      const participants = new Set<string>();
      collectParticipantsFromValue(source, participants);

      if (participants.size > 0) {
        const phones = Array.from(participants);
        console.log(`[group-carousel] Found ${phones.length} participants for ${groupJid} via ${attempt.label}`);
        return phones;
      }

      diagnostics.push(`${attempt.label}: resposta sem participantes`);
    } catch (error) {
      diagnostics.push(`${attempt.label}: ${error instanceof Error ? error.message : "erro"}`);
    }
  }

  console.warn(`[group-carousel] Could not fetch participants for ${groupJid}: ${diagnostics.join(" | ")}`);
  return [];
}

function injectMentionsIntoAttempts(attempts: SendAttempt[], mentionPhones: string[]): SendAttempt[] {
  if (mentionPhones.length === 0) return attempts;

  const mentionFields = buildMentionFields(mentionPhones);
  console.log(`[group-carousel] Injecting ${mentionFields.count} mentions into ${attempts.length} attempt(s)`);

  const enrichedAttempts: SendAttempt[] = [];

  for (const a of attempts) {
    const endpointPath = new URL(a.endpoint).pathname;
    const target = extractAttemptTarget(a.body);
    const text = extractAttemptText(a.body);
    const messageFields = { text, body: text, message: text, ...mentionFields.payload };

    if (endpointPath === "/send/carousel" || endpointPath === "/send/menu") {
      enrichedAttempts.push({
        ...a,
        label: `${a.label || ""}_mention_all`.replace(/^_/, ""),
        body: { ...a.body, mentions: "all" },
      });

      if (mentionFields.mentionUsers) {
        enrichedAttempts.push({
          ...a,
          label: `${a.label || ""}_mention_users`.replace(/^_/, ""),
          body: { ...a.body, mentionUsers: mentionFields.mentionUsers },
        });
      }

      if (mentionFields.jids.length > 0) {
        enrichedAttempts.push({
          ...a,
          label: `${a.label || ""}_mentioned_jid`.replace(/^_/, ""),
          body: {
            ...a.body,
            mentionedJid: mentionFields.jids,
            mentionedJidList: mentionFields.jids,
          },
        });
      }

      continue;
    }

    if (endpointPath === "/message/sendText") {
      enrichedAttempts.push(
        {
          ...a,
          label: `${a.label || ""}_mentions_number`.replace(/^_/, ""),
          body: { number: target, to: target, chatId: target, ...messageFields },
        },
        {
          ...a,
          label: `${a.label || ""}_mentions_chatid`.replace(/^_/, ""),
          body: { chatId: target, to: target, ...messageFields },
        },
      );
      continue;
    }

    if (endpointPath === "/send/text") {
      enrichedAttempts.push(
        {
          ...a,
          label: `${a.label || ""}_mentions_text`.replace(/^_/, ""),
          body: { number: target, phone: target, to: target, ...messageFields },
        },
        {
          ...a,
          label: `${a.label || ""}_mentions_chatid`.replace(/^_/, ""),
          body: { chatId: target, number: target, ...messageFields },
        },
      );
      continue;
    }

    if (endpointPath === "/chat/send-text") {
      enrichedAttempts.push(
        {
          ...a,
          label: `${a.label || ""}_mentions_chat`.replace(/^_/, ""),
          body: { chatId: target, to: target, ...messageFields },
        },
      );
      continue;
    }

    enrichedAttempts.push({
      ...a,
      label: `${a.label || ""}_mentions_generic`.replace(/^_/, ""),
      body: { ...a.body, ...mentionFields.payload },
    });
  }

  return dedupeAttempts(enrichedAttempts);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, error: "Unauthorized" }, 401);

    const rawBody = await req.json().catch(() => null);
    const parsedBody = BodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return json({ ok: false, error: "Payload inválido", details: parsedBody.error.flatten().fieldErrors }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json({ ok: false, error: "Unauthorized" }, 401);

    const { deviceId, groupJid, content, type, caption, headerText, mediaUrl, buttons, cards, mentionAll } = parsedBody.data;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: device, error: deviceError } = await admin
      .from("devices")
      .select("uazapi_token, uazapi_base_url")
      .eq("id", deviceId)
      .eq("user_id", user.id)
      .single();

    if (deviceError || !device?.uazapi_token || !device?.uazapi_base_url) {
      return json({ ok: false, error: "Dispositivo não configurado" }, 404);
    }

    const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");
    const headers = {
      token: device.uazapi_token,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    // Fetch group name for enrichment
    const groupInfo = await fetchGroupDeliveryMode(baseUrl, headers, groupJid);
    const groupName = groupInfo.groupName || "";

    // Fetch participants if mentionAll is enabled
    const mentionPhones = mentionAll ? await fetchGroupParticipants(baseUrl, headers, groupJid) : [];
    if (mentionAll && mentionPhones.length === 0) {
      return json({ ok: false, error: "Não consegui carregar os membros desse grupo para montar o @todos. A UAZAPI dessa instância não retornou a lista de participantes." }, 422);
    }

    const normalizedCarouselCards = normalizeCarouselCards(cards || []);
    if (normalizedCarouselCards.length > 0) {
      for (const [index, card] of normalizedCarouselCards.entries()) {
        if (card.mediaUrl) {
          if (card.mediaType && card.mediaType !== "image") {
            return json({ ok: false, error: `Card ${index + 1}: para carrossel em grupo use imagem.` }, 400);
          }

          const inspectedMedia = await inspectMediaUrl(card.mediaUrl, "image");
          if (!inspectedMedia.ok) {
            return json({ ok: false, error: `Card ${index + 1}: ${inspectedMedia.error}` }, 400);
          }

          card.mediaUrl = inspectedMedia.normalizedUrl;
        }
      }

      // Send carousel directly — admins can send in restricted groups without toggling settings
      const carouselAttempts = buildCarouselAttempts(baseUrl, groupJid, headerText, normalizedCarouselCards);
      const textFallbackAttempts = buildMessageAttempts(
        baseUrl, groupJid,
        renderCarouselAsTextFallback(headerText, normalizedCarouselCards),
        "text",
      );
      const allAttempts = [...carouselAttempts, ...textFallbackAttempts];
      await sendWithFallbacks(allAttempts, headers, groupJid, mentionPhones);
      return json({ ok: true, mode: "carousel", groupName });
    }

    const normalizedButtons = normalizeButtons(buttons || []);
    const trimmedMediaUrl = typeof mediaUrl === "string" ? mediaUrl.trim() : "";
    const normalizedTextContent = content.trim();

    if (type === "buttons") {
      if (!normalizedTextContent) {
        return json({ ok: false, error: "Mensagens com botão exigem copy/texto principal." }, 400);
      }

      if (normalizedButtons.length === 0) {
        return json({ ok: false, error: "Adicione pelo menos um botão válido." }, 400);
      }

      const buttonAttempts = buildButtonsAttempts(baseUrl, groupJid, normalizedTextContent, normalizedButtons);

      // When mentionAll is active with buttons, try sending buttons WITH mentions: "all"
      // injected directly into the /send/menu payload. This avoids a separate ping message.
      if (mentionAll && mentionPhones.length > 0) {
        const mentionButtonAttempts = buttonAttempts.map((attempt) => ({
          ...attempt,
          body: { ...attempt.body, mentions: "all" },
          label: `${attempt.label}_mention_all`,
        }));

        try {
          console.log(`[group-carousel] Trying buttons + mentions:"all" in single payload (${mentionPhones.length} members)`);
          await sendWithFallbacks(mentionButtonAttempts, headers, groupJid);

          if (trimmedMediaUrl) {
            const mediaType = detectMediaTypeFromUrl(trimmedMediaUrl);
            const inspectedMedia = await inspectMediaUrl(trimmedMediaUrl, mediaType);
            if (inspectedMedia.ok) {
              const mediaAttempts = buildMessageAttempts(baseUrl, groupJid, inspectedMedia.normalizedUrl, mediaType, undefined, inspectedMedia.fileName);
              await new Promise((resolve) => setTimeout(resolve, 1500));
              await sendWithFallbacks(mediaAttempts, headers, groupJid);
            }
          }

          return json({ ok: true, mode: "buttons_mention", groupName });
        } catch (mentionBtnErr) {
          // Fallback: send buttons without mentions if the combined payload fails
          console.warn(`[group-carousel] buttons+mentions failed, sending buttons only: ${mentionBtnErr instanceof Error ? mentionBtnErr.message : String(mentionBtnErr)}`);
          await sendWithFallbacks(buttonAttempts, headers, groupJid);

          if (trimmedMediaUrl) {
            const mediaType = detectMediaTypeFromUrl(trimmedMediaUrl);
            const inspectedMedia = await inspectMediaUrl(trimmedMediaUrl, mediaType);
            if (inspectedMedia.ok) {
              const mediaAttempts = buildMessageAttempts(baseUrl, groupJid, inspectedMedia.normalizedUrl, mediaType, undefined, inspectedMedia.fileName);
              await new Promise((resolve) => setTimeout(resolve, 1500));
              await sendWithFallbacks(mediaAttempts, headers, groupJid);
            }
          }

          return json({ ok: true, mode: "buttons_mention_fallback", groupName });
        }
      }

      if (trimmedMediaUrl) {
        const mediaType = detectMediaTypeFromUrl(trimmedMediaUrl);
        const inspectedMedia = await inspectMediaUrl(trimmedMediaUrl, mediaType);
        if (!inspectedMedia.ok) {
          return json({ ok: false, error: inspectedMedia.error }, 400);
        }

        if (mediaType === "image") {
          const imageButtonAttempts = buildButtonsAttempts(
            baseUrl,
            groupJid,
            normalizedTextContent,
            normalizedButtons,
            inspectedMedia.normalizedUrl,
          );

          try {
            await sendWithFallbacks(imageButtonAttempts, headers, groupJid);
            return json({ ok: true, mode: "buttons_image", groupName });
          } catch (error) {
            console.warn(`[group-carousel] imageButton failed, falling back to split send: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        const mediaAttempts = buildMessageAttempts(baseUrl, groupJid, inspectedMedia.normalizedUrl, mediaType, undefined, inspectedMedia.fileName);

        if (mediaType === "audio") {
          await sendWithFallbacks(buttonAttempts, headers, groupJid);
          await new Promise((resolve) => setTimeout(resolve, 1500));
          await sendWithFallbacks(mediaAttempts, headers, groupJid);
          return json({ ok: true, mode: "buttons_audio", groupName });
        }

        await sendWithFallbacks(mediaAttempts, headers, groupJid);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await sendWithFallbacks(buttonAttempts, headers, groupJid);
        return json({ ok: true, mode: "buttons_media", groupName });
      }

      await sendWithFallbacks(buttonAttempts, headers, groupJid);
      return json({ ok: true, mode: "buttons", groupName });
    }

    let normalizedContent = normalizedTextContent;
    let fileName: string | undefined;

    if (!normalizedContent) {
      return json({ ok: false, error: "content é obrigatório quando não houver cards." }, 400);
    }

    if (type !== "text") {
      const inspectedMedia = await inspectMediaUrl(content, type);
      if (!inspectedMedia.ok) {
        return json({ ok: false, error: inspectedMedia.error }, 400);
      }

      normalizedContent = inspectedMedia.normalizedUrl;
      fileName = inspectedMedia.fileName;
    }

    if (mentionAll && type === "text") {
      const mentionAttempts = buildMentionTextAttempts(baseUrl, groupJid, normalizedContent, mentionPhones);
      console.log(`[group-carousel] Prepared ${mentionAttempts.length} dedicated @todos attempt(s) for ${groupJid}`);
      await sendWithFallbacks(mentionAttempts, headers, groupJid);
      return json({ ok: true, mode: "message", groupName });
    }

    const attempts = buildMessageAttempts(baseUrl, groupJid, normalizedContent, type, caption, fileName);
    await sendWithFallbacks(attempts, headers, groupJid, mentionPhones);
    return json({ ok: true, mode: "message", groupName });
  } catch (error: any) {
    console.error("[group-carousel] Error:", error);
    const status = typeof error?.status === "number" ? error.status : 500;
    return json({ ok: false, error: error?.message || "Erro interno ao enviar carrossel.", status }, status >= 500 ? 200 : status);
  }
});
