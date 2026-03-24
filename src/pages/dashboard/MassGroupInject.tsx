import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  Users, Upload, Search, CheckCircle2, XCircle,
  Loader2, Play, Trash2, Copy, Shield, RefreshCw,
  FileText, BarChart3, UserPlus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Step = "import" | "preview" | "processing" | "done";

interface ValidationResult {
  total: number;
  valid: string[];
  invalid: string[];
  duplicates: string[];
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
}

interface ParticipantCheckResult {
  ready: string[];
  alreadyExists: string[];
  readyCount: number;
  alreadyExistsCount: number;
  totalParticipants: number;
}

interface ProcessResult {
  ok: number;
  fail: number;
  already: number;
  total: number;
  durationSec: number;
  totalAttempts: number;
  results: Array<{ phone: string; status: string; error?: string }>;
}

export default function MassGroupInject() {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("import");
  const [groupId, setGroupId] = useState("");
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [participantCheck, setParticipantCheck] = useState<ParticipantCheckResult | null>(null);
  const [processResult, setProcessResult] = useState<ProcessResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  // Fetch user's own devices with uazapi
  const { data: devices = [] } = useQuery({
    queryKey: ["user-devices-inject", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("id, name, number, status, uazapi_base_url")
        .not("uazapi_base_url", "is", null)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const connectedDevices = useMemo(() =>
    devices.filter((d: any) => d.status === "connected"),
  [devices]);

  const parseContacts = useCallback((input: string): string[] => {
    return input
      .split(/[\n,;]+/)
      .map(c => c.trim())
      .filter(c => c.length > 0);
  }, []);

  const handleValidate = useCallback(async () => {
    const contacts = parseContacts(rawInput);
    if (contacts.length === 0) return toast.error("Nenhum contato informado");
    if (!groupId.trim()) return toast.error("Informe o Group ID");
    if (!selectedDeviceId) return toast.error("Selecione uma instância");

    setIsValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke("mass-group-inject", {
        body: { action: "validate", contacts },
      });
      if (error) throw error;
      setValidationResult(data);
      setStep("preview");
      toast.success(`${data.validCount} contatos válidos encontrados`);
    } catch (e: any) {
      toast.error(e.message || "Erro na validação");
    } finally {
      setIsValidating(false);
    }
  }, [rawInput, groupId, selectedDeviceId, parseContacts]);

  const handleCheckParticipants = useCallback(async () => {
    if (!validationResult?.valid.length) return;
    setIsChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("mass-group-inject", {
        body: {
          action: "check-participants",
          groupId,
          deviceId: selectedDeviceId,
          contacts: validationResult.valid,
        },
      });
      if (error) throw error;
      setParticipantCheck(data);
      toast.success(`${data.readyCount} contatos prontos para adição`);
    } catch (e: any) {
      toast.error(e.message || "Erro ao verificar participantes");
    } finally {
      setIsChecking(false);
    }
  }, [validationResult, groupId, selectedDeviceId]);

  const handleProcess = useCallback(async () => {
    const contacts = participantCheck?.ready || validationResult?.valid || [];
    if (contacts.length === 0) return toast.error("Nenhum contato para processar");

    setConfirmOpen(false);
    setIsProcessing(true);
    setStep("processing");

    try {
      const { data, error } = await supabase.functions.invoke("mass-group-inject", {
        body: {
          action: "process",
          groupId,
          deviceId: selectedDeviceId,
          contacts,
          concurrency: 3,
        },
      });
      if (error) throw error;
      setProcessResult(data);
      setStep("done");
      toast.success(`Concluído: ${data.ok} sucesso, ${data.fail} falhas`);
    } catch (e: any) {
      toast.error(e.message || "Erro no processamento");
      setStep("preview");
    } finally {
      setIsProcessing(false);
    }
  }, [participantCheck, validationResult, groupId, selectedDeviceId]);

  const handleReset = useCallback(() => {
    setStep("import");
    setRawInput("");
    setValidationResult(null);
    setParticipantCheck(null);
    setProcessResult(null);
    setActiveFilter("all");
  }, []);

  const filteredResults = useMemo(() => {
    if (!processResult?.results) return [];
    if (activeFilter === "all") return processResult.results;
    return processResult.results.filter(r => r.status === activeFilter);
  }, [processResult, activeFilter]);

  const totalToProcess = participantCheck?.readyCount ?? validationResult?.validCount ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <UserPlus className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Adição em Massa</h1>
            <p className="text-xs text-muted-foreground">Adicione contatos em lote a um grupo</p>
          </div>
        </div>
        {step !== "import" && (
          <Button variant="outline" size="sm" onClick={handleReset} className="gap-2">
            <RefreshCw className="w-3.5 h-3.5" />
            Novo Lote
          </Button>
        )}
      </div>

      {/* Steps */}
      <div className="flex items-center gap-2">
        {[
          { key: "import", label: "Importar", icon: Upload },
          { key: "preview", label: "Revisão", icon: Search },
          { key: "processing", label: "Processando", icon: RefreshCw },
          { key: "done", label: "Concluído", icon: CheckCircle2 },
        ].map((s, i, arr) => {
          const isCurrent = step === s.key;
          const isPast = arr.findIndex(x => x.key === step) > i;
          return (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && <div className={`w-6 sm:w-8 h-px ${isPast || isCurrent ? "bg-primary" : "bg-border"}`} />}
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                isCurrent ? "bg-primary text-primary-foreground" : isPast ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              }`}>
                <s.icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{s.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ══ IMPORT ══ */}
      {step === "import" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-5">
            <Card className="border-border/60 bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  Configuração
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Group ID (JID)</label>
                  <Input
                    value={groupId}
                    onChange={e => setGroupId(e.target.value)}
                    placeholder="120363XXXXXXXXXX@g.us"
                    className="font-mono text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground/60 mt-1">Identificador completo do grupo</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Instância</label>
                  <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma instância" />
                    </SelectTrigger>
                    <SelectContent>
                      {connectedDevices.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span>{d.name}</span>
                            {d.number && <span className="text-muted-foreground text-xs">({d.number})</span>}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {connectedDevices.length === 0 && (
                    <p className="text-[10px] text-destructive mt-1">Nenhuma instância conectada encontrada</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {rawInput.trim() && (
              <Card className="border-border/60 bg-card/50">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-4">
                    <BarChart3 className="w-4 h-4 text-muted-foreground" />
                    <Badge variant="outline" className="text-xs">
                      {parseContacts(rawInput).length} contatos detectados
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <Card className="border-border/60 bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Upload className="w-4 h-4 text-primary" />
                Importar Contatos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs defaultValue="paste">
                <TabsList className="w-full grid grid-cols-2 h-8">
                  <TabsTrigger value="paste" className="text-xs">Colar Números</TabsTrigger>
                  <TabsTrigger value="file" className="text-xs">Arquivo CSV/TXT</TabsTrigger>
                </TabsList>
                <TabsContent value="paste" className="mt-3">
                  <Textarea
                    value={rawInput}
                    onChange={e => setRawInput(e.target.value)}
                    placeholder={"55119XXXXXXXX\n55219XXXXXXXX\n\nSepare por linha, vírgula ou ;"}
                    className="min-h-[260px] font-mono text-xs resize-none"
                  />
                </TabsContent>
                <TabsContent value="file" className="mt-3">
                  <div className="border-2 border-dashed border-border/60 rounded-xl p-8 text-center">
                    <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-xs text-muted-foreground mb-2">Arraste ou selecione um arquivo</p>
                    <input
                      type="file"
                      accept=".csv,.txt"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setRawInput(ev.target?.result as string || "");
                          toast.success(`Arquivo carregado: ${file.name}`);
                        };
                        reader.readAsText(file);
                      }}
                      className="text-xs"
                    />
                  </div>
                </TabsContent>
              </Tabs>
              <Button
                onClick={handleValidate}
                disabled={isValidating || !rawInput.trim() || !groupId.trim() || !selectedDeviceId}
                className="w-full gap-2"
              >
                {isValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {isValidating ? "Validando..." : "Validar e Revisar"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══ PREVIEW ══ */}
      {step === "preview" && validationResult && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Total", value: validationResult.total, icon: Users, color: "text-foreground" },
              { label: "Válidos", value: validationResult.validCount, icon: CheckCircle2, color: "text-emerald-500" },
              { label: "Inválidos", value: validationResult.invalidCount, icon: XCircle, color: "text-destructive" },
              { label: "Duplicados", value: validationResult.duplicateCount, icon: Copy, color: "text-amber-500" },
              { label: "Já no Grupo", value: participantCheck?.alreadyExistsCount ?? "—", icon: Users, color: "text-blue-500" },
              { label: "Prontos", value: participantCheck?.readyCount ?? "—", icon: Play, color: "text-primary" },
            ].map(s => (
              <Card key={s.label} className="border-border/60 bg-card/50">
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 mb-1">
                    <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</span>
                  </div>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {!participantCheck && (
              <Button onClick={handleCheckParticipants} disabled={isChecking} variant="outline" className="gap-2">
                {isChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Verificar Existentes
              </Button>
            )}
            <Button onClick={() => setConfirmOpen(true)} disabled={totalToProcess === 0} className="gap-2">
              <Play className="w-4 h-4" />
              Iniciar ({totalToProcess} contatos)
            </Button>
            <Button variant="ghost" onClick={handleReset} className="gap-2">
              <Trash2 className="w-4 h-4" />
              Descartar
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {validationResult.invalidCount > 0 && (
              <Card className="border-destructive/20 bg-destructive/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-destructive flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    Inválidos ({validationResult.invalidCount})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {validationResult.invalid.map((phone, i) => (
                      <div key={i} className="text-xs font-mono text-destructive/80 bg-destructive/5 rounded px-2 py-1">{phone}</div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            {validationResult.duplicateCount > 0 && (
              <Card className="border-amber-500/20 bg-amber-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-amber-500 flex items-center gap-2">
                    <Copy className="w-4 h-4" />
                    Duplicados ({validationResult.duplicateCount})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {validationResult.duplicates.map((phone, i) => (
                      <div key={i} className="text-xs font-mono text-amber-500/80 bg-amber-500/5 rounded px-2 py-1">{phone}</div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            {participantCheck && participantCheck.alreadyExistsCount > 0 && (
              <Card className="border-blue-500/20 bg-blue-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-blue-500 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Já no Grupo ({participantCheck.alreadyExistsCount})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {participantCheck.alreadyExists.map((phone, i) => (
                      <div key={i} className="text-xs font-mono text-blue-500/80 bg-blue-500/5 rounded px-2 py-1">{phone}</div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ══ PROCESSING ══ */}
      {step === "processing" && (
        <div className="flex flex-col items-center justify-center py-16 space-y-6">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-lg font-bold text-foreground">Processando Contatos</h2>
            <p className="text-sm text-muted-foreground">Adicionando {totalToProcess} contatos ao grupo...</p>
            <p className="text-xs text-muted-foreground/60">Não feche esta página.</p>
          </div>
          <div className="w-full max-w-md">
            <Progress value={undefined} className="h-2" />
          </div>
        </div>
      )}

      {/* ══ DONE ══ */}
      {step === "done" && processResult && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Sucesso", value: processResult.ok, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" },
              { label: "Já Existente", value: processResult.already, color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20" },
              { label: "Falhas", value: processResult.fail, color: "text-destructive", bg: "bg-destructive/10 border-destructive/20" },
              { label: "Duração", value: `${processResult.durationSec}s`, color: "text-muted-foreground", bg: "bg-muted/50 border-border/60" },
            ].map(s => (
              <Card key={s.label} className={`border ${s.bg}`}>
                <CardContent className="pt-4 pb-3 px-4">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</span>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {[
              { key: "all", label: `Todos (${processResult.results.length})` },
              { key: "completed", label: `Sucesso (${processResult.ok})` },
              { key: "already_exists", label: `Existente (${processResult.already})` },
              { key: "failed", label: `Falhas (${processResult.fail})` },
            ].map(f => (
              <Button
                key={f.key}
                variant={activeFilter === f.key ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveFilter(f.key)}
                className="text-xs h-7"
              >
                {f.label}
              </Button>
            ))}
          </div>

          <Card className="border-border/60 bg-card/50">
            <CardContent className="p-0">
              <div className="max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/40">
                      <TableHead className="text-xs w-12">#</TableHead>
                      <TableHead className="text-xs">Contato</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Detalhe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResults.map((r, i) => (
                      <TableRow key={i} className="border-border/20">
                        <TableCell className="text-xs text-muted-foreground font-mono">{i + 1}</TableCell>
                        <TableCell className="text-xs font-mono">{r.phone}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              r.status === "completed" ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/5" :
                              r.status === "already_exists" ? "border-blue-500/30 text-blue-500 bg-blue-500/5" :
                              "border-destructive/30 text-destructive bg-destructive/5"
                            }`}
                          >
                            {r.status === "completed" ? "Sucesso" : r.status === "already_exists" ? "Já existe" : "Falha"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{r.error || "—"}</TableCell>
                      </TableRow>
                    ))}
                    {filteredResults.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-sm text-muted-foreground">Nenhum resultado</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleReset} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Novo Lote
          </Button>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Processamento</AlertDialogTitle>
            <AlertDialogDescription>
              Serão processados <strong>{totalToProcess}</strong> contatos para adição ao grupo. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleProcess}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
