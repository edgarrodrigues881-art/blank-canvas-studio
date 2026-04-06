import { Search, Check, CheckCheck, MessageSquarePlus, Tag, X, ArchiveRestore, Smartphone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type Conversation } from "./types";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useState, useMemo, Fragment } from "react";

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

function getMessagePreview(msg: string | undefined | null): { icon: string; text: string } | null {
  if (!msg) return null;
  const lower = msg.toLowerCase().trim();
  if (lower.includes("[image]") || lower.includes("[foto]") || lower === "image" || lower === "foto")
    return { icon: "📷", text: "Foto" };
  if (lower.includes("[audio]") || lower.includes("[áudio]") || lower === "audio" || lower === "áudio" || lower.includes("[ptt]"))
    return { icon: "🎧", text: "Áudio" };
  if (lower.includes("[video]") || lower.includes("[vídeo]") || lower === "video" || lower === "vídeo")
    return { icon: "🎬", text: "Vídeo" };
  if (lower.includes("[document]") || lower.includes("[documento]") || lower.includes("[arquivo]") || lower === "document" || lower === "documento")
    return { icon: "📎", text: "Arquivo" };
  if (lower.includes("[sticker]") || lower.includes("[figurinha]") || lower === "sticker")
    return { icon: "🏷️", text: "Figurinha" };
  if (lower.includes("[contact]") || lower.includes("[contato]"))
    return { icon: "👤", text: "Contato" };
  if (lower.includes("[location]") || lower.includes("[localização]"))
    return { icon: "📍", text: "Localização" };
  return null;
}

function formatPhone(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  if (digits.length >= 10) {
    return `+${digits}`;
  }
  return phone;
}

const avatarColors = [
  "bg-emerald-500/15 text-emerald-400",
  "bg-blue-500/15 text-blue-400",
  "bg-violet-500/15 text-violet-400",
  "bg-amber-500/15 text-amber-400",
  "bg-pink-500/15 text-pink-400",
  "bg-cyan-500/15 text-cyan-400",
  "bg-red-500/15 text-red-400",
  "bg-orange-500/15 text-orange-400",
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
}: ConversationListProps) {
  const [activeStatus, setActiveStatus] = useState<StatusTab>("all");

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

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-3 pt-2.5 pb-2 space-y-2 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-foreground">Atendimento</h2>
            <span className="text-[10px] text-muted-foreground">{conversations.length} conversas</span>
          </div>
          {onNewConversationClick && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-lg px-2.5 text-[10px] shrink-0"
              onClick={onNewConversationClick}
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              Nova conversa
            </Button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar nome, número, mensagem ou tag..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 pr-8 h-7 text-xs bg-muted/30 border-border/50 rounded-lg"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {trimmedQuery && (
          <div className="text-[10px] text-muted-foreground">
            {filtered.length} resultado{filtered.length !== 1 ? "s" : ""} para "<span className="text-foreground font-medium">{trimmedQuery}</span>"
          </div>
        )}

        <div className="flex gap-0.5 overflow-x-auto scrollbar-none -mx-0.5">
          {statusTabs.map((tab) => {
            const count = statusCount(tab.key);
            return (
              <button
                key={tab.key}
                onClick={() => setActiveStatus(tab.key)}
                className={cn(
                  "px-1.5 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap transition-all flex items-center gap-0.5",
                  activeStatus === tab.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {tab.label}
                <span className={cn(
                  "text-[9px] min-w-[12px] h-3 px-0.5 rounded-full flex items-center justify-center font-bold",
                  activeStatus === tab.key
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted-foreground/15 text-muted-foreground"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Instance filter chips */}
        {availableInstances.length > 1 && (
          <div className="flex gap-1 overflow-x-auto scrollbar-none -mx-0.5 pt-1">
            <button
              onClick={() => onFilterInstancesChange?.([])}
              className={cn(
                "px-1.5 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap transition-all flex items-center gap-0.5",
                filterInstanceIds.length === 0
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              Todas
            </button>
            {availableInstances.map((inst) => {
              const isActive = filterInstanceIds.includes(inst.id);
              return (
                <button
                  key={inst.id}
                  onClick={() => toggleInstance(inst.id)}
                  className={cn(
                    "px-1.5 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap transition-all flex items-center gap-0.5",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {inst.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div>
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              Nenhuma conversa encontrada
            </div>
          ) : (
            filtered.map((c) => {
              const isSelected = selectedId === c.id;
              const hasUnread = c.unreadCount > 0;
              const displayName = c.name && c.name !== c.phone ? c.name : null;
              const avatarLabel = displayName || c.phone;
              const avatarCls = getAvatarColor(avatarLabel);
              const mediaPreview = getMessagePreview(c.lastMessage);
              const matchCtx = getMatchContext(c, trimmedQuery);
              const matchedTags = trimmedQuery
                ? (c.tags || []).filter((t) => t.toLowerCase().includes(trimmedQuery.toLowerCase()))
                : [];

              return (
                <button
                  key={c.id}
                  onClick={() => onSelect(c)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all border-l-2",
                    isSelected
                      ? "bg-primary/8 border-l-primary"
                      : hasUnread
                        ? "border-l-primary/70 bg-primary/[0.03] hover:bg-primary/[0.06]"
                        : "border-l-transparent hover:bg-muted/20"
                  )}
                >
                  <div className="relative shrink-0">
                    {c.avatar_url ? (
                      <img src={c.avatar_url} alt={avatarLabel} className="w-11 h-11 rounded-full object-cover" />
                    ) : (
                      <div className={cn("w-11 h-11 rounded-full flex items-center justify-center", avatarCls)}>
                        <span className="text-sm font-bold">{avatarLabel.slice(0, 2).toUpperCase()}</span>
                      </div>
                    )}
                    {c.status === "online" && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-background" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn(
                        "text-[13px] truncate",
                        hasUnread ? "font-bold text-foreground" : "font-medium text-foreground"
                      )}>
                        {trimmedQuery ? (
                          <HighlightText text={displayName || formatPhone(c.phone)} query={trimmedQuery} />
                        ) : (
                          displayName || formatPhone(c.phone)
                        )}
                      </span>
                      <span className={cn(
                        "text-[10px] shrink-0",
                        hasUnread ? "text-primary font-semibold" : "text-muted-foreground/60 font-medium"
                      )}>
                        {c.lastMessageAt ? formatDate(c.lastMessageAt) : ""}
                      </span>
                    </div>

                    {displayName && (
                      <p className="text-[10px] text-muted-foreground/50 truncate leading-tight">
                        {trimmedQuery ? (
                          <HighlightText text={formatPhone(c.phone)} query={trimmedQuery} />
                        ) : (
                          formatPhone(c.phone)
                        )}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-1.5 mt-0.5">
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        {c.lastMessageStatus && <MessageTicks status={c.lastMessageStatus} />}
                        <p className={cn(
                          "text-[11px] truncate",
                          hasUnread ? "text-foreground font-semibold" : "text-muted-foreground",
                          matchCtx === "mensagem" && "text-primary/80"
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
                      {hasUnread && (
                        <span className="min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-red-500 text-white rounded-full flex items-center justify-center shrink-0 animate-in zoom-in-50 duration-200 shadow-sm shadow-red-500/30">
                          {c.unreadCount}
                        </span>
                      )}
                      {activeStatus === "archived" && onUnarchive && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onUnarchive(c.id); }}
                          className="shrink-0 text-[10px] text-primary hover:text-primary/80 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 hover:bg-primary/20 transition-colors"
                          title="Desarquivar"
                        >
                          <ArchiveRestore className="w-3 h-3" />
                          <span className="hidden sm:inline">Desarquivar</span>
                        </button>
                      )}
                    </div>

                    {/* Matched tags */}
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
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
