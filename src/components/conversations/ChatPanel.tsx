import { useState, useRef, useEffect } from "react";
import {
  ArrowLeft,
  MoreVertical,
  Paperclip,
  Smile,
  Send,
  Image,
  FileText,
  Check,
  CheckCheck,
  PanelRightOpen,
  PanelRightClose,
  Play,
  Pause,
  ChevronDown,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Conversation, type Message, type AttendingStatus } from "./types";
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
}

const attendingStatusConfig: Record<AttendingStatus, { label: string; color: string; bg: string; dot: string }> = {
  nova: { label: "Nova", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", dot: "bg-blue-400" },
  em_atendimento: { label: "Em Atendimento", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-400" },
  aguardando: { label: "Aguardando", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", dot: "bg-amber-400" },
  finalizado: { label: "Finalizado", color: "text-muted-foreground", bg: "bg-muted/50 border-border/50", dot: "bg-muted-foreground/50" },
  pausado: { label: "Pausado", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20", dot: "bg-orange-400" },
};

const quickReplies = [
  { id: "1", label: "Saudação inicial", text: "Olá! Bem-vindo(a)! Como posso ajudá-lo(a) hoje? 😊" },
  { id: "2", label: "Confirmar pagamento", text: "Confirmamos o recebimento do seu pagamento. Obrigado!" },
  { id: "3", label: "Enviar orçamento", text: "Segue o orçamento conforme conversado. Qualquer dúvida estou à disposição." },
  { id: "4", label: "Aguarde um momento", text: "Aguarde um momento, por favor. Já estou verificando para você." },
];

function formatAudioDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ChatPanel({ conversation, messages, showDetails, onToggleDetails, onBack, onStatusChange }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [currentStatus, setCurrentStatus] = useState<AttendingStatus>(conversation.attendingStatus);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setCurrentStatus(conversation.attendingStatus);
  }, [conversation.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  // Show quick replies when "/" is typed
  useEffect(() => {
    setShowQuickReplies(input === "/");
  }, [input]);

  const handleSend = () => {
    if (!input.trim()) return;
    setInput("");
    setShowQuickReplies(false);
  };

  const handleQuickReply = (text: string) => {
    setInput(text);
    setShowQuickReplies(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const statusIcon = (status?: string) => {
    if (status === "read") return <CheckCheck className="w-3.5 h-3.5 text-blue-400" />;
    if (status === "delivered") return <CheckCheck className="w-3.5 h-3.5 text-muted-foreground/50" />;
    if (status === "sent") return <Check className="w-3.5 h-3.5 text-muted-foreground/50" />;
    return null;
  };

  const currentStatusCfg = attendingStatusConfig[currentStatus];
  const categoryTag = conversation.category
    ? conversation.category.charAt(0).toUpperCase() + conversation.category.slice(1)
    : null;

  const categoryColor: Record<string, string> = {
    vendas: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    financeiro: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    suporte: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="border-b border-border flex items-center px-4 py-2.5 gap-3 shrink-0 bg-card/50">
        <Button variant="ghost" size="icon" className="md:hidden w-8 h-8 shrink-0" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>

        {/* Avatar */}
        <div className="relative shrink-0">
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

        {/* Name + Tag + Status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground truncate">{conversation.name}</p>
            {categoryTag && (
              <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded border", categoryColor[conversation.category!] || "bg-muted text-muted-foreground")}>
                {categoryTag}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={cn("w-1.5 h-1.5 rounded-full", currentStatusCfg.dot)} />
            <span className={cn("text-[11px] font-medium", currentStatusCfg.color)}>{currentStatusCfg.label}</span>
          </div>
        </div>

        {/* Status Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors", currentStatusCfg.bg, currentStatusCfg.color)}>
              <span className={cn("w-1.5 h-1.5 rounded-full", currentStatusCfg.dot)} />
              {currentStatusCfg.label}
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            {(Object.entries(attendingStatusConfig) as [AttendingStatus, typeof currentStatusCfg][]).map(([key, cfg]) => (
              <DropdownMenuItem
                key={key}
                onClick={() => { setCurrentStatus(key); onStatusChange?.(conversation.id, key); }}
                className={cn("gap-2 text-xs cursor-pointer", currentStatus === key && "bg-muted")}
              >
                <span className={cn("w-2 h-2 rounded-full shrink-0", cfg.dot)} />
                <span className={cfg.color}>{cfg.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:flex w-8 h-8 text-muted-foreground hover:text-foreground"
            onClick={onToggleDetails}
          >
            {showDetails ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-foreground">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Marcar como não lida</DropdownMenuItem>
              <DropdownMenuItem>Silenciar</DropdownMenuItem>
              <DropdownMenuItem>Arquivar</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">Bloquear contato</DropdownMenuItem>
              <DropdownMenuItem onClick={onBack} className="text-destructive font-semibold">Fechar conversa</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-2"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, hsl(var(--muted)) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      >
        {messages.map((msg, i) => {
          const showDate =
            i === 0 ||
            format(new Date(messages[i - 1].timestamp), "dd/MM/yyyy") !==
              format(new Date(msg.timestamp), "dd/MM/yyyy");

          const isAudio = msg.mediaType === "audio";

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex justify-center my-3">
                  <span className="text-[10px] font-medium text-muted-foreground bg-muted/80 px-3 py-1 rounded-full">
                    {format(new Date(msg.timestamp), "dd 'de' MMMM", { locale: ptBR })}
                  </span>
                </div>
              )}
              <div className={cn("flex", msg.type === "sent" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] sm:max-w-[65%] rounded-2xl relative",
                    isAudio ? "px-3 py-2" : "px-3.5 py-2",
                    msg.type === "sent"
                      ? "bg-blue-600 text-white rounded-br-md"
                      : "bg-card border border-border text-foreground rounded-bl-md"
                  )}
                >
                  {isAudio ? (
                    /* Audio message */
                    <div className="flex items-center gap-2.5 min-w-[180px]">
                      <button
                        onClick={() => setPlayingAudioId(playingAudioId === msg.id ? null : msg.id)}
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors",
                          msg.type === "sent"
                            ? "bg-white/20 hover:bg-white/30 text-white"
                            : "bg-primary/10 hover:bg-primary/20 text-primary"
                        )}
                      >
                        {playingAudioId === msg.id ? (
                          <Pause className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5 ml-0.5" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        {/* Waveform placeholder */}
                        <div className="flex items-center gap-[2px] h-5">
                          {Array.from({ length: 20 }).map((_, idx) => {
                            const h = Math.random() * 14 + 4;
                            return (
                              <div
                                key={idx}
                                className={cn("w-[2px] rounded-full", msg.type === "sent" ? "bg-white/40" : "bg-muted-foreground/30")}
                                style={{ height: `${h}px` }}
                              />
                            );
                          })}
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className={cn("text-[10px]", msg.type === "sent" ? "text-white/60" : "text-muted-foreground/60")}>
                            {formatAudioDuration(msg.audioDuration || 0)}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className={cn("text-[10px]", msg.type === "sent" ? "text-white/60" : "text-muted-foreground/60")}>
                              {format(new Date(msg.timestamp), "HH:mm")}
                            </span>
                            {msg.type === "sent" && statusIcon(msg.status)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Text message */
                    <>
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                      <div className={cn("flex items-center gap-1 mt-0.5", msg.type === "sent" ? "justify-end" : "justify-start")}>
                        <span className={cn("text-[10px]", msg.type === "sent" ? "text-white/50" : "text-muted-foreground/60")}>
                          {format(new Date(msg.timestamp), "HH:mm")}
                        </span>
                        {msg.type === "sent" && statusIcon(msg.status)}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Replies Popup */}
      {showQuickReplies && (
        <div className="border-t border-border bg-card/90 backdrop-blur-sm">
          <div className="px-4 py-2 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Respostas Rápidas</span>
          </div>
          <div className="px-2 pb-2 space-y-0.5">
            {quickReplies.map((qr) => (
              <button
                key={qr.id}
                onClick={() => handleQuickReply(qr.text)}
                className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-muted/50 transition-colors flex flex-col gap-0.5"
              >
                <span className="text-xs font-semibold text-foreground">{qr.label}</span>
                <span className="text-[11px] text-muted-foreground truncate">{qr.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-border p-3 bg-card/50 shrink-0">
        <div className="flex items-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="w-9 h-9 shrink-0 text-muted-foreground hover:text-foreground mb-0.5">
                <Paperclip className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start">
              <DropdownMenuItem className="gap-2">
                <Image className="w-4 h-4" /> Imagem
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2">
                <FileText className="w-4 h-4" /> Arquivo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              placeholder="Digite / para respostas rápidas, Shift+Enter para nova linha..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              className="w-full resize-none rounded-xl bg-muted/30 border border-border/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
              style={{ minHeight: "40px", maxHeight: "120px" }}
            />
          </div>

          <Button
            size="icon"
            className={cn(
              "w-9 h-9 shrink-0 rounded-xl transition-all mb-0.5",
              input.trim()
                ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm"
                : "bg-muted text-muted-foreground"
            )}
            onClick={handleSend}
            disabled={!input.trim()}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
