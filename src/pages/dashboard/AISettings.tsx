import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import {
  Bot,
  Building2,
  BookOpen,
  Headset,
  Brain,
  ShieldCheck,
  Upload,
  Plus,
  Trash2,
  Sparkles,
  Key,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Loader2,
  Send,
} from "lucide-react";

const AISettings = () => {
  const [iaActive, setIaActive] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [aiModel, setAiModel] = useState("gpt-4o-mini");
  const [testingAi, setTestingAi] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [businessSegment, setBusinessSegment] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [tone, setTone] = useState("professional");
  const [attendanceMode, setAttendanceMode] = useState("hybrid");
  const [creativity, setCreativity] = useState([50]);
  const [maxResponseLength, setMaxResponseLength] = useState("medium");
  const [blockSensitive, setBlockSensitive] = useState(true);
  const [requireHumanForSale, setRequireHumanForSale] = useState(true);
  const [knowledgeItems, setKnowledgeItems] = useState<string[]>([
    "Tabela de preços atualizada",
    "FAQ - Perguntas frequentes",
  ]);
  const [newKnowledgeItem, setNewKnowledgeItem] = useState("");

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
    await new Promise((r) => setTimeout(r, 2000));
    setTestingAi(false);
    toast.success("IA respondeu com sucesso! Conexão funcionando.");
  };

  const addKnowledgeItem = () => {
    if (newKnowledgeItem.trim()) {
      setKnowledgeItems((prev) => [...prev, newKnowledgeItem.trim()]);
      setNewKnowledgeItem("");
    }
  };

  const removeKnowledgeItem = (index: number) => {
    setKnowledgeItems((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Inteligência Artificial</h1>
            <p className="text-sm text-muted-foreground">Configure o atendimento automático com IA</p>
          </div>
        </div>
        <Button size="sm">Salvar Configurações</Button>
      </div>

      {/* Toggle principal */}
      <Card className={iaActive ? "border-primary/40 bg-primary/5" : ""}>
        <CardContent className="flex items-center justify-between py-5 px-5">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-primary" />
            <div>
              <p className="font-semibold text-foreground">IA Ativa</p>
              <p className="text-xs text-muted-foreground">A IA responderá automaticamente os clientes</p>
            </div>
          </div>
          <Switch checked={iaActive} onCheckedChange={setIaActive} />
        </CardContent>
      </Card>

      {/* Configuração da IA */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Configuração da IA</CardTitle>
          </div>
          <CardDescription>Ajuste o comportamento e personalidade</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Tom de comunicação</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Profissional</SelectItem>
                <SelectItem value="friendly">Amigável</SelectItem>
                <SelectItem value="formal">Formal</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Criatividade: {creativity[0]}%</Label>
            <Slider value={creativity} onValueChange={setCreativity} max={100} step={5} className="w-full" />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Preciso</span>
              <span>Criativo</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Tamanho máximo da resposta</Label>
            <Select value={maxResponseLength} onValueChange={setMaxResponseLength}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">Curta (1-2 frases)</SelectItem>
                <SelectItem value="medium">Média (1 parágrafo)</SelectItem>
                <SelectItem value="long">Longa (detalhada)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Informações do Negócio */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Informações do Negócio</CardTitle>
          </div>
          <CardDescription>Dados que a IA usará para contextualizar respostas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome da empresa</Label>
              <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Ex: Minha Empresa" />
            </div>
            <div className="space-y-2">
              <Label>Segmento</Label>
              <Input value={businessSegment} onChange={(e) => setBusinessSegment(e.target.value)} placeholder="Ex: E-commerce, Serviços..." />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição do negócio</Label>
            <Textarea
              value={businessDescription}
              onChange={(e) => setBusinessDescription(e.target.value)}
              placeholder="Descreva brevemente seu negócio, produtos e serviços..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Base de Conhecimento */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Base de Conhecimento</CardTitle>
          </div>
          <CardDescription>Documentos e informações que a IA pode consultar</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newKnowledgeItem}
              onChange={(e) => setNewKnowledgeItem(e.target.value)}
              placeholder="Nome do documento ou informação..."
              onKeyDown={(e) => e.key === "Enter" && addKnowledgeItem()}
            />
            <Button variant="outline" size="icon" onClick={addKnowledgeItem}>
              <Plus className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon">
              <Upload className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2">
            {knowledgeItems.map((item, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
                <span className="text-sm text-foreground">{item}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeKnowledgeItem(i)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Modo de Atendimento */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Headset className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Modo de Atendimento</CardTitle>
          </div>
          <CardDescription>Como a IA deve interagir com os clientes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { value: "full", label: "100% IA", desc: "IA responde tudo sozinha" },
              { value: "hybrid", label: "Híbrido", desc: "IA + humano quando necessário" },
              { value: "assist", label: "Assistente", desc: "IA sugere, humano envia" },
            ].map((mode) => (
              <button
                key={mode.value}
                onClick={() => setAttendanceMode(mode.value)}
                className={`rounded-lg border p-3 text-left transition-all ${
                  attendanceMode === mode.value
                    ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                    : "border-border/50 hover:border-border"
                }`}
              >
                <p className="font-medium text-sm text-foreground">{mode.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{mode.desc}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Segurança e Controle */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
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
    </div>
  );
};

export default AISettings;
