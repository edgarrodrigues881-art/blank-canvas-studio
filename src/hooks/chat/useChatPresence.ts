import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Sends WhatsApp "typing..." / "recording..." presence indicators while the
 * agent interacts with the chat input. Mirrors the autoreply humanization.
 *
 * - Typing: triggered while user is editing the textarea (debounced).
 * - Recording: triggered while the audio recorder is active.
 * - Each call asks UAZAPI to keep the presence for ~8s; we refresh it
 *   periodically so it stays visible until the user pauses or sends.
 */
type PresenceKind = "composing" | "recording" | "paused";

const REFRESH_MS = 6000;
const HOLD_MS = 8000;
const TYPING_IDLE_MS = 1200;

function fire(conversationId: string, kind: PresenceKind, delayMs = HOLD_MS) {
  // Fire-and-forget; do not await so the UI never blocks on network.
  void supabase.functions.invoke("chat-presence", {
    body: { conversation_id: conversationId, kind, delay_ms: delayMs },
  }).catch(() => { /* silent */ });
}

export function useChatPresence(params: {
  conversationId?: string;
  input: string;
  isRecording: boolean;
}) {
  const { conversationId, input, isRecording } = params;
  const lastInputRef = useRef(input);
  const typingIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeKindRef = useRef<PresenceKind | null>(null);

  // Helper to start/stop the periodic refresher.
  const startRefresher = (kind: "composing" | "recording") => {
    activeKindRef.current = kind;
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(() => {
      if (!conversationId) return;
      fire(conversationId, kind);
    }, REFRESH_MS);
  };
  const stopRefresher = () => {
    if (refreshTimer.current) { clearInterval(refreshTimer.current); refreshTimer.current = null; }
    if (conversationId && activeKindRef.current && activeKindRef.current !== "paused") {
      fire(conversationId, "paused", 0);
    }
    activeKindRef.current = null;
  };

  // ── Recording presence ──
  useEffect(() => {
    if (!conversationId) return;
    if (isRecording) {
      fire(conversationId, "recording");
      startRefresher("recording");
    } else if (activeKindRef.current === "recording") {
      stopRefresher();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, conversationId]);

  // ── Typing presence ──
  useEffect(() => {
    if (!conversationId) return;
    // Recording overrides typing.
    if (isRecording) return;

    const changed = input !== lastInputRef.current;
    lastInputRef.current = input;

    if (changed && input.trim().length > 0) {
      if (activeKindRef.current !== "composing") {
        fire(conversationId, "composing");
        startRefresher("composing");
      }
      if (typingIdleTimer.current) clearTimeout(typingIdleTimer.current);
      typingIdleTimer.current = setTimeout(() => {
        stopRefresher();
      }, TYPING_IDLE_MS);
    }

    if (input.trim().length === 0 && activeKindRef.current === "composing") {
      if (typingIdleTimer.current) clearTimeout(typingIdleTimer.current);
      stopRefresher();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, conversationId, isRecording]);

  // Cleanup on unmount or conversation switch.
  useEffect(() => {
    return () => {
      if (typingIdleTimer.current) clearTimeout(typingIdleTimer.current);
      stopRefresher();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);
}
