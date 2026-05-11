import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Paperclip, Send, Image as ImageIcon, FileText, Camera, Mic, Trash2, Loader2, X,
} from "lucide-react";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { CameraCapture } from "@/components/chat/CameraCapture";
import { formatDuration, formatFileSize } from "@/utils/formatters";
import { getFileIcon } from "@/utils/fileHelpers";
import { cn } from "@/lib/utils";

export interface GroupReplyTo {
  whatsappMessageId?: string | null;
  content?: string | null;
  senderName?: string | null;
  mediaType?: string | null;
}

interface Props {
  disabled?: boolean;
  replyTo: GroupReplyTo | null;
  onCancelReply: () => void;
  onSendText: (text: string, replyTo: GroupReplyTo | null) => Promise<void> | void;
  onSendFile: (file: File, caption: string | undefined, replyTo: GroupReplyTo | null) => Promise<void> | void;
  onSendAudio: (blob: Blob, duration: number, replyTo: GroupReplyTo | null) => Promise<void> | void;
}

export function GroupChatComposer({
  disabled, replyTo, onCancelReply, onSendText, onSendFile, onSendAudio,
}: Props) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // file
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // camera
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("environment");

  // audio
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [sendingAudio, setSendingAudio] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // auto-resize
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [input]);

  useEffect(() => () => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    if (timerRef.current) clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  }, []);

  const handleFileSelected = useCallback((file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      alert("Arquivo muito grande. Máximo: 20MB");
      return;
    }
    setPendingFile(file);
    setPendingPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
  }, []);

  const cancelPendingFile = useCallback(() => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
  }, [pendingPreview]);

  const doSend = useCallback(async () => {
    if (sending) return;
    if (pendingFile) {
      setSending(true);
      try {
        await onSendFile(pendingFile, input.trim() || undefined, replyTo);
        cancelPendingFile();
        setInput("");
        onCancelReply();
      } finally { setSending(false); }
      return;
    }
    const text = input.trim();
    if (!text) return;
    setSending(true);
    try {
      await onSendText(text, replyTo);
      setInput("");
      onCancelReply();
    } finally { setSending(false); }
  }, [sending, pendingFile, input, replyTo, onSendFile, onSendText, cancelPendingFile, onCancelReply]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
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
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 },
      });
      const mimeType = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => stream.getTracks().forEach((t) => t.stop());
      recorder.start(250);
      recorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      alert("Permissão de microfone negada");
    }
  };

  const stopAndSend = async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    setSendingAudio(true);
    const duration = recordingTime;
    await new Promise<void>((resolve) => {
      const orig = recorder.onstop;
      recorder.onstop = (e) => { if (orig) (orig as any).call(recorder, e); resolve(); };
      recorder.stop();
    });
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsRecording(false);
    setRecordingTime(0);
    const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
    if (blob.size > 0) {
      try {
        await onSendAudio(blob, duration, replyTo);
        onCancelReply();
      } catch { /* handled by caller toast */ }
    }
    setSendingAudio(false);
    recorderRef.current = null;
  };

  const cancelRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsRecording(false);
    setRecordingTime(0);
    chunksRef.current = [];
    recorderRef.current = null;
  };

  return (
    <>
      <CameraCapture
        open={cameraOpen}
        initialFacing={cameraFacing}
        onClose={() => setCameraOpen(false)}
        onCapture={(f) => { handleFileSelected(f); setCameraOpen(false); }}
      />

      {/* Reply preview */}
      {replyTo && (
        <div className="border-t border-border bg-card/90 backdrop-blur-sm px-4 py-2 flex items-center gap-3">
          <div className="w-1 h-8 rounded-full bg-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-primary">
              {replyTo.senderName || "Mensagem"}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {replyTo.content?.substring(0, 80) || (replyTo.mediaType ? `[${replyTo.mediaType}]` : "💬 Mensagem")}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="w-7 h-7 shrink-0" onClick={onCancelReply}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* File preview */}
      {pendingFile && (
        <div className="border-t border-border bg-card/90 backdrop-blur-sm p-3">
          <div className="flex items-start gap-3">
            {pendingPreview ? (
              <img src={pendingPreview} alt="" className="w-20 h-20 rounded-lg object-cover border border-border" />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-muted/50 border border-border flex items-center justify-center">
                <span className="text-3xl">{getFileIcon(pendingFile.name)}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{pendingFile.name}</p>
              <p className="text-[11px] text-muted-foreground">{formatFileSize(pendingFile.size)}</p>
            </div>
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={cancelPendingFile}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); e.target.value = ""; }} />
      <input ref={fileInputRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); e.target.value = ""; }} />

      <div className="border-t border-border/40 bg-card/40 px-3 py-2">
        {isRecording ? (
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="w-9 h-9 text-red-400 hover:text-red-300" onClick={cancelRecording}>
              <Trash2 className="w-4 h-4" />
            </Button>
            <div className="flex-1 flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-medium">{formatDuration(recordingTime)}</span>
              <span className="text-xs text-muted-foreground">Gravando áudio...</span>
            </div>
            <Button size="icon" className="w-10 h-10 rounded-full" onClick={stopAndSend} disabled={sendingAudio}>
              {sendingAudio ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <EmojiPicker onEmojiSelect={(emoji) => {
                setInput((prev) => prev + emoji);
                textareaRef.current?.focus();
              }} />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="w-9 h-9 text-muted-foreground hover:text-foreground">
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
                  <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => { setCameraFacing("environment"); setCameraOpen(true); }}>
                    <Camera className="w-4 h-4" /> Câmera
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  spellCheck
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  rows={1}
                  placeholder={pendingFile ? "Adicione uma legenda (opcional)..." : "Digite uma mensagem para o grupo..."}
                  disabled={disabled || sending}
                  className={cn(
                    "w-full resize-none rounded-xl bg-background border border-border px-4 py-2.5 text-sm",
                    "focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/40 shadow-sm",
                    "placeholder:text-muted-foreground/70"
                  )}
                  style={{ minHeight: "40px", maxHeight: "120px" }}
                />
              </div>

              {(input.trim() || pendingFile) ? (
                <Button size="icon" className="w-10 h-10 rounded-xl shrink-0" onClick={doSend} disabled={sending || disabled}>
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              ) : (
                <Button size="icon" variant="ghost" className="w-10 h-10 rounded-xl shrink-0 text-muted-foreground hover:text-foreground" onClick={startRecording} disabled={disabled}>
                  <Mic className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
