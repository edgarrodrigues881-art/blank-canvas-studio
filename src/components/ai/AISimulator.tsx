import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Bot, Send, User, Loader2, Sparkles, Target, Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SimMessage {
  role: "user" | "assistant";
  content: string;
  meta?: { intent?: string; flow_step?: string };
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

export function AISimulator() {
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: SimMessage = { role: "user", content: text };
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
        body: {
          messages: history,
          settings: settings || {},
        },
      });

      if (error) throw new Error(error.message || "Erro na simulação");

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply, meta: data.meta },
      ]);
    } catch (err: any) {
      console.error("Simulator error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ Erro: ${err.message || "Falha na simulação"}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="transition-all duration-200 hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" strokeWidth={1.5} />
          <CardTitle className="text-base">Teste sua IA agora</CardTitle>
        </div>
        <CardDescription>Simule uma conversa como cliente e veja como a IA responde</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          ref={scrollRef}
          className="h-[280px] rounded-xl border border-border/50 bg-background overflow-y-auto p-3 space-y-3"
        >
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Bot className="h-10 w-10 text-muted-foreground/30 mb-2" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">Digite uma mensagem como se fosse um cliente</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Ex: "Oi, quanto custa o plano?"</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
                </div>
              )}
              <div className="space-y-1 max-w-[80%]">
                <div
                  className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted/50 text-foreground border border-border/30 rounded-bl-md"
                  }`}
                >
                  {msg.content}
                </div>
                {msg.meta && (msg.meta.intent || msg.meta.flow_step) && (
                  <div className="flex items-center gap-1.5 px-1">
                    {msg.meta.intent && (
                      <Badge className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20 font-normal">
                        <Target className="h-2.5 w-2.5 mr-0.5" strokeWidth={1.5} />
                        {INTENT_LABELS[msg.meta.intent] || msg.meta.intent}
                      </Badge>
                    )}
                    {msg.meta.flow_step && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-dashed font-normal">
                        <Brain className="h-2.5 w-2.5 mr-0.5" strokeWidth={1.5} />
                        {STEP_LABELS[msg.meta.flow_step] || msg.meta.flow_step}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              {msg.role === "user" && (
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-2 items-start">
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
              </div>
              <div className="rounded-2xl rounded-bl-md bg-muted/50 border border-border/30 px-4 py-2.5">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Digite como cliente..."
            className="text-sm"
            disabled={loading}
          />
          <Button size="icon" onClick={sendMessage} disabled={!input.trim() || loading} className="shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>

        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full text-center"
          >
            Limpar conversa
          </button>
        )}
      </CardContent>
    </Card>
  );
}
