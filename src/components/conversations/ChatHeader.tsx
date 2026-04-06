import { memo } from "react";
import {
  ArrowLeft,
  MoreVertical,
  ChevronDown,
  UserCheck,
  UserX,
  Clock,
  History,
  MailOpen,
  Archive,
  X,
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
}

export const ChatHeader = memo(function ChatHeader({
  conversation,
  currentUserId,
  currentStatus,
  timeInStatus,
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
}: ChatHeaderProps) {
  const currentStatusCfg = attendingStatusConfig[currentStatus];

  return (
    <>
      {/* Header bar */}
      <div className="border-b border-border flex items-start px-4 py-2 gap-3 shrink-0 bg-card/50">
        <Button variant="ghost" size="icon" className="md:hidden w-8 h-8 shrink-0" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="relative shrink-0 mt-0.5">
          {conversation.avatar_url ? (
            <img src={conversation.avatar_url} alt={conversation.name} className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-semibold text-primary">{conversation.name.slice(0, 2).toUpperCase()}</span>
            </div>
          )}
          {conversation.status === "online" && (
            <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 rounded-full ring-2 ring-card" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{conversation.name}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-[10px] text-muted-foreground">
            <span className="truncate">{conversation.phone}</span>
            {conversation.statusChangedAt && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Status há {timeInStatus}
              </span>
            )}
            <button
              onClick={onToggleStatusHistory}
              className="inline-flex items-center gap-1 text-muted-foreground/70 hover:text-muted-foreground transition-colors"
              title="Histórico de status"
            >
              <History className="w-3 h-3" />
              Histórico
            </button>
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            {conversation.assignedTo
              ? conversation.assignedTo === currentUserId
                ? "Atendido por você"
                : `Responsável: ${conversation.assignedName || "..."}`
              : "Sem responsável"}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn("flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors", currentStatusCfg.bg, currentStatusCfg.textStrong)}>
                <span className={cn("w-2 h-2 rounded-full", currentStatusCfg.dot)} />
                {currentStatusCfg.label}
                <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              {(Object.entries(attendingStatusConfig) as [AttendingStatus, typeof currentStatusCfg][]).map(([key, cfg]) => (
                <DropdownMenuItem key={key} onClick={() => onStatusChange(key)} className={cn("gap-2 text-xs cursor-pointer", currentStatus === key && "bg-muted font-bold")}>
                  <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", cfg.dot)} />
                  <span className={cn("font-semibold", cfg.textStrong)}>{cfg.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {conversation.assignedTo === currentUserId ? (
            <Button variant="ghost" size="sm" className="text-[11px] h-7 px-2 text-muted-foreground hover:text-destructive gap-1" onClick={() => onRelease?.(conversation.id)}>
              <UserX className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Liberar</span>
            </Button>
          ) : !conversation.assignedTo ? (
            <Button variant="ghost" size="sm" className="text-[11px] h-7 px-2 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 gap-1" onClick={() => onAssign?.(conversation.id)}>
              <UserCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Assumir</span>
            </Button>
          ) : null}

          <Button variant="ghost" size="icon" className="hidden lg:flex w-8 h-8 text-muted-foreground hover:text-foreground" onClick={onToggleDetails}>
            {showDetails ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-foreground"><MoreVertical className="w-4 h-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onMarkUnread?.(conversation.id)} className="gap-2 cursor-pointer">
                <MailOpen className="w-4 h-4" /> Marcar como não lida
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

      {/* Status History Panel */}
      {showStatusHistory && (
        <div className="border-b border-border bg-muted/10 px-4 py-2 max-h-[160px] overflow-y-auto animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-foreground flex items-center gap-1">
              <History className="w-3.5 h-3.5" /> Histórico de Status
            </span>
            <button onClick={onToggleStatusHistory} className="text-muted-foreground/50 hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {statusHistory.length === 0 ? (
            conversation.statusChangedAt ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-muted-foreground/50 shrink-0 w-[70px]">
                    {format(new Date(conversation.statusChangedAt), "dd/MM HH:mm")}
                  </span>
                  <span className={cn("flex items-center gap-1 font-semibold", currentStatusCfg.color)}>
                    <span className={cn("w-1.5 h-1.5 rounded-full", currentStatusCfg.dot)} />
                    {currentStatusCfg.label}
                  </span>
                  <span className="text-muted-foreground/40 ml-auto">Status atual</span>
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground">Nenhum histórico registrado ainda</p>
            )
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
                    <span className="text-muted-foreground/40 ml-auto truncate max-w-[120px]">
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
