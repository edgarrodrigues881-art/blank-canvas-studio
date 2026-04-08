import { useConversationSync } from "./useConversationSync";
import { useConversationActions } from "./useConversationActions";
import { useConversationRealtime } from "./useConversationRealtime";

// Re-export types so existing imports keep working
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
  assigned_to?: string | null;
  assigned_name?: string | null;
  status_changed_at?: string;
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
  quoted_message_id?: string | null;
  quoted_content?: string | null;
  created_at: string;
  deviceName?: string;
}

/**
 * useConversations — orchestrator
 * Composes useConversationSync, useConversationActions, and useConversationRealtime.
 * Public API is identical to the original hook.
 */
export function useConversations() {
  const sync = useConversationSync();

  const actions = useConversationActions({
    user: sync.user,
    conversationsRef: sync.conversationsRef,
    setConversations: sync.setConversations,
    setArchivedConversations: sync.setArchivedConversations,
    setMessages: sync.setMessages,
    sortConversations: sync.sortConversations,
    normalizePhone: sync.normalizePhone,
    mapConversationRow: sync.mapConversationRow,
    upsertConversationInState: sync.upsertConversationInState,
    getConversationIdsForSameContact: sync.getConversationIdsForSameContact,
    getToken: sync.getToken,
    projectId: sync.projectId,
    selectConversation: sync.selectConversation,
    conversations: sync.conversations,
    archivedConversations: sync.archivedConversations,
    messages: sync.messages,
  });

  // Wire markConversationGroupAsRead into selectConversation
  // The sync.selectConversation already calls fetchMessages;
  // we also need to mark as read when selecting
  const selectConversation = (convId: string | null) => {
    sync.selectConversation(convId);
    if (convId) {
      void actions.markConversationGroupAsRead(convId);
    }
  };

  useConversationRealtime({
    user: sync.user,
    conversationsRef: sync.conversationsRef,
    selectedConvIdRef: sync.selectedConvIdRef,
    setConversations: sync.setConversations,
    setMessages: sync.setMessages,
    upsertConversationInState: sync.upsertConversationInState,
    sortConversations: sync.sortConversations,
    getConversationContactKey: sync.getConversationContactKey,
    getConversationIdsForSameContact: sync.getConversationIdsForSameContact,
    markConversationGroupAsRead: actions.markConversationGroupAsRead,
    updateStatus: actions.updateStatus,
    isOwnDevice: sync.isOwnDevice,
  });

  const selectedConversation = sync.selectedConvId
    ? sync.conversations.find((c) => c.id === sync.selectedConvId) || null
    : null;

  return {
    conversations: sync.conversations,
    archivedConversations: sync.archivedConversations,
    messages: sync.messages,
    loading: sync.loading,
    syncing: sync.syncing,
    selectedConversation,
    selectedConvId: sync.selectedConvId,
    selectConversation,
    createConversation: actions.createConversation,
    syncConversations: sync.syncConversations,
    updateStatus: actions.updateStatus,
    updateTags: actions.updateTags,
    updateConversation: actions.updateConversation,
    sendMessage: actions.sendMessage,
    sendAudioMessage: actions.sendAudioMessage,
    sendFileMessage: actions.sendFileMessage,
    retryMessage: actions.retryMessage,
    deleteMessage: actions.deleteMessage,
    editMessage: actions.editMessage,
    fetchConversations: sync.fetchConversations,
    assignConversation: actions.assignConversation,
    releaseConversation: actions.releaseConversation,
    archiveConversation: actions.archiveConversation,
    unarchiveConversation: actions.unarchiveConversation,
    markAsUnread: actions.markAsUnread,
    getConversationIdsForSameContact: sync.getConversationIdsForSameContact,
    getConversationContactKey: sync.getConversationContactKey,
  };
}
