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
  type: z.enum(["text", "image", "video", "document", "audio"]).optional().default("text"),
  caption: z.string().optional(),
  headerText: z.string().optional(),
  cards: z.array(CarouselCardSchema).max(4, "Máximo de 4 cards").optional(),
});

type MediaType = z.infer<typeof BodySchema>["type"];
type MediaOnlyType = Exclude<MediaType, "text">;
type CarouselButton = z.infer<typeof CarouselButtonSchema>;
type CarouselCard = z.infer<typeof CarouselCardSchema>;
type SendAttempt = {
  endpoint: string;
  body: Record<string, unknown>;
  label?: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
  if (type === "image" && ["webp", "svg", "avif"].includes(extension)) {
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
    { endpoint: `${baseUrl}/chat/send-text`, body: { phone: groupJid, chatId: groupJid, text: safeText, body: safeText, message: safeText } },
    { endpoint: `${baseUrl}/send/text`, body: { ...targetFields, phone: groupJid, text: safeText, message: safeText } },
    { endpoint: `${baseUrl}/message/sendText`, body: { phone: groupJid, chatId: groupJid, text: safeText, body: safeText, message: safeText } },
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

function extractGroupInfoPayload(raw: any) {
  return raw?.group || raw?.data?.group || raw?.data || raw || null;
}

function isTruthyGroupFlag(value: unknown) {
  if (value === true || value === 1 || value === "1") return true;
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

function isFalsyGroupFlag(value: unknown) {
  if (value === false || value === 0 || value === "0") return true;
  return typeof value === "string" && value.trim().toLowerCase() === "false";
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

async function fetchGroupDeliveryMode(baseUrl: string, headers: Record<string, string>, groupJid: string): Promise<"default" | "restricted"> {
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
      if (isRestrictedGroup(parsed)) {
        console.log(`[group-carousel] Restricted group detected for ${groupJid}`);
        return "restricted";
      }
    } catch (error) {
      console.warn(`[group-carousel] Failed to inspect group mode for ${groupJid}:`, error);
    }
  }

  return "default";
}

async function toggleGroupAnnounce(baseUrl: string, headers: Record<string, string>, groupJid: string, announce: boolean): Promise<boolean> {
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
    return response.ok;
  } catch (error: any) {
    console.warn(`[group-carousel] Failed to toggle announce for ${groupJid}:`, error?.message);
    return false;
  }
}

async function sendToRestrictedGroup(
  baseUrl: string,
  headers: Record<string, string>,
  groupJid: string,
  sendFn: () => Promise<void>,
): Promise<void> {
  const unlocked = await toggleGroupAnnounce(baseUrl, headers, groupJid, false);
  if (unlocked) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  try {
    await sendFn();
  } finally {
    if (unlocked) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await toggleGroupAnnounce(baseUrl, headers, groupJid, true);
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

async function sendWithFallbacks(attempts: SendAttempt[], headers: Record<string, string>, expectedGroupJid: string) {
  let lastError = "Falha ao enviar mensagem para o grupo.";

  for (const attempt of attempts) {
    try {
      console.log(`[group-carousel] Sending via ${attempt.endpoint}${attempt.label ? ` (${attempt.label})` : ""}`);
      const response = await fetchWithTimeout(attempt.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(attempt.body),
      });

      const raw = await response.text();
      console.log(`[group-carousel] Response: ${response.status} ${raw.substring(0, 200)}`);

      if (response.ok) {
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

    const { deviceId, groupJid, content, type, caption, headerText, cards } = parsedBody.data;

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

    const headers = {
      token: device.uazapi_token,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");

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

      const deliveryMode = await fetchGroupDeliveryMode(baseUrl, headers, groupJid);
      if (deliveryMode === "restricted") {
        const carouselAttempts = buildCarouselAttempts(baseUrl, groupJid, headerText, normalizedCarouselCards);
        const textFallbackAttempts = buildMessageAttempts(
          baseUrl, groupJid,
          renderCarouselAsTextFallback(headerText, normalizedCarouselCards),
          "text",
        );
        const allAttempts = [...carouselAttempts, ...textFallbackAttempts];
        await sendToRestrictedGroup(baseUrl, headers, groupJid, () =>
          sendWithFallbacks(allAttempts, headers, groupJid),
        );
        return json({ ok: true, mode: "restricted_unlocked" });
      }

      const attempts = buildCarouselAttempts(baseUrl, groupJid, headerText, normalizedCarouselCards);
      await sendWithFallbacks(attempts, headers, groupJid);
      return json({ ok: true, mode: "carousel" });
    }

    let normalizedContent = content.trim();
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

    const attempts = buildMessageAttempts(baseUrl, groupJid, normalizedContent, type, caption, fileName);
    await sendWithFallbacks(attempts, headers, groupJid);
    return json({ ok: true, mode: "message" });
  } catch (error: any) {
    console.error("[group-carousel] Error:", error);
    return json({ ok: false, error: error?.message || "Erro interno ao enviar carrossel." }, 500);
  }
});
