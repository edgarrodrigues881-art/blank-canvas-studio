import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, Building2, Target, MessageCircle, Briefcase, Send,
  Loader2, CheckCircle2, ArrowRight, Zap,
} from "lucide-react";
import { toast } from "sonner";

interface OnboardingResult {
  businessType: string;
  objective: string;
  tone: string;
  businessName: string;
  businessDescription: string;
  businessHours: string;
}

interface Props {
  open: boolean;
  onComplete: (result: OnboardingResult) => void;
  onSkip: () => void;
  apiKey: string;
  aiModel: string;
}

const BUSINESS_TYPES = [
  { value: "ecommerce", label: "E-commerce", icon: "🛒" },
  { value: "servicos", label: "Prestação de Serviços", icon: "🔧" },
  { value: "saas", label: "SaaS / Tecnologia", icon: "💻" },
  { value: "varejo", label: "Varejo / Loja Física", icon: "🏪" },
  { value: "consultoria", label: "Consultoria", icon: "📊" },
  { value: "educacao", label: "Educação", icon: "📚" },
  { value: "saude", label: "Saúde / Clínica", icon: "🏥" },
  { value: "alimentacao", label: "Alimentação", icon: "🍽️" },
  { value: "imobiliaria", label: "Imobiliária", icon: "🏠" },
  { value: "outro", label: "Outro", icon: "📦" },
];

const OBJECTIVES = [
  { value: "atendimento", label: "Atendimento", desc: "Responder dúvidas dos clientes", icon: "💬" },
  { value: "vendas", label: "Vendas", desc: "Converter leads em clientes", icon: "💰" },
  { value: "suporte", label: "Suporte", desc: "Resolver problemas técnicos", icon: "🛠️" },
  { value: "agendamento", label: "Agendamento", desc: "Marcar horários e consultas", icon: "📅" },
];

const TONES = [
  { value: "friendly", label: "Amigável", desc: "Oi! 😊 Como posso te ajudar?", icon: "😊" },
  { value: "professional", label: "Profissional", desc: "Olá! Seja bem-vindo. Como posso auxiliá-lo?", icon: "👔" },
  { value: "direct", label: "Direto", desc: "Olá. Em que posso ajudar?", icon: "⚡" },
];

const EXAMPLES: Record<string, { name: string; desc: string; hours: string }> = {
  ecommerce: { name: "Loja Virtual Premium", desc: "Vendemos roupas e acessórios online com entrega para todo o Brasil.", hours: "Seg-Sex 08:00 às 18:00, Sáb 09:00 às 13:00" },
  servicos: { name: "ServiçoPro", desc: "Prestamos serviços de manutenção residencial e empresarial.", hours: "Seg-Sex 08:00 às 18:00" },
  saas: { name: "TechSoft", desc: "Plataforma SaaS de gestão empresarial para PMEs.", hours: "Seg-Sex 09:00 às 18:00" },
  varejo: { name: "Super Loja", desc: "Loja de varejo com produtos diversos para casa e escritório.", hours: "Seg-Sáb 08:00 às 20:00" },
  consultoria: { name: "Consultoria Expert", desc: "Consultoria especializada em gestão e estratégia empresarial.", hours: "Seg-Sex 09:00 às 17:00" },
  educacao: { name: "Escola Digital", desc: "Cursos online e presenciais de capacitação profissional.", hours: "Seg-Sex 08:00 às 22:00" },
  saude: { name: "Clínica Saúde+", desc: "Clínica multidisciplinar com atendimento médico e odontológico.", hours: "Seg-Sex 07:00 às 19:00, Sáb 08:00 às 12:00" },
  alimentacao: { name: "Restaurante Sabor", desc: "Restaurante com delivery de comida caseira e saudável.", hours: "Seg-Dom 11:00 às 23:00" },
  imobiliaria: { name: "Imóveis Top", desc: "Imobiliária com imóveis para venda e aluguel na região.", hours: "Seg-Sex 08:00 às 18:00, Sáb 09:00 às 13:00" },
  outro: { name: "Minha Empresa", desc: "Descreva brevemente o que sua empresa faz.", hours: "Seg-Sex 08:00 às 18:00" },
};

const TOTAL_STEPS = 5;

export const AIOnboardingWizard = ({ open, onComplete, onSkip, apiKey, aiModel }: Props) => {
  const [step, setStep] = useState(1);
  const [businessType, setBusinessType] = useState("");
  const [objective, setObjective] = useState("");
  const [tone, setTone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [businessHours, setBusinessHours] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "success" | "error">("idle");

  const progress = (step / TOTAL_STEPS) * 100;

  const handleSelectBusinessType = (value: string) => {
    setBusinessType(value);
    const example = EXAMPLES[value];
    if (example) {
      if (!businessName) setBusinessName(example.name);
      if (!businessDescription) setBusinessDescription(example.desc);
      if (!businessHours) setBusinessHours(example.hours);
    }
  };

  const handleTest = async () => {
    if (!apiKey || !apiKey.startsWith("sk-")) {
      toast.info("Configure sua chave de API nas configurações para testar");
      setTestResult("success");
      return;
    }
    setTesting(true);
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
        setTestResult("success");
        toast.success("IA respondeu com sucesso!");
      } else {
        setTestResult("error");
        toast.error("Erro ao testar a IA");
      }
    } catch {
      setTestResult("error");
      toast.error("Falha na conexão");
    } finally {
      setTesting(false);
    }
  };

  const handleFinish = () => {
    onComplete({
      businessType,
      objective,
      tone,
      businessName,
      businessDescription,
      businessHours,
    });
  };

  const canNext = () => {
    switch (step) {
      case 1: return !!businessType;
      case 2: return !!objective;
      case 3: return !!tone;
      case 4: return !!businessName.trim();
      case 5: return true;
      default: return false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden [&>button]:hidden">
        {/* Progress bar */}
        <div className="px-6 pt-5 pb-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold text-foreground">Etapa {step} de {TOTAL_STEPS}</span>
            </div>
            <button onClick={onSkip} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Pular configuração
            </button>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <div className="px-6 pb-6 pt-3">
          {/* Step 1 - Business Type */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-foreground">Qual é o tipo do seu negócio?</h2>
                <p className="text-sm text-muted-foreground mt-1">Isso ajuda a IA a entender seu contexto</p>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-[320px] overflow-y-auto pr-1">
                {BUSINESS_TYPES.map((bt) => (
                  <button
                    key={bt.value}
                    onClick={() => handleSelectBusinessType(bt.value)}
                    className={`rounded-lg border p-3 text-left transition-all ${
                      businessType === bt.value
                        ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                        : "border-border/50 hover:border-border hover:bg-muted/30"
                    }`}
                  >
                    <span className="text-lg">{bt.icon}</span>
                    <p className="text-sm font-medium text-foreground mt-1">{bt.label}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2 - Objective */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-foreground">Qual o objetivo da IA?</h2>
                <p className="text-sm text-muted-foreground mt-1">Escolha o foco principal do atendimento</p>
              </div>
              <div className="space-y-2">
                {OBJECTIVES.map((obj) => (
                  <button
                    key={obj.value}
                    onClick={() => setObjective(obj.value)}
                    className={`w-full rounded-lg border p-4 text-left transition-all ${
                      objective === obj.value
                        ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                        : "border-border/50 hover:border-border hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{obj.icon}</span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{obj.label}</p>
                        <p className="text-xs text-muted-foreground">{obj.desc}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3 - Tone */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-foreground">Qual tom de voz da IA?</h2>
                <p className="text-sm text-muted-foreground mt-1">Como a IA deve se comunicar com seus clientes</p>
              </div>
              <div className="space-y-2">
                {TONES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTone(t.value)}
                    className={`w-full rounded-lg border p-4 text-left transition-all ${
                      tone === t.value
                        ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                        : "border-border/50 hover:border-border hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{t.icon}</span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{t.label}</p>
                        <p className="text-xs text-muted-foreground italic mt-0.5">"{t.desc}"</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 4 - Business Info */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-foreground">Informações do negócio</h2>
                <p className="text-sm text-muted-foreground mt-1">Esses dados serão usados pela IA nas respostas</p>
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome da empresa</Label>
                  <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Ex: Minha Empresa" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Descrição do negócio</Label>
                  <Textarea value={businessDescription} onChange={(e) => setBusinessDescription(e.target.value)} placeholder="Descreva brevemente o que sua empresa faz..." rows={3} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Horário de atendimento</Label>
                  <Input value={businessHours} onChange={(e) => setBusinessHours(e.target.value)} placeholder="Ex: Seg-Sex 08:00 às 18:00" />
                </div>
              </div>
              {businessType && (
                <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                  <Zap className="h-3 w-3" /> Campos preenchidos automaticamente com base no tipo de negócio selecionado
                </p>
              )}
            </div>
          )}

          {/* Step 5 - Test */}
          {step === 5 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-foreground">Tudo pronto! 🎉</h2>
                <p className="text-sm text-muted-foreground mt-1">Revise suas escolhas e ative a IA</p>
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm text-foreground">
                    <span className="text-muted-foreground">Tipo:</span>{" "}
                    {BUSINESS_TYPES.find((b) => b.value === businessType)?.label || "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm text-foreground">
                    <span className="text-muted-foreground">Objetivo:</span>{" "}
                    {OBJECTIVES.find((o) => o.value === objective)?.label || "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm text-foreground">
                    <span className="text-muted-foreground">Tom:</span>{" "}
                    {TONES.find((t) => t.value === tone)?.label || "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm text-foreground">
                    <span className="text-muted-foreground">Empresa:</span> {businessName || "—"}
                  </span>
                </div>
              </div>

              {apiKey && apiKey.startsWith("sk-") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTest}
                  disabled={testing}
                  className="gap-2 w-full"
                >
                  {testing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : testResult === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {testResult === "success" ? "Teste OK!" : "Testar conexão da IA"}
                </Button>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/30">
            {step > 1 ? (
              <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)}>
                Voltar
              </Button>
            ) : (
              <div />
            )}
            {step < TOTAL_STEPS ? (
              <Button size="sm" onClick={() => setStep((s) => s + 1)} disabled={!canNext()} className="gap-1.5">
                Próximo <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="sm" onClick={handleFinish} className="gap-1.5">
                <Sparkles className="h-4 w-4" /> Ativar IA
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
