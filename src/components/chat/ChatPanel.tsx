import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { formatDuration, formatFileSize } from "@/utils/formatters";
import { getFileIcon } from "@/utils/fileHelpers";
import { useQuickReplies, resolveVariables, QUICK_REPLY_CATEGORIES } from "@/hooks/chat/useQuickReplies";
import { QuickRepliesManager } from "./QuickRepliesManager";
import { useSendMessage } from "@/hooks/chat/useSendMessage";
import { MessageBubble } from "./MessageBubble";
import { ChatHeader } from "./ChatHeader";
import { supabase } from "@/integrations/supabase/client";
import {
  Paperclip,
  Send,
  Image as ImageIcon,
  FileText,
  ChevronDown,
  Zap,
  Mic,
  Settings,
  Trash2,
  Loader2,
  X,
  Download,
  CheckSquare,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Conversation, type Message, type AttendingStatus, type ConversationInstance } from "./types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  conversation: Conversation;
  messages: Message[];
  showDetails: boolean;
  onToggleDetails: () => void;
  onBack: () => void;
  onStatusChange?: (conversationId: string, newStatus: AttendingStatus) => void;
  onSendMessage?: (conversationId: string, content: string, quotedMessageId?: string, quotedContent?: string) => void;
  onSendAudio?: (conversationId: string, blob: Blob, duration: number) => void;
  onSendFile?: (conversationId: string, file: File) => void;
  onRetryMessage?: (messageId: string) => void;
  onDeleteMessage?: (msg: Message) => void;
  onEditMessage?: (msg: Message) => void;
  onArchive?: (conversationId: string) => void;
  onMarkUnread?: (conversationId: string) => void;
  currentUserId?: string;
  onAssign?: (conversationId: string) => void;
  onRelease?: (conversationId: string) => void;
  instances?: ConversationInstance[];
  selectedInstanceId?: string | null;
  onInstanceChange?: (id: string) => void;
}

/* ─────────── Image Lightbox ─────────── */
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    setZoom((z) => Math.min(5, Math.max(1, z - e.deltaY * 0.002)));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (zoom <= 1) return;
    e.stopPropagation();
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [zoom]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    e.stopPropagation();
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  }, []);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = src.split("/").pop() || "imagem.jpg";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(src, "_blank");
    }
  };

  const resetView = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-150" onClick={onClose}>
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-10 bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex items-center gap-2">
          <button onClick={handleDownload} className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/10">
            <Download className="w-4 h-4" />
            Baixar
          </button>
          <button onClick={resetView} className="text-xs text-white/70 hover:text-white transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/10" title="Resetar zoom">
            {Math.round(zoom * 100)}%
          </button>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div
        className="w-full h-full flex items-center justify-center overflow-hidden select-none"
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        style={{ cursor: zoom > 1 ? "grab" : "default" }}
      >
        <img
          src={src}
          alt="Visualização"
          draggable={false}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="max-w-[92vw] max-h-[90vh] object-contain transition-transform duration-100"
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transformOrigin: "center center",
            borderRadius: "16px",
            boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
          }}
        />
      </div>
    </div>
  );
}

const defaultQuickReplies = [
  { id: "default-1", label: "Saudação inicial", content: "Olá! Bem-vindo(a)! Como posso ajudá-lo(a) hoje? 😊" },
  { id: "default-2", label: "Confirmar pagamento", content: "Confirmamos o recebimento do seu pagamento. Obrigado!" },
  { id: "default-3", label: "Enviar orçamento", content: "Segue o orçamento conforme conversado. Qualquer dúvida estou à disposição." },
  { id: "default-4", label: "Aguarde um momento", content: "Aguarde um momento, por favor. Já estou verificando para você." },
];

export function ChatPanel({
  conversation, messages, showDetails, onToggleDetails, onBack,
  onStatusChange, onSendMessage, onSendAudio, onSendFile, onRetryMessage, onDeleteMessage, onEditMessage,
  onArchive, onMarkUnread,
  currentUserId, onAssign, onRelease,
  instances, selectedInstanceId, onInstanceChange,
}: ChatPanelProps) {
  const { replies: dbReplies } = useQuickReplies();
  const [showQRManager, setShowQRManager] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<AttendingStatus>(conversation.attendingStatus);
  const [showStatusHistory, setShowStatusHistory] = useState(false);
  const [statusHistory, setStatusHistory] = useState<any[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set());

  const scrollToBottomAfterSend = useCallback(() => {
    setIsNearBottom(true);
    forceScrollOnNextMessageRef.current = true;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight });
    });
  }, []);

  const send = useSendMessage({
    conversationId: conversation.id,
    conversationName: conversation.name,
    conversationPhone: conversation.phone,
    onSendMessage,
    onSendAudio,
    onSendFile,
    onAfterSend: scrollToBottomAfterSend,
  });

  const {
    input, setInput, textareaRef, handleSend, handleKeyDown, handlePaste,
    replyTo, setReplyTo,
    showQuickReplies, setShowQuickReplies, getFilteredQuickReplies, handleQuickReply,
    pendingFile, pendingPreview, sendingFile, imageInputRef, fileInputRef,
    handleImageInput, handleDocInput, cancelPendingFile, sendPendingFile,
    isRecording, recordingTime, sendingAudio, startRecording, stopAndSend, cancelRecording,
  } = send;

  const allQuickReplies = dbReplies.length > 0 ? dbReplies : defaultQuickReplies;

  useEffect(() => { setCurrentStatus(conversation.attendingStatus); }, [conversation.id]);

  // Time in current status
  const [timeInStatus, setTimeInStatus] = useState("");
  useEffect(() => {
    const computeTime = () => {
      const changedAt = conversation.statusChangedAt ? new Date(conversation.statusChangedAt) : new Date();
      const diff = Math.max(0, Math.floor((Date.now() - changedAt.getTime()) / 1000));
      if (diff < 60) { setTimeInStatus(`${diff}s`); return; }
      if (diff < 3600) { setTimeInStatus(`${Math.floor(diff / 60)} min`); return; }
      if (diff < 86400) { setTimeInStatus(`${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}min`); return; }
      setTimeInStatus(`${Math.floor(diff / 86400)}d`);
    };
    computeTime();
    const interval = setInterval(computeTime, 10000);
    return () => clearInterval(interval);
  }, [conversation.statusChangedAt, currentStatus]);

  // Fetch status history when toggled
  useEffect(() => {
    if (!showStatusHistory) return;
    supabase
      .from("conversation_status_history")
      .select("*")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setStatusHistory(data || []));
  }, [showStatusHistory, conversation.id]);

  const [isNearBottom, setIsNearBottom] = useState(true);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const prevMsgCountRef = useRef(messages.length);
  const scrollPositionsRef = useRef<Record<string, number>>({});
  const pendingRestoreRef = useRef<string | null>(null);
  const forceScrollOnNextMessageRef = useRef(false);

  const scrollToBottom = useCallback((smooth?: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    if (smooth) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      el.scrollTop = el.scrollHeight;
    }
    scrollPositionsRef.current[conversation.id] = el.scrollTop;
    setNewMsgCount(0);
  }, [conversation.id]);

  const restoreScrollPosition = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const savedTop = scrollPositionsRef.current[conversation.id];
    if (typeof savedTop === "number") {
      el.scrollTop = Math.min(savedTop, Math.max(0, el.scrollHeight - el.clientHeight));
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      setIsNearBottom(nearBottom);
      return;
    }
    if (messages.length > 0) {
      el.scrollTop = el.scrollHeight;
      setIsNearBottom(true);
    }
  }, [conversation.id, messages.length]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    scrollPositionsRef.current[conversation.id] = el.scrollTop;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setIsNearBottom(nearBottom);
    if (nearBottom) setNewMsgCount(0);
  }, [conversation.id]);

  useEffect(() => {
    const diff = messages.length - prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;
    if (diff <= 0) return;

    if (forceScrollOnNextMessageRef.current || isNearBottom) {
      forceScrollOnNextMessageRef.current = false;
      requestAnimationFrame(() => scrollToBottom());
    } else {
      setNewMsgCount((c) => c + diff);
    }
  }, [messages.length, isNearBottom, scrollToBottom]);

  useEffect(() => {
    if (!isNearBottom || !conversation.id) return;
    const activeConversationIds = instances?.map((instance) => instance.id) ?? [conversation.id];
    const unreadReceived = messages.filter((m) => m.type === "received" && m.status !== "read");
    if (unreadReceived.length > 0) {
      supabase
        .from("conversation_messages")
        .update({ status: "read" } as any)
        .in("conversation_id", activeConversationIds)
        .eq("direction", "received")
        .or("status.eq.received,status.is.null")
        .then(() => {});
    }
  }, [isNearBottom, conversation.id, instances, messages]);

  useEffect(() => {
    pendingRestoreRef.current = conversation.id;
    setNewMsgCount(0);
  }, [conversation.id]);

  useLayoutEffect(() => {
    if (pendingRestoreRef.current !== conversation.id) return;
    restoreScrollPosition();
    if (messages.length > 0) {
      pendingRestoreRef.current = null;
    }
  }, [conversation.id, messages.length, restoreScrollPosition]);

  const filteredQuickReplies = getFilteredQuickReplies(allQuickReplies);
  useEffect(() => { setShowQuickReplies(input.startsWith("/") && filteredQuickReplies.length > 0); }, [input, filteredQuickReplies.length]);

  const handleStatusChangeInternal = useCallback((status: AttendingStatus) => {
    setCurrentStatus(status);
    onStatusChange?.(conversation.id, status);
  }, [conversation.id, onStatusChange]);

  const handleReply = useCallback((msg: Message) => {
    setReplyTo(msg);
    textareaRef.current?.focus();
  }, [setReplyTo, textareaRef]);

  const toggleSelectMsg = useCallback((msgId: string) => {
    setSelectedMsgIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId); else next.add(msgId);
      return next;
    });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedMsgIds(new Set());
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (!onDeleteMessage) return;
    const selectedMessages = messages.filter((m) => selectedMsgIds.has(m.id));
    selectedMessages.forEach((m) => onDeleteMessage(m));
    exitSelectionMode();
  }, [messages, selectedMsgIds, onDeleteMessage, exitSelectionMode]);

  // Exit selection mode on conversation change
  useEffect(() => { exitSelectionMode(); }, [conversation.id]);

  // Scroll to quoted message
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const handleScrollToQuoted = useCallback((quotedWaId: string) => {
    // Find message by whatsapp_message_id or id
    const target = messages.find((m) => m.whatsappMessageId === quotedWaId || m.id === quotedWaId);
    if (!target) return;
    const el = document.getElementById(`msg-${target.id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedMsgId(target.id);
      setTimeout(() => setHighlightedMsgId(null), 2000);
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full min-w-0 max-w-full overflow-hidden">
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageInput} />
      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.csv,.txt" className="hidden" onChange={handleDocInput} />

      <ChatHeader
        conversation={conversation}
        currentUserId={currentUserId}
        currentStatus={currentStatus}
        timeInStatus={timeInStatus}
        showDetails={showDetails}
        showStatusHistory={showStatusHistory}
        statusHistory={statusHistory}
        onBack={onBack}
        onToggleDetails={onToggleDetails}
        onToggleStatusHistory={() => setShowStatusHistory(!showStatusHistory)}
        onStatusChange={handleStatusChangeInternal}
        onAssign={onAssign}
        onRelease={onRelease}
        onMarkUnread={onMarkUnread}
        onArchive={onArchive}
        onSelectMessages={() => setSelectionMode(true)}
      />

      {/* Selection toolbar */}
      {selectionMode && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border-b border-border/40">
          <button onClick={exitSelectionMode} className="p-1 rounded hover:bg-muted/50">
            <X className="w-4 h-4 text-foreground" />
          </button>
          <span className="text-xs font-medium text-foreground flex-1">
            {selectedMsgIds.size} selecionada{selectedMsgIds.size !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() => { const all = new Set(messages.map(m => m.id)); setSelectedMsgIds(all); }}
            className="text-[11px] text-primary hover:underline"
          >
            Selecionar tudo
          </button>
          {selectedMsgIds.size > 0 && onDeleteMessage && (
            <button onClick={handleDeleteSelected} className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-400 px-2 py-1 rounded-md bg-red-500/10">
              <Trash2 className="w-3 h-3" /> Apagar ({selectedMsgIds.size})
            </button>
          )}
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 relative overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto px-3 py-4 space-y-0.5"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, hsl(var(--muted) / 0.3) 1px, transparent 0)", backgroundSize: "32px 32px", scrollBehavior: "smooth" }}
      >
        {messages.map((msg, i) => {
          const showDate = i === 0 || format(new Date(messages[i - 1].timestamp), "dd/MM/yyyy") !== format(new Date(msg.timestamp), "dd/MM/yyyy");
          const prevMsg = i > 0 ? messages[i - 1] : null;
          const showDevice = !!(instances && instances.length > 1) && msg.deviceName !== prevMsg?.deviceName;
          const directionChanged = prevMsg && prevMsg.type !== msg.type;

          return (
            <div key={msg.id} id={`msg-${msg.id}`} className={cn("animate-fade-in transition-colors duration-500", directionChanged && !showDate && "mt-3", highlightedMsgId === msg.id && "bg-primary/10 rounded-lg")}>
              {showDate && (
                <div className="flex justify-center my-4">
                  <span className="text-[10px] font-medium text-muted-foreground/70 bg-muted/60 px-3 py-1 rounded-full">
                    {format(new Date(msg.timestamp), "dd 'de' MMMM", { locale: ptBR })}
                  </span>
                </div>
              )}
              <MessageBubble
                msg={msg}
                showDeviceLabel={showDevice}
                onReply={handleReply}
                onImageClick={setLightboxUrl}
                onRetry={onRetryMessage}
                onDelete={onDeleteMessage}
                onEdit={onEditMessage}
                selectionMode={selectionMode}
                isSelected={selectedMsgIds.has(msg.id)}
                onToggleSelect={toggleSelectMsg}
                onScrollToQuoted={handleScrollToQuoted}
              />
            </div>
          );
        })}

        {/* Typing indicator */}
        {conversation.status === "typing" && (
          <div className="flex justify-start mb-2 ml-1 animate-fade-in">
            <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-2.5 flex items-center gap-1.5">
              <div className="flex items-center gap-[3px]">
                <span className="w-[6px] h-[6px] bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-[6px] h-[6px] bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-[6px] h-[6px] bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="text-[10px] text-muted-foreground/60 ml-1">digitando...</span>
            </div>
          </div>
        )}
      </div>

      {/* Scroll to bottom FAB */}
      {!isNearBottom && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-4 right-4 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-card border border-border shadow-lg hover:bg-muted transition-all duration-200 animate-scale-in hover:scale-110"
        >
          <ChevronDown className="w-5 h-5 text-foreground" />
          {newMsgCount > 0 && (
            <span className="absolute -top-1.5 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 animate-in zoom-in-50 shadow-sm shadow-red-500/30">
              {newMsgCount > 99 ? "99+" : newMsgCount}
            </span>
          )}
        </button>
      )}
      </div>

      {/* Quick Replies */}
      {showQuickReplies && (
        <div className="border-t border-border bg-card/90 backdrop-blur-sm">
          <div className="px-4 py-2 flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Respostas Rápidas</span>
            </div>
            <button onClick={() => { setShowQuickReplies(false); setInput(""); setShowQRManager(true); }} className="text-[10px] text-primary hover:underline">
              <Settings className="w-3.5 h-3.5 inline mr-0.5" />Gerenciar
            </button>
          </div>
          <div className="px-2 pb-2 space-y-0.5 max-h-[240px] overflow-y-auto">
            {filteredQuickReplies.map((qr) => {
              const catInfo = QUICK_REPLY_CATEGORIES.find((c) => c.value === (qr as any).category);
              const preview = resolveVariables(qr.content, {
                nome: conversation.name || "",
                telefone: conversation.phone || "",
              });
              return (
                <button key={qr.id} onClick={() => handleQuickReply(qr.content)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors group">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-foreground">/{qr.label}</span>
                    {catInfo && (
                      <span className={cn("text-[9px] px-1.5 py-0 rounded-md border font-medium", catInfo.color)}>
                        {catInfo.label}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground truncate block">{preview}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Reply Preview */}
      {replyTo && (
        <div className="border-t border-border bg-card/90 backdrop-blur-sm px-4 py-2 flex items-center gap-3">
          <div className="w-1 h-8 rounded-full bg-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-primary">
              {replyTo.type === "sent" ? "Você" : conversation.name}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {replyTo.content?.substring(0, 80) || "💬 Mensagem"}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="w-7 h-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => setReplyTo(null)}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* File Preview */}
      {pendingFile && (
        <div className="border-t border-border bg-card/90 backdrop-blur-sm p-3">
          <div className="flex items-start gap-3">
            {pendingPreview ? (
              <img src={pendingPreview} alt="Preview" className="w-20 h-20 rounded-lg object-cover border border-border" />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-muted/50 border border-border flex items-center justify-center">
                <span className="text-3xl">{getFileIcon(pendingFile.name)}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{pendingFile.name}</p>
              <p className="text-[11px] text-muted-foreground">{formatFileSize(pendingFile.size)}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-foreground" onClick={cancelPendingFile}>
                <X className="w-4 h-4" />
              </Button>
              <Button size="icon" className="w-9 h-9 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm" onClick={sendPendingFile} disabled={sendingFile}>
                {sendingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Instance Selector + Input Area */}
      <div className="border-t border-border/40 bg-card/30 shrink-0 min-w-0 max-w-full pb-[env(safe-area-inset-bottom,0px)]">
        {instances && instances.filter(i => i.deviceName).length > 1 && (
          <div className="flex items-center gap-1.5 px-4 pt-1.5 pb-0">
            <span className="text-[9px] text-muted-foreground/50 shrink-0">via:</span>
            <div className="flex gap-1 overflow-x-auto scrollbar-none">
              {instances.filter(i => i.deviceName).map((inst) => (
                <button
                  key={inst.id}
                  onClick={() => onInstanceChange?.(inst.id)}
                  className={cn(
                    "text-[9px] px-1.5 py-0.5 rounded-md whitespace-nowrap transition-colors font-medium",
                    selectedInstanceId === inst.id
                      ? "bg-primary/15 text-primary font-semibold"
                      : "text-muted-foreground/40 hover:text-muted-foreground/60"
                  )}
                >
                  {inst.deviceName}
                </button>
              ))}
            </div>
          </div>
        )}
      <div className="px-3 py-1.5">
        {isRecording ? (
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="w-9 h-9 shrink-0 text-red-400 hover:text-red-300" onClick={cancelRecording}>
              <Trash2 className="w-4 h-4" />
            </Button>
            <div className="flex-1 flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
              <span className="text-sm font-medium text-foreground">{formatDuration(recordingTime)}</span>
              <div className="flex items-center gap-[2px] flex-1 h-6 overflow-hidden">
                {Array.from({ length: 40 }).map((_, i) => (
                  <div key={i} className="w-[2px] rounded-full bg-red-400/60" style={{ height: `${Math.random() * 16 + 4}px`, animation: "pulse 0.5s ease-in-out infinite", animationDelay: `${i * 0.03}s` }} />
                ))}
              </div>
            </div>
            <Button size="icon" className="w-10 h-10 shrink-0 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 shadow-md" onClick={stopAndSend} disabled={sendingAudio}>
              {sendingAudio ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="w-9 h-9 shrink-0 text-muted-foreground hover:text-foreground mb-0.5">
                  <Paperclip className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start">
                <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => imageInputRef.current?.click()}>
                  <ImageIcon className="w-4 h-4" /> Imagem
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <FileText className="w-4 h-4" /> Arquivo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                placeholder="Digite / para respostas rápidas..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                rows={1}
                className="w-full resize-none rounded-xl bg-muted/30 border border-border/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
                style={{ minHeight: "40px", maxHeight: "120px" }}
              />
            </div>

            {input.trim() ? (
              <Button size="icon" className="w-9 h-9 shrink-0 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm mb-0.5" onClick={handleSend}>
                <Send className="w-4 h-4" />
              </Button>
            ) : (
              <Button size="icon" variant="ghost" className="w-9 h-9 shrink-0 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 mb-0.5" onClick={startRecording}>
                <Mic className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}
      </div>
      </div>

      <QuickRepliesManager open={showQRManager} onOpenChange={setShowQRManager} />
      {lightboxUrl && <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
}
