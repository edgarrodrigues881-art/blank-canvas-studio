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
    "[mensagem apagada]", "[mensagem editada]", "[mensagem temporária]",
    "[mensagem de visualização única]", "[evento do whatsapp]",
    "[enquete]", "[voto em enquete]", "[reação removida]",
    "[localização ao vivo]", "[convite de grupo]", "[chamada]",
    "[configuração de mensagens temporárias]",
    "🎧 áudio", "📷 foto", "🎬 vídeo", "📎 arquivo",
    "🏷️ figurinha", "👤 contato", "📍 localização",
  ];
  if (exactPlaceholders.some(p => lower === p)) return true;
  // Reaction with emoji: "[reação] 👍"
  if (lower.startsWith("[reação]") || lower.startsWith("[reacao]")) return true;
  return false;
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

  // Exact emoji+word placeholders the backend writes (e.g. "🏷️ Figurinha", "📷 Foto").
  // We match on equality (after lower+trim) so we do NOT mistake real text like
  // "Manda essa figurinha aí depois" for a media message.
  const emojiPlaceholders: Record<string, { icon: string; text: string }> = {
    "🏷️ figurinha": { icon: "🏷️", text: "Figurinha" },
    "🏷 figurinha": { icon: "🏷️", text: "Figurinha" },
    "📷 foto": { icon: "📷", text: "Foto" },
    "🖼️ imagem": { icon: "📷", text: "Foto" },
    "🖼 imagem": { icon: "📷", text: "Foto" },
    "🎬 vídeo": { icon: "🎬", text: "Vídeo" },
    "🎬 video": { icon: "🎬", text: "Vídeo" },
    "🎧 áudio": { icon: "🎧", text: "Áudio" },
    "🎧 audio": { icon: "🎧", text: "Áudio" },
    "🎤 áudio": { icon: "🎧", text: "Áudio" },
    "📎 arquivo": { icon: "📎", text: "Arquivo" },
    "📄 documento": { icon: "📎", text: "Documento" },
    "👤 contato": { icon: "👤", text: "Contato" },
    "📍 localização": { icon: "📍", text: "Localização" },
    "📍 localizacao": { icon: "📍", text: "Localização" },
    "[mensagem]": { icon: "💬", text: "Mensagem (não suportada por este app)" },
    "[mensagem apagada]": { icon: "🚫", text: "Mensagem apagada" },
    "[mensagem editada]": { icon: "✏️", text: "Mensagem editada" },
    "[mensagem temporária]": { icon: "⏳", text: "Mensagem temporária" },
    "[mensagem de visualização única]": { icon: "👁️", text: "Visualização única" },
    "[evento do whatsapp]": { icon: "ℹ️", text: "Evento do WhatsApp" },
    "[configuração de mensagens temporárias]": { icon: "⏱️", text: "Mensagens temporárias ativadas" },
    "[enquete]": { icon: "📊", text: "Enquete" },
    "[voto em enquete]": { icon: "🗳️", text: "Voto em enquete" },
    "[reação removida]": { icon: "💔", text: "Reação removida" },
    "[localização ao vivo]": { icon: "📍", text: "Localização ao vivo" },
    "[convite de grupo]": { icon: "👥", text: "Convite de grupo" },
    "[chamada]": { icon: "📞", text: "Chamada" },
  };
  if (emojiPlaceholders[lower]) return emojiPlaceholders[lower];

  // Reaction with emoji: "[reação] 👍" → show the emoji as the icon
  const reactionMatch = lower.match(/^\[rea[cç]ão\]\s*(.+)$/);
  if (reactionMatch) {
    return { icon: reactionMatch[1].trim() || "❤️", text: "Reagiu à mensagem" };
  }

  if (lower === "[image]" || lower === "[foto]" || lower === "image" || lower === "foto")
    return { icon: "📷", text: "Foto" };
  if (lower === "[audio]" || lower === "[áudio]" || lower === "audio" || lower === "áudio" || lower === "[ptt]")
    return { icon: "🎧", text: "Áudio" };
  if (lower === "[video]" || lower === "[vídeo]" || lower === "video" || lower === "vídeo")
    return { icon: "🎬", text: "Vídeo" };
  if (lower === "[document]" || lower === "[documento]" || lower === "[arquivo]" || lower === "document" || lower === "documento")
    return { icon: "📎", text: "Arquivo" };
  if (lower === "[sticker]" || lower === "[figurinha]" || lower === "sticker")
    return { icon: "🏷️", text: "Figurinha" };
  if (lower === "[contact]" || lower === "[contato]")
    return { icon: "👤", text: "Contato" };
  if (lower === "[location]" || lower === "[localização]")
    return { icon: "📍", text: "Localização" };
  return null;
}
