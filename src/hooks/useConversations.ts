import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export interface RealConversation {
  id: string;
  user_id: string;
  device_id: string | null;
  remote_jid: string;
  name: string;
  phone: string;
  avatar_url: string | null;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  status: string;
  attending_status: string;
  tags: string[];
  category: string | null;
  email: string | null;
  company: string | null;
  notes: string | null;
  origin: string;
  created_at: string;
  updated_at: string;
  last_message_status?: string;
  last_message_direction?: string;
  // joined
  deviceName?: string;
}

export interface RealMessage {
  id: string;
  conversation_id: string;
  content: string;
  direction: "sent" | "received";
  status: string | null;
  media_type: string | null;
  media_url: string | null;
  audio_duration: number | null;
  is_ai_response: boolean;
  whatsapp_message_id: string | null;
  created_at: string;
}

export function useConversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<RealConversation[]>([]);
  const [messages, setMessages] = useState<RealMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);

  // Fetch conversations from DB
  const fetchConversations = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("conversations")
      .select("*, devices!conversations_device_id_fkey(name)")
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false });

    if (error) {
      console.error("Error fetching conversations:", error);
      return;
    }

    const mapped = (data || []).map((c: any) => ({
      ...c,
      tags: c.tags || [],
      attending_status: c.attending_status || "nova",
      deviceName: c.devices?.name || undefined,
    }));

    setConversations(mapped);
    setLoading(false);
  }, [user]);

  // Fetch messages for a conversation
  const fetchMessages = useCallback(async (conversationId: string) => {
    const { data, error } = await supabase
      .from("conversation_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching messages:", error);
      return;
    }

    setMessages((data || []).map((m: any) => ({ ...m, direction: m.direction as "sent" | "received" })));
  }, []);

  // Sync from UAZAPI
  const syncConversations = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "amizwispkprvyrnwypws";

      // Step 1: Setup webhooks on all devices (so future messages arrive automatically)
      const webhookResp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/webhook-conversations`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "setup_all_webhooks" }),
        }
      );
      const webhookResult = await webhookResp.json();
      console.log("Webhook setup result:", webhookResult);

      // Step 2: Try sync-conversations for initial import (may not work on all UAZAPI versions)
      try {
        const resp = await fetch(
          `https://${projectId}.supabase.co/functions/v1/sync-conversations`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );
        const result = await resp.json();
        console.log("Sync result:", result);
      } catch (e) {
        console.log("Sync-conversations skipped:", e);
      }

      const configuredCount = webhookResult.configured || 0;
      toast.success(
        configuredCount > 0
          ? `Webhooks configurados em ${configuredCount} dispositivos. Conversas aparecerão automaticamente!`
          : "Sincronização concluída. Envie/receba mensagens para ver as conversas."
      );
      await fetchConversations();
    } catch (err: any) {
      console.error("Sync error:", err);
      toast.error("Erro ao sincronizar conversas: " + err.message);
    } finally {
      setSyncing(false);
    }
  }, [syncing, fetchConversations]);

  // Update conversation status
  const updateStatus = useCallback(async (convId: string, newStatus: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, attending_status: newStatus } : c))
    );
    await supabase.from("conversations").update({ attending_status: newStatus }).eq("id", convId);
  }, []);

  // Update tags
  const updateTags = useCallback(async (convId: string, newTags: string[]) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, tags: newTags } : c))
    );
    await supabase.from("conversations").update({ tags: newTags }).eq("id", convId);
  }, []);

  // Update conversation fields (notes, category, etc.)
  const updateConversation = useCallback(async (convId: string, updates: Partial<RealConversation>) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, ...updates } : c))
    );
    await supabase.from("conversations").update(updates as any).eq("id", convId);
  }, []);

  // Send message with optimistic UI
  const sendMessage = useCallback(async (conversationId: string, content: string) => {
    if (!user) return;

    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return;

    const tempId = crypto.randomUUID();
    const now = new Date().toISOString();

    // 1. Optimistic: show message immediately as "sending"
    const optimisticMsg: RealMessage = {
      id: tempId,
      conversation_id: conversationId,
      content,
      direction: "sent",
      status: "sending",
      media_type: null,
      media_url: null,
      audio_duration: null,
      is_ai_response: false,
      whatsapp_message_id: null,
      created_at: now,
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    // Update conversation preview immediately
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? { ...c, last_message: content, last_message_at: now }
          : c
      )
    );

    // 2. Persist to DB
    const { data: dbMsg, error: dbError } = await supabase
      .from("conversation_messages")
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        remote_jid: conv.remote_jid,
        content,
        direction: "sent",
        status: "sending",
        created_at: now,
      })
      .select()
      .single();

    if (dbError || !dbMsg) {
      // Mark as failed
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m))
      );
      toast.error("Erro ao salvar mensagem");
      return;
    }

    // Replace temp ID with real DB ID
    setMessages((prev) =>
      prev.map((m) => (m.id === tempId ? { ...m, id: dbMsg.id } : m))
    );

    // 3. Send via edge function (UAZAPI)
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "amizwispkprvyrnwypws";

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/chat-send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            conversation_id: conversationId,
            content,
            message_id: dbMsg.id,
          }),
        }
      );

      const result = await res.json();

      if (result.sent) {
        // Update to "sent"
        setMessages((prev) =>
          prev.map((m) => (m.id === dbMsg.id ? { ...m, status: "sent" } : m))
        );
      } else {
        // Mark as failed
        setMessages((prev) =>
          prev.map((m) => (m.id === dbMsg.id ? { ...m, status: "failed" } : m))
        );
        await supabase.from("conversation_messages").update({ status: "failed" }).eq("id", dbMsg.id);
        toast.error(result.error || "Falha ao enviar mensagem");
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) => (m.id === dbMsg.id ? { ...m, status: "failed" } : m))
      );
      await supabase.from("conversation_messages").update({ status: "failed" }).eq("id", dbMsg.id);
      toast.error("Erro de conexão ao enviar mensagem");
    }

    return dbMsg;
  }, [user, conversations]);

  // Select conversation
  const selectConversation = useCallback((convId: string | null) => {
    setSelectedConvId(convId);
    if (convId) {
      fetchMessages(convId);
      // Mark as read
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c))
      );
      supabase.from("conversations").update({ unread_count: 0 }).eq("id", convId);
    } else {
      setMessages([]);
    }
  }, [fetchMessages]);

  // Initial load
  useEffect(() => {
    if (user) {
      fetchConversations();
    }
  }, [user, fetchConversations]);

  // Real-time subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("conversations-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter: `user_id=eq.${user.id}` },
        () => {
          fetchConversations();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_messages", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const newMsg = payload.new as RealMessage;
          if (newMsg.conversation_id === selectedConvId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, selectedConvId, fetchConversations]);

  const selectedConversation = selectedConvId
    ? conversations.find((c) => c.id === selectedConvId) || null
    : null;

  return {
    conversations,
    messages,
    loading,
    syncing,
    selectedConversation,
    selectedConvId,
    selectConversation,
    syncConversations,
    updateStatus,
    updateTags,
    updateConversation,
    sendMessage,
    fetchConversations,
  };
}
