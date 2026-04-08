import { Search, Check, CheckCheck, MessageSquarePlus, Tag, X, ArchiveRestore, Smartphone, CheckSquare, Square, Trash2, Archive, XCircle, Pencil, MailOpen, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { type Conversation } from "./types";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useState, useMemo, Fragment, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { formatPhone } from "@/utils/formatters";
import { getMessagePreview } from "@/utils/fileHelpers";

interface InstanceFilter {
  id: string;
  name: string;
  number: string;
}

interface ConversationListProps {
  conversations: Conversation[];
  archivedConversations?: Conversation[];
  selectedId: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelect: (c: Conversation) => void;
  onNewConversationClick?: () => void;
  currentUserId?: string;
  onUnarchive?: (conversationId: string) => void;
  availableInstances?: InstanceFilter[];
  filterInstanceIds?: string[];
  onFilterInstancesChange?: (ids: string[]) => void;
  onBulkArchive?: (ids: string[]) => void;
  onBulkDelete?: (ids: string[]) => void;
  onMarkUnread?: (conversationId: string) => void;
}

type StatusTab = "all" | "mine" | "new" | "attending" | "waiting" | "archived";

const statusTabs: { key: StatusTab; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "mine", label: "Minhas" },
  { key: "new", label: "Novas" },
  { key: "attending", label: "Em Atendimento" },
  { key: "waiting", label: "Aguardando" },
  { key: "archived", label: "Arquivadas" },
];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Ontem";
  return format(d, "dd/MM", { locale: ptBR });
}


const avatarColors = [
  "bg-emerald-600/20 text-emerald-300",
  "bg-blue-600/20 text-blue-300",
  "bg-violet-600/20 text-violet-300",
  "bg-amber-600/20 text-amber-300",
  "bg-pink-600/20 text-pink-300",
  "bg-cyan-600/20 text-cyan-300",
  "bg-teal-600/20 text-teal-300",
  "bg-indigo-600/20 text-indigo-300",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function MessageTicks({ status }: { status?: "sent" | "delivered" | "read" }) {
  if (!status) return null;
  if (status === "sent") return <Check className="w-3.5 h-3.5 text-muted-foreground/50" />;
  if (status === "delivered") return <CheckCheck className="w-3.5 h-3.5 text-muted-foreground/50" />;
  if (status === "read") return <CheckCheck className="w-3.5 h-3.5 text-blue-400" />;
  return null;
}

/** Highlight matching text portions */
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-primary/25 text-foreground rounded-[2px] px-[1px]">{part}</mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
}

/** Check where the match occurred for showing context */
function getMatchContext(c: Conversation, query: string): string | null {
  if (!query) return null;
  const q = query.toLowerCase();
  if (c.lastMessage && c.lastMessage.toLowerCase().includes(q)) return "mensagem";
  if (c.tags && c.tags.some((t) => t.toLowerCase().includes(q))) return "tag";
  return null;
}

export function ConversationList({
  conversations,
  selectedId,
  searchQuery,
  onSearchChange,
  onSelect,
  onNewConversationClick,
  currentUserId,
  archivedConversations = [],
  onUnarchive,
  availableInstances = [],
  filterInstanceIds = [],
  onFilterInstancesChange,
  onBulkArchive,
  onBulkDelete,
  onMarkUnread,
}: ConversationListProps) {
  const [activeStatus, setActiveStatus] = useState<StatusTab>("all");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);
  const [contextPos, setContextPos] = useState({ x: 0, y: 0 });

  const toggleInstance = (id: string) => {
    if (!onFilterInstancesChange) return;
    const next = filterInstanceIds.includes(id)
      ? filterInstanceIds.filter((i) => i !== id)
      : [...filterInstanceIds, id];
    onFilterInstancesChange(next);
  };

  const baseList = activeStatus === "archived" ? archivedConversations : conversations;

  const filtered = baseList.filter((c) => {
    if (activeStatus === "archived") return true;
    if (activeStatus === "all") return true;
    if (activeStatus === "mine") return c.assignedTo === currentUserId;
    if (activeStatus === "new") return c.unreadCount > 0;
    if (activeStatus === "attending") return c.attendingStatus === "em_atendimento";
    if (activeStatus === "waiting") return c.attendingStatus === "aguardando";
    return true;
  });

  const statusCount = (tab: StatusTab) => {
    if (tab === "archived") return archivedConversations.length;
    if (tab === "all") return conversations.length;
    if (tab === "mine") return conversations.filter((c) => c.assignedTo === currentUserId).length;
    if (tab === "new") return conversations.filter((c) => c.unreadCount > 0).length;
    if (tab === "attending") return conversations.filter((c) => c.attendingStatus === "em_atendimento").length;
    if (tab === "waiting") return conversations.filter((c) => c.attendingStatus === "aguardando").length;
    return 0;
  };

  const trimmedQuery = searchQuery.trim();

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(filtered.map((c) => c.id)));
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const selectedCountLabel = `${selectedIds.size} selecionada${selectedIds.size > 1 ? "s" : ""}`;
  const contextMenuLeft =
    typeof window === "undefined"
      ? contextPos.x
      : Math.max(8, Math.min(contextPos.x + 6, window.innerWidth - 192));
  const contextMenuTop =
    typeof window === "undefined"
      ? contextPos.y
      : Math.max(8, Math.min(contextPos.y + 6, window.innerHeight - 220));

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Search */}
      <div className="px-3 pt-2.5 pb-2 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <Input
            placeholder="Buscar conversa, nome ou número..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 pr-9 h-9 text-sm bg-muted/20 border-border/30 rounded-xl placeholder:text-muted-foreground/40"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {trimmedQuery && (
          <div className="text-[11px] text-muted-foreground px-0.5">
            {filtered.length} resultado{filtered.length !== 1 ? "s" : ""} para "<span className="text-foreground font-medium">{trimmedQuery}</span>"
          </div>
        )}

        {/* Selection mode bar */}
        {selectionMode && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-muted/20 px-2 py-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                <CheckSquare className="w-3.5 h-3.5" />
                {selectedCountLabel}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-lg px-2 text-[11px] gap-1.5"
                onClick={selectedIds.size === filtered.length ? () => setSelectedIds(new Set()) : selectAllVisible}
              >
                {selectedIds.size === filtered.length ? <Square className="w-3.5 h-3.5" /> : <CheckSquare className="w-3.5 h-3.5" />}
                {selectedIds.size === filtered.length ? "Desmarcar" : "Todas"}
              </Button>
              {selectedIds.size > 0 && onBulkArchive && (
                <Button variant="ghost" size="sm" className="h-7 rounded-lg px-2 text-[11px] gap-1.5" onClick={() => { onBulkArchive(Array.from(selectedIds)); exitSelectionMode(); }}>
                  <Archive className="w-3.5 h-3.5" /> Arquivar
                </Button>
              )}
              {selectedIds.size > 0 && onBulkDelete && (
                <Button variant="ghost" size="sm" className="h-7 rounded-lg px-2 text-[11px] gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => { onBulkDelete(Array.from(selectedIds)); exitSelectionMode(); }}>
                  <Trash2 className="w-3.5 h-3.5" /> Apagar
                </Button>
              )}
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-lg text-muted-foreground hover:text-foreground" onClick={exitSelectionMode}>
              <XCircle className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {/* Status filter tabs */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-0.5 pb-0.5">
          {statusTabs.map((tab) => {
            const count = statusCount(tab.key);
            const isActive = activeStatus === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveStatus(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all duration-150",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                {tab.label}
                <span className={cn(
                  "text-[9px] min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center font-bold",
                  isActive
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted-foreground/10 text-muted-foreground"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-border/30" />

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        <div className="pb-14">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              Nenhuma conversa encontrada
            </div>
          ) : (
            filtered.map((c) => {
              const isSelected = selectedId === c.id;
              const hasUnread = c.unreadCount !== 0;
              const isManualUnread = c.unreadCount < 0;
              const hasNewMessages = c.unreadCount > 0;
              const displayName = c.name && c.name !== c.phone ? c.name : null;
              const avatarLabel = displayName || c.phone;
              const avatarCls = getAvatarColor(avatarLabel);
              const mediaPreview = getMessagePreview(c.lastMessage);
              const matchedTags = trimmedQuery
                ? (c.tags || []).filter((t) => t.toLowerCase().includes(trimmedQuery.toLowerCase()))
                : [];

              return (
                <div
                  key={c.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenuId(c.id);
                    setContextPos({ x: e.clientX, y: e.clientY });
                  }}
                >
                  <button
                    onClick={() => (selectionMode ? toggleSelect(c.id) : onSelect(c))}
                    className={cn(
                      "w-full flex items-center text-left transition-colors duration-100 gap-3 px-4 py-2.5",
                      isSelected
                        ? "bg-primary/8"
                        : "hover:bg-muted/10",
                      selectionMode && selectedIds.has(c.id) && "bg-primary/8"
                    )}
                  >
                    {selectionMode && (
                      <div className="shrink-0" onClick={(e) => { e.stopPropagation(); toggleSelect(c.id); }}>
                        <Checkbox checked={selectedIds.has(c.id)} className="w-4 h-4" />
                      </div>
                    )}

                    {/* Avatar */}
                    <div className="relative shrink-0">
                      {c.avatar_url ? (
                        <img
                          src={c.avatar_url}
                          alt={avatarLabel}
                          className="w-[46px] h-[46px] rounded-full object-cover"
                        />
                      ) : (
                        <div className={cn("w-[46px] h-[46px] rounded-full flex items-center justify-center font-semibold text-sm", avatarCls)}>
                          {avatarLabel.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 py-0.5">
                      {/* Row 1: Name + Time */}
                      <div className="flex items-baseline justify-between gap-1.5 overflow-hidden">
                        <span className={cn(
                          "truncate text-[13.5px] leading-tight min-w-0",
                          hasUnread ? "font-bold text-foreground" : "font-medium text-foreground/85"
                        )}>
                          {trimmedQuery ? (
                            <HighlightText text={displayName || formatPhone(c.phone)} query={trimmedQuery} />
                          ) : (
                            displayName || formatPhone(c.phone)
                          )}
                        </span>
                        <span className={cn(
                          "shrink-0 text-[10.5px] leading-tight whitespace-nowrap",
                          hasNewMessages ? "text-emerald-500 font-semibold" : "text-muted-foreground/50"
                        )}>
                          {c.lastMessageAt ? formatDate(c.lastMessageAt) : ""}
                        </span>
                      </div>

                      {/* Row 2: Last message + Badge */}
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
                          {c.lastMessageStatus && <MessageTicks status={c.lastMessageStatus} />}
                          <p className={cn(
                            "truncate text-[12.5px] leading-snug",
                            hasUnread ? "text-foreground/70" : "text-muted-foreground/50"
                          )}>
                            {c.status === "typing" ? (
                              <span className="text-emerald-400 italic">digitando...</span>
                            ) : mediaPreview ? (
                              <span>{mediaPreview.icon} {mediaPreview.text}</span>
                            ) : trimmedQuery && c.lastMessage ? (
                              <HighlightText text={c.lastMessage} query={trimmedQuery} />
                            ) : (
                              c.lastMessage || "..."
                            )}
                          </p>
                        </div>

                        {/* Unread indicators */}
                        {hasNewMessages && (
                          <span className="min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-emerald-500 text-white rounded-full flex items-center justify-center shrink-0">
                            {c.unreadCount}
                          </span>
                        )}
                        {isManualUnread && (
                          <span className="w-[10px] h-[10px] rounded-full bg-emerald-500 shrink-0" />
                        )}

                        {activeStatus === "archived" && onUnarchive && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onUnarchive(c.id); }}
                            className="shrink-0 text-[10px] text-primary hover:text-primary/80 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 hover:bg-primary/20 transition-colors"
                            title="Desarquivar"
                          >
                            <ArchiveRestore className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {matchedTags.length > 0 && (
                        <div className="flex items-center gap-1 mt-1 overflow-hidden">
                          <Tag className="w-2.5 h-2.5 text-primary/60 shrink-0" />
                          {matchedTags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[9px] px-1.5 py-0 h-4 rounded-md border-primary/30 text-primary/80 bg-primary/5">
                              <HighlightText text={tag} query={trimmedQuery} />
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                  {/* Subtle separator */}
                  <div className="h-px bg-border/20 ml-[70px]" />
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {contextMenuId && createPortal(
        <div
          className="fixed inset-0 z-[9999]"
          onClick={() => setContextMenuId(null)}
          onContextMenu={(e) => { e.preventDefault(); setContextMenuId(null); }}
        >
          <div
            className="fixed z-[51] w-[176px] rounded-xl border border-border/60 bg-popover/95 p-1 shadow-2xl backdrop-blur-md animate-in fade-in-0 zoom-in-95"
            style={{
              left: contextMenuLeft,
              top: contextMenuTop,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[12px] font-medium text-foreground transition-colors hover:bg-muted/60"
              onClick={() => {
                setSelectionMode(true);
                setSelectedIds(new Set([contextMenuId]));
                setContextMenuId(null);
              }}
            >
              <CheckSquare className="w-3.5 h-3.5 text-muted-foreground" />
              Selecionar
            </button>

            {onBulkArchive && (
              <button
                className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[12px] font-medium text-foreground transition-colors hover:bg-muted/60"
                onClick={() => {
                  onBulkArchive([contextMenuId]);
                  setContextMenuId(null);
                }}
              >
                <Archive className="w-3.5 h-3.5 text-muted-foreground" />
                Arquivar
              </button>
            )}

            <button
              className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[12px] font-medium text-foreground transition-colors hover:bg-muted/60"
              onClick={() => {
                const conv = filtered.find((c) => c.id === contextMenuId);
                if (conv) onSelect(conv);
                setContextMenuId(null);
              }}
            >
              <Tag className="w-3.5 h-3.5 text-muted-foreground" />
              Marcar com tag
            </button>

            {onMarkUnread && (
              <button
                className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[12px] font-medium text-foreground transition-colors hover:bg-muted/60"
                onClick={() => {
                  onMarkUnread(contextMenuId);
                  setContextMenuId(null);
                }}
              >
                <MailOpen className="w-3.5 h-3.5 text-muted-foreground" />
                Marcar como não lida
              </button>
            )}

            <div className="my-1 h-px bg-border/50" />

            {onBulkDelete && (
              <button
                className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[12px] font-medium text-destructive transition-colors hover:bg-destructive/10"
                onClick={() => {
                  onBulkDelete([contextMenuId]);
                  setContextMenuId(null);
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Apagar conversa
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
