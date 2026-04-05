import { Search, Filter, MessageSquarePlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type Conversation } from "./types";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelect: (c: Conversation) => void;
}

export function ConversationList({ conversations, selectedId, searchQuery, onSearchChange, onSelect }: ConversationListProps) {
  return (
    <>
      {/* Header */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">Conversas</h2>
          <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-foreground">
            <MessageSquarePlus className="w-4 h-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversa..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9 text-sm bg-muted/30 border-border/50"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {["Todas", "Não lidas", "Leads", "Suporte"].map((tab) => (
            <button
              key={tab}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                tab === "Todas"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="divide-y divide-border/50">
          {conversations.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhuma conversa encontrada
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c)}
                className={cn(
                  "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30",
                  selectedId === c.id && "bg-primary/5 border-l-2 border-l-primary"
                )}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  {c.avatar_url ? (
                    <img src={c.avatar_url} alt={c.name} className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-semibold text-primary">{c.name.slice(0, 2).toUpperCase()}</span>
                    </div>
                  )}
                  {c.status === "online" && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-background" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("text-sm truncate", c.unreadCount > 0 ? "font-bold text-foreground" : "font-medium text-foreground")}>
                      {c.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(c.lastMessageAt), { addSuffix: false, locale: ptBR })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className={cn("text-xs truncate", c.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
                      {c.status === "typing" ? (
                        <span className="text-primary italic">digitando...</span>
                      ) : (
                        c.lastMessage
                      )}
                    </p>
                    {c.unreadCount > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-primary text-primary-foreground rounded-full flex items-center justify-center shrink-0">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                  {c.tags.length > 0 && (
                    <div className="flex gap-1 mt-1.5 overflow-hidden">
                      {c.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-medium">
                          {tag}
                        </Badge>
                      ))}
                      {c.tags.length > 2 && (
                        <span className="text-[9px] text-muted-foreground">+{c.tags.length - 2}</span>
                      )}
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </>
  );
}
