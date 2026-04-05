import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
}

type StatusTab = "all" | "new" | "attending" | "waiting";
type CategoryTab = "all" | "vendas" | "financeiro" | "suporte";

const statusTabs: { key: StatusTab; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "new", label: "Novas" },
  { key: "attending", label: "Em Atendimento" },
  { key: "waiting", label: "Aguardando" },
];

const categoryTabs: { key: CategoryTab; label: string; color?: string; dot?: string }[] = [
  { key: "all", label: "Todas" },
  { key: "vendas", label: "Vendas", color: "text-emerald-400", dot: "bg-emerald-400" },
  { key: "financeiro", label: "Financeiro", color: "text-amber-400", dot: "bg-amber-400" },
  { key: "suporte", label: "Suporte", color: "text-blue-400", dot: "bg-blue-400" },
];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Ontem";
  return format(d, "dd/MM", { locale: ptBR });
}

const tagColors: Record<string, string> = {
  "novo lead": "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  lead: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  interessado: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  cliente: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  vip: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  cobrança: "bg-red-500/15 text-red-400 border-red-500/20",
  suporte: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  prospect: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  urgente: "bg-red-500/15 text-red-400 border-red-500/20",
};

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

export function ConversationList({ conversations, selectedId, searchQuery, onSearchChange, onSelect }: ConversationListProps) {
  const [activeStatus, setActiveStatus] = useState<StatusTab>("all");
  const [activeCategory, setActiveCategory] = useState<CategoryTab>("all");

  const onlineCount = conversations.filter((c) => c.status === "online").length;

  // Filter by status tab
  const filteredByStatus = conversations.filter((c) => {
    if (activeStatus === "all") return true;
    if (activeStatus === "new") return c.unreadCount > 0;
    if (activeStatus === "attending") return c.status === "online" || c.status === "typing";
    if (activeStatus === "waiting") return c.status === "offline" && c.unreadCount === 0;
    return true;
  });

  // Filter by category
  const filtered = filteredByStatus.filter((c) => {
    if (activeCategory === "all") return true;
    return c.tags.some((t) => t.toLowerCase() === activeCategory);
  });

  const statusCount = (tab: StatusTab) => {
    if (tab === "all") return conversations.length;
    if (tab === "new") return conversations.filter((c) => c.unreadCount > 0).length;
    if (tab === "attending") return conversations.filter((c) => c.status === "online" || c.status === "typing").length;
    if (tab === "waiting") return conversations.filter((c) => c.status === "offline" && c.unreadCount === 0).length;
    return 0;
  };

  return (
    <>
      {/* Header */}
      <div className="p-4 pb-3 space-y-3 border-b border-border">
        {/* Title + online indicator */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">Atendimento</h2>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-400 font-semibold">{onlineCount} online</span>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversa..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9 text-sm bg-muted/30 border-border/50 rounded-lg"
          />
        </div>

        {/* Status Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
          {statusTabs.map((tab) => {
            const count = statusCount(tab.key);
            return (
              <button
                key={tab.key}
                onClick={() => setActiveStatus(tab.key)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all flex items-center gap-1.5",
                  activeStatus === tab.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {tab.label}
                <span className={cn(
                  "text-[9px] min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center font-bold",
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

        {/* Category Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {categoryTabs.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 border",
                activeCategory === cat.key
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border/50 bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              )}
            >
              {cat.dot && <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", cat.dot)} />}
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div>
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhuma conversa encontrada
            </div>
          ) : (
            filtered.map((c) => {
              const isSelected = selectedId === c.id;
              const avatarCls = getAvatarColor(c.name);
              return (
                <button
                  key={c.id}
                  onClick={() => onSelect(c)}
                  className={cn(
                    "w-full flex items-start gap-3 px-4 py-3 text-left transition-all border-l-2",
                    isSelected
                      ? "bg-primary/5 border-l-primary"
                      : "border-l-transparent hover:bg-muted/20"
                  )}
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    {c.avatar_url ? (
                      <img src={c.avatar_url} alt={c.name} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", avatarCls)}>
                        <span className="text-sm font-bold">{c.name.slice(0, 2).toUpperCase()}</span>
                      </div>
                    )}
                    {c.status === "online" && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-background" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("text-[13px] truncate", c.unreadCount > 0 ? "font-bold text-foreground" : "font-medium text-foreground")}>
                        {c.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 shrink-0 font-medium">
                        {formatDate(c.lastMessageAt)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className={cn("text-[11px] truncate", c.unreadCount > 0 ? "text-foreground/80 font-medium" : "text-muted-foreground")}>
                        {c.status === "typing" ? (
                          <span className="text-emerald-400 italic">digitando...</span>
                        ) : (
                          c.lastMessage
                        )}
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Status label */}
                        {(c.status === "online" || c.status === "typing") && (
                          <span className="text-[9px] font-semibold text-emerald-400 whitespace-nowrap">
                            Em atend.
                          </span>
                        )}
                        {c.unreadCount > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-primary text-primary-foreground rounded-full flex items-center justify-center">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Tags */}
                    {c.tags.length > 0 && (
                      <div className="flex gap-1 mt-1.5 overflow-hidden">
                        {c.tags.slice(0, 3).map((tag) => {
                          const cls = tagColors[tag.toLowerCase()] || "bg-muted text-muted-foreground border-border/50";
                          return (
                            <span
                              key={tag}
                              className={cn("text-[9px] px-1.5 py-0 h-[16px] inline-flex items-center rounded-md font-semibold border", cls)}
                            >
                              {tag}
                            </span>
                          );
                        })}
                        {c.tags.length > 3 && (
                          <span className="text-[9px] text-muted-foreground/50">+{c.tags.length - 3}</span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </>
  );
}
