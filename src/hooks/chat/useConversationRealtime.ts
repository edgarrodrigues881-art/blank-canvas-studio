import { useCallback, useRef } from "react";
import { useConversationListRealtime } from "./useConversationListRealtime";
import { useMessagesRealtime } from "./useMessagesRealtime";
import { useTabSync } from "./useTabSync";
import type { RealConversation, RealMessage } from "./useConversations";
import type { ConversationRow, TabSyncEvent } from "./realtime-types";

interface UseConversationRealtimeParams {
  user: { id: string } | null;
  conversationsRef: React.MutableRefObject<RealConversation[]>;
  selectedConvIdRef: React.MutableRefObject<string | null>;
  realtimeConnectedRef: React.MutableRefObject<boolean>;
  setConversations: React.Dispatch<React.SetStateAction<RealConversation[]>>;
  setArchivedConversations: React.Dispatch<React.SetStateAction<RealConversation[]>>;
  setMessages: React.Dispatch<React.SetStateAction<RealMessage[]>>;
  upsertConversationInState: (items: RealConversation[], row: ConversationRow) => RealConversation[];
  sortConversations: (items: RealConversation[]) => RealConversation[];
  getConversationContactKey: (conv: { phone?: string | null; remote_jid?: string | null }) => string;
  getConversationIdsForSameContact: (convId: string) => string[];
  markConversationGroupAsRead: (convId: string) => Promise<void>;
  updateStatus: (convId: string, newStatus: string) => Promise<void>;
  isOwnDevice: (phone: string | null | undefined) => boolean;
  fetchConversations: () => Promise<void> | void;
}

/**
 * useConversationRealtime — orchestrator
 * Composes the three realtime concerns:
 *  1. Conversation list channel (debounced UPDATEs)
 *  2. Messages channel (immediate INSERT/UPDATE)
 *  3. Cross-tab BroadcastChannel sync
 *
 * Cross-tab strategy: when another tab tells us the DB state already moved
 * on, we trigger a single light refetch instead of relying on each tab's
 * own realtime subscription. This avoids N tabs × N events redundancy.
 */
export function useConversationRealtime({
  user,
  conversationsRef,
  selectedConvIdRef,
  realtimeConnectedRef,
  setConversations,
  setArchivedConversations,
  setMessages,
  upsertConversationInState,
  sortConversations,
  getConversationContactKey,
  getConversationIdsForSameContact,
  markConversationGroupAsRead,
  updateStatus,
  isOwnDevice,
  fetchConversations,
}: UseConversationRealtimeParams) {
  // Coalesce cross-tab notifications into a single refetch per ~250ms
  const tabRefetchTimerRef = useRef<number | null>(null);

  const handleTabEvent = useCallback((event: TabSyncEvent) => {
    if (event.type !== "conv-updated" && event.type !== "msg-inserted") return;
    if (tabRefetchTimerRef.current !== null) return;
    tabRefetchTimerRef.current = window.setTimeout(() => {
      tabRefetchTimerRef.current = null;
      void fetchConversations();
    }, 250);
  }, [fetchConversations]);

  const { notifyTabs } = useTabSync(user?.id ?? null, handleTabEvent);

  useConversationListRealtime({
    user,
    selectedConvIdRef,
    realtimeConnectedRef,
    setConversations,
    setArchivedConversations,
    upsertConversationInState,
    sortConversations,
    getConversationContactKey,
    isOwnDevice,
    notifyTabs,
  });

  useMessagesRealtime({
    user,
    conversationsRef,
    selectedConvIdRef,
    setConversations,
    setMessages,
    upsertConversationInState,
    sortConversations,
    getConversationIdsForSameContact,
    markConversationGroupAsRead,
    updateStatus,
    notifyTabs,
  });
}
