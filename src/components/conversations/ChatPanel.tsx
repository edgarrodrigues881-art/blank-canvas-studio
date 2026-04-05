import { useState, useRef, useEffect } from "react";
import {
  ArrowLeft,
  Phone,
  Video,
  MoreVertical,
  Paperclip,
  Smile,
  Send,
  Mic,
  Image,
  FileText,
  Check,
  CheckCheck,
  PanelRightOpen,
  PanelRightClose,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Conversation, type Message } from "./types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  conversation: Conversation;
  messages: Message[];
  showDetails: boolean;
  onToggleDetails: () => void;
  onBack: () => void;
}

export function ChatPanel({ conversation, messages, showDetails, onToggleDetails, onBack }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    // Future: send message logic
    setInput("");
  };

  const statusIcon = (status?: string) => {
    if (status === "read") return <CheckCheck className="w-3.5 h-3.5 text-primary" />;
    if (status === "delivered") return <CheckCheck className="w-3.5 h-3.5 text-muted-foreground/50" />;
    if (status === "sent") return <Check className="w-3.5 h-3.5 text-muted-foreground/50" />;
    return null;
  };

  return (
    <>
      {/* Chat Header */}
      <div className="h-[60px] border-b border-border flex items-center px-4 gap-3 shrink-0 bg-card/50">
        <Button variant="ghost" size="icon" className="md:hidden w-8 h-8 shrink-0" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>

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

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{conversation.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {conversation.status === "online" && "Online"}
            {conversation.status === "typing" && <span className="text-primary">digitando...</span>}
            {conversation.status === "offline" && conversation.phone}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="hidden sm:flex w-8 h-8 text-muted-foreground hover:text-foreground">
            <Phone className="w-4 h-4" />
          </Button>
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
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

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex justify-center my-4">
                  <span className="text-[10px] font-medium text-muted-foreground bg-muted/80 px-3 py-1 rounded-full">
                    {format(new Date(msg.timestamp), "dd 'de' MMMM", { locale: ptBR })}
                  </span>
                </div>
              )}
              <div className={cn("flex", msg.type === "sent" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] sm:max-w-[65%] rounded-2xl px-3.5 py-2 relative group",
                    msg.type === "sent"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-card border border-border text-foreground rounded-bl-md"
                  )}
                >
                  <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                  <div className={cn("flex items-center gap-1 mt-1", msg.type === "sent" ? "justify-end" : "justify-start")}>
                    <span className={cn("text-[10px]", msg.type === "sent" ? "text-primary-foreground/60" : "text-muted-foreground/60")}>
                      {format(new Date(msg.timestamp), "HH:mm")}
                    </span>
                    {msg.type === "sent" && statusIcon(msg.status)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input Area */}
      <div className="border-t border-border p-3 bg-card/50 shrink-0">
        <div className="flex items-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="w-9 h-9 shrink-0 text-muted-foreground hover:text-foreground">
                <Paperclip className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start">
              <DropdownMenuItem className="gap-2">
                <Image className="w-4 h-4" /> Imagem
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2">
                <FileText className="w-4 h-4" /> Documento
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon" className="w-9 h-9 shrink-0 text-muted-foreground hover:text-foreground">
            <Smile className="w-4 h-4" />
          </Button>

          <div className="flex-1 relative">
            <Input
              placeholder="Digite uma mensagem..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              className="pr-10 h-10 text-sm bg-muted/30 border-border/50 rounded-xl"
            />
          </div>

          <Button
            size="icon"
            className={cn(
              "w-9 h-9 shrink-0 rounded-xl transition-colors",
              input.trim()
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground"
            )}
            onClick={handleSend}
            disabled={!input.trim()}
          >
            {input.trim() ? <Send className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </>
  );
}
