const MEDIA_BUCKET = "media";
const encoder = new TextEncoder();

const MEDIA_INFO: Record<string, string> = {
  audio: "WhatsApp Audio Keys",
  image: "WhatsApp Image Keys",
  video: "WhatsApp Video Keys",
  document: "WhatsApp Document Keys",
  sticker: "WhatsApp Image Keys",
};

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function normalizeMimeType(value?: string | null, mediaType?: string | null): string {
  const mime = String(value || "").split(";")[0].trim().toLowerCase();
  if (mime) return mime;

  switch (mediaType) {
    case "audio":
      return "audio/ogg";
    case "image":
      return "image/jpeg";
    case "video":
      return "video/mp4";
    case "document":
      return "application/octet-stream";
    case "sticker":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function inferExtension(sourceUrl: string, mimeType: string, mediaType?: string | null): string {
  try {
    const pathname = new URL(sourceUrl).pathname;
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    const ext = match?.[1]?.toLowerCase();
    if (ext && ext !== "enc") return ext;
  } catch {
    // ignore invalid URL
  }

  const subtype = mimeType.split("/")[1] || "";
  if (subtype) {
    if (subtype.includes("jpeg")) return "jpg";
    if (subtype.includes("ogg")) return "ogg";
    if (subtype.includes("mpeg")) return "mp3";
    if (subtype.includes("quicktime")) return "mov";
    if (subtype.includes("plain")) return "txt";
    if (subtype.includes("sheet")) return "xlsx";
    if (subtype.includes("presentation")) return "pptx";
    if (subtype.includes("wordprocessingml")) return "docx";
    return subtype.replace(/[^a-z0-9]/g, "") || "bin";
  }

  switch (mediaType) {
    case "audio":
      return "ogg";
    case "image":
      return "jpg";
    case "video":
      return "mp4";
    case "sticker":
      return "webp";
    default:
      return "bin";
  }
}

function isEncryptedWhatsAppUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("mmg.whatsapp.net") || lower.includes(".enc?") || lower.endsWith(".enc");
}

async function deriveMediaSecrets(mediaKey: string, mediaType: string): Promise<{ iv: Uint8Array; cipherKey: Uint8Array }> {
  const info = MEDIA_INFO[mediaType];
  if (!info) throw new Error(`Tipo de mídia sem chave decriptável: ${mediaType}`);

  const keyMaterial = await crypto.subtle.importKey("raw", decodeBase64(mediaKey), "HKDF", false, ["deriveBits"]);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: encoder.encode(info),
    },
    keyMaterial,
    112 * 8,
  );

  const derived = new Uint8Array(derivedBits);
  return {
    iv: derived.slice(0, 16),
    cipherKey: derived.slice(16, 48),
  };
}

async function decryptWhatsAppMedia(sourceUrl: string, mediaKey: string, mediaType: string): Promise<Uint8Array> {
  const { iv, cipherKey } = await deriveMediaSecrets(mediaKey, mediaType);

  const response = await fetch(sourceUrl, { headers: { Accept: "*/*" } });
  if (!response.ok) {
    throw new Error(`Falha ao baixar mídia criptografada (${response.status})`);
  }

  const encryptedBytes = new Uint8Array(await response.arrayBuffer());
  const ciphertext = encryptedBytes.length > 10 ? encryptedBytes.slice(0, encryptedBytes.length - 10) : encryptedBytes;

  const aesKey = await crypto.subtle.importKey("raw", cipherKey, { name: "AES-CBC" }, false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, aesKey, ciphertext);
  return new Uint8Array(decrypted);
}

export async function persistIncomingMedia(
  admin: any,
  params: {
    userId: string;
    messageId: string;
    mediaType: string | null;
    sourceUrl: string | null;
    mimeType?: string | null;
    mediaKey?: string | null;
    directPath?: string | null;
  },
): Promise<string | null> {
  const { userId, messageId, mediaType, sourceUrl, mimeType, mediaKey, directPath } = params;

  if (!mediaType) return null;

  const fallbackUrl = sourceUrl || (directPath ? `https://mmg.whatsapp.net${directPath}` : "");
  if (!fallbackUrl) return null;
  if (fallbackUrl.includes("/storage/v1/object/")) return fallbackUrl;

  const normalizedMime = normalizeMimeType(mimeType, mediaType);
  const fileExt = inferExtension(fallbackUrl, normalizedMime, mediaType);
  const storagePath = `${userId}/incoming-media/${messageId}.${fileExt}`;

  try {
    if (!isEncryptedWhatsAppUrl(fallbackUrl)) {
      return fallbackUrl;
    }

    if (!mediaKey) {
      return null;
    }

    const decryptedBytes = await decryptWhatsAppMedia(fallbackUrl, mediaKey, mediaType);
    const upload = await admin.storage.from(MEDIA_BUCKET).upload(storagePath, decryptedBytes, {
      contentType: normalizedMime,
      upsert: true,
    });

    if (upload.error) {
      throw upload.error;
    }

    const { data } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);
    return data.publicUrl;
  } catch (error: any) {
    console.error("[media] Persist failed:", error?.message || error);
    return isEncryptedWhatsAppUrl(fallbackUrl) ? null : fallbackUrl;
  }
}
