import { memo } from "react";
import {
  ArrowLeft,
  MoreVertical,
  ChevronDown,
  UserCheck,
  UserX,
  History,
  MailOpen,
  Archive,
  X,
  CheckSquare,
} from "lucide-react";
import { PanelRightOpen, PanelRightClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Conversation, type AttendingStatus } from "./types";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export const attendingStatusConfig: Record<
  AttendingStatus,
  { label: string; color: string; bg: string; dot: string; textStrong: string }
> = {
  nova: { label: "Nova", color: "text-blue-400", bg: "bg-blue-600/20 border-blue-500/40", dot: "bg-blue-500", textStrong: "text-blue-300" },
  em_atendimento: { label: "Em Atendimento", color: "text-emerald-400", bg: "bg-emerald-600/20 border-emerald-500/40", dot: "bg-emerald-500", textStrong: "text-emerald-300" },
  aguardando: { label: "Aguardando", color: "text-amber-400", bg: "bg-amber-600/20 border-amber-500/40", dot: "bg-amber-500 animate-pulse", textStrong: "text-amber-300" },
  finalizado: { label: "Finalizado", color: "text-gray-400", bg: "bg-gray-600/20 border-gray-500/30", dot: "bg-gray-500", textStrong: "text-gray-400" },
  pausado: { label: "Pausado", color: "text-orange-400", bg: "bg-orange-600/20 border-orange-500/40", dot: "bg-orange-500", textStrong: "text-orange-300" },
};

export interface ChatHeaderProps {
  conversation: Conversation;
  currentUserId?: string;
  currentStatus: AttendingStatus;
  timeInStatus: string;
  showDetails: boolean;
  showStatusHistory: boolean;
  statusHistory: any[];
  onBack: () => void;
  onToggleDetails: () => void;
  onToggleStatusHistory: () => void;
  onStatusChange: (status: AttendingStatus) => void;
  onAssign?: (conversationId: string) => void;
  onRelease?: (conversationId: string) => void;
  onMarkUnread?: (conversationId: string) => void;
  onArchive?: (conversationId: string) => void;
  onSelectMessages?: () => void;
}

export const ChatHeader = memo(function ChatHeader({
  conversation,
  currentUserId,
  currentStatus,
  showDetails,
  showStatusHistory,
  statusHistory,
  onBack,
  onToggleDetails,
  onToggleStatusHistory,
  onStatusChange,
  onAssign,
  onRelease,
  onMarkUnread,
  onArchive,
  onSelectMessages,
}: ChatHeaderProps) {
  const currentStatusCfg = attendingStatusConfig[currentStatus];

  return (
    <>
      {/* Header bar — clean, aligned */}
      <div className="border-b border-border/50 flex items-center px-4 py-3 gap-3 shrink-0 bg-card/40">
        <Button variant="ghost" size="icon" className="md:hidden w-8 h-8 shrink-0" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>

        {/* Avatar */}
        <div className="relative shrink-0">
          {conversation.avatar_url ? (
            <img src={conversation.avatar_url} alt={conversation.name} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-semibold text-primary">{conversation.name.slice(0, 2).toUpperCase()}</span>
            </div>
          )}
          {conversation.status === "online" && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-card" />
          )}
        </div>

        {/* Name + phone + status badge */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate shrink min-w-0">{conversation.name}</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold transition-colors shrink-0",
                  currentStatusCfg.bg, currentStatusCfg.textStrong
                )}>
                  <span className={cn("w-1.5 h-1.5 rounded-full", currentStatusCfg.dot)} />
                  {currentStatusCfg.label}
                  <ChevronDown className="w-2.5 h-2.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[160px]">
                {(Object.entries(attendingStatusConfig) as [AttendingStatus, typeof currentStatusCfg][]).map(([key, cfg]) => (
                  <DropdownMenuItem key={key} onClick={() => onStatusChange(key)} className={cn("gap-2 text-xs cursor-pointer", currentStatus === key && "bg-muted font-bold")}>
                    <span className={cn("w-2 h-2 rounded-full shrink-0", cfg.dot)} />
                    <span className={cn("font-semibold", cfg.textStrong)}>{cfg.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">{conversation.phone}</p>
        </div>

        {/* Actions — minimal */}
        <div className="flex items-center gap-0.5 shrink-0">
          {conversation.assignedTo === currentUserId ? (
            <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-destructive" onClick={() => onRelease?.(conversation.id)} title="Liberar">
              <UserX className="w-4 h-4" />
            </Button>
          ) : !conversation.assignedTo ? (
            <Button variant="ghost" size="icon" className="w-8 h-8 text-emerald-500/70 hover:text-emerald-400 hover:bg-emerald-500/10" onClick={() => onAssign?.(conversation.id)} title="Assumir">
              <UserCheck className="w-4 h-4" />
            </Button>
          ) : null}

          <Button variant="ghost" size="icon" className="hidden lg:flex w-8 h-8 text-muted-foreground hover:text-foreground" onClick={onToggleDetails}>
            {showDetails ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-foreground">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onSelectMessages?.()} className="gap-2 cursor-pointer">
                <CheckSquare className="w-4 h-4" /> Selecionar mensagens
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { onArchive?.(conversation.id); onBack(); }} className="gap-2 cursor-pointer">
                <Archive className="w-4 h-4" /> Arquivar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onBack} className="text-destructive font-semibold gap-2 cursor-pointer">
                <X className="w-4 h-4" /> Fechar conversa
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Status History Panel — on demand */}
      {showStatusHistory && (
        <div className="border-b border-border/40 bg-muted/5 px-4 py-2.5 max-h-[140px] overflow-y-auto animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-foreground flex items-center gap-1">
              <History className="w-3.5 h-3.5" /> Histórico
            </span>
            <button onClick={onToggleStatusHistory} className="text-muted-foreground/50 hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {statusHistory.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">Nenhum histórico registrado</p>
          ) : (
            <div className="space-y-1">
              {statusHistory.map((h: any) => {
                const oldCfg = h.old_status ? attendingStatusConfig[h.old_status as AttendingStatus] : null;
                const newCfg = attendingStatusConfig[h.new_status as AttendingStatus] || attendingStatusConfig.nova;
                return (
                  <div key={h.id} className="flex items-center gap-2 text-[10px]">
                    <span className="text-muted-foreground/50 shrink-0 w-[70px]">
                      {format(new Date(h.created_at), "dd/MM HH:mm")}
                    </span>
                    {oldCfg && (
                      <>
                        <span className={cn("flex items-center gap-1", oldCfg.color)}>
                          <span className={cn("w-1.5 h-1.5 rounded-full", oldCfg.dot)} />
                          {oldCfg.label}
                        </span>
                        <span className="text-muted-foreground/30">→</span>
                      </>
                    )}
                    <span className={cn("flex items-center gap-1 font-semibold", newCfg.color)}>
                      <span className={cn("w-1.5 h-1.5 rounded-full", newCfg.dot)} />
                      {newCfg.label}
                    </span>
                    <span className="text-muted-foreground/40 ml-auto truncate max-w-[100px]">
                      {h.changed_by_name || "Sistema"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
});
