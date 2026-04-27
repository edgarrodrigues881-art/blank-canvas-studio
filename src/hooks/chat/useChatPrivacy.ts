import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ChatPrivacyMode = "normal" | "hide_messages" | "hide_all";

const LS_KEY = "chat_privacy_mode";

/**
 * Hook para gerenciar o modo de privacidade visual do chat.
 * - normal: mostra tudo
 * - hide_messages: esconde só o conteúdo das mensagens (lista + bolhas)
 * - hide_all: esconde nome, foto e mensagens
 *
 * Persistência: profiles.chat_privacy_mode (sincroniza entre dispositivos),
 * com cache em localStorage para resposta imediata.
 */
export function useChatPrivacy() {
  const [mode, setModeState] = useState<ChatPrivacyMode>(() => {
    try {
      const cached = localStorage.getItem(LS_KEY) as ChatPrivacyMode | null;
      if (cached === "normal" || cached === "hide_messages" || cached === "hide_all") {
        return cached;
      }
    } catch {}
    return "normal";
  });

  // Carrega do banco na montagem
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from("profiles")
        .select("chat_privacy_mode")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const remote = (data as any)?.chat_privacy_mode as ChatPrivacyMode | undefined;
      if (remote && remote !== mode) {
        setModeState(remote);
        try { localStorage.setItem(LS_KEY, remote); } catch {}
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMode = useCallback(async (next: ChatPrivacyMode) => {
    setModeState(next);
    try { localStorage.setItem(LS_KEY, next); } catch {}
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ chat_privacy_mode: next } as any)
      .eq("id", user.id);
  }, []);

  return {
    mode,
    setMode,
    hideMessages: mode === "hide_messages" || mode === "hide_all",
    hideIdentity: mode === "hide_all",
  };
}
