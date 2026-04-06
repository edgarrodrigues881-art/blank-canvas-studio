import { useState, useRef, useCallback, useEffect } from "react";
import { resolveVariables } from "@/hooks/useQuickReplies";

interface UseSendMessageParams {
  conversationId: string;
  conversationName?: string;
  conversationPhone?: string;
  onSendMessage?: (conversationId: string, content: string, quotedMessageId?: string, quotedContent?: string) => void;
  onSendAudio?: (conversationId: string, blob: Blob, duration: number) => void;
  onSendFile?: (conversationId: string, file: File) => void;
  /** Called after any send action so ChatPanel can scroll to bottom */
  onAfterSend?: () => void;
}

export function useSendMessage({
  conversationId,
  conversationName,
  conversationPhone,
  onSendMessage,
  onSendAudio,
  onSendFile,
  onAfterSend,
}: UseSendMessageParams) {
  // ── Text input ──
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Reply quote ──
  const [replyTo, setReplyTo] = useState<{ whatsappMessageId?: string; content?: string } | null>(null);

  // ── File attachment ──
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [sendingFile, setSendingFile] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Audio recording ──
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [sendingAudio, setSendingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Quick replies ──
  const [showQuickReplies, setShowQuickReplies] = useState(false);

  // Cleanup preview URL on unmount / change
  useEffect(() => {
    return () => { if (pendingPreview) URL.revokeObjectURL(pendingPreview); };
  }, [pendingPreview]);

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
    };
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  // ── Quick reply filtering ──
  const quickReplySearch = input.startsWith("/") ? input.slice(1).toLowerCase() : null;

  const getFilteredQuickReplies = useCallback(
    (allReplies: Array<{ id: string; label: string; content: string }>) => {
      if (quickReplySearch === null) return [];
      return allReplies.filter(
        (qr) =>
          qr.label.toLowerCase().includes(quickReplySearch) ||
          qr.content.toLowerCase().includes(quickReplySearch)
      );
    },
    [quickReplySearch]
  );

  // ── File handling ──
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

  const cancelPendingFile = useCallback(() => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
  }, [pendingPreview]);

  const sendPendingFile = useCallback(async () => {
    if (!pendingFile) return;
    setSendingFile(true);
    const caption = input.trim();
    if (caption) {
      onSendMessage?.(conversationId, caption);
      setInput("");
    }
    onSendFile?.(conversationId, pendingFile);
    // Clean up
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    setSendingFile(false);
    onAfterSend?.();
  }, [pendingFile, input, conversationId, onSendMessage, onSendFile, pendingPreview, onAfterSend]);

  // ── Send text ──
  const handleSend = useCallback(() => {
    if (pendingFile) {
      sendPendingFile();
      return;
    }
    if (!input.trim()) return;
    const quotedWaId = replyTo?.whatsappMessageId || undefined;
    const quotedText = replyTo?.content || undefined;
    onSendMessage?.(conversationId, input.trim(), quotedWaId, quotedText);
    setInput("");
    setShowQuickReplies(false);
    setReplyTo(null);
    onAfterSend?.();
  }, [pendingFile, sendPendingFile, input, replyTo, conversationId, onSendMessage, onAfterSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleQuickReply = useCallback(
    (text: string) => {
      const resolved = resolveVariables(text, {
        nome: conversationName || "",
        telefone: conversationPhone || "",
      });
      setInput(resolved);
      setShowQuickReplies(false);
      textareaRef.current?.focus();
    },
    [conversationName, conversationPhone]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
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
    },
    [handleFileSelected]
  );

  const handleImageInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelected(file);
      e.target.value = "";
    },
    [handleFileSelected]
  );

  const handleDocInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelected(file);
      e.target.value = "";
    },
    [handleFileSelected]
  );

  // ── Audio recording ──
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 },
      });
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
    } catch (err) {
      console.error("Mic denied:", err);
    }
  }, []);

  const stopAndSend = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    setSendingAudio(true);
    const duration = recordingTime;
    await new Promise<void>((resolve) => {
      const origStop = recorder.onstop;
      recorder.onstop = (e) => {
        if (origStop && typeof origStop === "function") (origStop as any).call(recorder, e);
        resolve();
      };
      recorder.stop();
    });
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsRecording(false);
    setRecordingTime(0);
    const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
    if (blob.size > 0) onSendAudio?.(conversationId, blob, duration);
    setSendingAudio(false);
    mediaRecorderRef.current = null;
    onAfterSend?.();
  }, [recordingTime, conversationId, onSendAudio, onAfterSend]);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsRecording(false);
    setRecordingTime(0);
    chunksRef.current = [];
    mediaRecorderRef.current = null;
  }, []);

  return {
    // Text
    input,
    setInput,
    textareaRef,
    handleSend,
    handleKeyDown,
    handlePaste,

    // Reply
    replyTo,
    setReplyTo,

    // Quick replies
    showQuickReplies,
    setShowQuickReplies,
    quickReplySearch,
    getFilteredQuickReplies,
    handleQuickReply,

    // File
    pendingFile,
    pendingPreview,
    sendingFile,
    imageInputRef,
    fileInputRef,
    handleFileSelected,
    handleImageInput,
    handleDocInput,
    cancelPendingFile,
    sendPendingFile,

    // Audio
    isRecording,
    recordingTime,
    sendingAudio,
    startRecording,
    stopAndSend,
    cancelRecording,
  };
}
