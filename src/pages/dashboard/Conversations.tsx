import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { ConversationList } from "@/components/conversations/ConversationList";
import { ChatPanel } from "@/components/conversations/ChatPanel";
import { ContactDetails } from "@/components/conversations/ContactDetails";
import { NewConversationDialog } from "@/components/conversations/NewConversationDialog";
import { AutomationFlows } from "@/components/conversations/AutomationFlows";
import { type Conversation, type AttendingStatus, type Message } from "@/components/conversations/types";
import { useConversations } from "@/hooks/useConversations";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

const MIN_SIDEBAR_W = 240;
const MAX_SIDEBAR_W = 600;
const DEFAULT_SIDEBAR_W = 340;

const Conversations = () => {
  const { user } = useAuth();
  const {
    conversations: realConvs,
    messages: realMsgs,
    loading,
    syncing,
    selectedConversation: selectedReal,
    selectedConvId,
    selectConversation,
    createConversation,
    syncConversations,
    updateStatus,
    updateTags,
    sendMessage,
    sendAudioMessage,
    sendFileMessage,
    retryMessage,
    assignConversation,
    releaseConversation,
  } = useConversations();

  const [showDetails, setShowDetails] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_W);
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newW = Math.min(MAX_SIDEBAR_W, Math.max(MIN_SIDEBAR_W, e.clientX - rect.left));
      setSidebarWidth(newW);
    };
    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const conversations: Conversation[] = realConvs.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    avatar_url: c.avatar_url || undefined,
    lastMessage: c.last_message,
    lastMessageAt: c.last_message_at,
    lastMessageStatus: (c.last_message_status as "sent" | "delivered" | "read") || undefined,
    lastMessageDirection: (c.last_message_direction as "sent" | "received") || undefined,
    unreadCount: c.unread_count,
    status: (c.status as "online" | "offline" | "typing") || "offline",
    attendingStatus: (c.attending_status as AttendingStatus) || "nova",
    tags: c.tags || [],
    category: c.category as any,
    email: c.email || undefined,
    notes: c.notes || undefined,
    deviceName: c.deviceName,
    assignedTo: c.assigned_to || undefined,
    assignedName: c.assigned_name || undefined,
  }));

  const selectedConversation = selectedReal
    ? conversations.find((c) => c.id === selectedReal.id) || null
    : null;

  const filteredConversations = conversations.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery)
  );

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
    <>
      <div className="flex flex-col h-[calc(100vh-theme(spacing.14)-theme(spacing.5)*2)] sm:h-[calc(100vh-theme(spacing.14)-theme(spacing.10))] -m-2.5 sm:-m-5 md:-m-8">
        <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden bg-background">
          <div
            className={`${
              selectedConversation
                ? "hidden md:flex flex-col shrink-0"
                : "flex flex-col w-full"
            }`}
            style={selectedConversation ? { width: sidebarWidth } : undefined}
          >
            <ConversationList
              conversations={filteredConversations}
              selectedId={selectedConvId}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onSelect={handleSelect}
              onNewConversationClick={() => setNewConversationOpen(true)}
            />
          </div>

          {selectedConversation && (
            <div
              onMouseDown={handleMouseDown}
              className="hidden md:flex items-center justify-center w-1.5 cursor-col-resize group hover:bg-primary/20 active:bg-primary/30 transition-colors shrink-0 relative"
            >
              <div className="w-0.5 h-8 rounded-full bg-border group-hover:bg-primary/50 group-active:bg-primary transition-colors" />
            </div>
          )}

          {selectedConversation && (
            <div className="flex flex-col flex-1 min-w-0">
              <ChatPanel
                conversation={selectedConversation}
                messages={messages}
                showDetails={showDetails}
                onToggleDetails={() => setShowDetails(!showDetails)}
                onBack={() => selectConversation(null)}
                onStatusChange={handleStatusChange}
                onSendMessage={sendMessage}
                onSendAudio={sendAudioMessage}
                onSendFile={sendFileMessage}
                onRetryMessage={retryMessage}
                currentUserId={user?.id}
                onAssign={assignConversation}
                onRelease={releaseConversation}
              />
            </div>
          )}

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

      <NewConversationDialog
        open={newConversationOpen}
        onOpenChange={setNewConversationOpen}
        onCreateConversation={createConversation}
      />
    </>
  );
};

export default Conversations;

