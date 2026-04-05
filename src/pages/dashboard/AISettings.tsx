import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
  FileText,
  File,
  Power,
} from "lucide-react";

interface KnowledgeDoc {
  id: string;
  title: string;
  type: string;
  fileName: string;
  active: boolean;
  addedAt: string;
}

const AISettings = () => {
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
  const [attendanceMode, setAttendanceMode] = useState("hybrid");
  const [creativity, setCreativity] = useState([50]);
  const [maxResponseLength, setMaxResponseLength] = useState("medium");
  const [blockSensitive, setBlockSensitive] = useState(true);
  const [requireHumanForSale, setRequireHumanForSale] = useState(true);
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDoc[]>([]);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocType, setNewDocType] = useState("pdf");
  const [newDocFile, setNewDocFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      {/* Configuração da IA — API & Modelo */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-primary" />
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
            {/* Status */}
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
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4o-mini">GPT-4o Mini (rápido)</SelectItem>
                <SelectItem value="gpt-4o">GPT-4o (mais inteligente)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestAi}
            disabled={testingAi || apiKeyStatus !== "valid"}
            className="gap-2"
          >
            {testingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Testar IA
          </Button>
        </CardContent>
      </Card>

      {/* Comportamento da IA */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Comportamento da IA</CardTitle>
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
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo..." />
              </SelectTrigger>
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
          <Button size="sm" className="gap-2" onClick={() => toast.success("Informações salvas com sucesso!")}>
            Salvar informações
          </Button>
        </CardContent>
      </Card>

      {/* Base de Conhecimento */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Base de Conhecimento</CardTitle>
            </div>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => setUploadModalOpen(true)}>
              <Plus className="h-4 w-4" /> Adicionar documento
            </Button>
          </div>
          <CardDescription>Documentos que a IA pode consultar para responder (PDF, TXT, DOCX)</CardDescription>
        </CardHeader>
        <CardContent>
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-7 w-7 ${doc.active ? "text-emerald-400" : "text-muted-foreground/40"}`}
                      onClick={() => toggleDocActive(doc.id)}
                      title={doc.active ? "Ativo" : "Inativo"}
                    >
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
        </CardContent>
      </Card>

      {/* Modal de Upload */}
      <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Documento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Título do documento</Label>
              <Input value={newDocTitle} onChange={(e) => setNewDocTitle(e.target.value)} placeholder="Ex: Tabela de preços 2025" />
            </div>
            <div className="space-y-2">
              <Label>Tipo de documento</Label>
              <Select value={newDocType} onValueChange={setNewDocType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="txt">TXT</SelectItem>
                  <SelectItem value="docx">DOCX</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Arquivo</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.docx"
                className="hidden"
                onChange={(e) => setNewDocFile(e.target.files?.[0] || null)}
              />
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
