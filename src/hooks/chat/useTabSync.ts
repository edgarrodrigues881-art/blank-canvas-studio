import { useEffect, useRef, useCallback } from "react";
import type { TabSyncEvent } from "./realtime-types";

const CHANNEL_NAME = "conv-sync";

/**
 * useTabSync
 * Thin wrapper over BroadcastChannel("conv-sync") to coordinate multiple
 * open tabs of the same user. Lets one tab notify the others that data
 * already changed locally — so the others can patch state without each
 * issuing its own DB fetch.
 *
 * Falls back to a no-op when BroadcastChannel is unavailable (older browsers).
 */
export function useTabSync(
  userId: string | null | undefined,
  onMessage: (event: TabSyncEvent) => void
) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  // Tag every outgoing event so we can ignore our own echoes if the browser
  // ever delivers them back. Spec says it shouldn't, but be defensive.
  const tabIdRef = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  );
  const onMessageRef = useRef(onMessage);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = ch;

    const handler = (e: MessageEvent) => {
      const data = e.data as (TabSyncEvent & { __tab?: string }) | undefined;
      if (!data || data.__tab === tabIdRef.current) return;
      if (userId && "userId" in data && data.userId !== userId) return;
      onMessageRef.current(data);
    };
    ch.addEventListener("message", handler);

    return () => {
      ch.removeEventListener("message", handler);
      ch.close();
      channelRef.current = null;
    };
  }, [userId]);

  const notifyTabs = useCallback((event: TabSyncEvent) => {
    const ch = channelRef.current;
    if (!ch) return;
    try {
      ch.postMessage({ ...event, __tab: tabIdRef.current });
    } catch {
      // Channel can be closed mid-flight (e.g. tab unloading) — ignore.
    }
  }, []);

  return { notifyTabs };
}
