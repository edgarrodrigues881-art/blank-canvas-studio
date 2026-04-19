import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Send, Loader2, Target, Brain, ArrowLeft, Video, Phone, MoreVertical, Smile, Paperclip, Mic, CheckCheck, Battery, Wifi, Signal, X, Image as ImageIcon, FileText, Square, Play, Pause } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Attachment {
  type: "image" | "audio" | "file";
  name: string;
  dataUrl: string; // base64 data URL
  size: number;
  mimeType: string;
  duration?: number; // for audio in seconds
}

interface SimMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  meta?: { intent?: string; flow_step?: string };
  time?: string;
}

const INTENT_LABELS: Record<string, string> = {
  curious: "🔎 Curioso",
  interested: "💡 Interessado",
  ready_to_buy: "🔥 Pronto p/ comprar",
  objection: "🛡️ Objeção",
};

const STEP_LABELS: Record<string, string> = {
  saudacao: "👋 Saudação",
  diagnostico: "🔍 Diagnóstico",
  apresentacao: "🎯 Apresentação",
  objecao: "🛡️ Objeção",
  fechamento: "🤝 Fechamento",
};

const getCurrentTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const formatDuration = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

const fileToDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export function AISimulator() {
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [businessName, setBusinessName] = useState("Assistente");
  const [showMeta, setShowMeta] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [clockTime, setClockTime] = useState(getCurrentTime());

  // Audio recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});

  useEffect(() => {
    const interval = setInterval(() => setClockTime(getCurrentTime()), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("ai_settings")
        .select("business_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.business_name) setBusinessName(data.business_name);
    })();
  }, []);

  // ============ Attachments ============
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (file.size > 8 * 1024 * 1024) {
        toast.error(`${file.name}: máximo 8 MB`);
        continue;
      }
      const dataUrl = await fileToDataUrl(file);
      setPendingAttachments((p) => [...p, { type: "image", name: file.name, dataUrl, size: file.size, mimeType: file.type }]);
    }
    e.target.value = "";
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (file.size > 8 * 1024 * 1024) {
        toast.error(`${file.name}: máximo 8 MB`);
        continue;
      }
      const dataUrl = await fileToDataUrl(file);
      const isImage = file.type.startsWith("image/");
      setPendingAttachments((p) => [...p, { type: isImage ? "image" : "file", name: file.name, dataUrl, size: file.size, mimeType: file.type }]);
    }
    e.target.value = "";
  };

  const removePending = (idx: number) => {
    setPendingAttachments((p) => p.filter((_, i) => i !== idx));
  };

  // ============ Audio Recording ============
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const dataUrl = await fileToDataUrl(blob);
        const duration = recordSeconds;
        setPendingAttachments((p) => [...p, {
          type: "audio",
          name: `audio-${Date.now()}.webm`,
          dataUrl,
          size: blob.size,
          mimeType: "audio/webm",
          duration,
        }]);
        setRecordSeconds(0);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      toast.error("Permita acesso ao microfone para gravar áudio");
    }
  };

  const stopRecording = (cancel = false) => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    setIsRecording(false);
    if (mediaRecorderRef.current) {
      if (cancel) {
        mediaRecorderRef.current.onstop = () => {
          mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
        };
      }
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    if (cancel) setRecordSeconds(0);
  };

  const togglePlay = (id: string, dataUrl: string) => {
    if (!audioRefs.current[id]) {
      const audio = new Audio(dataUrl);
      audio.onended = () => setPlayingId(null);
      audioRefs.current[id] = audio;
    }
    const audio = audioRefs.current[id];
    if (playingId === id) {
      audio.pause();
      setPlayingId(null);
    } else {
      Object.entries(audioRefs.current).forEach(([k, a]) => k !== id && a.pause());
      audio.play();
      setPlayingId(id);
    }
  };

  // ============ Send ============
  const sendMessage = async () => {
    const text = input.trim();
    if ((!text && pendingAttachments.length === 0) || loading) return;

    const userMsg: SimMessage = {
      role: "user",
      content: text,
      attachments: pendingAttachments.length ? pendingAttachments : undefined,
      time: getCurrentTime(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setPendingAttachments([]);
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data: settings } = await supabase
        .from("ai_settings")
        .select("tone, ai_instructions, business_name, business_type, business_description, business_hours, creativity")
        .eq("user_id", user.id)
        .maybeSingle();

      // Build multimodal history (OpenAI/Gemini compatible)
      const history = [...messages, userMsg].map((m) => {
        const imgs = (m.attachments || []).filter((a) => a.type === "image");
        const otherAtts = (m.attachments || []).filter((a) => a.type !== "image");
        const otherDesc = otherAtts.map((a) =>
          a.type === "audio"
            ? `[áudio enviado pelo cliente — duração ${a.duration ?? "?"}s]`
            : `[arquivo enviado: ${a.name} (${a.mimeType || "desconhecido"})]`
        ).join("\n");

        const textPart = [m.content, otherDesc].filter(Boolean).join("\n\n");

        if (imgs.length === 0) {
          return { role: m.role, content: textPart };
        }
        // Multimodal: array of parts
        const parts: any[] = [];
        if (textPart) parts.push({ type: "text", text: textPart });
        imgs.forEach((img) => {
          parts.push({ type: "image_url", image_url: { url: img.dataUrl } });
        });
        return { role: m.role, content: parts };
      });

      const { data, error } = await supabase.functions.invoke("test-ai-simulator", {
        body: { messages: history, settings: settings || {} },
      });

      if (error) throw new Error(error.message || "Erro na simulação");

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply, meta: data.meta, time: getCurrentTime() },
      ]);
    } catch (err: any) {
      console.error("Simulator error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ Erro: ${err.message || "Falha na simulação"}`, time: getCurrentTime() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const initial = (businessName || "A").trim().charAt(0).toUpperCase();
  const hasInputContent = input.trim().length > 0 || pendingAttachments.length > 0;

  const renderAttachment = (att: Attachment, i: number, isUser: boolean) => {
    const id = `att-${i}-${att.name}`;
    if (att.type === "image") {
      return (
        <a key={i} href={att.dataUrl} target="_blank" rel="noreferrer" className="block">
          <img src={att.dataUrl} alt={att.name} className="max-h-48 rounded-md object-cover" />
        </a>
      );
    }
    if (att.type === "audio") {
      return (
        <div key={i} className="flex items-center gap-2 py-1">
          <button
            onClick={() => togglePlay(id, att.dataUrl)}
            className={`flex h-8 w-8 items-center justify-center rounded-full ${isUser ? "bg-[#128C7E]" : "bg-[#075E54]"} text-white`}
          >
            {playingId === id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
          </button>
          <div className="h-1 flex-1 min-w-[100px] rounded-full bg-neutral-300">
            <div className="h-full w-0 rounded-full bg-neutral-500" />
          </div>
          <span className="text-[10px] text-neutral-500">{formatDuration(att.duration || 0)}</span>
        </div>
      );
    }
    return (
      <a key={i} href={att.dataUrl} download={att.name} className="flex items-center gap-2 rounded-md bg-black/5 px-2 py-1.5">
        <FileText className="h-4 w-4 text-neutral-600" />
        <span className="text-[12px] text-neutral-700 truncate max-w-[150px]">{att.name}</span>
      </a>
    );
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-end">
      {/* Info on the left (only on desktop) */}
      <div className="hidden lg:flex lg:flex-1 lg:flex-col lg:gap-3 lg:pt-2">
        <div className="rounded-xl border border-border/40 bg-card/50 p-5">
          <div className="flex items-center gap-2.5 mb-2">
            <Brain className="h-4 w-4 text-primary" strokeWidth={1.5} />
            <h3 className="text-base font-semibold tracking-tight">Testar Assistente</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Simule uma conversa real com seu assistente: envie texto, áudio, imagens e arquivos para validar o comportamento da IA antes de colocar em produção.
          </p>
        </div>

        <div className="rounded-xl border border-border/30 bg-card/30 p-4 space-y-2">
          <p className="text-xs font-medium text-foreground/80">💡 Dicas</p>
          <ul className="space-y-1.5 text-[11.5px] text-muted-foreground leading-relaxed">
            <li>• Teste objeções comuns ("tá caro", "vou pensar")</li>
            <li>• Envie um áudio simulando um cliente apressado</li>
            <li>• Mande uma foto de um produto ou print</li>
            <li>• Verifique se a intenção é detectada corretamente</li>
          </ul>
        </div>
      </div>

      {/* Phone mockup — right side */}
      <div className="relative mx-auto lg:mx-0" style={{ width: 360 }}>
        <div className="relative rounded-[44px] bg-neutral-900 p-3 shadow-2xl ring-1 ring-black/20">
          {/* Side buttons */}
          <div className="absolute -left-[3px] top-24 h-10 w-[3px] rounded-l bg-neutral-800" />
          <div className="absolute -left-[3px] top-40 h-16 w-[3px] rounded-l bg-neutral-800" />
          <div className="absolute -right-[3px] top-32 h-20 w-[3px] rounded-l bg-neutral-800" />

          {/* Screen */}
          <div className="relative overflow-hidden rounded-[32px]" style={{ height: 640 }}>
            {/* Status bar */}
            <div className="flex items-center justify-between bg-[#075E54] px-5 pt-2 pb-1 text-[11px] font-medium text-white">
              <span>{clockTime}</span>
              <div className="flex items-center gap-1">
                <Signal className="h-3 w-3" />
                <Wifi className="h-3 w-3" />
                <Battery className="h-3.5 w-3.5" />
              </div>
            </div>

            {/* Chat header */}
            <div className="flex items-center gap-3 bg-[#075E54] px-3 py-2.5 text-white">
              <ArrowLeft className="h-5 w-5 shrink-0" strokeWidth={2} />
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">
                {initial}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-[15px] font-medium leading-tight">{businessName}</p>
                <p className="text-[11px] text-white/80 leading-tight">
                  {loading ? "digitando..." : "online"}
                </p>
              </div>
              <Video className="h-5 w-5 shrink-0" strokeWidth={2} />
              <Phone className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
              <MoreVertical className="h-5 w-5 shrink-0" strokeWidth={2} />
            </div>

            {/* Chat area */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
              style={{
                height: pendingAttachments.length > 0 ? "calc(100% - 200px)" : "calc(100% - 130px)",
                backgroundColor: "#ECE5DD",
                backgroundImage:
                  "radial-gradient(circle at 20% 30%, rgba(0,0,0,0.025) 1px, transparent 1px), radial-gradient(circle at 80% 70%, rgba(0,0,0,0.025) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            >
              <div className="flex justify-center pb-1">
                <span className="rounded-md bg-white/90 px-2.5 py-1 text-[10.5px] font-medium text-neutral-600 shadow-sm">
                  HOJE
                </span>
              </div>

              {messages.length === 0 && (
                <div className="flex justify-center pt-2">
                  <div className="max-w-[85%] rounded-lg bg-[#FFF9C4] px-3 py-2 text-center text-[11px] leading-relaxed text-neutral-700 shadow-sm">
                    💬 Envie texto, áudio, imagem ou arquivo<br />
                    pra testar o assistente.
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[78%] space-y-1">
                    <div
                      className={`relative px-2 pt-1.5 pb-1 text-[14px] leading-snug shadow-sm ${
                        msg.role === "user"
                          ? "rounded-lg rounded-tr-sm bg-[#DCF8C6] text-neutral-900"
                          : "rounded-lg rounded-tl-sm bg-white text-neutral-900"
                      }`}
                    >
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="space-y-1 mb-1">
                          {msg.attachments.map((a, idx) => renderAttachment(a, idx, msg.role === "user"))}
                        </div>
                      )}
                      {msg.content && (
                        <p className="whitespace-pre-wrap break-words pr-12 px-1">{msg.content}</p>
                      )}
                      <span className="absolute bottom-1 right-2 flex items-center gap-0.5 text-[9.5px] text-neutral-500">
                        {msg.time}
                        {msg.role === "user" && <CheckCheck className="h-3 w-3 text-[#34B7F1]" strokeWidth={2.5} />}
                      </span>
                    </div>

                    {showMeta && msg.meta && (msg.meta.intent || msg.meta.flow_step) && (
                      <div className="flex flex-wrap items-center gap-1 px-1">
                        {msg.meta.intent && (
                          <Badge className="text-[9px] px-1.5 py-0 bg-primary/15 text-primary border-primary/30 font-normal">
                            <Target className="h-2.5 w-2.5 mr-0.5" strokeWidth={2} />
                            {INTENT_LABELS[msg.meta.intent] || msg.meta.intent}
                          </Badge>
                        )}
                        {msg.meta.flow_step && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-dashed font-normal bg-white/80">
                            <Brain className="h-2.5 w-2.5 mr-0.5" strokeWidth={2} />
                            {STEP_LABELS[msg.meta.flow_step] || msg.meta.flow_step}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-lg rounded-tl-sm bg-white px-3 py-2 shadow-sm">
                    <div className="flex gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Pending attachments preview */}
            {pendingAttachments.length > 0 && (
              <div className="absolute bottom-[60px] left-0 right-0 bg-white/95 border-t border-neutral-200 px-2 py-2">
                <div className="flex gap-2 overflow-x-auto">
                  {pendingAttachments.map((a, i) => (
                    <div key={i} className="relative shrink-0">
                      {a.type === "image" ? (
                        <img src={a.dataUrl} alt="" className="h-14 w-14 rounded object-cover" />
                      ) : (
                        <div className="h-14 w-14 rounded bg-neutral-100 flex items-center justify-center">
                          {a.type === "audio" ? <Mic className="h-5 w-5 text-neutral-600" /> : <FileText className="h-5 w-5 text-neutral-600" />}
                        </div>
                      )}
                      <button
                        onClick={() => removePending(i)}
                        className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-neutral-800 text-white flex items-center justify-center"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recording bar */}
            {isRecording ? (
              <div className="absolute bottom-0 left-0 right-0 flex items-center gap-3 bg-[#ECE5DD] px-3 py-3">
                <button
                  onClick={() => stopRecording(true)}
                  className="text-neutral-600 hover:text-destructive"
                  title="Cancelar"
                >
                  <X className="h-5 w-5" />
                </button>
                <div className="flex flex-1 items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm font-mono text-neutral-700">{formatDuration(recordSeconds)}</span>
                  <span className="text-xs text-neutral-500">Gravando…</span>
                </div>
                <button
                  onClick={() => stopRecording(false)}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-[#075E54] text-white shadow-md active:scale-95 transition-transform"
                  title="Parar e anexar"
                >
                  <Square className="h-4 w-4 fill-current" />
                </button>
              </div>
            ) : (
              <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 bg-[#ECE5DD] px-2 py-2">
                <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm">
                  <Smile className="h-5 w-5 text-neutral-500 shrink-0" strokeWidth={2} />
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                    placeholder="Mensagem"
                    className="flex-1 bg-transparent text-[14px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none min-w-0"
                    disabled={loading}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-neutral-500 hover:text-neutral-700 shrink-0"
                    title="Anexar arquivo"
                  >
                    <Paperclip className="h-5 w-5 rotate-45" strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    className="text-neutral-500 hover:text-neutral-700 shrink-0"
                    title="Anexar imagem"
                  >
                    <ImageIcon className="h-5 w-5" strokeWidth={2} />
                  </button>
                </div>
                <button
                  onClick={hasInputContent ? sendMessage : startRecording}
                  disabled={loading}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#075E54] text-white shadow-md transition-transform active:scale-95 disabled:opacity-60"
                  title={hasInputContent ? "Enviar" : "Gravar áudio"}
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : hasInputContent ? (
                    <Send className="h-[18px] w-[18px]" strokeWidth={2.5} />
                  ) : (
                    <Mic className="h-5 w-5" strokeWidth={2} />
                  )}
                </button>
              </div>
            )}

            {/* Hidden inputs */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageSelect}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        </div>

        {/* Controls below phone */}
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={() => setShowMeta((v) => !v)}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {showMeta ? "Ocultar" : "Mostrar"} análise da IA
          </button>
          {messages.length > 0 && (
            <>
              <span className="text-muted-foreground/40">•</span>
              <button
                onClick={() => setMessages([])}
                className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
              >
                Limpar conversa
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
