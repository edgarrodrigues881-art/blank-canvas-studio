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
  Video, LayoutGrid, MousePointerClick,
} from "lucide-react";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { CameraCapture } from "@/components/chat/CameraCapture";
import { SmartSuggestions } from "@/components/chat/SmartSuggestions";
import { formatDuration, formatFileSize } from "@/utils/formatters";
import { getFileIcon } from "@/utils/fileHelpers";
import { cn } from "@/lib/utils";

export interface GroupReplyTo {
  whatsappMessageId?: string | null;
  content?: string | null;
  senderName?: string | null;
  mediaType?: string | null;
}

export interface ButtonTemplateItem {
  id: string;
  name: string;
  content: string;
  media_url?: string | null;
  type?: string | null;
  buttons: any[];
}
export interface CarouselTemplateItem {
  id: string;
  name: string;
  message?: string | null;
  cards: any[];
}
export type GroupTemplate =
  | { kind: "buttons"; tpl: ButtonTemplateItem }
  | { kind: "carousel"; tpl: CarouselTemplateItem };

interface Props {
  disabled?: boolean;
  replyTo: GroupReplyTo | null;
  onCancelReply: () => void;
  onSendText: (text: string, replyTo: GroupReplyTo | null) => Promise<void> | void;
  onSendFile: (file: File, caption: string | undefined, replyTo: GroupReplyTo | null) => Promise<void> | void;
  onSendAudio: (blob: Blob, duration: number, replyTo: GroupReplyTo | null) => Promise<void> | void;
  buttonTemplates?: ButtonTemplateItem[];
  carouselTemplates?: CarouselTemplateItem[];
  onSendTemplate?: (tpl: GroupTemplate) => Promise<void> | void;
}

export function GroupChatComposer({
  disabled, replyTo, onCancelReply, onSendText, onSendFile, onSendAudio,
  buttonTemplates = [], carouselTemplates = [], onSendTemplate,
}: Props) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // detect "@..." token at caret to show suggestion popup
  const detectMention = useCallback((value: string, caret: number) => {
    const before = value.slice(0, caret);
    const m = before.match(/(?:^|\s)@([a-zA-Z]*)$/);
    if (m) {
      setMentionQuery(m[1].toLowerCase());
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
    // detect "/" command — only when textarea starts with "/"
    const s = value.match(/^\/([^\n]*)$/);
    if (s) {
      setSlashQuery(s[1].toLowerCase());
      setSlashIndex(0);
    } else {
      setSlashQuery(null);
    }
  }, []);

  const mentionSuggestions = (() => {
    if (mentionQuery === null) return [] as { token: string; label: string }[];
    const all = [
      { token: "todos", label: "@todos · marca todos do grupo" },
      { token: "all", label: "@all · marca todos do grupo" },
    ];
    if (!mentionQuery) return all;
    return all.filter((s) => s.token.startsWith(mentionQuery));
  })();

  // Build flat slash-suggestion list: BUTTONS first, then CAROUSEL
  const slashSuggestions = (() => {
    if (slashQuery === null) return [] as GroupTemplate[];
    const q = slashQuery.trim().toLowerCase();
    const btn: GroupTemplate[] = buttonTemplates
      .filter((t) => !q || (t.name || "").toLowerCase().includes(q))
      .map((tpl) => ({ kind: "buttons" as const, tpl }));
    const car: GroupTemplate[] = carouselTemplates
      .filter((t) => !q || (t.name || "").toLowerCase().includes(q))
      .map((tpl) => ({ kind: "carousel" as const, tpl }));
    return [...btn, ...car];
  })();

  const applyMention = useCallback((token: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const caret = ta.selectionStart ?? input.length;
    const before = input.slice(0, caret);
    const after = input.slice(caret);
    const newBefore = before.replace(/@([a-zA-Z]*)$/, `@${token} `);
    const newValue = newBefore + after;
    setInput(newValue);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      const pos = newBefore.length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  }, [input]);

  const applyTemplate = useCallback(async (tpl: GroupTemplate) => {
    if (!onSendTemplate) return;
    setSlashQuery(null);
    setInput("");
    await onSendTemplate(tpl);
  }, [onSendTemplate]);

  // file
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashQuery !== null && slashSuggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashIndex((i) => Math.min(slashSuggestions.length - 1, i + 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSlashIndex((i) => Math.max(0, i - 1)); return; }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const pick = slashSuggestions[slashIndex];
        if (pick) applyTemplate(pick);
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); setSlashQuery(null); return; }
    }
    if (mentionQuery !== null && mentionSuggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => Math.min(mentionSuggestions.length - 1, i + 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => Math.max(0, i - 1)); return; }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applyMention(mentionSuggestions[mentionIndex]?.token || "todos");
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); setMentionQuery(null); return; }
    }
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
      <input ref={videoInputRef} type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); e.target.value = ""; }} />
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
                  <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => videoInputRef.current?.click()}>
                    <Video className="w-4 h-4" /> Vídeo
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <FileText className="w-4 h-4" /> Arquivo
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => { setCameraFacing("environment"); setCameraOpen(true); }}>
                    <Camera className="w-4 h-4" /> Câmera
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex-1 min-w-0">
                <SmartSuggestions
                  text={input}
                  onApply={(newText) => {
                    setInput(newText);
                    requestAnimationFrame(() => textareaRef.current?.focus());
                  }}
                />
              </div>
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                {slashQuery !== null && slashSuggestions.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-1 z-30 w-80 max-h-80 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
                    {(() => {
                      const btns = slashSuggestions.filter((s) => s.kind === "buttons");
                      const cars = slashSuggestions.filter((s) => s.kind === "carousel");
                      let runningIdx = 0;
                      const renderItem = (s: GroupTemplate) => {
                        const i = runningIdx++;
                        const isCarousel = s.kind === "carousel";
                        const name = isCarousel ? s.tpl.name : s.tpl.name;
                        const subtitle = isCarousel
                          ? `${(s.tpl.cards?.length || 0)} card(s) · carrossel`
                          : `${(s.tpl.buttons?.length || 0)} botão(ões)${s.tpl.media_url ? " · com mídia" : ""}`;
                        return (
                          <button
                            key={`${s.kind}-${s.tpl.id}`}
                            type="button"
                            onMouseEnter={() => setSlashIndex(i)}
                            onClick={() => applyTemplate(s)}
                            className={cn(
                              "w-full text-left px-3 py-2 text-sm flex items-start gap-2 transition-colors",
                              i === slashIndex ? "bg-primary/10 text-foreground" : "hover:bg-muted/50"
                            )}
                          >
                            {isCarousel ? <LayoutGrid className="w-4 h-4 mt-0.5 text-purple-500 shrink-0" /> : <MousePointerClick className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />}
                            <span className="flex-1 min-w-0">
                              <span className="font-semibold block truncate">{name}</span>
                              <span className="text-[11px] text-muted-foreground truncate block">{subtitle}</span>
                            </span>
                          </button>
                        );
                      };
                      return (
                        <>
                          {btns.length > 0 && (
                            <>
                              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40 bg-muted/30 sticky top-0">
                                Botões
                              </div>
                              {btns.map(renderItem)}
                            </>
                          )}
                          {cars.length > 0 && (
                            <>
                              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-y border-border/40 bg-muted/30 sticky top-0">
                                Carrossel
                              </div>
                              {cars.map(renderItem)}
                            </>
                          )}
                          <div className="px-3 py-1 text-[9px] text-muted-foreground/70 bg-muted/20 border-t border-border/40 sticky bottom-0">
                            ↑↓ navegar · Enter para enviar · Esc cancela
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
                {slashQuery !== null && slashSuggestions.length === 0 && (
                  <div className="absolute bottom-full left-0 mb-1 z-30 w-72 rounded-lg border border-border bg-popover shadow-lg px-3 py-3 text-xs text-muted-foreground">
                    Nenhum template encontrado. Crie em <span className="font-semibold text-foreground">Templates</span> ou <span className="font-semibold text-foreground">Carrossel</span>.
                  </div>
                )}
                {mentionQuery !== null && mentionSuggestions.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-1 z-20 w-64 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40 bg-muted/30">
                      Marcar membros
                    </div>
                    {mentionSuggestions.map((s, i) => (
                      <button
                        key={s.token}
                        type="button"
                        onMouseEnter={() => setMentionIndex(i)}
                        onClick={() => applyMention(s.token)}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors",
                          i === mentionIndex ? "bg-primary/10 text-foreground" : "hover:bg-muted/50"
                        )}
                      >
                        <span className="text-emerald-600 font-semibold">@{s.token}</span>
                        <span className="text-xs text-muted-foreground truncate">marca todos do grupo</span>
                      </button>
                    ))}
                    <div className="px-3 py-1 text-[9px] text-muted-foreground/70 bg-muted/20 border-t border-border/40">
                      ↑↓ navegar · Enter para inserir · Esc cancela
                    </div>
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  spellCheck
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
                  }}
                  onKeyUp={(e) => {
                    const ta = e.currentTarget;
                    detectMention(ta.value, ta.selectionStart ?? ta.value.length);
                  }}
                  onClick={(e) => {
                    const ta = e.currentTarget;
                    detectMention(ta.value, ta.selectionStart ?? ta.value.length);
                  }}
                  onBlur={() => setTimeout(() => { setMentionQuery(null); setSlashQuery(null); }, 150)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  rows={1}
                  placeholder={pendingFile ? "Adicione uma legenda (opcional)..." : "Digite / para templates · @todos para marcar o grupo..."}
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
