import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Sparkles, Copy, MessageSquare, Users, UserPlus, Zap } from "lucide-react";
import { generateNaturalMessage, generateBatch, estimateCombinations, type MessageContext } from "@/lib/messageGenerator";
import { useToast } from "@/hooks/use-toast";

export function MessageGeneratorPreview() {
  const { toast } = useToast();
  const [context, setContext] = useState<MessageContext>("group");
  const [messages, setMessages] = useState<string[]>(() => generateBatch(12, "group"));
  const totalCombinations = estimateCombinations();

  const regenerate = useCallback(() => {
    setMessages(generateBatch(12, context));
  }, [context]);

  const handleTabChange = useCallback((val: string) => {
    const ctx = val as MessageContext;
    setContext(ctx);
    setMessages(generateBatch(12, ctx));
  }, []);

  const copyMessage = (msg: string) => {
    navigator.clipboard.writeText(msg);
    toast({ title: "Copiado!", description: msg });
  };

  const contextConfig: Record<MessageContext, { icon: React.ReactNode; label: string; color: string }> = {
    group: { icon: <Users className="h-4 w-4" />, label: "Grupos", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
    private: { icon: <MessageSquare className="h-4 w-4" />, label: "PV", color: "bg-green-500/10 text-green-400 border-green-500/20" },
    autosave: { icon: <UserPlus className="h-4 w-4" />, label: "Auto Save", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    community: { icon: <Zap className="h-4 w-4" />, label: "Comunitário", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Gerador de Mensagens Naturais</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs font-mono">
            {totalCombinations.toLocaleString("pt-BR")}+ variações
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Mensagens geradas automaticamente por combinação de blocos. Cada clique gera frases únicas.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={context} onValueChange={handleTabChange}>
          <TabsList className="grid grid-cols-4 w-full">
            {(Object.entries(contextConfig) as [MessageContext, typeof contextConfig.group][]).map(([key, cfg]) => (
              <TabsTrigger key={key} value={key} className="gap-1.5 text-xs">
                {cfg.icon}
                {cfg.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={regenerate} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Gerar novas
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {messages.map((msg, i) => (
            <button
              key={`${msg}-${i}`}
              onClick={() => copyMessage(msg)}
              className="group relative text-left p-3 rounded-lg border border-border/40 bg-muted/30 hover:bg-muted/60 hover:border-primary/30 transition-all text-sm"
            >
              <span>{msg}</span>
              <span className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Copy className="h-3 w-3 text-muted-foreground" />
              </span>
              <span className="block text-[10px] text-muted-foreground mt-1">
                {msg.length} chars
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/30">
          <span>✅ 10-60 caracteres</span>
          <span>🔄 Sem repetição recente</span>
          <span>🎲 Emojis e números aleatórios</span>
        </div>
      </CardContent>
    </Card>
  );
}
