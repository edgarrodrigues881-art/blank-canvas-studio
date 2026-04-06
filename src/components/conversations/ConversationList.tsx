import { Search, Check, CheckCheck, MessageSquarePlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { type Conversation } from "./types";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelect: (c: Conversation) => void;
  onNewConversationClick?: () => void;
}

type StatusTab = "all" | "new" | "attending" | "waiting";

const statusTabs: { key: StatusTab; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "new", label: "Novas" },
  { key: "attending", label: "Em Atendimento" },
  { key: "waiting", label: "Aguardando" },
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

export function ConversationList({
  conversations,
  selectedId,
  searchQuery,
  onSearchChange,
  onSelect,
  onNewConversationClick,
}: ConversationListProps) {
  const [activeStatus, setActiveStatus] = useState<StatusTab>("all");

  const filtered = conversations.filter((c) => {
    if (activeStatus === "all") return true;
    if (activeStatus === "new") return c.unreadCount > 0;
    if (activeStatus === "attending") return c.attendingStatus === "em_atendimento";
    if (activeStatus === "waiting") return c.attendingStatus === "aguardando";
    return true;
  });

  const statusCount = (tab: StatusTab) => {
    if (tab === "all") return conversations.length;
    if (tab === "new") return conversations.filter((c) => c.unreadCount > 0).length;
    if (tab === "attending") return conversations.filter((c) => c.attendingStatus === "em_atendimento").length;
    if (tab === "waiting") return conversations.filter((c) => c.attendingStatus === "aguardando").length;
    return 0;
  };

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
            placeholder="Buscar nome ou número..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-7 text-xs bg-muted/30 border-border/50 rounded-lg"
          />
        </div>

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
                        {displayName || formatPhone(c.phone)}
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
                        {formatPhone(c.phone)}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-1.5 mt-0.5">
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        {c.lastMessageStatus && <MessageTicks status={c.lastMessageStatus} />}
                        <p className={cn(
                          "text-[11px] truncate",
                          hasUnread ? "text-foreground font-semibold" : "text-muted-foreground"
                        )}>
                          {c.status === "typing" ? (
                            <span className="text-emerald-400 italic">digitando...</span>
                          ) : mediaPreview ? (
                            <span>{mediaPreview.icon} {mediaPreview.text}</span>
                          ) : (
                            c.lastMessage || "..."
                          )}
                        </p>
                      </div>
                      {hasUnread && (
                        <span className="min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-primary text-primary-foreground rounded-full flex items-center justify-center shrink-0">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
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
