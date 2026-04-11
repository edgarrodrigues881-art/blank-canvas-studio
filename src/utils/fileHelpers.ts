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
