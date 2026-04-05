import { useState, useCallback } from "react";
import { ConversationList } from "@/components/conversations/ConversationList";
import { ChatPanel } from "@/components/conversations/ChatPanel";
import { ContactDetails } from "@/components/conversations/ContactDetails";
import { type Conversation, type AttendingStatus, type Message } from "@/components/conversations/types";
import { useConversations } from "@/hooks/useConversations";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const Conversations = () => {
  const {
    conversations: realConvs,
    messages: realMsgs,
    loading,
    syncing,
    selectedConversation: selectedReal,
    selectedConvId,
    selectConversation,
    syncConversations,
    updateStatus,
    updateTags,
    sendMessage,
  } = useConversations();

  const [showDetails, setShowDetails] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Map real data to the Conversation type used by components
  const conversations: Conversation[] = realConvs.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    avatar_url: c.avatar_url || undefined,
    lastMessage: c.last_message,
    lastMessageAt: c.last_message_at,
    unreadCount: c.unread_count,
    status: (c.status as "online" | "offline" | "typing") || "offline",
    attendingStatus: (c.attending_status as AttendingStatus) || "nova",
    tags: c.tags || [],
    category: c.category as any,
    email: c.email || undefined,
    notes: c.notes || undefined,
    deviceName: c.deviceName,
  }));

  const selectedConversation = selectedReal
    ? conversations.find((c) => c.id === selectedReal.id) || null
    : null;

  const filteredConversations = conversations.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery)
  );

  // Map real messages to Message type
  const messages: Message[] = realMsgs.map((m) => ({
    id: m.id,
    conversationId: m.conversation_id,
    content: m.content,
    type: m.direction === "sent" ? "sent" : "received",
    timestamp: m.created_at,
    status: m.direction === "sent" ? (m.status as any) || "sent" : undefined,
    mediaUrl: m.media_url || undefined,
    mediaType: m.media_type as any,
    audioDuration: m.audio_duration || undefined,
    isAiResponse: m.is_ai_response,
  }));

  const handleStatusChange = useCallback(
    (conversationId: string, newStatus: AttendingStatus) => {
      updateStatus(conversationId, newStatus);
    },
    [updateStatus]
  );

  const handleTagsChange = useCallback(
    (conversationId: string, newTags: string[]) => {
      updateTags(conversationId, newTags);
    },
    [updateTags]
  );

  const handleSelect = useCallback(
    (c: Conversation) => {
      selectConversation(c.id);
    },
    [selectConversation]
  );

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.14)-theme(spacing.5)*2)] sm:h-[calc(100vh-theme(spacing.14)-theme(spacing.10))] -m-2.5 sm:-m-5 md:-m-8">
      <div className="flex flex-1 min-h-0 overflow-hidden bg-background">
        {/* Left Column */}
        <div
          className={`${
            selectedConversation
              ? "hidden md:flex flex-col w-full md:w-[340px] lg:w-[360px] border-r border-border shrink-0"
              : "flex flex-col w-full"
          }`}
        >
          {/* Sync button */}
          <div className="flex items-center gap-2 px-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={syncConversations}
              disabled={syncing}
              className="ml-auto text-xs"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando..." : "Sincronizar"}
            </Button>
          </div>
          <ConversationList
            conversations={filteredConversations}
            selectedId={selectedConvId}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelect={handleSelect}
          />
        </div>

        {/* Center Column — Chat */}
        {selectedConversation && (
          <div className="flex flex-col flex-1 min-w-0">
            <ChatPanel
              conversation={selectedConversation}
              messages={messages}
              showDetails={showDetails}
              onToggleDetails={() => setShowDetails(!showDetails)}
              onBack={() => selectConversation(null)}
              onStatusChange={handleStatusChange}
            />
          </div>
        )}

        {/* Right Column — Contact Details */}
        {selectedConversation && showDetails && (
          <div className="hidden lg:flex flex-col w-[300px] xl:w-[320px] border-l border-border shrink-0">
            <ContactDetails
              conversation={selectedConversation}
              onClose={() => setShowDetails(false)}
              onTagsChange={handleTagsChange}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Conversations;
