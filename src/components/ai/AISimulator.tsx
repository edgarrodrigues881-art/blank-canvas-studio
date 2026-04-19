import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Send, Loader2, Target, Brain, ArrowLeft, Video, Phone, MoreVertical, Smile, Paperclip, Mic, Check, CheckCheck, Battery, Wifi, Signal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SimMessage {
  role: "user" | "assistant";
  content: string;
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

export function AISimulator() {
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [businessName, setBusinessName] = useState("Assistente");
  const [showMeta, setShowMeta] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [clockTime, setClockTime] = useState(getCurrentTime());

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

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: SimMessage = { role: "user", content: text, time: getCurrentTime() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data: settings } = await supabase
        .from("ai_settings")
        .select("tone, ai_instructions, business_name, business_type, business_description, business_hours, creativity")
        .eq("user_id", user.id)
        .maybeSingle();

      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

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

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Phone mockup */}
      <div className="relative mx-auto" style={{ width: 360 }}>
        {/* Phone frame */}
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

            {/* Chat area with pattern */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
              style={{
                height: "calc(100% - 130px)",
                backgroundColor: "#ECE5DD",
                backgroundImage:
                  "radial-gradient(circle at 20% 30%, rgba(0,0,0,0.025) 1px, transparent 1px), radial-gradient(circle at 80% 70%, rgba(0,0,0,0.025) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            >
              {/* Date pill */}
              <div className="flex justify-center pb-1">
                <span className="rounded-md bg-white/90 px-2.5 py-1 text-[10.5px] font-medium text-neutral-600 shadow-sm">
                  HOJE
                </span>
              </div>

              {messages.length === 0 && (
                <div className="flex justify-center pt-2">
                  <div className="max-w-[85%] rounded-lg bg-[#FFF9C4] px-3 py-2 text-center text-[11px] leading-relaxed text-neutral-700 shadow-sm">
                    💬 Envie uma mensagem como se fosse um cliente.<br/>
                    Ex: <em>"Oi, quanto custa o plano?"</em>
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[78%] space-y-1">
                    <div
                      className={`relative px-2.5 pt-1.5 pb-1 text-[14px] leading-snug shadow-sm ${
                        msg.role === "user"
                          ? "rounded-lg rounded-tr-sm bg-[#DCF8C6] text-neutral-900"
                          : "rounded-lg rounded-tl-sm bg-white text-neutral-900"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words pr-12">{msg.content}</p>
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

            {/* Input bar */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 bg-[#ECE5DD] px-2 py-2">
              <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm">
                <Smile className="h-5 w-5 text-neutral-500 shrink-0" strokeWidth={2} />
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  placeholder="Mensagem"
                  className="flex-1 bg-transparent text-[14px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
                  disabled={loading}
                />
                <Paperclip className="h-5 w-5 text-neutral-500 shrink-0 rotate-45" strokeWidth={2} />
              </div>
              <button
                onClick={sendMessage}
                disabled={loading}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#075E54] text-white shadow-md transition-transform active:scale-95 disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : input.trim() ? (
                  <Send className="h-[18px] w-[18px]" strokeWidth={2.5} />
                ) : (
                  <Mic className="h-5 w-5" strokeWidth={2} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Controls below phone */}
      <div className="flex items-center gap-3">
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
  );
}
