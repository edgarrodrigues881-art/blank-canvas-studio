import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  ConversationListRealtimeParams,
  ConversationRow,
  PendingConversationUpdates,
} from "./realtime-types";

const DEBOUNCE_MS = 150;

/**
 * useConversationListRealtime
 * Owns the realtime channel for the `conversations` table:
 *  - INSERT: upserts new conversation into state
 *  - UPDATE: coalesces rapid bursts via 150ms debounce, then patches in-place
 *  - Internal/archived rows are routed to the archived list
 *
 * Also flips `realtimeConnectedRef` so the polling fallback knows whether
 * realtime is healthy.
 */
export function useConversationListRealtime({
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
}: ConversationListRealtimeParams) {
  const pendingRef = useRef<PendingConversationUpdates>(new Map());
  const debounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user) return;

    const isInternalConversation = (row: ConversationRow) =>
      isOwnDevice(row.phone) || isOwnDevice(row.remote_jid?.split("@")[0]);

    const moveRowToArchived = (row: ConversationRow) => {
      if (row.status !== "archived") {
        supabase.from("conversations").update({ status: "archived" } as any).eq("id", row.id).then(() => {});
      }
      setConversations((prev) => prev.filter((c) => c.id !== row.id));
      setArchivedConversations((prev) =>
        upsertConversationInState(prev.filter((c) => c.id !== row.id), { ...row, status: "archived" })
      );
    };

    const flushUpdates = () => {
      debounceTimerRef.current = null;
      const updates = Array.from(pendingRef.current.values());
      pendingRef.current.clear();
      if (updates.length === 0) return;

      const updateById = new Map(updates.map((u) => [u.id, u]));

      setArchivedConversations((prev) => prev.filter((c) => !updateById.has(c.id)));
      setConversations((prev) => {
        const selectedId = selectedConvIdRef.current;
        const selectedConversation = prev.find((c) => c.id === selectedId);
        const selectedKey = selectedConversation ? getConversationContactKey(selectedConversation) : "";

        const existingIds = new Set(prev.map((c) => c.id));
        let next = prev.map((c) => {
          const row = updateById.get(c.id);
          if (!row) return c;

          const isSelectedConversation = c.id === selectedId;
          const rowKey = getConversationContactKey(row);
          const shouldKeepRead = Boolean(selectedKey && rowKey && selectedKey === rowKey);
          const sentRecently =
            c.last_message_direction === "sent" &&
            Date.now() - new Date(c.last_message_at || 0).getTime() < 2 * 60 * 1000;
          const preserveUnreadFromOwnSend = sentRecently && (row.unread_count ?? 0) > (c.unread_count ?? 0);
          const keepUnreadZero = isSelectedConversation || shouldKeepRead || preserveUnreadFromOwnSend;

          return {
            ...c,
            last_message: row.last_message ?? c.last_message,
            last_message_at: row.last_message_at ?? c.last_message_at,
            unread_count: keepUnreadZero ? 0 : (row.unread_count ?? c.unread_count),
            name: row.name ?? c.name,
            avatar_url: row.avatar_url ?? c.avatar_url,
            attending_status: row.attending_status ?? c.attending_status,
            tags: row.tags ?? c.tags,
            category: row.category ?? c.category,
            notes: row.notes ?? c.notes,
            updated_at: row.updated_at ?? c.updated_at,
            last_message_direction: row.last_message_direction ?? c.last_message_direction,
            last_message_status: row.last_message_status ?? c.last_message_status,
            status: row.status ?? c.status,
          };
        });

        for (const row of updates) {
          if (existingIds.has(row.id)) continue;
          const isSelectedConversation = row.id === selectedId;
          const rowKey = getConversationContactKey(row);
          const shouldKeepRead = Boolean(selectedKey && rowKey && selectedKey === rowKey);
          next = upsertConversationInState(next, {
            ...row,
            unread_count: isSelectedConversation || shouldKeepRead ? 0 : row.unread_count,
          });
        }

        const needsSort = updates.some((u) => u.last_message_at);
        return needsSort ? sortConversations(next) : next;
      });

      // Tell other tabs that conversation list state already moved on.
      for (const row of updates) {
        notifyTabs({ type: "conv-updated", convId: row.id, userId: user.id, ts: Date.now() });
      }
    };

    const channel = supabase
      .channel(`conv-list-rt-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversations", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as ConversationRow;
          if (isInternalConversation(row) || row.status === "archived") {
            moveRowToArchived(row);
            return;
          }
          setArchivedConversations((prev) => prev.filter((c) => c.id !== row.id));
          setConversations((prev) => upsertConversationInState(prev.filter((c) => c.id !== row.id), row));
          notifyTabs({ type: "conv-updated", convId: row.id, userId: user.id, ts: Date.now() });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as ConversationRow;
          if (isInternalConversation(row) || row.status === "archived") {
            moveRowToArchived(row);
            return;
          }

          pendingRef.current.set(row.id, row);
          if (debounceTimerRef.current !== null) return;
          debounceTimerRef.current = window.setTimeout(flushUpdates, DEBOUNCE_MS);
        }
      )
      .subscribe((status) => {
        realtimeConnectedRef.current = status === "SUBSCRIBED";
      });

    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      pendingRef.current.clear();
      realtimeConnectedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [
    user,
    upsertConversationInState,
    sortConversations,
    getConversationContactKey,
    setConversations,
    setArchivedConversations,
    selectedConvIdRef,
    realtimeConnectedRef,
    isOwnDevice,
    notifyTabs,
  ]);
}
