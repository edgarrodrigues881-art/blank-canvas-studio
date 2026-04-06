import { useState, useEffect, useCallback, useRef } from "react";
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

  // Cached auth token — refreshed on mount and reused across sends
  const cachedTokenRef = useRef<string | null>(null);
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "amizwispkprvyrnwypws";

  const getToken = useCallback(async () => {
    if (cachedTokenRef.current) return cachedTokenRef.current;
    const { data } = await supabase.auth.getSession();
    cachedTokenRef.current = data?.session?.access_token || null;
    return cachedTokenRef.current;
  }, []);

  // Keep token fresh
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      cachedTokenRef.current = session?.access_token || null;
    });
    // Warm cache immediately
    supabase.auth.getSession().then(({ data }) => {
      cachedTokenRef.current = data?.session?.access_token || null;
    });
    return () => subscription.unsubscribe();
  }, []);

  // Ref for conversations to avoid stale closures
  const conversationsRef = useRef(conversations);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  const mapConversationRow = useCallback((row: any): RealConversation => ({
    ...row,
    tags: row.tags || [],
    attending_status: row.attending_status || "nova",
    last_message: row.last_message || "",
    last_message_at: row.last_message_at || row.updated_at || row.created_at || new Date().toISOString(),
    unread_count: row.unread_count ?? 0,
    status: row.status || "offline",
    deviceName: row.devices?.name || row.deviceName || undefined,
  }), []);

  const sortConversations = useCallback((items: RealConversation[]) => {
    return [...items].sort((a, b) => {
      const aTs = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bTs = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bTs - aTs;
    });
  }, []);

  const upsertConversationInState = useCallback((items: RealConversation[], row: any) => {
    const mapped = mapConversationRow(row);
    return sortConversations([mapped, ...items.filter((item) => item.id !== mapped.id)]);
  }, [mapConversationRow, sortConversations]);

  const normalizePhone = useCallback((phone: string) => phone.replace(/\D/g, ""), []);

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

    const mapped = sortConversations((data || []).map(mapConversationRow));
    setConversations(mapped);
    setLoading(false);
  }, [user, mapConversationRow, sortConversations]);

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

    const nextMessages = (data || []).map((m: any) => ({ ...m, direction: m.direction as "sent" | "received" }));

    setMessages((prev) => {
      const pendingMessages = prev.filter(
        (m) => m.conversation_id === conversationId && m.status === "sending" && !nextMessages.some((next) => next.id === m.id)
      );

      return [...nextMessages, ...pendingMessages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
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

  // Send message with optimistic UI — parallelized DB + API
  const sendMessage = useCallback(async (conversationId: string, content: string) => {
    if (!user) return;
    const conv = conversationsRef.current.find((c) => c.id === conversationId);
    if (!conv) return;

    const tempId = crypto.randomUUID();
    const now = new Date().toISOString();

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
    setConversations((prev) =>
      sortConversations(prev.map((c) => c.id === conversationId ? { ...c, last_message: content, last_message_at: now } : c))
    );

    // Fire DB insert and API call in parallel
    const token = await getToken();

    const [dbResult, apiResult] = await Promise.allSettled([
      supabase.from("conversation_messages").insert({
        conversation_id: conversationId,
        user_id: user.id,
        remote_jid: conv.remote_jid,
        content,
        direction: "sent",
        status: "sending",
        created_at: now,
      }).select().single(),

      fetch(`https://${projectId}.supabase.co/functions/v1/chat-send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, content }),
      }).then((r) => r.json()),
    ]);

    // Handle DB result
    const dbMsg = dbResult.status === "fulfilled" && !dbResult.value.error ? dbResult.value.data : null;
    if (dbMsg) {
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, id: dbMsg.id } : m));
    }

    // Handle API result
    const apiOk = apiResult.status === "fulfilled" && apiResult.value?.sent;
    const finalStatus = apiOk ? "sent" : "failed";
    const finalId = dbMsg?.id || tempId;

    setMessages((prev) => prev.map((m) => (m.id === tempId || m.id === finalId) ? { ...m, id: finalId, status: finalStatus } : m));

    if (dbMsg) {
      // Update DB status + message_id in background (don't await)
      const waMessageId = apiOk ? (apiResult.value?.messageId || null) : null;
      supabase.from("conversation_messages").update({
        status: finalStatus,
        whatsapp_message_id: waMessageId,
      }).eq("id", dbMsg.id).then(() => {});
    }

    if (!apiOk) {
      const errMsg = apiResult.status === "fulfilled" ? apiResult.value?.error : "Erro de conexão";
      toast.error(errMsg || "Falha ao enviar mensagem");
    }

    return dbMsg;
  }, [user, sortConversations, getToken, projectId]);

  // Retry a failed message
  const retryMessage = useCallback(async (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || !msg.content) return;

    setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, status: "sending" } : m));

    const token = await getToken();

    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/chat-send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: msg.conversation_id, content: msg.content, message_id: messageId }),
      });
      const result = await res.json();

      const status = result.sent ? "sent" : "failed";
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, status } : m));
      supabase.from("conversation_messages").update({ status }).eq("id", messageId).then(() => {});
      if (!result.sent) toast.error(result.error || "Falha ao reenviar");
    } catch {
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, status: "failed" } : m));
      toast.error("Erro de conexão ao reenviar");
    }
  }, [messages, getToken, projectId]);

  // Send audio message
  const sendAudioMessage = useCallback(async (conversationId: string, blob: Blob, duration: number) => {
    if (!user) return;
    const conv = conversationsRef.current.find((c) => c.id === conversationId);
    if (!conv) return;

    const tempId = crypto.randomUUID();
    const now = new Date().toISOString();
    const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "mp4" : "webm";
    const fileName = `${user.id}/chat-audio/${tempId}.${ext}`;

    const optimisticMsg: RealMessage = {
      id: tempId,
      conversation_id: conversationId,
      content: "[audio]",
      direction: "sent",
      status: "sending",
      media_type: "audio",
      media_url: null,
      audio_duration: duration,
      is_ai_response: false,
      whatsapp_message_id: null,
      created_at: now,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setConversations((prev) =>
      sortConversations(
        prev.map((c) => c.id === conversationId ? { ...c, last_message: "🎧 Áudio", last_message_at: now } : c)
      )
    );

    try {
      const { error: uploadErr } = await supabase.storage.from("media").upload(fileName, blob, {
        contentType: blob.type,
        upsert: false,
      });
      if (uploadErr) throw new Error("Upload falhou: " + uploadErr.message);

      const { data: urlData } = supabase.storage.from("media").getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      setMessages((prev) =>
        prev.map((m) => m.id === tempId ? { ...m, media_url: publicUrl } : m)
      );

      const { data: dbMsg, error: dbErr } = await supabase
        .from("conversation_messages")
        .insert({
          conversation_id: conversationId,
          user_id: user.id,
          remote_jid: conv.remote_jid,
          content: "[audio]",
          direction: "sent",
          status: "sending",
          media_type: "audio",
          media_url: publicUrl,
          audio_duration: duration,
          created_at: now,
        })
        .select()
        .single();

      if (dbErr || !dbMsg) throw new Error("Erro ao salvar no banco");

      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, id: dbMsg.id } : m));

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "amizwispkprvyrnwypws";

      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/chat-send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          content: publicUrl,
          message_id: dbMsg.id,
          type: "audio",
        }),
      });
      const result = await res.json();

      if (result.sent) {
        setMessages((prev) => prev.map((m) => m.id === dbMsg.id ? { ...m, status: "sent" } : m));
      } else {
        setMessages((prev) => prev.map((m) => m.id === dbMsg.id ? { ...m, status: "failed" } : m));
        await supabase.from("conversation_messages").update({ status: "failed" }).eq("id", dbMsg.id);
        toast.error(result.error || "Falha ao enviar áudio");
      }
    } catch (err: any) {
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, status: "failed" } : m));
      toast.error(err.message || "Erro ao enviar áudio");
    }
  }, [user, conversations, sortConversations]);

  // Send file message (image or document)
  const sendFileMessage = useCallback(async (conversationId: string, file: File) => {
    if (!user) return;
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return;

    const tempId = crypto.randomUUID();
    const now = new Date().toISOString();
    const isImage = file.type.startsWith("image/");
    const mediaType = isImage ? "image" : "document";
    const ext = file.name.split(".").pop() || "bin";
    const storagePath = `${user.id}/chat-files/${tempId}.${ext}`;

    const localUrl = isImage ? URL.createObjectURL(file) : null;
    const previewLabel = isImage ? "📷 Foto" : `📎 ${file.name}`;

    const optimisticMsg: RealMessage = {
      id: tempId,
      conversation_id: conversationId,
      content: isImage ? "[image]" : `[document] ${file.name}`,
      direction: "sent",
      status: "sending",
      media_type: mediaType,
      media_url: localUrl,
      audio_duration: null,
      is_ai_response: false,
      whatsapp_message_id: null,
      created_at: now,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setConversations((prev) =>
      sortConversations(
        prev.map((c) => c.id === conversationId ? { ...c, last_message: previewLabel, last_message_at: now } : c)
      )
    );

    try {
      const { error: uploadErr } = await supabase.storage.from("media").upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });
      if (uploadErr) throw new Error("Upload falhou: " + uploadErr.message);

      const { data: urlData } = supabase.storage.from("media").getPublicUrl(storagePath);
      const publicUrl = urlData.publicUrl;

      setMessages((prev) =>
        prev.map((m) => m.id === tempId ? { ...m, media_url: publicUrl } : m)
      );

      const { data: dbMsg, error: dbErr } = await supabase
        .from("conversation_messages")
        .insert({
          conversation_id: conversationId,
          user_id: user.id,
          remote_jid: conv.remote_jid,
          content: isImage ? "[image]" : `[document] ${file.name}`,
          direction: "sent",
          status: "sending",
          media_type: mediaType,
          media_url: publicUrl,
          message_type: mediaType,
          created_at: now,
        })
        .select()
        .single();

      if (dbErr || !dbMsg) throw new Error("Erro ao salvar no banco");

      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, id: dbMsg.id } : m));

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "amizwispkprvyrnwypws";

      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/chat-send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          content: publicUrl,
          message_id: dbMsg.id,
          type: mediaType,
          file_name: file.name,
        }),
      });
      const result = await res.json();

      if (result.sent) {
        setMessages((prev) => prev.map((m) => m.id === dbMsg.id ? { ...m, status: "sent" } : m));
      } else {
        setMessages((prev) => prev.map((m) => m.id === dbMsg.id ? { ...m, status: "failed" } : m));
        await supabase.from("conversation_messages").update({ status: "failed" }).eq("id", dbMsg.id);
        toast.error(result.error || "Falha ao enviar arquivo");
      }
    } catch (err: any) {
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, status: "failed" } : m));
      toast.error(err.message || "Erro ao enviar arquivo");
    } finally {
      if (localUrl) URL.revokeObjectURL(localUrl);
    }
  }, [user, conversations, sortConversations]);

  const selectConversation = useCallback((convId: string | null) => {
    setSelectedConvId(convId);
    if (convId) {
      fetchMessages(convId);
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c))
      );
      supabase.from("conversations").update({ unread_count: 0 }).eq("id", convId);
    } else {
      setMessages([]);
    }
  }, [fetchMessages]);

  const createConversation = useCallback(async ({ deviceId, phone, name }: { deviceId: string; phone: string; name?: string }) => {
    if (!user) return null;

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      toast.error("Número inválido");
      return null;
    }

    const remoteJid = `${normalizedPhone}@s.whatsapp.net`;
    const now = new Date().toISOString();

    try {
      const { data: existing, error: existingError } = await supabase
        .from("conversations")
        .select("*, devices!conversations_device_id_fkey(name)")
        .eq("user_id", user.id)
        .eq("device_id", deviceId)
        .eq("remote_jid", remoteJid)
        .maybeSingle();

      if (existingError) throw existingError;

      let conversationRow = existing;
      const nextName = name?.trim();

      if (conversationRow) {
        if (nextName && conversationRow.name !== nextName) {
          const { data: updated, error: updateError } = await supabase
            .from("conversations")
            .update({ name: nextName, phone: normalizedPhone, updated_at: now })
            .eq("id", conversationRow.id)
            .select("*, devices!conversations_device_id_fkey(name)")
            .single();

          if (updateError) throw updateError;
          conversationRow = updated;
        }
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("conversations")
          .insert({
            user_id: user.id,
            device_id: deviceId,
            remote_jid: remoteJid,
            name: nextName || normalizedPhone,
            phone: normalizedPhone,
            last_message: "",
            last_message_at: now,
            unread_count: 0,
            status: "offline",
            attending_status: "nova",
            tags: [],
            updated_at: now,
          })
          .select("*, devices!conversations_device_id_fkey(name)")
          .single();

        if (insertError) throw insertError;
        conversationRow = inserted;
      }

      if (!conversationRow) return null;

      const mappedConversation = mapConversationRow(conversationRow);
      setConversations((prev) => upsertConversationInState(prev, mappedConversation));
      selectConversation(mappedConversation.id);
      toast.success(existing ? "Conversa aberta" : "Nova conversa criada");
      return mappedConversation.id;
    } catch (error: any) {
      console.error("Error creating conversation:", error);
      toast.error(error?.message || "Não foi possível abrir a conversa");
      return null;
    }
  }, [user, normalizePhone, mapConversationRow, upsertConversationInState, selectConversation]);

  // Initial load + auto background sync
  const hasSyncedRef = useRef(false);
  useEffect(() => {
    if (user) {
      fetchConversations();
      if (!hasSyncedRef.current) {
        hasSyncedRef.current = true;
        (async () => {
          try {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData?.session?.access_token;
            if (!token) return;
            const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "amizwispkprvyrnwypws";

            fetch(`https://${projectId}.supabase.co/functions/v1/webhook-conversations`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ action: "setup_all_webhooks" }),
            }).catch(() => {});

            const resp = await fetch(`https://${projectId}.supabase.co/functions/v1/sync-conversations`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            });
            const result = await resp.json();
            console.log("[auto-sync] background sync result:", result);
            if (result.synced > 0) {
              fetchConversations();
            }
          } catch (e) {
            console.log("[auto-sync] background sync skipped:", e);
          }
        })();
      }
    }
  }, [user, fetchConversations]);

  // Real-time subscription — conversations table (any change)
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("conv-list-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter: `user_id=eq.${user.id}` },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchConversations]);

  // Real-time subscription — messages (INSERT + UPDATE for status changes)
  const selectedConvIdRef = useRef(selectedConvId);
  useEffect(() => { selectedConvIdRef.current = selectedConvId; }, [selectedConvId]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("conv-msgs-rt")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_messages", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const newMsg = payload.new as RealMessage;
          if (newMsg.conversation_id === selectedConvIdRef.current) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversation_messages", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const updated = payload.new as RealMessage;
          if (updated.conversation_id === selectedConvIdRef.current) {
            setMessages((prev) =>
              prev.map((m) => (m.id === updated.id ? { ...m, ...updated, direction: updated.direction as "sent" | "received" } : m))
            );
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    let isActive = true;

    const refresh = async () => {
      if (!isActive) return;
      await fetchConversations();

      const currentConversationId = selectedConvIdRef.current;
      if (currentConversationId) {
        await fetchMessages(currentConversationId);
      }
    };

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }, 15000);

    const handleFocus = () => { void refresh(); };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      isActive = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user, fetchConversations, fetchMessages]);

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
    createConversation,
    syncConversations,
    updateStatus,
    updateTags,
    updateConversation,
    sendMessage,
    sendAudioMessage,
    sendFileMessage,
    retryMessage,
    fetchConversations,
  };
}
