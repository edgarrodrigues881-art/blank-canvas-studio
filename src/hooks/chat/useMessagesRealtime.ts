import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCrmSync } from "@/hooks/useCrmSync";
import type { RealMessage } from "./useConversations";
import type { MessagesRealtimeParams } from "./realtime-types";

const NOTIF_AUDIO_DATA_URI =
  "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVoGAACAgICAgICAgICAgICBgYKDhIWGh4iJiouMjY6PkJGSk5SVlpeYmZqbnJ2en6ChoqOkpaanqKmqq6ytrq+wsbKztLW2t7i5uru8vb6/wMHCw8TFxsfIycrLzM3Oz9DR0tPU1dbX2Nna29zd3t/g4eLj5OXm5+jp6uvs7e7v8PHy8/T19vf4+fr7/P3+/v/+/v38+/r5+Pf29fTz8vHw7+7t7Ovq6ejn5uXk4+Lh4N/e3dzb2tnY19bV1NPS0dDPzs3My8rJyMfGxcTDwsHAv769vLu6ubm4t7a1tLOysbCvrq2sq6qpqKempaSjoqGgn56dnJuamZiXlpWUk5KRkI+OjYyLiomIh4aFhIOCgYCAgA==";

/**
 * useMessagesRealtime
 * Owns the realtime channel for the `conversation_messages` table:
 *  - INSERT: patches the conversation summary, appends/dedupes message,
 *            plays notification sound, fires desktop notification, and
 *            auto-promotes attending_status to "em_atendimento".
 *  - UPDATE: patches a single message in the open conversation.
 */
export function useMessagesRealtime({
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
}: MessagesRealtimeParams) {
  const { syncToSheets, syncToNotion } = useCrmSync();

  useEffect(() => {
    if (!user) return;

    const notifAudio = new Audio(NOTIF_AUDIO_DATA_URI);
    notifAudio.volume = 0.3;

    const channel = supabase
      .channel(`conv-msgs-rt-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_messages", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const newMsg = payload.new as RealMessage & { origin?: string };
          const selectedId = selectedConvIdRef.current;
          const isOpenConversation = Boolean(
            selectedId && (
              newMsg.conversation_id === selectedId ||
              getConversationIdsForSameContact(selectedId).includes(newMsg.conversation_id)
            )
          );

          setConversations((prev) => {
            const target = prev.find((c) => c.id === newMsg.conversation_id);
            if (!target) {
              // Brand-new conversation created by the webhook — fetch it once
              // so it shows up in the list.
              supabase
                .from("conversations")
                .select("*, devices!conversations_device_id_fkey(name)")
                .eq("id", newMsg.conversation_id)
                .maybeSingle()
                .then(({ data }) => {
                  if (data) {
                    setConversations((cur) =>
                      sortConversations(upsertConversationInState(cur, data))
                    );
                  }
                });
              return prev;
            }

            const nextUnreadCount = newMsg.direction === "received"
              ? (isOpenConversation ? 0 : (target.unread_count ?? 0) + 1)
              : 0;

            return sortConversations(
              prev.map((c) =>
                c.id === newMsg.conversation_id
                  ? {
                      ...c,
                      last_message: newMsg.content ?? c.last_message,
                      last_message_at: newMsg.created_at ?? c.last_message_at,
                      unread_count: nextUnreadCount,
                      last_message_direction: newMsg.direction,
                      last_message_status: newMsg.status ?? c.last_message_status,
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
            const currentConv = conversationsRef.current.find((c) => c.id === newMsg.conversation_id);
            
            // Sincronização em segundo plano para mensagens recebidas
            syncToSheets({
              name: currentConv?.name || "Cliente",
              phone: currentConv?.phone || "",
              lastMessage: newMsg.content || "",
              status: currentConv?.attending_status || "nova",
              origin: "WhatsApp",
              timestamp: newMsg.created_at
            });

            syncToNotion({
              name: currentConv?.name || "Cliente",
              phone: currentConv?.phone || "",
              content: newMsg.content || "",
              type: "message"
            });

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
              notifyTabs({ type: "conv-read", convId: newMsg.conversation_id, userId: user.id, ts: Date.now() });
            }

            const conv = conversationsRef.current.find((c) => c.id === newMsg.conversation_id);
            if (conv && (conv.attending_status === "nova" || conv.attending_status === "aguardando")) {
              updateStatus(newMsg.conversation_id, "em_atendimento");
            }
          }

          notifyTabs({
            type: "msg-inserted",
            convId: newMsg.conversation_id,
            userId: user.id,
            ts: Date.now(),
          });
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
  }, [
    user,
    updateStatus,
    getConversationIdsForSameContact,
    markConversationGroupAsRead,
    conversationsRef,
    selectedConvIdRef,
    setMessages,
    setConversations,
    sortConversations,
    upsertConversationInState,
    notifyTabs,
  ]);
}
