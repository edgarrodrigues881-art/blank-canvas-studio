import { useState, useRef, useEffect, useCallback } from "react";
import { useQuickReplies } from "@/hooks/useQuickReplies";
import { QuickRepliesManager } from "./QuickRepliesManager";
import {
  ArrowLeft,
  MoreVertical,
  Paperclip,
  Send,
  Image as ImageIcon,
  FileText,
  Check,
  CheckCheck,
  PanelRightOpen,
  PanelRightClose,
  Play,
  Pause,
  ChevronDown,
  Zap,
  Bot,
  Mic,
  Settings,
  Trash2,
  Loader2,
  X,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  onSendMessage?: (conversationId: string, content: string) => void;
  onSendAudio?: (conversationId: string, blob: Blob, duration: number) => void;
  onSendFile?: (conversationId: string, file: File) => void;
  onRetryMessage?: (messageId: string) => void;
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

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function isImageFile(name: string) {
  return /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(name);
}

function getFileIcon(name: string) {
  if (/\.pdf$/i.test(name)) return "📄";
  if (/\.(docx?|odt)$/i.test(name)) return "📝";
  if (/\.(xlsx?|csv)$/i.test(name)) return "📊";
  if (/\.(pptx?|odp)$/i.test(name)) return "📑";
  if (/\.(zip|rar|7z|tar)$/i.test(name)) return "📦";
  return "📎";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ─────────── Audio Player ─────────── */
function AudioPlayer({ src, duration, isSent }: { src: string; duration?: number; isSent: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration && isFinite(audio.duration)) {
        setProgress((audio.currentTime / audio.duration) * 100);
        setTotalDuration(audio.duration);
      }
    };
    const onEnded = () => { setPlaying(false); setProgress(0); setCurrentTime(0); };
    const onLoaded = () => { if (audio.duration && isFinite(audio.duration)) setTotalDuration(audio.duration); };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("loadedmetadata", onLoaded);
    return () => { audio.removeEventListener("timeupdate", onTime); audio.removeEventListener("ended", onEnded); audio.removeEventListener("loadedmetadata", onLoaded); };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause(); else audio.play();
    setPlaying(!playing);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audio.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * audio.duration;
  };

  return (
    <div className="flex items-center gap-2.5 min-w-[200px]">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button onClick={toggle} className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors", isSent ? "bg-white/20 hover:bg-white/30 text-white" : "bg-primary/10 hover:bg-primary/20 text-primary")}>
        {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className={cn("h-1.5 rounded-full cursor-pointer", isSent ? "bg-white/20" : "bg-muted-foreground/15")} onClick={seek}>
          <div className={cn("h-full rounded-full transition-all", isSent ? "bg-white/70" : "bg-primary/60")} style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className={cn("text-[10px]", isSent ? "text-white/60" : "text-muted-foreground/60")}>{playing || currentTime > 0 ? formatDuration(currentTime) : formatDuration(totalDuration)}</span>
          <span className={cn("text-[10px]", isSent ? "text-white/60" : "text-muted-foreground/60")}>{formatDuration(totalDuration)}</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────── Main ChatPanel ─────────── */
export function ChatPanel({
  conversation, messages, showDetails, onToggleDetails, onBack,
  onStatusChange, onSendMessage, onSendAudio, onSendFile, onRetryMessage,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [currentStatus, setCurrentStatus] = useState<AttendingStatus>(conversation.attendingStatus);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File preview state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [sendingFile, setSendingFile] = useState(false);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [sendingAudio, setSendingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setCurrentStatus(conversation.attendingStatus); }, [conversation.id]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);
  const quickReplySearch = input.startsWith("/") ? input.slice(1).toLowerCase() : null;
  const filteredQuickReplies = quickReplySearch !== null
    ? quickReplies.filter((qr) => qr.label.toLowerCase().includes(quickReplySearch) || qr.text.toLowerCase().includes(quickReplySearch))
    : [];
  useEffect(() => { setShowQuickReplies(input.startsWith("/") && filteredQuickReplies.length > 0); }, [input, filteredQuickReplies.length]);

  // Cleanup preview URL
  useEffect(() => {
    return () => { if (pendingPreview) URL.revokeObjectURL(pendingPreview); };
  }, [pendingPreview]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage?.(conversation.id, input.trim());
    setInput("");
    setShowQuickReplies(false);
  };

  const handleQuickReply = (text: string) => { setInput(text); setShowQuickReplies(false); textareaRef.current?.focus(); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  // ─── File handling ───
  const handleFileSelected = useCallback((file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      alert("Arquivo muito grande. Máximo: 20MB");
      return;
    }
    setPendingFile(file);
    if (file.type.startsWith("image/")) {
      setPendingPreview(URL.createObjectURL(file));
    } else {
      setPendingPreview(null);
    }
  }, []);

  const handleImageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
    e.target.value = "";
  };

  const handleDocInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
    e.target.value = "";
  };

  const cancelPendingFile = () => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
  };

  const sendPendingFile = async () => {
    if (!pendingFile) return;
    setSendingFile(true);
    onSendFile?.(conversation.id, pendingFile);
    cancelPendingFile();
    setSendingFile(false);
  };

  // ─── Audio Recording ───
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => { stream.getTracks().forEach((t) => t.stop()); };
      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch (err) { console.error("Mic denied:", err); }
  }, []);

  const stopAndSend = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    setSendingAudio(true);
    const duration = recordingTime;
    await new Promise<void>((resolve) => {
      const origStop = recorder.onstop;
      recorder.onstop = (e) => { if (origStop && typeof origStop === "function") (origStop as any).call(recorder, e); resolve(); };
      recorder.stop();
    });
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsRecording(false);
    setRecordingTime(0);
    const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
    if (blob.size > 0) onSendAudio?.(conversation.id, blob, duration);
    setSendingAudio(false);
    mediaRecorderRef.current = null;
  }, [recordingTime, conversation.id, onSendAudio]);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsRecording(false);
    setRecordingTime(0);
    chunksRef.current = [];
    mediaRecorderRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
    };
  }, []);

  const statusIcon = (status?: string) => {
    if (status === "sending") return <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/40" />;
    if (status === "read") return <CheckCheck className="w-3.5 h-3.5 text-blue-400" />;
    if (status === "delivered") return <CheckCheck className="w-3.5 h-3.5 text-muted-foreground/50" />;
    if (status === "sent") return <Check className="w-3.5 h-3.5 text-muted-foreground/50" />;
    if (status === "failed") return <span className="text-[10px] text-red-400 font-medium">⚠</span>;
    return null;
  };

  const currentStatusCfg = attendingStatusConfig[currentStatus];
  const categoryTag = conversation.category ? conversation.category.charAt(0).toUpperCase() + conversation.category.slice(1) : null;
  const categoryColor: Record<string, string> = {
    vendas: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    financeiro: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    suporte: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  };

  const waveformCache = useRef<Record<string, number[]>>({});
  const getWaveform = (id: string) => {
    if (!waveformCache.current[id]) waveformCache.current[id] = Array.from({ length: 28 }, () => Math.random() * 14 + 4);
    return waveformCache.current[id];
  };

  /* ── Timestamp + status footer ── */
  const MsgFooter = ({ msg }: { msg: Message }) => (
    <div className={cn("flex items-center gap-1 mt-0.5", msg.type === "sent" ? "justify-end" : "justify-start")}>
      {msg.isAiResponse && (
        <span className="flex items-center gap-0.5 text-[9px] text-violet-300 mr-1"><Bot className="w-3 h-3" /> IA</span>
      )}
      <span className={cn("text-[10px]", msg.type === "sent" ? "text-white/50" : "text-muted-foreground/60")}>
        {format(new Date(msg.timestamp), "HH:mm")}
      </span>
      {msg.type === "sent" && statusIcon(msg.status)}
    </div>
  );

  /* ── Render a single message bubble content ── */
  const renderBubbleContent = (msg: Message) => {
    const isAudio = msg.mediaType === "audio";
    const isImage = msg.mediaType === "image";
    const isDocument = msg.mediaType === "document";

    if (isAudio && msg.mediaUrl) {
      return (
        <div>
          <AudioPlayer src={msg.mediaUrl} duration={msg.audioDuration} isSent={msg.type === "sent"} />
          <MsgFooter msg={msg} />
        </div>
      );
    }

    if (isAudio && !msg.mediaUrl) {
      return (
        <div className="flex items-center gap-2.5 min-w-[180px]">
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-primary/10 text-primary">
            <Play className="w-3.5 h-3.5 ml-0.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-[2px] h-5">
              {getWaveform(msg.id).map((h, idx) => (
                <div key={idx} className={cn("w-[2px] rounded-full", msg.type === "sent" ? "bg-white/40" : "bg-muted-foreground/30")} style={{ height: `${h}px` }} />
              ))}
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span className={cn("text-[10px]", msg.type === "sent" ? "text-white/60" : "text-muted-foreground/60")}>{formatDuration(msg.audioDuration || 0)}</span>
              <div className="flex items-center gap-1">
                <span className={cn("text-[10px]", msg.type === "sent" ? "text-white/60" : "text-muted-foreground/60")}>{format(new Date(msg.timestamp), "HH:mm")}</span>
                {msg.type === "sent" && statusIcon(msg.status)}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (isImage && msg.mediaUrl) {
      return (
        <div>
          <img
            src={msg.mediaUrl}
            alt="Imagem"
            className="rounded-lg max-w-full max-h-[300px] object-cover cursor-pointer"
            onClick={() => window.open(msg.mediaUrl, "_blank")}
          />
          {msg.content && msg.content !== "[image]" && msg.content !== "[foto]" && (
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words mt-1.5">{msg.content}</p>
          )}
          <MsgFooter msg={msg} />
        </div>
      );
    }

    if (isDocument && msg.mediaUrl) {
      const fileName = msg.fileName || msg.mediaUrl.split("/").pop() || "Arquivo";
      return (
        <div>
          <a
            href={msg.mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center gap-2.5 p-2.5 rounded-lg transition-colors",
              msg.type === "sent" ? "bg-white/10 hover:bg-white/20" : "bg-muted/50 hover:bg-muted"
            )}
          >
            <span className="text-2xl">{getFileIcon(fileName)}</span>
            <div className="flex-1 min-w-0">
              <p className={cn("text-[12px] font-medium truncate", msg.type === "sent" ? "text-white" : "text-foreground")}>{fileName}</p>
              <p className={cn("text-[10px]", msg.type === "sent" ? "text-white/50" : "text-muted-foreground/60")}>Documento</p>
            </div>
            <Download className={cn("w-4 h-4 shrink-0", msg.type === "sent" ? "text-white/50" : "text-muted-foreground/50")} />
          </a>
          {msg.content && msg.content !== "[document]" && msg.content !== "[documento]" && msg.content !== "[arquivo]" && (
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words mt-1.5">{msg.content}</p>
          )}
          <MsgFooter msg={msg} />
        </div>
      );
    }

    // Text message
    return (
      <>
        <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
        <MsgFooter msg={msg} />
        {msg.status === "failed" && (
          <button onClick={() => onRetryMessage?.(msg.id)} className="text-[10px] text-red-400 hover:text-red-300 mt-0.5 text-right underline cursor-pointer block w-full">
            Falhou — toque para reenviar
          </button>
        )}
      </>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Hidden file inputs */}
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageInput} />
      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.csv,.txt" className="hidden" onChange={handleDocInput} />

      {/* Chat Header */}
      <div className="border-b border-border flex items-center px-4 py-2.5 gap-3 shrink-0 bg-card/50">
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
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground truncate">{conversation.name}</p>
            {categoryTag && (
              <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded border", categoryColor[conversation.category!] || "bg-muted text-muted-foreground")}>{categoryTag}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={cn("w-1.5 h-1.5 rounded-full", currentStatusCfg.dot)} />
            <span className={cn("text-[11px] font-medium", currentStatusCfg.color)}>{currentStatusCfg.label}</span>
          </div>
        </div>

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
              <DropdownMenuItem key={key} onClick={() => { setCurrentStatus(key); onStatusChange?.(conversation.id, key); }} className={cn("gap-2 text-xs cursor-pointer", currentStatus === key && "bg-muted")}>
                <span className={cn("w-2 h-2 rounded-full shrink-0", cfg.dot)} />
                <span className={cfg.color}>{cfg.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="hidden lg:flex w-8 h-8 text-muted-foreground hover:text-foreground" onClick={onToggleDetails}>
            {showDetails ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-foreground"><MoreVertical className="w-4 h-4" /></Button>
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
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, hsl(var(--muted)) 1px, transparent 0)", backgroundSize: "24px 24px" }}
      >
        {messages.map((msg, i) => {
          const showDate = i === 0 || format(new Date(messages[i - 1].timestamp), "dd/MM/yyyy") !== format(new Date(msg.timestamp), "dd/MM/yyyy");
          const isMedia = msg.mediaType === "audio" || msg.mediaType === "image" || msg.mediaType === "document";

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
                    msg.mediaType === "image" && msg.mediaUrl ? "p-1" : isMedia ? "px-3 py-2" : "px-3.5 py-2",
                    msg.type === "sent" ? "bg-blue-600 text-white rounded-br-md" : "bg-card border border-border text-foreground rounded-bl-md",
                    msg.status === "failed" && "opacity-70"
                  )}
                >
                  {renderBubbleContent(msg)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Replies */}
      {showQuickReplies && (
        <div className="border-t border-border bg-card/90 backdrop-blur-sm">
          <div className="px-4 py-2 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Respostas Rápidas</span>
          </div>
          <div className="px-2 pb-2 space-y-0.5 max-h-[200px] overflow-y-auto">
            {filteredQuickReplies.map((qr) => (
              <button key={qr.id} onClick={() => handleQuickReply(qr.text)} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-muted/50 transition-colors flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-foreground">/{qr.label}</span>
                <span className="text-[11px] text-muted-foreground truncate">{qr.text}</span>
              </button>
            ))}
          </div>
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

      {/* Input Area */}
      <div className="border-t border-border p-3 bg-card/50 shrink-0">
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
  );
}
