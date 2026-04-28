import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ChatPrivacyMode = "normal" | "hide_messages" | "hide_all";

const LS_KEY = "chat_privacy_mode";
const EVT = "chat_privacy_mode_change";

function readInitial(): ChatPrivacyMode {
  try {
    const cached = localStorage.getItem(LS_KEY) as ChatPrivacyMode | null;
    if (cached === "normal" || cached === "hide_messages" || cached === "hide_all") {
      return cached;
    }
  } catch {}
  return "normal";
}

// Global in-memory store shared across all hook instances + tabs
let currentMode: ChatPrivacyMode = readInitial();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === LS_KEY && e.newValue) {
      const v = e.newValue as ChatPrivacyMode;
      if (v === "normal" || v === "hide_messages" || v === "hide_all") {
        currentMode = v;
        emit();
      }
    }
  };
  const onCustom = () => cb();
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVT, onCustom);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVT, onCustom);
  };
}

function getSnapshot() {
  return currentMode;
}

function setGlobalMode(next: ChatPrivacyMode) {
  currentMode = next;
  try { localStorage.setItem(LS_KEY, next); } catch {}
  window.dispatchEvent(new Event(EVT));
  emit();
}

let dbHydrated = false;
async function hydrateFromDB() {
  if (dbHydrated) return;
  dbHydrated = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("chat_privacy_mode")
      .eq("id", user.id)
      .maybeSingle();
    const remote = (data as any)?.chat_privacy_mode as ChatPrivacyMode | undefined;
    if (remote && remote !== currentMode) {
      setGlobalMode(remote);
    }
  } catch {}
}

/**
 * Hook para gerenciar o modo de privacidade visual do chat.
 * Estado compartilhado globalmente via useSyncExternalStore.
 */
export function useChatPrivacy() {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => { hydrateFromDB(); }, []);

  const setMode = useCallback(async (next: ChatPrivacyMode) => {
    setGlobalMode(next);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("profiles")
        .update({ chat_privacy_mode: next } as any)
        .eq("id", user.id);
    } catch {}
  }, []);

  return {
    mode,
    setMode,
    hideMessages: mode === "hide_messages" || mode === "hide_all",
    hideIdentity: mode === "hide_all",
  };
}
