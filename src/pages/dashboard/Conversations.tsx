import { useState } from "react";
import { ConversationList } from "@/components/conversations/ConversationList";
import { ChatPanel } from "@/components/conversations/ChatPanel";
import { ContactDetails } from "@/components/conversations/ContactDetails";
import { type Conversation, type Message, mockConversations, mockMessages } from "@/components/conversations/types";
import { MessageSquare } from "lucide-react";

const Conversations = () => {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [showDetails, setShowDetails] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredConversations = mockConversations.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery)
  );

  const messages = selectedConversation
    ? mockMessages[selectedConversation.id] || []
    : [];

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.14)-theme(spacing.5)*2)] sm:h-[calc(100vh-theme(spacing.14)-theme(spacing.10))] -m-2.5 sm:-m-5 md:-m-8">
      <div className="flex flex-1 min-h-0 overflow-hidden bg-background">
        {/* Left Column — Conversation List */}
        <div className={`${selectedConversation ? "hidden md:flex" : "flex"} flex-col w-full md:w-[340px] lg:w-[360px] border-r border-border shrink-0`}>
          <ConversationList
            conversations={filteredConversations}
            selectedId={selectedConversation?.id || null}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelect={setSelectedConversation}
          />
        </div>

        {/* Center Column — Chat */}
        <div className={`${selectedConversation ? "flex" : "hidden md:flex"} flex-col flex-1 min-w-0`}>
          {selectedConversation ? (
            <ChatPanel
              conversation={selectedConversation}
              messages={messages}
              showDetails={showDetails}
              onToggleDetails={() => setShowDetails(!showDetails)}
              onBack={() => setSelectedConversation(null)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <MessageSquare className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">Selecione uma conversa</h2>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Escolha uma conversa à esquerda para começar a visualizar as mensagens.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Column — Contact Details */}
        {selectedConversation && showDetails && (
          <div className="hidden lg:flex flex-col w-[300px] xl:w-[320px] border-l border-border shrink-0">
            <ContactDetails
              conversation={selectedConversation}
              onClose={() => setShowDetails(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Conversations;
