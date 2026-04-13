import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Bot, Building2, BookOpen, Headset, Brain, ShieldCheck, Upload, Plus, Trash2,
  Sparkles, Key, CheckCircle2, AlertTriangle, Eye, EyeOff, Loader2, Send,
  FileText, File, Power, Target, Zap, Activity, Circle, Timer, MessageSquare,
  UserCheck, PhoneCall, LifeBuoy, Users, Flame, Snowflake, TrendingUp,
  Rocket, Calendar, Settings2, ChevronDown, ChevronUp,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { AIOnboardingWizard } from "@/components/ai/AIOnboardingWizard";

type AiMode = "vendas" | "atendimento" | "suporte" | "agendamento";

interface ModePreset {
  label: string;
  icon: string;
  desc: string;
  recommended?: boolean;
  objective: string;
  commStyle: string;
  insistence: number;
  strategy: string;
  tone: string;
  responseStyle: string;
  flowSteps: Record<string, string>;
  preview: string;
}

const MODE_PRESETS: Record<AiMode, ModePreset> = {
  vendas: {
    label: "Vendas Automáticas",
    icon: "🚀",
    desc: "IA focada em converter leads em clientes",
    recommended: true,
    objective: "vender",
    commStyle: "persuasivo",
    insistence: 4,
    strategy: "fechamento",
    tone: "friendly",
    responseStyle: "medium",
    flowSteps: {
      saudacao: "Olá! Que bom ter você aqui! 😊 Posso te mostrar algo incrível?",
      diagnostico: "Me conta: o que você está buscando? Assim consigo te indicar a melhor opção!",
      apresentacao: "Perfeito! Tenho exatamente o que você precisa. Olha só os benefícios...",
      objecao: "Entendo! Mas olha, muitos clientes tinham essa mesma dúvida e hoje são super satisfeitos porque...",
      fechamento: "Vamos garantir o seu? Posso enviar o link agora mesmo! 🔥",
    },
    preview: "A IA vai cumprimentar, descobrir a necessidade, apresentar a solução, contornar objeções e conduzir para o fechamento — tudo de forma natural e persuasiva.",
  },
  atendimento: {
    label: "Atendimento Inteligente",
    icon: "💬",
    desc: "IA que responde dúvidas e acolhe o cliente",
    objective: "atender",
    commStyle: "amigavel",
    insistence: 2,
    strategy: "perguntas",
    tone: "friendly",
    responseStyle: "medium",
    flowSteps: {
      saudacao: "Olá! Seja bem-vindo(a)! Como posso te ajudar hoje? 😊",
      diagnostico: "Para te ajudar da melhor forma, me conta mais detalhes sobre o que você precisa.",
      apresentacao: "Entendi! Com base no que você me disse, vou te explicar tudo direitinho...",
      objecao: "Compreendo sua dúvida! Vou esclarecer isso para você...",
      fechamento: "Consegui te ajudar? Se tiver mais alguma dúvida, é só mandar! 😊",
    },
    preview: "A IA vai acolher o cliente, entender a necessidade com perguntas, fornecer informações claras e garantir que todas as dúvidas foram resolvidas.",
  },
  suporte: {
    label: "Suporte ao Cliente",
    icon: "🛠️",
    desc: "IA técnica para resolver problemas",
    objective: "suporte",
    commStyle: "tecnico",
    insistence: 1,
    strategy: "perguntas",
    tone: "professional",
    responseStyle: "detailed",
    flowSteps: {
      saudacao: "Olá! Sou o assistente de suporte. Como posso ajudá-lo?",
      diagnostico: "Para resolver seu problema, preciso de algumas informações: O que exatamente está acontecendo?",
      apresentacao: "Identifiquei o problema. Vou te guiar na solução passo a passo...",
      objecao: "Entendo que é frustrante. Vamos tentar uma abordagem alternativa...",
      fechamento: "O problema foi resolvido? Se precisar de mais ajuda, estou aqui.",
    },
    preview: "A IA vai diagnosticar o problema com perguntas técnicas, oferecer soluções passo a passo e verificar se o problema foi resolvido.",
  },
  agendamento: {
    label: "Agendamento",
    icon: "📅",
    desc: "IA focada em marcar horários",
    objective: "atender",
    commStyle: "direto",
    insistence: 3,
    strategy: "direto",
    tone: "professional",
    responseStyle: "short",
    flowSteps: {
      saudacao: "Olá! Vamos agendar seu horário? 📅",
      diagnostico: "Qual serviço você gostaria de agendar? E qual sua preferência de dia e horário?",
      apresentacao: "Temos disponibilidade nos seguintes horários...",
      objecao: "Se esse horário não funciona, posso verificar outras opções para você.",
      fechamento: "Perfeito! Seu agendamento está confirmado! Te envio um lembrete antes. ✅",
    },
    preview: "A IA vai perguntar o serviço desejado, verificar disponibilidade, confirmar o horário e enviar lembretes — tudo de forma objetiva.",
  },
};

interface LeadMemory {
  id: string;
  remote_jid: string;
  contact_name: string | null;
  interest: string | null;
  stage: string;
  interaction_count: number;
  last_interaction_at: string | null;
  notes: string | null;
  product_cited: string | null;
  last_message_preview: string | null;
}

interface KnowledgeDoc {
  id: string; title: string; type: string; fileName: string; active: boolean; addedAt: string;
}

const AISettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [iaActive, setIaActive] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [aiModel, setAiModel] = useState("gpt-4o-mini");
  const [testingAi, setTestingAi] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [businessHours, setBusinessHours] = useState("");
  const [businessSegment, setBusinessSegment] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [tone, setTone] = useState("professional");
  const [attendanceMode, setAttendanceMode] = useState("knowledge");
  const [aiInstructions, setAiInstructions] = useState("");
  const [aiObjective, setAiObjective] = useState("atender");
  const [commStyle, setCommStyle] = useState("amigavel");
  const [insistence, setInsistence] = useState(3);
  const [strategy, setStrategy] = useState("perguntas");
  const [autoFlow, setAutoFlow] = useState(true);
  const [selectedMode, setSelectedMode] = useState<AiMode | null>(null);
  const [expertMode, setExpertMode] = useState(false);
  const [flowSteps, setFlowSteps] = useState({
    saudacao: "Olá! Seja bem-vindo(a)! Como posso te ajudar hoje? 😊",
    diagnostico: "Para te ajudar melhor, me conta: o que você está buscando exatamente? Qual sua principal necessidade?",
    apresentacao: "Com base no que você me disse, tenho a solução perfeita! Deixa eu te apresentar...",
    objecao: "Entendo sua preocupação! Muitos clientes tinham a mesma dúvida. O que posso te garantir é que...",
    fechamento: "Ótimo! Vamos fechar então? Posso te enviar o link de pagamento ou agendar uma demonstração?",
  });
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<LeadMemory | null>(null);
  const [responseStyle, setResponseStyle] = useState("medium");
  const [splitLongMessages, setSplitLongMessages] = useState(true);
  const [simulateTyping, setSimulateTyping] = useState(true);
  const [conversationMemory, setConversationMemory] = useState(true);
  const [creativity, setCreativity] = useState([50]);
  const [maxResponseLength, setMaxResponseLength] = useState("medium");
  const [blockSensitive, setBlockSensitive] = useState(true);
  const [requireHumanForSale, setRequireHumanForSale] = useState(true);
  const [pauseWords, setPauseWords] = useState("parar, atendente, humano");
  const [reactivateWords, setReactivateWords] = useState("voltar, continuar");
  const [fallbackImage, setFallbackImage] = useState("Não consigo ver imagens, descreva por texto");
  const [fallbackAudio, setFallbackAudio] = useState("Não consigo ouvir áudios, pode escrever?");
  const [autoTransferHuman, setAutoTransferHuman] = useState(false);
  const [minDelay, setMinDelay] = useState(1);
  const [maxDelay, setMaxDelay] = useState(3);
  const [maxResponseTime, setMaxResponseTime] = useState(30);
  const [maxConsecutiveMessages, setMaxConsecutiveMessages] = useState(3);
  const [smartDelay, setSmartDelay] = useState(true);
  const [forceCollectName, setForceCollectName] = useState(false);
  const [forceCollectPhone, setForceCollectPhone] = useState(false);
  const [fallbackAskContext, setFallbackAskContext] = useState(true);
  const [fallbackTransferAfter, setFallbackTransferAfter] = useState(2);
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDoc[]>([]);
  const [kbProducts, setKbProducts] = useState("");
  const [kbPrices, setKbPrices] = useState("");
  const [kbDifferentials, setKbDifferentials] = useState("");
  const [kbFaq, setKbFaq] = useState("");
  const [kbPreview, setKbPreview] = useState("");
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [kbTab, setKbTab] = useState<"structured" | "upload">("structured");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocType, setNewDocType] = useState("pdf");
  const [newDocFile, setNewDocFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [settingsExist, setSettingsExist] = useState(false);
  const [leads, setLeads] = useState<LeadMemory[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);

  // Load settings from DB
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data } = await supabase
        .from("ai_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        setSettingsExist(true);
        setIaActive(data.ia_active);
        setApiKey(data.api_key || "");
        setAiModel(data.ai_model);
        setTone(data.tone);
        setResponseStyle(data.response_style);
        setAiInstructions(data.ai_instructions || "");
        setBusinessName(data.business_name || "");
        setBusinessType(data.business_type || "");
        setBusinessHours(data.business_hours || "");
        setBusinessSegment(data.business_segment || "");
        setBusinessDescription(data.business_description || "");
        setFallbackImage(data.fallback_image || "");
        setFallbackAudio(data.fallback_audio || "");
        setPauseWords(data.pause_words || "");
        setReactivateWords(data.reactivate_words || "");
        setAutoTransferHuman(data.auto_transfer_human);
        setSimulateTyping(data.simulate_typing);
        setSplitLongMessages(data.split_long_messages);
        setConversationMemory(data.conversation_memory);
        setMinDelay(data.min_delay_seconds);
        setMaxDelay(data.max_delay_seconds);
        setBlockSensitive(data.block_sensitive);
        setRequireHumanForSale(data.require_human_for_sale);
        setCreativity([data.creativity]);
        setMaxResponseLength(data.max_response_length);
      } else {
        setShowOnboarding(true);
      }
      setLoading(false);
    })();
  }, []);

  // Load leads
  useEffect(() => {
    (async () => {
      setLoadingLeads(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingLeads(false); return; }
      const { data } = await supabase
        .from("ai_lead_memory")
        .select("*")
        .eq("user_id", user.id)
        .order("last_interaction_at", { ascending: false })
        .limit(50);
      if (data) setLeads(data as LeadMemory[]);
      setLoadingLeads(false);
    })();
  }, []);

  const applyMode = (mode: AiMode) => {
    const preset = MODE_PRESETS[mode];
    setSelectedMode(mode);
    setAiObjective(preset.objective);
    setCommStyle(preset.commStyle);
    setInsistence(preset.insistence);
    setStrategy(preset.strategy);
    setTone(preset.tone);
    setResponseStyle(preset.responseStyle);
    setFlowSteps(preset.flowSteps as typeof flowSteps);
    setAutoFlow(true);
    const prompt = generatePrompt(preset.objective, preset.commStyle, preset.insistence, preset.strategy);
    setAiInstructions(prompt);
    toast.success(`Modo "${preset.label}" aplicado!`);
  };

  const generatePrompt = (obj: string, style: string, ins: number, strat: string) => {
    const objMap: Record<string, string> = { vender: "converter leads em vendas e fechar negócios", atender: "atender dúvidas dos clientes de forma completa", suporte: "resolver problemas técnicos e dar suporte" };
    const styleMap: Record<string, string> = { persuasivo: "persuasivo e convincente", tecnico: "técnico e detalhado", amigavel: "amigável e acolhedor", direto: "direto e objetivo" };
    const insMap: Record<number, string> = { 1: "Nunca insista, aceite a primeira negativa.", 2: "Seja discreto, sugira no máximo uma vez.", 3: "Tenha persistência moderada, tente até 2 vezes.", 4: "Seja persistente, tente convencer com argumentos.", 5: "Seja muito insistente, não desista fácil e use gatilhos de urgência." };
    const stratMap: Record<string, string> = { perguntas: "Faça perguntas para entender a necessidade antes de responder.", direto: "Vá direto ao ponto sem muitas perguntas.", fechamento: "Conduza a conversa sempre para o fechamento/conversão." };
    return `Seu objetivo é ${objMap[obj] || objMap.atender}. Comunique-se de forma ${styleMap[style] || styleMap.amigavel}. ${insMap[ins] || insMap[3]} Estratégia: ${stratMap[strat] || stratMap.perguntas} Use o nome do cliente quando disponível. Responda de forma natural e curta.`;
  };

  const updateBehavior = (obj: string, style: string, ins: number, strat: string) => {
    const prompt = generatePrompt(obj, style, ins, strat);
    setAiInstructions(prompt);
  };

  const handleOnboardingComplete = async (result: { businessType: string; objective: string; tone: string; businessName: string; businessDescription: string; businessHours: string }) => {
    setBusinessType(result.businessType);
    setTone(result.tone);
    setBusinessName(result.businessName);
    setBusinessDescription(result.businessDescription);
    setBusinessHours(result.businessHours);
    setIaActive(true);

    // Map objective to attendance mode
    const modeMap: Record<string, string> = {
      atendimento: "knowledge",
      vendas: "knowledge",
      suporte: "knowledge",
      agendamento: "scheduling",
    };
    setAttendanceMode(modeMap[result.objective] || "knowledge");

    // Generate instructions based on choices
    const toneLabels: Record<string, string> = { friendly: "amigável", professional: "profissional", direct: "direto e objetivo" };
    const objLabels: Record<string, string> = { atendimento: "atendimento ao cliente", vendas: "conversão de vendas", suporte: "suporte técnico", agendamento: "agendamento de horários" };
    const instructions = `Você é um assistente de ${objLabels[result.objective] || "atendimento"} da empresa ${result.businessName}. Seja ${toneLabels[result.tone] || "profissional"}. ${result.businessDescription ? "Sobre a empresa: " + result.businessDescription : ""}`;
    setAiInstructions(instructions);

    setShowOnboarding(false);

    // Auto-save
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const payload = {
        user_id: user.id,
        ia_active: true,
        api_key: apiKey,
        ai_model: aiModel,
        tone: result.tone,
        response_style: responseStyle,
        ai_instructions: instructions,
        business_name: result.businessName,
        business_type: result.businessType,
        business_hours: result.businessHours,
        business_segment: businessSegment,
        business_description: result.businessDescription,
        fallback_image: fallbackImage,
        fallback_audio: fallbackAudio,
        pause_words: pauseWords,
        reactivate_words: reactivateWords,
        auto_transfer_human: autoTransferHuman,
        simulate_typing: simulateTyping,
        split_long_messages: splitLongMessages,
        conversation_memory: conversationMemory,
        min_delay_seconds: minDelay,
        max_delay_seconds: maxDelay,
        block_sensitive: blockSensitive,
        require_human_for_sale: requireHumanForSale,
        creativity: creativity[0],
        max_response_length: maxResponseLength,
      };
      await supabase.from("ai_settings").upsert(payload, { onConflict: "user_id" });
      toast.success("IA configurada e ativada com sucesso! 🎉");
    } catch {
      toast.error("Erro ao salvar configurações");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Não autenticado"); return; }

      const payload = {
        user_id: user.id,
        ia_active: iaActive,
        api_key: apiKey,
        ai_model: aiModel,
        tone,
        response_style: responseStyle,
        ai_instructions: aiInstructions,
        business_name: businessName,
        business_type: businessType,
        business_hours: businessHours,
        business_segment: businessSegment,
        business_description: businessDescription,
        fallback_image: fallbackImage,
        fallback_audio: fallbackAudio,
        pause_words: pauseWords,
        reactivate_words: reactivateWords,
        auto_transfer_human: autoTransferHuman,
        simulate_typing: simulateTyping,
        split_long_messages: splitLongMessages,
        conversation_memory: conversationMemory,
        min_delay_seconds: minDelay,
        max_delay_seconds: maxDelay,
        block_sensitive: blockSensitive,
        require_human_for_sale: requireHumanForSale,
        creativity: creativity[0],
        max_response_length: maxResponseLength,
      };

      const { error } = await supabase
        .from("ai_settings")
        .upsert(payload, { onConflict: "user_id" });

      if (error) throw error;
      toast.success("Configurações salvas com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err.message || "Erro desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  const apiKeyStatus: "empty" | "valid" | "invalid" = !apiKey
    ? "empty"
    : apiKey.startsWith("sk-") && apiKey.length > 20
    ? "valid"
    : "invalid";

  const handleTestAi = async () => {
    if (apiKeyStatus !== "valid") {
      toast.error("Insira uma chave de API válida antes de testar");
      return;
    }
    setTestingAi(true);
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: aiModel,
          messages: [{ role: "user", content: "Responda com 'OK' apenas." }],
          max_tokens: 5,
        }),
      });
      if (res.ok) {
        toast.success("IA respondeu com sucesso! Conexão funcionando.");
      } else {
        const data = await res.json();
        toast.error("Erro: " + (data.error?.message || `HTTP ${res.status}`));
      }
    } catch (e: any) {
      toast.error("Falha na conexão: " + e.message);
    } finally {
      setTestingAi(false);
    }
  };

  const generateKbPreview = () => {
    if (!kbProducts.trim() && !kbPrices.trim() && !kbDifferentials.trim() && !kbFaq.trim()) {
      toast.error("Preencha pelo menos um campo da base de conhecimento");
      return;
    }
    setGeneratingPreview(true);
    setTimeout(() => {
      const parts: string[] = [];
      if (kbProducts.trim()) parts.push(`Nossos produtos/serviços incluem: ${kbProducts.trim()}`);
      if (kbPrices.trim()) parts.push(`Sobre preços: ${kbPrices.trim()}`);
      if (kbDifferentials.trim()) parts.push(`Nossos diferenciais: ${kbDifferentials.trim()}`);
      
      const faqLines = kbFaq.trim().split("\n").filter(Boolean);
      if (faqLines.length > 0) {
        const sampleQ = faqLines[0];
        parts.push(`Exemplo de resposta para "${sampleQ}": Com base no que sabemos, ${kbDifferentials.trim() ? `nosso diferencial é ${kbDifferentials.trim().split(",")[0]?.trim()}` : "oferecemos a melhor solução para você"}.`);
      }

      setKbPreview(
        parts.length > 0
          ? `🤖 Exemplo de como a IA responderia:\n\n"${tone === "friendly" ? "Oi! 😊 " : tone === "direct" ? "" : "Olá! "}${parts[0]}. ${parts.length > 1 ? parts[1] + "." : ""} Posso te ajudar com mais alguma coisa?"`
          : ""
      );
      setGeneratingPreview(false);
      toast.success("Preview gerado! Base de conhecimento aplicada automaticamente.");
    }, 800);
  };

  const handleAddDoc = () => {
    if (!newDocTitle.trim() || !newDocFile) {
      toast.error("Preencha o título e selecione um arquivo");
      return;
    }
    const doc: KnowledgeDoc = {
      id: crypto.randomUUID(),
      title: newDocTitle.trim(),
      type: newDocType,
      fileName: newDocFile.name,
      active: true,
      addedAt: new Date().toLocaleDateString("pt-BR"),
    };
    setKnowledgeDocs((prev) => [...prev, doc]);
    setNewDocTitle("");
    setNewDocType("pdf");
    setNewDocFile(null);
    setUploadModalOpen(false);
    toast.success("Documento adicionado com sucesso!");
  };

  const toggleDocActive = (id: string) => {
    setKnowledgeDocs((prev) => prev.map((d) => d.id === id ? { ...d, active: !d.active } : d));
  };

  const removeDoc = (id: string) => {
    setKnowledgeDocs((prev) => prev.filter((d) => d.id !== id));
    toast.success("Documento removido");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <AIOnboardingWizard
        open={showOnboarding}
        onComplete={handleOnboardingComplete}
        onSkip={() => setShowOnboarding(false)}
        apiKey={apiKey}
        aiModel={aiModel}
      />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Inteligência Artificial</h1>
            <p className="text-sm text-muted-foreground">Configure o atendimento automático com IA</p>
          </div>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2 transition-all duration-200 hover:shadow-lg hover:scale-[1.02]">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" strokeWidth={1.5} />}
          {iaActive ? "Salvar Alterações" : "Ativar IA"}
        </Button>
      </div>

      {/* Toggle principal + Status */}
      <Card className={`transition-all duration-300 ${iaActive ? "border-primary/40 bg-primary/5 shadow-[0_0_20px_-5px_hsl(var(--primary)/0.15)]" : "border-border/50"}`}>
        <CardContent className="py-4 px-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center transition-all duration-300 ${iaActive ? "bg-primary/15" : "bg-muted/50"}`}>
                <Bot className={`h-5 w-5 transition-colors duration-300 ${iaActive ? "text-primary" : "text-muted-foreground"}`} strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">IA Ativa</p>
                <p className="text-xs text-muted-foreground">Respostas automáticas para seus clientes</p>
              </div>
            </div>
            <Switch checked={iaActive} onCheckedChange={setIaActive} />
          </div>
          {iaActive && apiKeyStatus === "valid" && (
            <div className="mt-3 pt-3 border-t border-primary/10 flex items-center gap-2 animate-fade-in">
              <Circle className="h-2.5 w-2.5 fill-emerald-400 text-emerald-400 animate-pulse" />
              <span className="text-xs font-medium text-emerald-400">IA pronta para responder clientes</span>
            </div>
          )}
          {iaActive && apiKeyStatus !== "valid" && (
            <div className="mt-3 pt-3 border-t border-border/30 flex items-center gap-2 animate-fade-in">
              <Circle className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
              <span className="text-xs font-medium text-amber-400">Configure a chave de API para ativar</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modo de Operação */}
      <Card className="transition-all duration-200 hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" strokeWidth={1.5} />
            <CardTitle className="text-base">Escolha como sua IA deve operar</CardTitle>
          </div>
          <CardDescription>Selecione um modo e todas as configurações serão ajustadas automaticamente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {(Object.entries(MODE_PRESETS) as [AiMode, ModePreset][]).map(([key, preset]) => (
              <button
                key={key}
                onClick={() => applyMode(key)}
                className={`relative rounded-xl border p-4 text-left transition-all duration-200 hover:scale-[1.01] ${
                  selectedMode === key
                    ? "border-primary bg-primary/10 ring-2 ring-primary/30 shadow-md"
                    : "border-border/50 hover:border-border hover:shadow-sm"
                }`}
              >
                {preset.recommended && (
                  <Badge className="absolute -top-2 right-3 text-[10px] px-1.5 py-0 bg-primary text-primary-foreground">
                    Recomendado
                  </Badge>
                )}
                <span className="text-2xl">{preset.icon}</span>
                <p className="text-sm font-semibold text-foreground mt-2">{preset.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{preset.desc}</p>
                {selectedMode === key && (
                  <CheckCircle2 className="absolute top-3 right-3 h-4 w-4 text-primary" />
                )}
              </button>
            ))}
          </div>

          {/* Preview */}
          {selectedMode && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2 animate-fade-in">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" strokeWidth={1.5} />
                <p className="text-xs font-semibold text-primary">Como sua IA vai agir</p>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">{MODE_PRESETS[selectedMode].preview}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Badge variant="outline" className="text-[10px]">
                  {MODE_PRESETS[selectedMode].commStyle === "persuasivo" ? "🎯 Persuasivo" :
                   MODE_PRESETS[selectedMode].commStyle === "tecnico" ? "🔬 Técnico" :
                   MODE_PRESETS[selectedMode].commStyle === "amigavel" ? "😊 Amigável" : "⚡ Direto"}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  Insistência {MODE_PRESETS[selectedMode].insistence}/5
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {MODE_PRESETS[selectedMode].strategy === "fechamento" ? "🤝 Foco em fechamento" :
                   MODE_PRESETS[selectedMode].strategy === "direto" ? "🎯 Direto ao ponto" : "❓ Faz perguntas"}
                </Badge>
              </div>
            </div>
          )}

          {/* Expert mode toggle */}
          <button
            onClick={() => setExpertMode(!expertMode)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center pt-1"
          >
            <Settings2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span>{expertMode ? "Ocultar configurações avançadas" : "Modo expert — editar manualmente"}</span>
            {expertMode ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </CardContent>
      </Card>

      {/* Configuração da IA — API & Modelo */}
      <Card className="transition-all duration-200 hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-primary" strokeWidth={1.5} />
            <CardTitle className="text-base">Configuração da IA</CardTitle>
          </div>
          <CardDescription>Conecte sua chave de API e escolha o modelo</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Chave da API (OpenAI)</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {apiKeyStatus === "valid" && (
                <Badge variant="outline" className="border-emerald-500/50 text-emerald-400 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Conectado
                </Badge>
              )}
              {apiKeyStatus === "invalid" && (
                <Badge variant="outline" className="border-destructive/50 text-destructive gap-1">
                  <AlertTriangle className="h-3 w-3" /> Chave inválida
                </Badge>
              )}
              {apiKeyStatus === "empty" && (
                <div className="flex items-center gap-1.5 text-amber-400 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>A IA não funcionará sem uma chave válida</span>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Modelo</Label>
            <Select value={aiModel} onValueChange={setAiModel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4o-mini">GPT-4o Mini (rápido)</SelectItem>
                <SelectItem value="gpt-4o">GPT-4o (mais inteligente)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={handleTestAi} disabled={testingAi || apiKeyStatus !== "valid"} className="gap-2">
            {testingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Testar IA
          </Button>
        </CardContent>
      </Card>

      {expertMode && (<>
      {/* Delay de resposta */}
      <Card className="transition-all duration-200 hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" strokeWidth={1.5} />
            <CardTitle className="text-base">Delay de Resposta</CardTitle>
          </div>
          <CardDescription>Tempo de espera antes de enviar a resposta (simula digitação)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Mínimo (segundos)</Label>
              <Input type="number" min={0} max={10} value={minDelay} onChange={(e) => setMinDelay(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Máximo (segundos)</Label>
              <Input type="number" min={0} max={30} value={maxDelay} onChange={(e) => setMaxDelay(Number(e.target.value))} />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">A IA esperará entre {minDelay}s e {maxDelay}s antes de responder, para parecer mais natural</p>
        </CardContent>
      </Card>

      {/* Comportamento da IA */}
      <Card className="transition-all duration-200 hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" strokeWidth={1.5} />
            <CardTitle className="text-base">Comportamento da IA</CardTitle>
          </div>
          <CardDescription>Configure como a IA deve agir — o prompt é gerado automaticamente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Objetivo da IA */}
          <div className="space-y-2">
            <Label>Objetivo da IA</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "vender", label: "Vender", icon: "💰" },
                { value: "atender", label: "Atender", icon: "💬" },
                { value: "suporte", label: "Suporte", icon: "🛠️" },
              ].map((item) => (
                <button
                  key={item.value}
                  onClick={() => { setAiObjective(item.value); updateBehavior(item.value, commStyle, insistence, strategy); }}
                  className={`rounded-lg border p-3 text-center transition-all ${
                    aiObjective === item.value
                      ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                      : "border-border/50 hover:border-border"
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  <p className="text-sm font-medium text-foreground mt-1">{item.label}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Estilo de Comunicação */}
          <div className="space-y-2">
            <Label>Estilo de comunicação</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { value: "persuasivo", label: "Persuasivo", icon: "🎯" },
                { value: "tecnico", label: "Técnico", icon: "🔬" },
                { value: "amigavel", label: "Amigável", icon: "😊" },
                { value: "direto", label: "Direto", icon: "⚡" },
              ].map((item) => (
                <button
                  key={item.value}
                  onClick={() => { setCommStyle(item.value); updateBehavior(aiObjective, item.value, insistence, strategy); }}
                  className={`rounded-lg border p-2.5 text-center transition-all ${
                    commStyle === item.value
                      ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                      : "border-border/50 hover:border-border"
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <p className="text-xs font-medium text-foreground mt-0.5">{item.label}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Nível de Insistência */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Nível de insistência</Label>
              <Badge variant="outline" className="text-xs">{insistence}/5</Badge>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={insistence}
              onChange={(e) => { const v = Number(e.target.value); setInsistence(v); updateBehavior(aiObjective, commStyle, v, strategy); }}
              className="w-full accent-primary h-2 rounded-full cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Passivo</span>
              <span>Moderado</span>
              <span>Insistente</span>
            </div>
          </div>

          {/* Estratégia */}
          <div className="space-y-2">
            <Label>Estratégia</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "perguntas", label: "Fazer perguntas", desc: "Entende antes de responder", icon: "❓" },
                { value: "direto", label: "Direto ao ponto", desc: "Sem rodeios", icon: "🎯" },
                { value: "fechamento", label: "Conduzir fechamento", desc: "Foco em conversão", icon: "🤝" },
              ].map((item) => (
                <button
                  key={item.value}
                  onClick={() => { setStrategy(item.value); updateBehavior(aiObjective, commStyle, insistence, item.value); }}
                  className={`rounded-lg border p-2.5 text-left transition-all ${
                    strategy === item.value
                      ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                      : "border-border/50 hover:border-border"
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <p className="text-xs font-medium text-foreground mt-1">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Tom de voz */}
          <div className="space-y-2">
            <Label>Tom de voz</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="friendly">Amigável</SelectItem>
                <SelectItem value="professional">Profissional</SelectItem>
                <SelectItem value="direct">Direto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Estilo de resposta */}
          <div className="space-y-2">
            <Label>Estilo de resposta</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "short", label: "Curto", desc: "1-2 frases" },
                { value: "medium", label: "Médio", desc: "1 parágrafo" },
                { value: "detailed", label: "Detalhado", desc: "Resposta completa" },
              ].map((style) => (
                <button
                  key={style.value}
                  onClick={() => setResponseStyle(style.value)}
                  className={`rounded-lg border p-2.5 text-center transition-all ${
                    responseStyle === style.value
                      ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                      : "border-border/50 hover:border-border"
                  }`}
                >
                  <p className="text-sm font-medium text-foreground">{style.label}</p>
                  <p className="text-[10px] text-muted-foreground">{style.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Dividir mensagens longas</p>
                <p className="text-xs text-muted-foreground">Quebra respostas grandes em várias mensagens</p>
              </div>
              <Switch checked={splitLongMessages} onCheckedChange={setSplitLongMessages} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Simular digitando</p>
                <p className="text-xs text-muted-foreground">Adiciona delay antes de responder</p>
              </div>
              <Switch checked={simulateTyping} onCheckedChange={setSimulateTyping} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Memória de conversa</p>
                <p className="text-xs text-muted-foreground">IA lembra do contexto da conversa anterior</p>
              </div>
              <Switch checked={conversationMemory} onCheckedChange={setConversationMemory} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fluxo de Conversão */}
      <Card className="transition-all duration-200 hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" strokeWidth={1.5} />
            <CardTitle className="text-base">Fluxo de Conversão</CardTitle>
          </div>
          <CardDescription>Configure as etapas que a IA segue para converter clientes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between pb-2">
            <div>
              <p className="text-sm font-medium text-foreground">Seguir fluxo automaticamente</p>
              <p className="text-xs text-muted-foreground">IA detecta a intenção e avança nas etapas sozinha</p>
            </div>
            <Switch checked={autoFlow} onCheckedChange={setAutoFlow} />
          </div>

          <div className="space-y-2">
            {[
              { key: "saudacao", label: "Saudação", icon: "👋", desc: "Primeiro contato com o cliente" },
              { key: "diagnostico", label: "Diagnóstico", icon: "🔍", desc: "Entender a necessidade do cliente" },
              { key: "apresentacao", label: "Apresentação", icon: "🎯", desc: "Apresentar a solução ideal" },
              { key: "objecao", label: "Objeção", icon: "🛡️", desc: "Contornar dúvidas e objeções" },
              { key: "fechamento", label: "Fechamento", icon: "🤝", desc: "Conduzir para a conversão" },
            ].map((step, idx) => (
              <div
                key={step.key}
                className="rounded-lg border border-border/50 bg-muted/20 overflow-hidden"
              >
                <button
                  onClick={() => setEditingStep(editingStep === step.key ? null : step.key)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 text-xs font-bold text-primary shrink-0">
                    {idx + 1}
                  </div>
                  <span className="text-lg shrink-0">{step.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{step.label}</p>
                    <p className="text-[10px] text-muted-foreground">{step.desc}</p>
                  </div>
                  <svg
                    className={`h-4 w-4 text-muted-foreground transition-transform ${editingStep === step.key ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {editingStep === step.key && (
                  <div className="px-4 pb-4 pt-1 border-t border-border/30">
                    <Textarea
                      value={flowSteps[step.key as keyof typeof flowSteps]}
                      onChange={(e) => setFlowSteps((prev) => ({ ...prev, [step.key]: e.target.value }))}
                      rows={3}
                      placeholder={`Mensagem para a etapa de ${step.label.toLowerCase()}...`}
                      className="text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      A IA usará esta mensagem como base ao identificar que o cliente está nesta etapa
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {autoFlow && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3 animate-fade-in">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" strokeWidth={1.5} />
                <p className="text-xs font-semibold text-primary">Fluxo inteligente ativo</p>
              </div>
              <p className="text-[11px] text-foreground/70 leading-relaxed">A IA detecta a intenção do cliente em cada mensagem e escolhe a etapa ideal automaticamente. Se o cliente recuar, a IA volta uma etapa.</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: "🔎", label: "Curioso", desc: "→ Saudação / Diagnóstico" },
                  { icon: "💡", label: "Interessado", desc: "→ Diagnóstico / Apresentação" },
                  { icon: "🔥", label: "Pronto p/ comprar", desc: "→ Fechamento" },
                  { icon: "🛡️", label: "Objeção", desc: "→ Contornar + Avançar" },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-border/30 bg-background/50 px-3 py-2">
                    <p className="text-xs font-medium">{item.icon} {item.label}</p>
                    <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informações do Negócio */}
      <Card className="transition-all duration-200 hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" strokeWidth={1.5} />
            <CardTitle className="text-base">Informações do Negócio</CardTitle>
          </div>
          <CardDescription>Esses dados serão usados pela IA nas respostas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nome da empresa</Label>
            <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Ex: Minha Empresa LTDA" />
          </div>
          <div className="space-y-2">
            <Label>Tipo de negócio</Label>
            <Select value={businessType} onValueChange={setBusinessType}>
              <SelectTrigger><SelectValue placeholder="Selecione o tipo..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ecommerce">E-commerce</SelectItem>
                <SelectItem value="servicos">Prestação de Serviços</SelectItem>
                <SelectItem value="saas">SaaS / Tecnologia</SelectItem>
                <SelectItem value="varejo">Varejo / Loja Física</SelectItem>
                <SelectItem value="consultoria">Consultoria</SelectItem>
                <SelectItem value="educacao">Educação</SelectItem>
                <SelectItem value="saude">Saúde / Clínica</SelectItem>
                <SelectItem value="alimentacao">Alimentação</SelectItem>
                <SelectItem value="imobiliaria">Imobiliária</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Horário de atendimento</Label>
            <Input value={businessHours} onChange={(e) => setBusinessHours(e.target.value)} placeholder="Ex: Seg-Sex 08:00 às 18:00" />
          </div>
          <div className="space-y-2">
            <Label>Descrição do negócio</Label>
            <Textarea value={businessDescription} onChange={(e) => setBusinessDescription(e.target.value)} placeholder="Descreva brevemente o que sua empresa faz..." rows={3} />
          </div>
        </CardContent>
      </Card>

      {/* Base de Conhecimento */}
      <Card className="transition-all duration-200 hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" strokeWidth={1.5} />
            <CardTitle className="text-base">Base de Conhecimento</CardTitle>
          </div>
          <CardDescription>Ensine a IA sobre seu negócio para respostas precisas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-lg bg-muted/40">
            <button
              onClick={() => setKbTab("structured")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                kbTab === "structured" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              📝 Campos estruturados
            </button>
            <button
              onClick={() => setKbTab("upload")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                kbTab === "upload" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              📄 Upload de arquivos
            </button>
          </div>

          {kbTab === "structured" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <span>🛍️</span> Produtos / Serviços
                </Label>
                <Textarea
                  value={kbProducts}
                  onChange={(e) => setKbProducts(e.target.value)}
                  placeholder="Ex: Plano Básico - automação de mensagens&#10;Plano Pro - automação + IA&#10;Plano Enterprise - tudo incluso + suporte dedicado"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <span>💲</span> Preços
                </Label>
                <Textarea
                  value={kbPrices}
                  onChange={(e) => setKbPrices(e.target.value)}
                  placeholder="Ex: Básico R$97/mês, Pro R$197/mês, Enterprise R$497/mês"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <span>⭐</span> Diferenciais
                </Label>
                <Textarea
                  value={kbDifferentials}
                  onChange={(e) => setKbDifferentials(e.target.value)}
                  placeholder="Ex: Suporte 24h, Setup gratuito, Garantia de 30 dias, Integração com WhatsApp"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <span>❓</span> Perguntas frequentes
                </Label>
                <Textarea
                  value={kbFaq}
                  onChange={(e) => setKbFaq(e.target.value)}
                  placeholder="Coloque uma pergunta por linha:&#10;Qual o prazo de entrega?&#10;Vocês aceitam cartão?&#10;Como funciona a garantia?"
                  rows={4}
                />
                <p className="text-[10px] text-muted-foreground">Uma pergunta por linha — a IA aprenderá a responder cada uma</p>
              </div>

              <Button
                onClick={generateKbPreview}
                disabled={generatingPreview}
                className="w-full gap-2"
              >
                {generatingPreview ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Gerar respostas automaticamente
              </Button>

              {kbPreview && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary" strokeWidth={1.5} />
                    <Label className="text-xs text-primary font-medium">Preview — Como a IA responderia</Label>
                  </div>
                  <p className="text-sm text-foreground/80 whitespace-pre-line leading-relaxed">{kbPreview}</p>
                </div>
              )}
            </div>
          )}

          {kbTab === "upload" && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" className="gap-2" onClick={() => setUploadModalOpen(true)}>
                  <Plus className="h-4 w-4" /> Adicionar documento
                </Button>
              </div>
              {knowledgeDocs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <File className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhum documento adicionado ainda</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Adicione PDFs, TXTs ou DOCXs para a IA usar como referência</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {knowledgeDocs.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
                          <p className="text-xs text-muted-foreground">{doc.fileName} · {doc.type.toUpperCase()} · {doc.addedAt}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button variant="ghost" size="icon" className={`h-7 w-7 ${doc.active ? "text-emerald-400" : "text-muted-foreground/40"}`} onClick={() => toggleDocActive(doc.id)} title={doc.active ? "Ativo" : "Inativo"}>
                          <Power className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeDoc(doc.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Upload */}
      <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Adicionar Documento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Título do documento</Label>
              <Input value={newDocTitle} onChange={(e) => setNewDocTitle(e.target.value)} placeholder="Ex: Tabela de preços 2025" />
            </div>
            <div className="space-y-2">
              <Label>Tipo de documento</Label>
              <Select value={newDocType} onValueChange={setNewDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="txt">TXT</SelectItem>
                  <SelectItem value="docx">DOCX</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Arquivo</Label>
              <input ref={fileInputRef} type="file" accept=".pdf,.txt,.docx" className="hidden" onChange={(e) => setNewDocFile(e.target.files?.[0] || null)} />
              <Button variant="outline" className="w-full gap-2 justify-center" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" />
                {newDocFile ? newDocFile.name : "Selecionar arquivo"}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUploadModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddDoc}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modo de Atendimento */}
      <Card className="transition-all duration-200 hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Headset className="h-4 w-4 text-primary" strokeWidth={1.5} />
            <CardTitle className="text-base">Modo de Atendimento</CardTitle>
          </div>
          <CardDescription>Selecione um ou mais modos de atendimento da IA</CardDescription>
        </CardHeader>
        <CardContent>
          <TooltipProvider>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { value: "knowledge", label: "Base de Conhecimento", desc: "IA responde perguntas usando os documentos cadastrados", tooltip: "A IA consulta seus documentos para formular respostas precisas.", recommended: true },
                { value: "scheduling", label: "Agendamentos", desc: "IA foca em marcar horários e compromissos", tooltip: "A IA conduz a conversa para agendar horários automaticamente.", recommended: false },
              ].map((mode) => {
                const isSelected = attendanceMode.includes(mode.value);
                return (
                  <Tooltip key={mode.value}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          setAttendanceMode((prev: string) => {
                            const modes = prev ? prev.split(",").filter(Boolean) : [];
                            if (modes.includes(mode.value)) return modes.filter((m) => m !== mode.value).join(",");
                            return [...modes, mode.value].join(",");
                          });
                        }}
                        className={`rounded-lg border p-4 text-left transition-all relative ${isSelected ? "border-primary bg-primary/10 ring-1 ring-primary/30" : "border-border/50 hover:border-border"}`}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox checked={isSelected} className="mt-0.5 pointer-events-none" />
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm text-foreground">{mode.label}</p>
                              {mode.recommended && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary">Recomendado</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{mode.desc}</p>
                          </div>
                        </div>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px] text-xs">{mode.tooltip}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>

      </>)}

      {/* Segurança e Controle */}
      <Card className="transition-all duration-200 hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" strokeWidth={1.5} />
            <CardTitle className="text-base">Segurança e Controle</CardTitle>
          </div>
          <CardDescription>Limites e restrições da IA</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Bloquear temas sensíveis</p>
              <p className="text-xs text-muted-foreground">Impede respostas sobre política, religião, etc.</p>
            </div>
            <Switch checked={blockSensitive} onCheckedChange={setBlockSensitive} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Exigir humano para vendas</p>
              <p className="text-xs text-muted-foreground">Transfere para atendente antes de fechar venda</p>
            </div>
            <Switch checked={requireHumanForSale} onCheckedChange={setRequireHumanForSale} />
          </div>
        </CardContent>
      </Card>

      {/* Controle Avançado de Comportamento */}
      <Card className="transition-all duration-200 hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-primary" strokeWidth={1.5} />
            <CardTitle className="text-base">Controle Avançado</CardTitle>
          </div>
          <CardDescription>Limites de tempo, mensagens e coleta de dados</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Tempo máximo de resposta */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
                Tempo máximo de resposta
              </Label>
              <Badge variant="outline" className="text-xs">{maxResponseTime}s</Badge>
            </div>
            <Slider
              value={[maxResponseTime]}
              onValueChange={(v) => setMaxResponseTime(v[0])}
              min={10}
              max={120}
              step={5}
            />
            <p className="text-[10px] text-muted-foreground">Se a IA demorar mais que {maxResponseTime}s, envia mensagem de espera</p>
          </div>

          {/* Limite de mensagens seguidas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
                Limite de mensagens seguidas
              </Label>
              <Badge variant="outline" className="text-xs">{maxConsecutiveMessages} msgs</Badge>
            </div>
            <Slider
              value={[maxConsecutiveMessages]}
              onValueChange={(v) => setMaxConsecutiveMessages(v[0])}
              min={1}
              max={10}
              step={1}
            />
            <p className="text-[10px] text-muted-foreground">Máximo de mensagens que a IA envia sem resposta do cliente</p>
          </div>

          {/* Delay inteligente */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Delay inteligente</p>
              <p className="text-xs text-muted-foreground">Delay baseado no tamanho da mensagem (maior texto = mais delay)</p>
            </div>
            <Switch checked={smartDelay} onCheckedChange={setSmartDelay} />
          </div>

          {/* Coleta de dados */}
          <div className="border-t border-border/30 pt-4 space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Coleta de dados</Label>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                <div>
                  <p className="text-sm font-medium text-foreground">Forçar coleta de nome</p>
                  <p className="text-xs text-muted-foreground">IA pergunta o nome antes de continuar</p>
                </div>
              </div>
              <Switch checked={forceCollectName} onCheckedChange={setForceCollectName} />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PhoneCall className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                <div>
                  <p className="text-sm font-medium text-foreground">Forçar coleta de telefone</p>
                  <p className="text-xs text-muted-foreground">IA solicita o telefone para contato</p>
                </div>
              </div>
              <Switch checked={forceCollectPhone} onCheckedChange={setForceCollectPhone} />
            </div>
          </div>

          {/* Fallback inteligente */}
          <div className="border-t border-border/30 pt-4 space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <LifeBuoy className="h-3.5 w-3.5" strokeWidth={1.5} />
              Fallback inteligente
            </Label>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Pedir mais contexto</p>
                <p className="text-xs text-muted-foreground">Se não souber responder, pede mais informações</p>
              </div>
              <Switch checked={fallbackAskContext} onCheckedChange={setFallbackAskContext} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Transferir após tentativas sem sucesso</Label>
                <Badge variant="outline" className="text-xs">{fallbackTransferAfter}x</Badge>
              </div>
              <Slider
                value={[fallbackTransferAfter]}
                onValueChange={(v) => setFallbackTransferAfter(v[0])}
                min={1}
                max={5}
                step={1}
              />
              <p className="text-[10px] text-muted-foreground">Após {fallbackTransferAfter} tentativa{fallbackTransferAfter > 1 ? "s" : ""} sem conseguir responder, transfere para humano</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Controle da IA */}
      <Card className="transition-all duration-200 hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" strokeWidth={1.5} />
            <CardTitle className="text-base">Controle da IA</CardTitle>
          </div>
          <CardDescription>Palavras-chave e respostas de fallback</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Palavras para pausar a IA</Label>
            <Input value={pauseWords} onChange={(e) => setPauseWords(e.target.value)} placeholder='Ex: parar, atendente, humano' />
            <p className="text-[10px] text-muted-foreground">Quando o cliente digitar uma dessas palavras, a IA para de responder</p>
          </div>
          <div className="space-y-2">
            <Label>Palavras para reativar a IA</Label>
            <Input value={reactivateWords} onChange={(e) => setReactivateWords(e.target.value)} placeholder='Ex: voltar, continuar, ia' />
            <p className="text-[10px] text-muted-foreground">Quando o cliente digitar uma dessas palavras, a IA volta a responder</p>
          </div>
          <div className="space-y-3">
            <Label>Respostas de fallback</Label>
            <div className="space-y-2">
              <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1.5">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">Imagem</Badge>
                <Input value={fallbackImage} onChange={(e) => setFallbackImage(e.target.value)} className="text-sm" />
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1.5">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">Áudio</Badge>
                <Input value={fallbackAudio} onChange={(e) => setFallbackAudio(e.target.value)} className="text-sm" />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-sm font-medium text-foreground">Transferir para humano automaticamente</p>
              <p className="text-xs text-muted-foreground">Quando a IA não souber responder, transfere para um atendente</p>
            </div>
            <Switch checked={autoTransferHuman} onCheckedChange={setAutoTransferHuman} />
          </div>
        </CardContent>
      </Card>

      {/* Memória de Leads */}
      <Card className="transition-all duration-200 hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" strokeWidth={1.5} />
            <CardTitle className="text-base">Memória de Leads</CardTitle>
          </div>
          <CardDescription>A IA aprende e lembra informações de cada lead automaticamente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Frios", count: leads.filter(l => l.stage === "cold").length, icon: Snowflake, color: "text-blue-400" },
              { label: "Mornos", count: leads.filter(l => l.stage === "warm").length, icon: TrendingUp, color: "text-amber-400" },
              { label: "Quentes", count: leads.filter(l => l.stage === "hot").length, icon: Flame, color: "text-red-400" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-border/50 bg-muted/20 p-3 text-center">
                <stat.icon className={`h-4 w-4 mx-auto ${stat.color}`} strokeWidth={1.5} />
                <p className="text-lg font-bold text-foreground mt-1">{stat.count}</p>
                <p className="text-[10px] text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Lead list */}
          {loadingLeads ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Users className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum lead registrado ainda</p>
              <p className="text-xs text-muted-foreground/60 mt-1">A IA criará memórias automaticamente ao conversar com clientes</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
               {leads.map((lead) => {
                 let notesObj: Record<string, string> = {};
                 try { notesObj = JSON.parse(lead.notes || "{}"); } catch {}
                 const intentLabels: Record<string, string> = { curious: "🔎 Curioso", interested: "💡 Interessado", ready_to_buy: "🔥 Pronto p/ comprar", objection: "🛡️ Objeção" };
                 const stepLabels: Record<string, string> = { saudacao: "Saudação", diagnostico: "Diagnóstico", apresentacao: "Apresentação", objecao: "Objeção", fechamento: "Fechamento" };
                 return (
                 <div key={lead.id} className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2">
                   <div className="flex items-center justify-between">
                     <div className="flex items-center gap-2.5 min-w-0">
                       <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                         lead.stage === "hot" ? "bg-red-500/15" : lead.stage === "warm" ? "bg-amber-500/15" : "bg-blue-500/15"
                       }`}>
                         {lead.stage === "hot" ? <Flame className="h-4 w-4 text-red-400" /> :
                          lead.stage === "warm" ? <TrendingUp className="h-4 w-4 text-amber-400" /> :
                          <Snowflake className="h-4 w-4 text-blue-400" />}
                       </div>
                       <div className="min-w-0">
                         <p className="text-sm font-medium text-foreground truncate">
                           {lead.contact_name || lead.remote_jid.replace("@s.whatsapp.net", "")}
                         </p>
                         <p className="text-[10px] text-muted-foreground">{lead.interaction_count} interações</p>
                       </div>
                     </div>
                     <div className="flex items-center gap-1.5">
                       <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${
                         lead.stage === "hot" ? "border-red-500/40 text-red-400" :
                         lead.stage === "warm" ? "border-amber-500/40 text-amber-400" :
                         "border-blue-500/40 text-blue-400"
                       }`}>
                         {lead.stage === "hot" ? "Quente" : lead.stage === "warm" ? "Morno" : "Frio"}
                       </Badge>
                     </div>
                   </div>
                   {/* Badges row */}
                   <div className="flex items-center gap-1.5 flex-wrap">
                     {lead.interest && (
                       <Badge variant="outline" className="text-[10px] px-1.5 py-0">💡 {lead.interest}</Badge>
                     )}
                     {lead.product_cited && (
                       <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">🏷️ {lead.product_cited}</Badge>
                     )}
                     {notesObj.last_intent && (
                       <Badge className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
                         {intentLabels[notesObj.last_intent] || notesObj.last_intent}
                       </Badge>
                     )}
                     {notesObj.last_flow_step && (
                       <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-dashed">
                         📍 {stepLabels[notesObj.last_flow_step] || notesObj.last_flow_step}
                       </Badge>
                     )}
                   </div>
                   {/* Last message preview */}
                   {lead.last_message_preview && (
                     <p className="text-[11px] text-muted-foreground truncate italic">"{lead.last_message_preview}"</p>
                   )}
                   {/* Last interaction + view history */}
                   <div className="flex items-center justify-between pt-1">
                     {lead.last_interaction_at && (
                       <span className="text-[10px] text-muted-foreground">
                         Última interação: {new Date(lead.last_interaction_at).toLocaleDateString("pt-BR")}
                       </span>
                     )}
                     <button
                       onClick={() => setSelectedLead(lead)}
                       className="text-[10px] text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors"
                     >
                       <Eye className="h-3 w-3" strokeWidth={1.5} />
                       Ver histórico
                     </button>
                   </div>
                 </div>
                 );
               })}
             </div>
           )}

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-primary">Memória ativa</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">A IA usa o nome, interesse e estágio para personalizar: "Você mencionou que queria X..." — tudo automático</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AISettings;
