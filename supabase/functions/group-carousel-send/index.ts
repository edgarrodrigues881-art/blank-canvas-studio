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

const BodySchema = z.object({
  deviceId: z.string().uuid("deviceId inválido"),
  groupJid: z.string().trim().regex(/@g\.us$/, "groupJid inválido"),
  content: z.string().trim().min(1, "content é obrigatório"),
  type: z.enum(["text", "image", "video", "document", "audio"]).optional().default("text"),
  caption: z.string().optional(),
});

type MediaType = z.infer<typeof BodySchema>["type"];
type MediaOnlyType = Exclude<MediaType, "text">;
type SendAttempt = {
  endpoint: string;
  body: Record<string, unknown>;
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

function buildAttempts(baseUrl: string, groupJid: string, content: string, type: MediaType, caption?: string, fileName?: string): SendAttempt[] {
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
    { endpoint: `${baseUrl}/send/text`, body: { ...targetFields, text: safeText } },
  ];
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
      console.log(`[group-carousel] Sending via ${attempt.endpoint}`);
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

    const { deviceId, groupJid, content, type, caption } = parsedBody.data;

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

    let normalizedContent = content;
    let fileName: string | undefined;

    if (type !== "text") {
      const inspectedMedia = await inspectMediaUrl(content, type);
      if (!inspectedMedia.ok) {
        return json({ ok: false, error: inspectedMedia.error }, 400);
      }

      normalizedContent = inspectedMedia.normalizedUrl;
      fileName = inspectedMedia.fileName;
    }

    const headers = {
      token: device.uazapi_token,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    const baseUrl = device.uazapi_base_url.replace(/\/+$/, "");
    const attempts = buildAttempts(baseUrl, groupJid, normalizedContent, type, caption, fileName);

    await sendWithFallbacks(attempts, headers, groupJid);
    return json({ ok: true });
  } catch (error: any) {
    console.error("[group-carousel] Error:", error);
    return json({ ok: false, error: error?.message || "Erro interno ao enviar carrossel." }, 500);
  }
});
