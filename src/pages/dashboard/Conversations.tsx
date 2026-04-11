import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useSearchParams } from "react-router-dom";
import { ConversationList } from "@/components/chat/ConversationList";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ContactDetails } from "@/components/chat/ContactDetails";
import { NewConversationDialog } from "@/components/chat/NewConversationDialog";
import AutoReplyList from "@/pages/dashboard/AutoReplyList";
import { type Conversation, type AttendingStatus, type Message, type ConversationInstance } from "@/components/chat/types";
import { useConversations } from "@/hooks/chat/useConversations";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Zap, Bell, MessageSquarePlus, Trash2, Pencil, Smartphone, ChevronDown, Check } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { normalizePhoneKey } from "@/utils/formatters";

const MIN_SIDEBAR_W = 240;
const MAX_SIDEBAR_W = 600;
const DEFAULT_SIDEBAR_W = 340;

const Conversations = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const {
    conversations: realConvs,
    archivedConversations: realArchivedConvs,
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
    deleteMessage,
    editMessage,
    assignConversation,
    releaseConversation,
    archiveConversation,
    unarchiveConversation,
    markAsUnread,
    getConversationIdsForSameContact,
    getConversationContactKey,
    bulkArchiveConversations,
    bulkDeleteConversations,
  } = useConversations();

  const [showDetails, setShowDetails] = useState(false);
  const [showFlows, setShowFlows] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_W);
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [filterInstanceIds, setFilterInstanceIds] = useState<string[]>([]);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; conversationId: string; whatsappMessageId?: string; isSent: boolean } | null>(null);
  const [editTarget, setEditTarget] = useState<{ id: string; conversationId: string; whatsappMessageId?: string; content: string } | null>(null);
  const [editText, setEditText] = useState("");

  // Handle ?open=convId from queue
  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId && realConvs.length > 0) {
      selectConversation(openId);
    }
  }, [searchParams, realConvs.length]);

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

  // Map raw conversations to UI type
  const allConversations: (Conversation & { _rawId: string })[] = useMemo(() =>
    realConvs.map((c) => ({
      id: c.id,
      _rawId: c.id,
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
      statusChangedAt: c.status_changed_at || undefined,
    }))
  , [realConvs]);

  // Group conversations by phone number
  const groupedConversations: Conversation[] = useMemo(() => {
    const phoneMap = new Map<string, typeof allConversations>();
    allConversations.forEach((c) => {
      const key = normalizePhoneKey(c.phone);
      if (!key) return;
      const group = phoneMap.get(key) || [];
      group.push(c);
      phoneMap.set(key, group);
    });

    return Array.from(phoneMap.values()).map((group) => {
      // Sort by last message time, pick latest as representative
      group.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
      const rep = group[0];
      return {
        ...rep,
        // Aggregate unread count from all instances
        unreadCount: group.reduce((sum, c) => {
          const effectiveUnread = c.lastMessageDirection === "sent" ? 0 : c.unreadCount;
          if (effectiveUnread < 0) return sum < 0 ? sum : effectiveUnread;
          return sum < 0 ? (effectiveUnread > 0 ? effectiveUnread : sum) : sum + effectiveUnread;
        }, 0),
        // Use latest last message across all instances
        lastMessage: group[0].lastMessage,
        lastMessageAt: group[0].lastMessageAt,
        lastMessageStatus: group[0].lastMessageStatus,
        lastMessageDirection: group[0].lastMessageDirection,
        // Show device count badge
        deviceName: group.length > 1 ? `${group.length} instâncias` : rep.deviceName,
      };
    }).sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }, [allConversations]);

  const archivedConversations: Conversation[] = useMemo(() =>
    realArchivedConvs.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      avatar_url: c.avatar_url || undefined,
      lastMessage: c.last_message,
      lastMessageAt: c.last_message_at,
      lastMessageStatus: (c.last_message_status as "sent" | "delivered" | "read") || undefined,
      lastMessageDirection: (c.last_message_direction as "sent" | "received") || undefined,
      unreadCount: c.unread_count,
      status: "offline" as const,
      attendingStatus: (c.attending_status as AttendingStatus) || "nova",
      tags: c.tags || [],
      category: c.category as any,
      email: c.email || undefined,
      notes: c.notes || undefined,
      deviceName: c.deviceName,
      assignedTo: c.assigned_to || undefined,
      assignedName: c.assigned_name || undefined,
      statusChangedAt: c.status_changed_at || undefined,
    }))
  , [realArchivedConvs]);

  // Find selected conversation in grouped list
  const selectedConversation = useMemo(() => {
    if (!selectedReal) return null;
    const selectedKey = normalizePhoneKey(selectedReal.phone);
    return groupedConversations.find((c) => normalizePhoneKey(c.phone) === selectedKey) || null;
  }, [selectedReal, groupedConversations]);

  // Get instances for the selected conversation
  const selectedInstances: ConversationInstance[] = useMemo(() => {
    if (!selectedConversation) return [];
    const key = normalizePhoneKey(selectedConversation.phone);
    return allConversations
      .filter((c) => normalizePhoneKey(c.phone) === key)
      .map((c) => ({
        id: c._rawId,
        deviceName: c.deviceName,
        lastMessageAt: c.lastMessageAt,
      }))
      .sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime());
  }, [selectedConversation, allConversations]);

  // Auto-select the latest instance when conversation changes
  useEffect(() => {
    if (selectedInstances.length > 0 && !selectedInstances.find((i) => i.id === selectedInstanceId)) {
      setSelectedInstanceId(selectedInstances[0].id);
    }
  }, [selectedInstances, selectedInstanceId]);

  // Extract unique instances for filter chips (deduplicated by name)
  const availableInstances = useMemo(() => {
    const map = new Map<string, { id: string; name: string; number: string }>();
    realConvs.forEach((c) => {
      if (c.device_id && !map.has(c.device_id)) {
        const name = c.deviceName || c.device_id.slice(0, 8);
        // Skip if we already have an instance with the same name
        const existing = Array.from(map.values());
        if (!existing.some((e) => e.name === name)) {
          map.set(c.device_id, { id: c.device_id, name, number: "" });
        }
      }
    });
    return Array.from(map.values());
  }, [realConvs]);

  const filteredConversations = useMemo(() => {
    let list = groupedConversations;

    // Filter by selected instances
    if (filterInstanceIds.length > 0) {
      list = list.filter((c) => {
        const key = normalizePhoneKey(c.phone);
        // Check if any raw conversation for this phone belongs to a selected instance
        return allConversations.some(
          (raw) => normalizePhoneKey(raw.phone) === key &&
            realConvs.find((r) => r.id === raw.id && r.device_id && filterInstanceIds.includes(r.device_id))
        );
      });
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.replace(/\D/g, "").includes(q.replace(/\D/g, "")) ||
        c.phone.includes(q) ||
        (c.lastMessage && c.lastMessage.toLowerCase().includes(q)) ||
        (c.tags && c.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }

    return list;
  }, [groupedConversations, searchQuery, filterInstanceIds, allConversations, realConvs]);

  const messages: Message[] = useMemo(() =>
    realMsgs.map((m) => ({
      id: m.id,
      conversationId: m.conversation_id,
      content: m.content,
      type: m.direction === "sent" ? "sent" as const : "received" as const,
      timestamp: m.created_at,
      status: m.direction === "sent" ? (m.status as any) || "sent" : undefined,
      mediaUrl: m.media_url || undefined,
      mediaType: m.media_type as any,
      audioDuration: m.audio_duration || undefined,
      isAiResponse: m.is_ai_response,
      whatsappMessageId: m.whatsapp_message_id || undefined,
      quotedMessageId: m.quoted_message_id || undefined,
      quotedContent: m.quoted_content || undefined,
      failureReason: m.failure_reason || undefined,
      deviceName: m.deviceName,
    }))
  , [realMsgs]);

  // Send handlers that use the selected instance
  const handleSendMessage = useCallback(
    (conversationId: string, content: string, quotedMessageId?: string, quotedContent?: string) => {
      const targetId = selectedInstanceId || conversationId;
      sendMessage(targetId, content, quotedMessageId, quotedContent);
    },
    [sendMessage, selectedInstanceId]
  );

  const handleSendAudio = useCallback(
    (conversationId: string, blob: Blob, duration: number) => {
      const targetId = selectedInstanceId || conversationId;
      sendAudioMessage(targetId, blob, duration);
    },
    [sendAudioMessage, selectedInstanceId]
  );

  const handleSendFile = useCallback(
    (conversationId: string, file: File, caption?: string) => {
      const targetId = selectedInstanceId || conversationId;
      sendFileMessage(targetId, file, caption);
    },
    [sendFileMessage, selectedInstanceId]
  );

  const handleDeleteMessage = useCallback(
    (msg: any) => {
      setDeleteTarget({
        id: msg.id,
        conversationId: msg.conversationId,
        whatsappMessageId: msg.whatsappMessageId,
        isSent: msg.type === "sent",
      });
    },
    []
  );

  const confirmDelete = useCallback(
    (forEveryone: boolean) => {
      if (!deleteTarget) return;
      deleteMessage(deleteTarget.id, deleteTarget.conversationId, deleteTarget.whatsappMessageId, forEveryone);
      setDeleteTarget(null);
    },
    [deleteTarget, deleteMessage]
  );

  const handleEditMessage = useCallback(
    (msg: any) => {
      setEditTarget({
        id: msg.id,
        conversationId: msg.conversationId,
        whatsappMessageId: msg.whatsappMessageId,
        content: msg.content || "",
      });
      setEditText(msg.content || "");
    },
    []
  );

  const confirmEdit = useCallback(() => {
    if (!editTarget || !editText.trim()) return;
    editMessage(editTarget.id, editTarget.conversationId, editTarget.whatsappMessageId, editText.trim());
    setEditTarget(null);
  }, [editTarget, editText, editMessage]);

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

  if (showFlows) {
    return (
      <div className="flex flex-col h-[calc(100vh-theme(spacing.14)-theme(spacing.5)*2)] sm:h-[calc(100vh-theme(spacing.14)-theme(spacing.10))] -m-2.5 sm:-m-5 md:-m-8">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border/40 bg-card/60 backdrop-blur-sm shrink-0">
          <button
            onClick={() => setShowFlows(false)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            Conversas
          </button>
          <div className="w-px h-4 bg-border/40" />
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Fluxos de Automação</span>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <AutoReplyList />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-[calc(100vh-theme(spacing.14)-theme(spacing.5)*2)] sm:h-[calc(100vh-theme(spacing.14)-theme(spacing.10))] -m-2.5 sm:-m-5 md:-m-8">
        <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden bg-background">
          <div
            className={`${
              selectedConversation
                ? "hidden md:flex flex-col shrink-0 w-[300px] overflow-hidden"
                : "flex flex-col w-full max-w-[400px]"
            }`}
          >
            {/* Clean top header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/30 shrink-0 bg-card/30">
              <h2 className="text-base font-bold text-foreground tracking-tight">Atendimento</h2>
              <div className="flex items-center gap-0.5">
                {availableInstances.length >= 1 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="!h-[28px] rounded-lg text-[11px] gap-1.5 border-border/40 text-muted-foreground hover:text-foreground px-2">
                        <Smartphone className="w-3 h-3" />
                        {filterInstanceIds.length === 0
                          ? "Instância"
                          : filterInstanceIds.length === 1
                            ? availableInstances.find((i) => i.id === filterInstanceIds[0])?.name || "Instância"
                            : `${filterInstanceIds.length} instâncias`}
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[180px]">
                      <DropdownMenuItem
                        onSelect={(e) => { e.preventDefault(); setFilterInstanceIds([]); }}
                        className="gap-2 text-xs cursor-pointer"
                      >
                        <Check className={`w-3.5 h-3.5 ${filterInstanceIds.length === 0 ? "opacity-100" : "opacity-0"}`} />
                        Todas
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {availableInstances.map((inst) => {
                        const isActive = filterInstanceIds.includes(inst.id);
                        return (
                          <DropdownMenuItem
                            key={inst.id}
                            onSelect={(e) => {
                              e.preventDefault();
                              setFilterInstanceIds((prev) =>
                                prev.includes(inst.id)
                                  ? prev.filter((i) => i !== inst.id)
                                  : [...prev, inst.id]
                              );
                            }}
                            className="gap-2 text-xs cursor-pointer"
                          >
                            <Check className={`w-3.5 h-3.5 ${isActive ? "opacity-100" : "opacity-0"}`} />
                            {inst.name}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    if (typeof Notification !== "undefined" && Notification.permission === "default") {
                      Notification.requestPermission().then((p) => {
                        if (p === "granted") toast.success("Notificações ativadas!");
                        else toast.info("Notificações não foram permitidas");
                      });
                    } else if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                      toast.info("Notificações já estão ativadas");
                    }
                  }}
                  title="Notificações"
                >
                  <Bell className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowFlows(true)}
                  title="Fluxos de automação"
                >
                  <Zap className="w-4 h-4" />
                </Button>
                <button
                  onClick={() => setNewConversationOpen(true)}
                  className="inline-flex items-center gap-1 h-[28px] px-2.5 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/85 transition-colors ml-1 shrink-0"
                >
                  <MessageSquarePlus className="w-3 h-3" />
                  Nova
                </button>
              </div>
            </div>
            <ConversationList
              conversations={filteredConversations}
              archivedConversations={archivedConversations}
              selectedId={selectedConvId}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onSelect={handleSelect}
              onNewConversationClick={() => setNewConversationOpen(true)}
              currentUserId={user?.id}
              onUnarchive={unarchiveConversation}
              availableInstances={availableInstances}
              filterInstanceIds={filterInstanceIds}
              onFilterInstancesChange={setFilterInstanceIds}
              onBulkArchive={bulkArchiveConversations}
              onBulkDelete={bulkDeleteConversations}
              onMarkUnread={markAsUnread}
            />
          </div>

          {/* Fixed divider */}
          <div className="hidden md:block w-px bg-border/50 shrink-0" />

          {selectedConversation ? (
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
              <ChatPanel
                conversation={selectedConversation}
                messages={messages}
                showDetails={showDetails}
                onToggleDetails={() => setShowDetails(!showDetails)}
                onBack={() => selectConversation(null)}
                onStatusChange={handleStatusChange}
                onSendMessage={handleSendMessage}
                onSendAudio={handleSendAudio}
                onSendFile={handleSendFile}
                onRetryMessage={retryMessage}
                onDeleteMessage={handleDeleteMessage}
                onEditMessage={handleEditMessage}
                currentUserId={user?.id}
                onAssign={assignConversation}
                onRelease={releaseConversation}
                onArchive={archiveConversation}
                onMarkUnread={markAsUnread}
                instances={selectedInstances}
                selectedInstanceId={selectedInstanceId}
                onInstanceChange={setSelectedInstanceId}
              />
            </div>
          ) : (
            <div className="hidden md:flex flex-col flex-1 items-center justify-center bg-muted/3">
              <div className="flex flex-col items-center gap-5 text-center max-w-sm px-6">
                <div className="w-20 h-20 rounded-full bg-muted/20 flex items-center justify-center">
                  <MessageSquarePlus className="w-10 h-10 text-muted-foreground/25" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-lg font-semibold text-foreground/70">Selecione uma conversa</h2>
                  <p className="text-[13px] text-muted-foreground/50 leading-relaxed">
                    Escolha uma conversa da lista ao lado para começar a atender.
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground/30 flex items-center gap-1.5 mt-2">
                  🔒 Suas mensagens são protegidas com criptografia de ponta a ponta.
                </p>
              </div>
            </div>
          )}

          {selectedConversation && showDetails && (
            <>
              {/* Desktop sidebar */}
              <div className="hidden lg:flex flex-col w-[300px] xl:w-[320px] border-l border-border shrink-0">
                <ContactDetails
                  conversation={selectedConversation}
                  onClose={() => setShowDetails(false)}
                  onTagsChange={handleTagsChange}
                />
              </div>
              {/* Mobile fullscreen overlay */}
              <div className="fixed inset-0 z-50 bg-background flex flex-col lg:hidden">
                <ContactDetails
                  conversation={selectedConversation}
                  onClose={() => setShowDetails(false)}
                  onTagsChange={handleTagsChange}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <NewConversationDialog
        open={newConversationOpen}
        onOpenChange={setNewConversationOpen}
        onCreateConversation={createConversation}
      />

      {/* Delete message dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-[340px]">
          <DialogHeader>
            <DialogTitle className="text-base">Apagar mensagem</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {deleteTarget?.isSent
                ? "Escolha como deseja apagar esta mensagem."
                : "Você só pode apagar mensagens recebidas para você."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {deleteTarget?.isSent && (
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => confirmDelete(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Apagar para todos
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => confirmDelete(false)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Apagar para mim
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit message dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Pencil className="w-4 h-4" /> Editar mensagem
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Edite o texto da mensagem. A alteração será aplicada no WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="min-h-[80px] resize-none"
            placeholder="Digite o novo texto..."
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmEdit} disabled={!editText.trim() || editText.trim() === editTarget?.content}>
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Conversations;
