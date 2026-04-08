import { useState, useRef, useCallback, useEffect } from "react";
import {
  Play, Pause, Check, CheckCheck, Loader2,
  Download, FileText, Video, MapPin, User,
  Image as ImageIcon, Reply, X, Trash2,
} from "lucide-react";
import { Smartphone } from "lucide-react";
import { type Message } from "./types";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/utils/formatters";
import { getFileIcon, isMediaPlaceholder } from "@/utils/fileHelpers";

export { isMediaPlaceholder };

/* ─── Audio Player ─── */

function AudioPlayer({ src, duration, isSent }: { src: string; duration?: number; isSent: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number>(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);

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

  // Audio event listeners
  const onRef = useCallback((el: HTMLAudioElement | null) => {
    (audioRef as React.MutableRefObject<HTMLAudioElement | null>).current = el;
    if (!el) return;
    el.onplay = () => { rafRef.current = requestAnimationFrame(updateProgress); };
    el.onpause = () => { cancelAnimationFrame(rafRef.current); };
    el.onended = () => { cancelAnimationFrame(rafRef.current); setPlaying(false); setProgress(0); setCurrentTime(0); };
    el.onloadedmetadata = () => { if (el.duration && isFinite(el.duration)) setTotalDuration(el.duration); };
  }, [updateProgress]);

  return (
    <div className="flex items-center gap-2.5 min-w-[200px]">
      <audio ref={onRef} src={src} preload="auto" />
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

/* ─── Sub-components ─── */

function StatusIcon({ status }: { status?: string }) {
  if (status === "sending") return <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/40" />;
  if (status === "read") return <CheckCheck className="w-3.5 h-3.5 text-blue-400" />;
  if (status === "delivered") return <CheckCheck className="w-3.5 h-3.5 text-muted-foreground/50" />;
  if (status === "sent") return <Check className="w-3.5 h-3.5 text-muted-foreground/50" />;
  if (status === "failed") return <span className="text-[10px] text-red-400 font-medium">⚠</span>;
  return null;
}

function MsgFooter({ msg }: { msg: Message }) {
  return (
    <div className={cn("flex items-center gap-1 mt-1", msg.type === "sent" ? "justify-end" : "justify-start")}>
      <span className={cn("text-[10px]", msg.type === "sent" ? "text-white/60" : "text-muted-foreground/60")}>
        {format(new Date(msg.timestamp), "HH:mm")}
      </span>
      {msg.type === "sent" && <StatusIcon status={msg.status} />}
    </div>
  );
}

function QuotedBlock({ msg }: { msg: Message }) {
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
}

/* ─── Main MessageBubble ─── */

export interface MessageBubbleProps {
  msg: Message;
  /** Whether this contact has multiple instances (shows device label) */
  showDeviceLabel?: boolean;
  /** Callback when user clicks reply */
  onReply?: (msg: Message) => void;
  /** Callback to open lightbox */
  onImageClick?: (url: string) => void;
  /** Callback to retry failed message */
  onRetry?: (messageId: string) => void;
  /** Callback to delete message */
  onDelete?: (msg: Message) => void;
}

// Stable waveform cache outside component to avoid re-renders
const waveformCache: Record<string, number[]> = {};
function getWaveform(id: string) {
  if (!waveformCache[id]) waveformCache[id] = Array.from({ length: 28 }, () => Math.random() * 14 + 4);
  return waveformCache[id];
}

export function MessageBubble({ msg, showDeviceLabel, onReply, onImageClick, onRetry, onDelete }: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback(() => {
    longPressTimer.current = setTimeout(() => setShowActions(true), 500);
  }, []);
  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  // Close actions when clicking outside
  useEffect(() => {
    if (!showActions) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setShowActions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [showActions]);

  const renderContent = () => {
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
                {msg.type === "sent" && <StatusIcon status={msg.status} />}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (isSticker && msg.mediaUrl) {
      return (
        <div>
          <img
            src={msg.mediaUrl}
            alt="Figurinha"
            className="max-w-[100px] max-h-[100px] object-contain cursor-pointer drop-shadow-md"
            onClick={() => onImageClick?.(msg.mediaUrl!)}
          />
          <MsgFooter msg={msg} />
        </div>
      );
    }

    if (isImage && msg.mediaUrl) {
      return (
        <div className="w-full">
          <QuotedBlock msg={msg} />
          <button
            type="button"
            onClick={() => onImageClick?.(msg.mediaUrl!)}
            className="block w-full overflow-hidden rounded-[18px] border border-border/20 bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <div className="aspect-square w-full">
              <img src={msg.mediaUrl} alt="Imagem" className="h-full w-full object-cover" />
            </div>
          </button>
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
          <video src={msg.mediaUrl} controls className="rounded-xl max-w-full max-h-[320px] cursor-pointer shadow-md" />
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

    // Media without URL — icon placeholder
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

    // Plain text
    const displayText = isMediaPlaceholder(msg.content) && !msg.mediaType ? msg.content : msg.content;
    return (
      <>
        <QuotedBlock msg={msg} />
        <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{displayText}</p>
        <MsgFooter msg={msg} />
        {msg.status === "failed" && (
          <button onClick={() => onRetry?.(msg.id)} className="text-[10px] text-red-400 hover:text-red-300 mt-0.5 text-right underline cursor-pointer block w-full">
            Falhou — toque para reenviar
          </button>
        )}
      </>
    );
  };

  const isSent = msg.type === "sent";

  return (
    <div className={cn("flex group relative", isSent ? "justify-end" : "justify-start")}>
      {/* Reply button for received */}
      {!isSent && onReply && (
        <button
          onClick={() => onReply(msg)}
          className="self-center mr-0.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted/50"
          title="Responder"
        >
          <Reply className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      )}

      <div className={cn("flex flex-col max-w-[82%] sm:max-w-[72%]", isSent ? "items-end" : "items-start")}>
        {/* Device label — only when instance changes */}
        {showDeviceLabel && msg.deviceName && (
          <span className="text-[8px] text-muted-foreground/30 mb-0.5 ml-1 mr-1 flex items-center gap-0.5">
            <Smartphone className="w-2 h-2" />
            {msg.deviceName}
          </span>
        )}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onContextMenu={(e) => { e.preventDefault(); setShowActions(true); }}
          className={cn(
            "min-w-[60px] rounded-2xl relative",
            msg.mediaType === "image" && msg.mediaUrl
              ? "w-full max-w-[260px] p-1.5"
              : "w-fit px-3.5 py-2",
            isSent
              ? "bg-blue-600 text-white rounded-br-sm"
              : "bg-card border border-border/40 text-foreground rounded-bl-sm",
            msg.status === "failed" && "opacity-70"
          )}
        >
          {renderContent()}
        </div>

        {/* Action popup */}
        {showActions && (
          <div
            ref={actionsRef}
            className={cn(
              "flex items-center gap-1 mt-1 animate-fade-in",
              isSent ? "justify-end" : "justify-start"
            )}
          >
            {onReply && (
              <button
                onClick={() => { onReply(msg); setShowActions(false); }}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-md bg-muted/60 hover:bg-muted transition-colors"
              >
                <Reply className="w-3 h-3" /> Responder
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => { onDelete(msg); setShowActions(false); }}
                className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 px-2 py-1 rounded-md bg-muted/60 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Apagar
              </button>
            )}
            <button
              onClick={() => setShowActions(false)}
              className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Reply button for sent */}
      {isSent && onReply && (
        <button
          onClick={() => onReply(msg)}
          className="self-center ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted/50"
          title="Responder"
        >
          <Reply className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
