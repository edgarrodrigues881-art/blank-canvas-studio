import { useState, useCallback } from "react";
import { ConversationList } from "@/components/conversations/ConversationList";
import { ChatPanel } from "@/components/conversations/ChatPanel";
import { ContactDetails } from "@/components/conversations/ContactDetails";
import { type Conversation, type AttendingStatus, mockConversations, mockMessages } from "@/components/conversations/types";

const Conversations = () => {
  const [conversations, setConversations] = useState<Conversation[]>(mockConversations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedConversation = selectedId ? conversations.find((c) => c.id === selectedId) || null : null;

  const filteredConversations = conversations.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery)
  );

  const messages = selectedConversation
    ? mockMessages[selectedConversation.id] || []
    : [];

  const handleStatusChange = useCallback((conversationId: string, newStatus: AttendingStatus) => {
    setConversations((prev) =>
      prev.map((c) => c.id === conversationId ? { ...c, attendingStatus: newStatus } : c)
    );
  }, []);

  const handleTagsChange = useCallback((conversationId: string, newTags: string[]) => {
    setConversations((prev) =>
      prev.map((c) => c.id === conversationId ? { ...c, tags: newTags } : c)
    );
  }, []);

  const handleSelect = useCallback((c: Conversation) => {
    setSelectedId(c.id);
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.14)-theme(spacing.5)*2)] sm:h-[calc(100vh-theme(spacing.14)-theme(spacing.10))] -m-2.5 sm:-m-5 md:-m-8">
      <div className="flex flex-1 min-h-0 overflow-hidden bg-background">
        {/* Left Column — full width when nothing selected, sidebar when selected */}
        <div className={`${selectedConversation ? "hidden md:flex flex-col w-full md:w-[340px] lg:w-[360px] border-r border-border shrink-0" : "flex flex-col w-full"}`}>
          <ConversationList
            conversations={filteredConversations}
            selectedId={selectedId}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelect={handleSelect}
          />
        </div>

        {/* Center Column — Chat (only when conversation selected) */}
        {selectedConversation && (
          <div className="flex flex-col flex-1 min-w-0">
            <ChatPanel
              conversation={selectedConversation}
              messages={messages}
              showDetails={showDetails}
              onToggleDetails={() => setShowDetails(!showDetails)}
              onBack={() => setSelectedId(null)}
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
