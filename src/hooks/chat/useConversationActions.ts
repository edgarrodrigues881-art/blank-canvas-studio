import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { RealConversation, RealMessage } from "./useConversations";

interface UseConversationActionsParams {
  user: { id: string; email?: string } | null;
  conversationsRef: React.MutableRefObject<RealConversation[]>;
  setConversations: React.Dispatch<React.SetStateAction<RealConversation[]>>;
  setArchivedConversations: React.Dispatch<React.SetStateAction<RealConversation[]>>;
  setMessages: React.Dispatch<React.SetStateAction<RealMessage[]>>;
  sortConversations: (items: RealConversation[]) => RealConversation[];
  normalizePhone: (phone: string) => string;
  mapConversationRow: (row: any) => RealConversation;
  upsertConversationInState: (items: RealConversation[], row: any) => RealConversation[];
  getConversationIdsForSameContact: (convId: string) => string[];
  getToken: () => Promise<string | null>;
  projectId: string;
  selectConversation: (convId: string | null) => void;
  conversations: RealConversation[];
  archivedConversations: RealConversation[];
  messages: RealMessage[];
}

/**
 * useConversationActions
 * All user-initiated actions: send, update, archive, assign, etc.
 */
export function useConversationActions({
  user,
  conversationsRef,
  setConversations,
  setArchivedConversations,
  setMessages,
  sortConversations,
  normalizePhone,
  mapConversationRow,
  upsertConversationInState,
  getConversationIdsForSameContact,
  getToken,
  projectId,
  selectConversation,
  conversations,
  archivedConversations,
  messages,
}: UseConversationActionsParams) {

  const markConversationGroupAsRead = useCallback(async (convId: string) => {
    const ids = getConversationIdsForSameContact(convId);

    setConversations((prev) =>
      prev.map((c) => ids.includes(c.id) ? { ...c, unread_count: 0 } : c)
    );
    setMessages((prev) =>
      prev.map((m) => ids.includes(m.conversation_id) && m.direction === "received" ? { ...m, status: "read" } : m)
    );

    const [conversationUpdate, messageUpdate] = await Promise.all([
      supabase.from("conversations").update({ unread_count: 0 }).in("id", ids),
      supabase.from("conversation_messages").update({ status: "read" } as any).in("conversation_id", ids).eq("direction", "received").or("status.eq.received,status.is.null"),
    ]);
    if (conversationUpdate.error) console.error("Error clearing unread count:", conversationUpdate.error);
    if (messageUpdate.error) console.error("Error marking messages as read:", messageUpdate.error);
  }, [getConversationIdsForSameContact, setConversations, setMessages]);

  const updateStatus = useCallback(async (convId: string, newStatus: string) => {
    const conv = conversationsRef.current.find((c) => c.id === convId);
    const oldStatus = conv?.attending_status || "nova";
    const now = new Date().toISOString();

    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, attending_status: newStatus, status_changed_at: now } : c))
    );
    await supabase.from("conversations").update({ attending_status: newStatus, status_changed_at: now } as any).eq("id", convId);

    if (user && oldStatus !== newStatus) {
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
      supabase.from("conversation_status_history").insert({
        conversation_id: convId,
        user_id: user.id,
        old_status: oldStatus,
        new_status: newStatus,
        changed_by_name: profile?.full_name || user.email?.split("@")[0] || "Sistema",
      } as any).then(() => {});
    }

    if (newStatus === "aguardando" && user && conv) {
      const token = await getToken();
      fetch(`https://${projectId}.supabase.co/functions/v1/conversation-automations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "trigger",
          user_id: user.id,
          conversation_id: convId,
          automation_type: "awaiting",
        }),
      }).catch((e) => console.error("Awaiting automation error:", e));
    }
  }, [user, getToken, projectId, conversationsRef, setConversations]);

  const updateTags = useCallback(async (convId: string, newTags: string[]) => {
    setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, tags: newTags } : c)));
    await supabase.from("conversations").update({ tags: newTags }).eq("id", convId);
  }, [setConversations]);

  const updateConversation = useCallback(async (convId: string, updates: Partial<RealConversation>) => {
    setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, ...updates } : c)));
    await supabase.from("conversations").update(updates as any).eq("id", convId);
  }, [setConversations]);

  const assignConversation = useCallback(async (convId: string) => {
    if (!user) return;
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
    const name = profile?.full_name || user.email?.split("@")[0] || "Atendente";
    setConversations((prev) =>
      prev.map((c) => c.id === convId ? { ...c, assigned_to: user.id, assigned_name: name } : c)
    );
    await supabase.from("conversations").update({ assigned_to: user.id, assigned_name: name } as any).eq("id", convId);
  }, [user, setConversations]);

  const releaseConversation = useCallback(async (convId: string) => {
    setConversations((prev) =>
      prev.map((c) => c.id === convId ? { ...c, assigned_to: null, assigned_name: null } : c)
    );
    await supabase.from("conversations").update({ assigned_to: null, assigned_name: null } as any).eq("id", convId);
  }, [setConversations]);

  const sendMessage = useCallback(async (conversationId: string, content: string, quotedMessageId?: string, quotedContent?: string) => {
    if (!user) return;
    const conv = conversationsRef.current.find((c) => c.id === conversationId);
    if (!conv) return;

    const tempId = crypto.randomUUID();
    const now = new Date().toISOString();

    const optimisticMsg: RealMessage = {
      id: tempId, conversation_id: conversationId, content, direction: "sent",
      status: "sending", media_type: null, media_url: null, audio_duration: null,
      is_ai_response: false, whatsapp_message_id: null, created_at: now,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setConversations((prev) =>
      sortConversations(prev.map((c) => c.id === conversationId ? { ...c, last_message: content, last_message_at: now } : c))
    );

    const token = await getToken();

    const insertPayload: any = {
      conversation_id: conversationId, user_id: user.id, remote_jid: conv.remote_jid,
      content, direction: "sent", status: "sending", created_at: now, responded_by: user.id,
    };
    if (quotedMessageId) insertPayload.quoted_message_id = quotedMessageId;
    if (quotedContent) insertPayload.quoted_content = quotedContent;

    const sendBody: any = { conversation_id: conversationId, content };
    if (quotedMessageId) sendBody.quoted_message_id = quotedMessageId;

    const [dbResult, apiResult] = await Promise.allSettled([
      supabase.from("conversation_messages").insert(insertPayload).select().single(),
      fetch(`https://${projectId}.supabase.co/functions/v1/chat-send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(sendBody),
      }).then((r) => r.json()),
    ]);

    const dbMsg = dbResult.status === "fulfilled" && !dbResult.value.error ? dbResult.value.data : null;
    if (dbMsg) {
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, id: dbMsg.id } : m));
    }

    const apiOk = apiResult.status === "fulfilled" && apiResult.value?.sent;
    const finalStatus = apiOk ? "sent" : "failed";
    const finalId = dbMsg?.id || tempId;

    setMessages((prev) => prev.map((m) => (m.id === tempId || m.id === finalId) ? { ...m, id: finalId, status: finalStatus } : m));

    if (dbMsg) {
      const waMessageId = apiOk ? (apiResult.value?.messageId || null) : null;
      supabase.from("conversation_messages").update({ status: finalStatus, whatsapp_message_id: waMessageId }).eq("id", dbMsg.id).then(() => {});
    }

    if (!apiOk) {
      const errMsg = apiResult.status === "fulfilled" ? apiResult.value?.error : "Erro de conexão";
      toast.error(errMsg || "Falha ao enviar mensagem");
    }

    return dbMsg;
  }, [user, sortConversations, getToken, projectId, conversationsRef, setConversations, setMessages]);

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
  }, [messages, getToken, projectId, setMessages]);

  const deleteMessage = useCallback(async (messageId: string, conversationId: string, whatsappMessageId?: string, forEveryone?: boolean) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));

    const token = await getToken();
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/chat-send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          conversation_id: conversationId,
          message_id: messageId,
          whatsapp_message_id: forEveryone ? (whatsappMessageId || "") : "",
        }),
      });
      const result = await res.json();
      if (result.deleted) {
        toast.success(forEveryone && result.deletedOnWhatsApp ? "Mensagem apagada para todos" : "Mensagem apagada para você");
      } else {
        toast.error(result.error || "Erro ao apagar mensagem");
      }
    } catch {
      toast.error("Erro de conexão ao apagar mensagem");
    }
  }, [getToken, projectId, setMessages]);

  const editMessage = useCallback(async (messageId: string, conversationId: string, whatsappMessageId: string | undefined, newText: string) => {
    // Optimistic update
    setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, content: newText } : m));

    const token = await getToken();
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/chat-send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit",
          conversation_id: conversationId,
          message_id: messageId,
          whatsapp_message_id: whatsappMessageId || "",
          new_text: newText,
        }),
      });
      const result = await res.json();
      if (result.edited) {
        toast.success(result.editedOnWhatsApp ? "Mensagem editada" : "Mensagem editada localmente");
      } else {
        toast.error(result.error || "Erro ao editar mensagem");
      }
    } catch {
      toast.error("Erro de conexão ao editar mensagem");
    }
  }, [getToken, projectId, setMessages]);

  const sendAudioMessage = useCallback(async (conversationId: string, blob: Blob, duration: number) => {
    if (!user) return;
    const conv = conversationsRef.current.find((c) => c.id === conversationId);
    if (!conv) return;

    const tempId = crypto.randomUUID();
    const now = new Date().toISOString();
    const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "mp4" : "webm";
    const fileName = `${user.id}/chat-audio/${tempId}.${ext}`;

    const optimisticMsg: RealMessage = {
      id: tempId, conversation_id: conversationId, content: "[audio]", direction: "sent",
      status: "sending", media_type: "audio", media_url: null, audio_duration: duration,
      is_ai_response: false, whatsapp_message_id: null, created_at: now,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setConversations((prev) =>
      sortConversations(prev.map((c) => c.id === conversationId ? { ...c, last_message: "🎧 Áudio", last_message_at: now } : c))
    );

    try {
      const { error: uploadErr } = await supabase.storage.from("media").upload(fileName, blob, { contentType: blob.type, upsert: false });
      if (uploadErr) throw new Error("Upload falhou: " + uploadErr.message);

      const { data: urlData } = supabase.storage.from("media").getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, media_url: publicUrl } : m));

      const { data: dbMsg, error: dbErr } = await supabase
        .from("conversation_messages")
        .insert({
          conversation_id: conversationId, user_id: user.id, remote_jid: conv.remote_jid,
          content: "[audio]", direction: "sent", status: "sending", media_type: "audio",
          media_url: publicUrl, audio_duration: duration, created_at: now,
        })
        .select().single();

      if (dbErr || !dbMsg) throw new Error("Erro ao salvar no banco");
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, id: dbMsg.id } : m));

      const token = await getToken();
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/chat-send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, content: publicUrl, message_id: dbMsg.id, type: "audio" }),
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
  }, [user, sortConversations, getToken, projectId, conversationsRef, setConversations, setMessages]);

  const sendFileMessage = useCallback(async (conversationId: string, file: File) => {
    if (!user) return;
    const conv = conversationsRef.current.find((c) => c.id === conversationId);
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
      id: tempId, conversation_id: conversationId, content: isImage ? "[image]" : `[document] ${file.name}`,
      direction: "sent", status: "sending", media_type: mediaType, media_url: localUrl,
      audio_duration: null, is_ai_response: false, whatsapp_message_id: null, created_at: now,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setConversations((prev) =>
      sortConversations(prev.map((c) => c.id === conversationId ? { ...c, last_message: previewLabel, last_message_at: now } : c))
    );

    try {
      const { error: uploadErr } = await supabase.storage.from("media").upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadErr) throw new Error("Upload falhou: " + uploadErr.message);

      const { data: urlData } = supabase.storage.from("media").getPublicUrl(storagePath);
      const publicUrl = urlData.publicUrl;
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, media_url: publicUrl } : m));

      const { data: dbMsg, error: dbErr } = await supabase
        .from("conversation_messages")
        .insert({
          conversation_id: conversationId, user_id: user.id, remote_jid: conv.remote_jid,
          content: isImage ? "[image]" : `[document] ${file.name}`, direction: "sent", status: "sending",
          media_type: mediaType, media_url: publicUrl, message_type: mediaType, created_at: now,
        })
        .select().single();

      if (dbErr || !dbMsg) throw new Error("Erro ao salvar no banco");
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, id: dbMsg.id } : m));

      const token = await getToken();
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/chat-send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, content: publicUrl, message_id: dbMsg.id, type: mediaType, file_name: file.name }),
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
  }, [user, sortConversations, getToken, projectId, conversationsRef, setConversations, setMessages]);

  const createConversation = useCallback(async ({ deviceId, phone, name }: { deviceId: string; phone: string; name?: string }) => {
    if (!user) return null;
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) { toast.error("Número inválido"); return null; }

    const remoteJid = `${normalizedPhone}@s.whatsapp.net`;
    const now = new Date().toISOString();

    try {
      const { data: existing, error: existingError } = await supabase
        .from("conversations")
        .select("*, devices!conversations_device_id_fkey(name)")
        .eq("user_id", user.id).eq("device_id", deviceId).eq("remote_jid", remoteJid).maybeSingle();

      if (existingError) throw existingError;

      let conversationRow = existing;
      const nextName = name?.trim();

      if (conversationRow) {
        if (nextName && conversationRow.name !== nextName) {
          const { data: updated, error: updateError } = await supabase
            .from("conversations")
            .update({ name: nextName, phone: normalizedPhone, updated_at: now })
            .eq("id", conversationRow.id)
            .select("*, devices!conversations_device_id_fkey(name)").single();
          if (updateError) throw updateError;
          conversationRow = updated;
        }
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("conversations")
          .insert({
            user_id: user.id, device_id: deviceId, remote_jid: remoteJid,
            name: nextName || normalizedPhone, phone: normalizedPhone,
            last_message: "", last_message_at: now, unread_count: 0,
            status: "offline", attending_status: "nova", tags: [], updated_at: now,
          })
          .select("*, devices!conversations_device_id_fkey(name)").single();
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
  }, [user, normalizePhone, mapConversationRow, upsertConversationInState, selectConversation, setConversations]);

  const archiveConversation = useCallback(async (convId: string) => {
    const conv = conversations.find((c) => c.id === convId);
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    if (conv) setArchivedConversations((prev) => [conv, ...prev]);
    await supabase.from("conversations").update({ status: "archived" } as any).eq("id", convId);
    toast.success("Conversa arquivada");
  }, [conversations, setConversations, setArchivedConversations]);

  const unarchiveConversation = useCallback(async (convId: string) => {
    const conv = archivedConversations.find((c) => c.id === convId);
    setArchivedConversations((prev) => prev.filter((c) => c.id !== convId));
    if (conv) setConversations((prev) => sortConversations([{ ...conv, status: "offline" } as any, ...prev]));
    await supabase.from("conversations").update({ status: "offline" } as any).eq("id", convId);
    toast.success("Conversa desarquivada");
  }, [archivedConversations, sortConversations, setConversations, setArchivedConversations]);

  const markAsUnread = useCallback(async (convId: string) => {
    setConversations((prev) =>
      prev.map((c) => c.id === convId ? { ...c, unread_count: Math.max(c.unread_count, 1) } : c)
    );
    await supabase.from("conversations").update({ unread_count: 1 } as any).eq("id", convId);
    toast.success("Marcada como não lida");
  }, [setConversations]);

  const bulkArchiveConversations = useCallback(async (convIds: string[]) => {
    if (convIds.length === 0) return;
    const convs = conversations.filter((c) => convIds.includes(c.id));
    setConversations((prev) => prev.filter((c) => !convIds.includes(c.id)));
    setArchivedConversations((prev) => [...convs, ...prev]);
    await supabase.from("conversations").update({ status: "archived" } as any).in("id", convIds);
    toast.success(`${convIds.length} conversa${convIds.length > 1 ? "s" : ""} arquivada${convIds.length > 1 ? "s" : ""}`);
  }, [conversations, setConversations, setArchivedConversations]);

  const bulkDeleteConversations = useCallback(async (convIds: string[]) => {
    if (convIds.length === 0) return;
    setConversations((prev) => prev.filter((c) => !convIds.includes(c.id)));
    setArchivedConversations((prev) => prev.filter((c) => !convIds.includes(c.id)));
    // Delete messages first, then conversations
    await supabase.from("conversation_messages").delete().in("conversation_id", convIds);
    await supabase.from("conversations").delete().in("id", convIds);
    toast.success(`${convIds.length} conversa${convIds.length > 1 ? "s" : ""} apagada${convIds.length > 1 ? "s" : ""}`);
  }, [setConversations, setArchivedConversations]);

  return {
    markConversationGroupAsRead,
    updateStatus,
    updateTags,
    updateConversation,
    assignConversation,
    releaseConversation,
    sendMessage,
    retryMessage,
    deleteMessage,
    sendAudioMessage,
    sendFileMessage,
    createConversation,
    archiveConversation,
    unarchiveConversation,
    markAsUnread,
    bulkArchiveConversations,
    bulkDeleteConversations,
  };
}
