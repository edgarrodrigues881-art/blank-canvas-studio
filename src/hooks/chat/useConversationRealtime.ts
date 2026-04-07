import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealConversation, RealMessage } from "./useConversations";

interface UseConversationRealtimeParams {
  user: { id: string } | null;
  conversationsRef: React.MutableRefObject<RealConversation[]>;
  selectedConvIdRef: React.MutableRefObject<string | null>;
  setConversations: React.Dispatch<React.SetStateAction<RealConversation[]>>;
  setMessages: React.Dispatch<React.SetStateAction<RealMessage[]>>;
  upsertConversationInState: (items: RealConversation[], row: any) => RealConversation[];
  sortConversations: (items: RealConversation[]) => RealConversation[];
  getConversationContactKey: (conv: { phone?: string | null; remote_jid?: string | null }) => string;
  getConversationIdsForSameContact: (convId: string) => string[];
  markConversationGroupAsRead: (convId: string) => Promise<void>;
  updateStatus: (convId: string, newStatus: string) => Promise<void>;
  isOwnDevice: (phone: string | null | undefined) => boolean;
}

/**
 * useConversationRealtime
 * Manages Supabase real-time subscriptions for conversations and messages.
 */
export function useConversationRealtime({
  user,
  conversationsRef,
  selectedConvIdRef,
  setConversations,
  setMessages,
  upsertConversationInState,
  sortConversations,
  getConversationContactKey,
  getConversationIdsForSameContact,
  markConversationGroupAsRead,
  updateStatus,
  isOwnDevice,
}: UseConversationRealtimeParams) {

  // Real-time — conversations table
  useEffect(() => {
    if (!user) return;

    const isInternalConversation = (row: any) =>
      isOwnDevice(row.phone) || isOwnDevice(row.remote_jid?.split("@")[0]);

    const channel = supabase
      .channel(`conv-list-rt-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversations", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as any;
          if (isInternalConversation(row)) {
            setConversations((prev) => prev.filter((c) => c.id !== row.id));
            return;
          }
          setConversations((prev) => upsertConversationInState(prev.filter((c) => c.id !== row.id), row));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as any;
          if (isInternalConversation(row)) {
            setConversations((prev) => prev.filter((c) => c.id !== row.id));
            return;
          }
          setConversations((prev) => {
            const exists = prev.some((c) => c.id === row.id);
            const isSelectedConversation = row.id === selectedConvIdRef.current;
            const selectedConversation = prev.find((c) => c.id === selectedConvIdRef.current);
            const selectedKey = selectedConversation ? getConversationContactKey(selectedConversation) : "";
            const rowKey = getConversationContactKey(row);
            const shouldKeepRead = Boolean(selectedKey && rowKey && selectedKey === rowKey);

            if (!exists) {
              return upsertConversationInState(prev, {
                ...row,
                unread_count: isSelectedConversation || shouldKeepRead ? 0 : row.unread_count,
              });
            }

            return sortConversations(
              prev.map((c) => c.id === row.id ? {
                ...c,
                last_message: row.last_message ?? c.last_message,
                last_message_at: row.last_message_at ?? c.last_message_at,
                unread_count: isSelectedConversation || shouldKeepRead ? 0 : (row.unread_count ?? c.unread_count),
                name: row.name ?? c.name,
                avatar_url: row.avatar_url ?? c.avatar_url,
                attending_status: row.attending_status ?? c.attending_status,
                tags: row.tags ?? c.tags,
                category: row.category ?? c.category,
                notes: row.notes ?? c.notes,
                updated_at: row.updated_at ?? c.updated_at,
              } : c)
            );
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, upsertConversationInState, sortConversations, getConversationContactKey, setConversations, selectedConvIdRef, isOwnDevice]);

  // Real-time — messages table
  useEffect(() => {
    if (!user) return;

    const notifAudio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVoGAACAgICAgICAgICAgICBgYKDhIWGh4iJiouMjY6PkJGSk5SVlpeYmZqbnJ2en6ChoqOkpaanqKmqq6ytrq+wsbKztLW2t7i5uru8vb6/wMHCw8TFxsfIycrLzM3Oz9DR0tPU1dbX2Nna29zd3t/g4eLj5OXm5+jp6uvs7e7v8PHy8/T19vf4+fr7/P3+/v/+/v38+/r5+Pf29fTz8vHw7+7t7Ovq6ejn5uXk4+Lh4N/e3dzb2tnY19bV1NPS0dDPzs3My8rJyMfGxcTDwsHAv769vLu6ubm4t7a1tLOysbCvrq2sq6qpqKempaSjoqGgn56dnJuamZiXlpWUk5KRkI+OjYyLiomIh4aFhIOCgYCAgA==");
    notifAudio.volume = 0.3;

    const channel = supabase
      .channel(`conv-msgs-rt-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_messages", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const newMsg = payload.new as RealMessage & { origin?: string };
          // Skip warmup/autosave messages
          if ((newMsg as any).origin === "warmup") return;
          const selectedId = selectedConvIdRef.current;
          const isOpenConversation = Boolean(
            selectedId && (
              newMsg.conversation_id === selectedId ||
              getConversationIdsForSameContact(selectedId).includes(newMsg.conversation_id)
            )
          );

          setConversations((prev) => {
            const target = prev.find((c) => c.id === newMsg.conversation_id);
            if (!target) return prev;

            const nextUnreadCount = newMsg.direction === "received"
              ? (isOpenConversation ? 0 : (target.unread_count ?? 0) + 1)
              : target.unread_count;

            return sortConversations(
              prev.map((c) =>
                c.id === newMsg.conversation_id
                  ? {
                      ...c,
                      last_message: newMsg.content ?? c.last_message,
                      last_message_at: newMsg.created_at ?? c.last_message_at,
                      unread_count: nextUnreadCount,
                    }
                  : c
              )
            );
          });

          if (isOpenConversation) {
            const deviceName = conversationsRef.current.find((c) => c.id === newMsg.conversation_id)?.deviceName;
            const enrichedMsg = { ...newMsg, deviceName };

            setMessages((prev) => {
              if (prev.some((m) => m.id === enrichedMsg.id)) return prev;
              if (enrichedMsg.direction === "sent") {
                const newTime = new Date(enrichedMsg.created_at).getTime();
                const isDuplicate = prev.some((m) =>
                  m.direction === "sent" &&
                  m.content === enrichedMsg.content &&
                  m.conversation_id === enrichedMsg.conversation_id &&
                  Math.abs(new Date(m.created_at).getTime() - newTime) < 30000
                );
                if (isDuplicate) {
                  return prev.map((m) =>
                    m.direction === "sent" &&
                    m.content === enrichedMsg.content &&
                    m.conversation_id === enrichedMsg.conversation_id &&
                    Math.abs(new Date(m.created_at).getTime() - newTime) < 30000
                      ? { ...m, id: enrichedMsg.id, status: enrichedMsg.status || m.status }
                      : m
                  );
                }
              }
              return [...prev, enrichedMsg];
            });
          }

          if (newMsg.direction === "received") {
            if (!isOpenConversation) {
              notifAudio.currentTime = 0;
              notifAudio.play().catch(() => {});

              if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                const conv = conversationsRef.current.find((c) => c.id === newMsg.conversation_id);
                const title = conv?.name || "Nova mensagem";
                const body = newMsg.content?.substring(0, 100) || "📩 Nova mensagem recebida";
                try {
                  new Notification(title, {
                    body,
                    icon: conv?.avatar_url || "/placeholder.svg",
                    tag: `msg-${newMsg.conversation_id}`,
                    silent: true,
                  });
                } catch {}
              }
            } else {
              void markConversationGroupAsRead(newMsg.conversation_id);
            }

            const conv = conversationsRef.current.find((c) => c.id === newMsg.conversation_id);
            if (conv && (conv.attending_status === "nova" || conv.attending_status === "aguardando")) {
              updateStatus(newMsg.conversation_id, "em_atendimento");
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversation_messages", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const updated = payload.new as RealMessage;
          const selectedId = selectedConvIdRef.current;
          if (selectedId && (updated.conversation_id === selectedId || getConversationIdsForSameContact(selectedId).includes(updated.conversation_id))) {
            setMessages((prev) =>
              prev.map((m) => (m.id === updated.id ? { ...m, ...updated, direction: updated.direction as "sent" | "received" } : m))
            );
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, updateStatus, getConversationIdsForSameContact, markConversationGroupAsRead, conversationsRef, selectedConvIdRef, setMessages, setConversations, sortConversations]);
}
