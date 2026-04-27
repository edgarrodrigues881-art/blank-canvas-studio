/**
 * File & media helper functions — no React dependencies.
 */

/** Emoji icon based on file extension */
export function getFileIcon(name: string): string {
  if (/\.pdf$/i.test(name)) return "📄";
  if (/\.(docx?|odt)$/i.test(name)) return "📝";
  if (/\.(xlsx?|csv)$/i.test(name)) return "📊";
  if (/\.(pptx?|odp)$/i.test(name)) return "📑";
  if (/\.(zip|rar|7z|tar)$/i.test(name)) return "📦";
  return "📎";
}

/** Check if message content is a media placeholder (not real text) */
export function isMediaPlaceholder(content: string | undefined | null): boolean {
  if (!content) return true;
  const lower = content.toLowerCase().trim();
  const exactPlaceholders = [
    "[image]", "[foto]", "[audio]", "[áudio]", "[ptt]",
    "[video]", "[vídeo]", "[document]", "[documento]", "[arquivo]",
    "[sticker]", "[figurinha]", "[contact]", "[contato]",
    "[location]", "[localização]", "[mensagem]",
    "🎧 áudio", "📷 foto", "🎬 vídeo", "📎 arquivo",
    "🏷️ figurinha", "👤 contato", "📍 localização",
  ];
  return exactPlaceholders.some(p => lower === p);
}

/** Extract icon + label for media message previews */
export function getMessagePreview(msg: string | undefined | null): { icon: string; text: string } | null {
  if (!msg) return null;
  const lower = msg.toLowerCase().trim();

  // View-once detection (WhatsApp "ver uma vez")
  // Patterns commonly seen: "[view_once]", "view_once", "[Undecryptable] [media] [view_once]", "[ViewOnce]"
  const isViewOnce = lower.includes("view_once") || lower.includes("viewonce") || lower.includes("[view once]");
  // Undecryptable (E2E protected media we can't decrypt without device)
  const isUndecryptable = lower.includes("[undecryptable]") || lower.includes("undecryptable");

  if (isViewOnce) {
    if (lower.includes("audio") || lower.includes("áudio") || lower.includes("[ptt]"))
      return { icon: "👁️", text: "Áudio de visualização única" };
    if (lower.includes("video") || lower.includes("vídeo"))
      return { icon: "👁️", text: "Vídeo de visualização única" };
    if (lower.includes("image") || lower.includes("foto") || lower.includes("photo"))
      return { icon: "👁️", text: "Foto de visualização única" };
    // generic media view-once
    if (lower.includes("[media]") || lower.includes("media"))
      return { icon: "👁️", text: "Mídia de visualização única" };
    return { icon: "👁️", text: "Visualização única" };
  }

  if (isUndecryptable) {
    if (lower.includes("audio") || lower.includes("áudio") || lower.includes("[ptt]"))
      return { icon: "🔒", text: "Áudio protegido" };
    if (lower.includes("video") || lower.includes("vídeo"))
      return { icon: "🔒", text: "Vídeo protegido" };
    if (lower.includes("image") || lower.includes("foto"))
      return { icon: "🔒", text: "Foto protegida" };
    if (lower.includes("[media]") || lower.includes("media"))
      return { icon: "🔒", text: "Mídia protegida" };
    if (lower.includes("[text]"))
      return { icon: "🔒", text: "Mensagem protegida" };
    return { icon: "🔒", text: "Mensagem criptografada" };
  }

  if (lower.includes("[image]") || lower.includes("[foto]") || lower === "image" || lower === "foto")
    return { icon: "📷", text: "Foto" };
  if (lower.includes("[audio]") || lower.includes("[áudio]") || lower === "audio" || lower === "áudio" || lower.includes("[ptt]"))
    return { icon: "🎧", text: "Áudio" };
  if (lower.includes("[video]") || lower.includes("[vídeo]") || lower === "video" || lower === "vídeo")
    return { icon: "🎬", text: "Vídeo" };
  if (lower.includes("[document]") || lower.includes("[documento]") || lower.includes("[arquivo]") || lower === "document" || lower === "documento")
    return { icon: "📎", text: "Arquivo" };
  if (lower.includes("[sticker]") || lower.includes("[figurinha]") || lower === "sticker")
    return { icon: "🏷️", text: "Figurinha" };
  if (lower.includes("[contact]") || lower.includes("[contato]"))
    return { icon: "👤", text: "Contato" };
  if (lower.includes("[location]") || lower.includes("[localização]"))
    return { icon: "📍", text: "Localização" };
  return null;
}
