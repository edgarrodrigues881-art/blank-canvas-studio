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
  Reply,
  Video,
  MapPin,
  User,
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

/* ─────────── Image Lightbox ─────────── */
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    setZoom((z) => Math.min(5, Math.max(1, z - e.deltaY * 0.002)));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (zoom <= 1) return;
    e.stopPropagation();
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [zoom]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    e.stopPropagation();
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  }, []);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = src.split("/").pop() || "imagem.jpg";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(src, "_blank");
    }
  };

  const resetView = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose}>
      <div
        className="relative bg-card rounded-2xl shadow-2xl border border-border/30 overflow-hidden max-w-[min(560px,92vw)] max-h-[min(560px,85vh)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/20 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted/50"
            >
              <Download className="w-4 h-4" />
              Baixar
            </button>
            <button
              onClick={resetView}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted/50"
              title="Resetar zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* Image */}
        <div
          className="flex-1 min-h-0 flex items-center justify-center overflow-hidden select-none"
          onWheel={handleWheel}
          style={{ cursor: zoom > 1 ? "grab" : "default" }}
        >
          <img
            src={src}
            alt="Visualização"
            draggable={false}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="max-w-full max-h-[min(480px,75vh)] object-contain rounded-lg transition-transform duration-100"
            style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transformOrigin: "center center",
            }}
          />
        </div>
      </div>
    </div>
  );
}

const defaultQuickReplies = [
  { id: "default-1", label: "Saudação inicial", content: "Olá! Bem-vindo(a)! Como posso ajudá-lo(a) hoje? 😊" },
  { id: "default-2", label: "Confirmar pagamento", content: "Confirmamos o recebimento do seu pagamento. Obrigado!" },
  { id: "default-3", label: "Enviar orçamento", content: "Segue o orçamento conforme conversado. Qualquer dúvida estou à disposição." },
  { id: "default-4", label: "Aguarde um momento", content: "Aguarde um momento, por favor. Já estou verificando para você." },
];

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
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

/** Check if content is a media placeholder that shouldn't be shown as text */
function isMediaPlaceholder(content: string | undefined | null): boolean {
  if (!content) return true;
  const lower = content.toLowerCase().trim();
  return [
    "[image]", "[foto]", "[audio]", "[áudio]", "[ptt]",
    "[video]", "[vídeo]", "[document]", "[documento]", "[arquivo]",
    "[sticker]", "[figurinha]", "[contact]", "[contato]",
    "[location]", "[localização]", "[mensagem]",
    "🎧 áudio", "📷 foto", "🎬 vídeo", "📎 arquivo",
    "🏷️ figurinha", "👤 contato", "📍 localização",
  ].some(p => lower === p || lower.startsWith(p));
}

/* ─────────── Audio Player ─────────── */
function AudioPlayer({ src, duration, isSent }: { src: string; duration?: number; isSent: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number>(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);

  // Smooth RAF-based progress instead of timeupdate
  const updateProgress = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.duration && isFinite(audio.duration)) {
      setCurrentTime(audio.currentTime);
      setProgress((audio.currentTime / audio.duration) * 100);
      setTotalDuration(audio.duration);
    }
    if (!audio.paused) {
      rafRef.current = requestAnimationFrame(updateProgress);
    }
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => { rafRef.current = requestAnimationFrame(updateProgress); };
    const onPause = () => { cancelAnimationFrame(rafRef.current); };
    const onEnded = () => { cancelAnimationFrame(rafRef.current); setPlaying(false); setProgress(0); setCurrentTime(0); };
    const onLoaded = () => { if (audio.duration && isFinite(audio.duration)) setTotalDuration(audio.duration); };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("loadedmetadata", onLoaded);
    return () => {
      cancelAnimationFrame(rafRef.current);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("loadedmetadata", onLoaded);
    };
  }, [updateProgress]);

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
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio * 100);
    setCurrentTime(audio.currentTime);
  };

  return (
    <div className="flex items-center gap-2.5 min-w-[200px]">
      <audio ref={audioRef} src={src} preload="auto" />
      <button onClick={toggle} className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors", isSent ? "bg-white/20 hover:bg-white/30 text-white" : "bg-primary/10 hover:bg-primary/20 text-primary")}>
        {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className={cn("h-1.5 rounded-full cursor-pointer relative", isSent ? "bg-white/20" : "bg-muted-foreground/15")} onClick={seek}>
          <div className={cn("h-full rounded-full", isSent ? "bg-white/70" : "bg-primary/60")} style={{ width: `${progress}%`, transition: "none" }} />
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
  const { replies: dbReplies } = useQuickReplies();
  const [showQRManager, setShowQRManager] = useState(false);
  const [input, setInput] = useState("");
  const [currentStatus, setCurrentStatus] = useState<AttendingStatus>(conversation.attendingStatus);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [sendingFile, setSendingFile] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [sendingAudio, setSendingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const allQuickReplies = dbReplies.length > 0 ? dbReplies : defaultQuickReplies;

  useEffect(() => { setCurrentStatus(conversation.attendingStatus); }, [conversation.id]);

  const [isNearBottom, setIsNearBottom] = useState(true);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const prevMsgCountRef = useRef(messages.length);

  const scrollToBottom = useCallback((force?: boolean) => {
    if (scrollRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current!.scrollTop = scrollRef.current!.scrollHeight;
      });
      setNewMsgCount(0);
    }
  }, []);

  // Track scroll position
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setIsNearBottom(nearBottom);
    if (nearBottom) setNewMsgCount(0);
  }, []);

  // Only auto-scroll if near bottom; otherwise increment badge
  useEffect(() => {
    const diff = messages.length - prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;
    if (isNearBottom) {
      scrollToBottom();
    } else if (diff > 0) {
      setNewMsgCount((c) => c + diff);
    }
  }, [messages.length, isNearBottom, scrollToBottom]);

  // Always scroll on conversation change
  useEffect(() => {
    setNewMsgCount(0);
    setIsNearBottom(true);
    scrollToBottom();
  }, [conversation.id, scrollToBottom]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  const quickReplySearch = input.startsWith("/") ? input.slice(1).toLowerCase() : null;
  const filteredQuickReplies = quickReplySearch !== null
    ? allQuickReplies.filter((qr) => qr.label.toLowerCase().includes(quickReplySearch) || qr.content.toLowerCase().includes(quickReplySearch))
    : [];
  useEffect(() => { setShowQuickReplies(input.startsWith("/") && filteredQuickReplies.length > 0); }, [input, filteredQuickReplies.length]);

  useEffect(() => {
    return () => { if (pendingPreview) URL.revokeObjectURL(pendingPreview); };
  }, [pendingPreview]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage?.(conversation.id, input.trim());
    setInput("");
    setShowQuickReplies(false);
    setReplyTo(null);
  };

  const handleQuickReply = (text: string) => { setInput(text); setShowQuickReplies(false); textareaRef.current?.focus(); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } };

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

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleFileSelected(file);
        return;
      }
    }
  }, [handleFileSelected]);

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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 },
      });
      // Prefer OGG Opus (WhatsApp PTT native format), then WebM Opus
      const mimeType = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"
            : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 });
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

  const getReplyPreview = (msg: Message) => {
    if (msg.mediaType === "audio") return "🎧 Áudio";
    if (msg.mediaType === "image") return "📷 Foto";
    if (msg.mediaType === "video") return "🎬 Vídeo";
    if (msg.mediaType === "document") return "📎 Arquivo";
    if (msg.mediaType === "sticker") return "🏷️ Figurinha";
    if (msg.mediaType === "contact") return "👤 Contato";
    if (msg.mediaType === "location") return "📍 Localização";
    if (isMediaPlaceholder(msg.content)) return "💬 Mensagem";
    return msg.content?.substring(0, 80) || "💬 Mensagem";
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

  /* ── Quoted message block ── */
  const QuotedBlock = ({ msg }: { msg: Message }) => {
    if (!msg.quotedContent && !msg.quotedMessageId) return null;
    return (
      <div className={cn(
        "rounded-lg px-2.5 py-1.5 mb-1.5 border-l-2 text-[11px] leading-snug",
        msg.type === "sent"
          ? "bg-white/10 border-l-white/40 text-white/70"
          : "bg-muted/50 border-l-primary/40 text-muted-foreground"
      )}>
        <p className="truncate">{msg.quotedContent || "..."}</p>
      </div>
    );
  };

  /* ── Render a single message bubble content ── */
  const renderBubbleContent = (msg: Message) => {
    const isAudio = msg.mediaType === "audio";
    const isImage = msg.mediaType === "image";
    const isDocument = msg.mediaType === "document";
    const isVideo = msg.mediaType === "video";
    const isSticker = msg.mediaType === "sticker";
    const isContact = msg.mediaType === "contact";
    const isLocation = msg.mediaType === "location";

    if (isAudio && msg.mediaUrl) {
      return (
        <div>
          <QuotedBlock msg={msg} />
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
          <QuotedBlock msg={msg} />
          <img
            src={msg.mediaUrl}
            alt="Imagem"
            className="rounded-lg max-w-full max-h-[300px] object-cover cursor-pointer"
            onClick={() => setLightboxUrl(msg.mediaUrl!)}
          />
          {msg.content && !isMediaPlaceholder(msg.content) && (
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words mt-1.5">{msg.content}</p>
          )}
          <MsgFooter msg={msg} />
        </div>
      );
    }

    if (isVideo && msg.mediaUrl) {
      return (
        <div>
          <QuotedBlock msg={msg} />
          <div className={cn("flex items-center gap-2.5 p-2.5 rounded-lg", msg.type === "sent" ? "bg-white/10" : "bg-muted/50")}>
            <Video className={cn("w-5 h-5 shrink-0", msg.type === "sent" ? "text-white/70" : "text-muted-foreground")} />
            <div className="flex-1 min-w-0">
              <p className={cn("text-[12px] font-medium", msg.type === "sent" ? "text-white" : "text-foreground")}>Vídeo</p>
            </div>
            <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer">
              <Download className={cn("w-4 h-4 shrink-0", msg.type === "sent" ? "text-white/50" : "text-muted-foreground/50")} />
            </a>
          </div>
          {msg.content && !isMediaPlaceholder(msg.content) && (
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
          <QuotedBlock msg={msg} />
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
          {msg.content && !isMediaPlaceholder(msg.content) && (
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words mt-1.5">{msg.content}</p>
          )}
          <MsgFooter msg={msg} />
        </div>
      );
    }

    // Sticker, contact, location without URL — show icon placeholder
    if ((isSticker || isContact || isLocation || isVideo || isImage || isDocument) && !msg.mediaUrl) {
      const iconMap: Record<string, { icon: React.ReactNode; label: string }> = {
        sticker: { icon: <span className="text-2xl">🏷️</span>, label: "Figurinha" },
        contact: { icon: <User className="w-5 h-5" />, label: "Contato" },
        location: { icon: <MapPin className="w-5 h-5" />, label: "Localização" },
        video: { icon: <Video className="w-5 h-5" />, label: "Vídeo" },
        image: { icon: <ImageIcon className="w-5 h-5" />, label: "Foto" },
        document: { icon: <FileText className="w-5 h-5" />, label: "Arquivo" },
      };
      const info = iconMap[msg.mediaType!] || { icon: <FileText className="w-5 h-5" />, label: msg.mediaType || "Mídia" };

      return (
        <div>
          <QuotedBlock msg={msg} />
          <div className={cn("flex items-center gap-2.5 py-1", msg.type === "sent" ? "text-white/70" : "text-muted-foreground")}>
            {info.icon}
            <span className="text-[12px] font-medium">{info.label}</span>
          </div>
          {msg.content && !isMediaPlaceholder(msg.content) && (
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words mt-1">{msg.content}</p>
          )}
          <MsgFooter msg={msg} />
        </div>
      );
    }

    // Plain text or unknown content
    const displayText = isMediaPlaceholder(msg.content) && !msg.mediaType
      ? msg.content // show as-is if no media type (fallback)
      : msg.content;

    return (
      <>
        <QuotedBlock msg={msg} />
        <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{displayText}</p>
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
          const isMedia = !!msg.mediaType;

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex justify-center my-3">
                  <span className="text-[10px] font-medium text-muted-foreground bg-muted/80 px-3 py-1 rounded-full">
                    {format(new Date(msg.timestamp), "dd 'de' MMMM", { locale: ptBR })}
                  </span>
                </div>
              )}
              <div className={cn("flex group", msg.type === "sent" ? "justify-end" : "justify-start")}>
                {/* Reply button (appears on hover) */}
                {msg.type === "received" && (
                  <button
                    onClick={() => { setReplyTo(msg); textareaRef.current?.focus(); }}
                    className="self-center mr-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted/50"
                    title="Responder"
                  >
                    <Reply className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                )}

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

                {/* Reply button for sent messages (appears on hover) */}
                {msg.type === "sent" && (
                  <button
                    onClick={() => { setReplyTo(msg); textareaRef.current?.focus(); }}
                    className="self-center ml-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted/50"
                    title="Responder"
                  >
                    <Reply className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Replies */}
      {showQuickReplies && (
        <div className="border-t border-border bg-card/90 backdrop-blur-sm">
          <div className="px-4 py-2 flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Respostas Rápidas</span>
            </div>
            <button onClick={() => { setShowQuickReplies(false); setInput(""); setShowQRManager(true); }} className="text-[10px] text-primary hover:underline">
              <Settings className="w-3.5 h-3.5 inline mr-0.5" />Gerenciar
            </button>
          </div>
          <div className="px-2 pb-2 space-y-0.5 max-h-[200px] overflow-y-auto">
            {filteredQuickReplies.map((qr) => (
              <button key={qr.id} onClick={() => handleQuickReply(qr.content)} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-muted/50 transition-colors flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-foreground">/{qr.label}</span>
                <span className="text-[11px] text-muted-foreground truncate">{qr.content}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reply Preview */}
      {replyTo && (
        <div className="border-t border-border bg-card/90 backdrop-blur-sm px-4 py-2 flex items-center gap-3">
          <div className="w-1 h-8 rounded-full bg-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-primary">
              {replyTo.type === "sent" ? "Você" : conversation.name}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {getReplyPreview(replyTo)}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="w-7 h-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => setReplyTo(null)}>
            <X className="w-3.5 h-3.5" />
          </Button>
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
                onPaste={handlePaste}
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

      <QuickRepliesManager open={showQRManager} onOpenChange={setShowQRManager} />
      {lightboxUrl && <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
}
