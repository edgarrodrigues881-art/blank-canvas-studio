import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  Users, Upload, Search, CheckCircle2, XCircle,
  Loader2, Play, Trash2, Copy, Shield, RefreshCw,
  FileText, BarChart3, UserPlus, ChevronRight, Globe
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

interface GroupInfo {
  jid: string;
  name: string;
  participants: number;
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
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [groupSearch, setGroupSearch] = useState("");

  // Fetch user's devices - exclude report/notification instances
  const { data: devices = [] } = useQuery({
    queryKey: ["user-devices-inject", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("id, name, number, status, uazapi_base_url, instance_type, login_type")
        .not("uazapi_base_url", "is", null)
        .order("name");
      if (error) throw error;
      return (data || []).filter((d: any) =>
        d.instance_type !== "notificacao" && d.login_type !== "report_wa"
      );
    },
    enabled: !!user,
  });

  const isDeviceOnline = (status: string) => {
    const s = status?.toLowerCase();
    return s === "connected" || s === "ready" || s === "active";
  };

  const connectedDevices = useMemo(() =>
    devices.filter((d: any) => isDeviceOnline(d.status)),
  [devices]);

  const allDevicesForSelect = useMemo(() =>
    devices.length > 0 ? devices : [],
  [devices]);

  const handleDeviceChange = useCallback(async (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    setGroups([]);
    setGroupId("");
    setIsLoadingGroups(true);
    try {
      const { data, error } = await supabase.functions.invoke("mass-group-inject", {
        body: { action: "list-groups", deviceId },
      });
      if (error) throw error;
      setGroups(data?.groups || []);
    } catch (e: any) {
      console.error("Error fetching groups:", e);
      toast.error("Erro ao buscar grupos da instância");
    } finally {
      setIsLoadingGroups(false);
    }
  }, []);

  const filteredGroups = useMemo(() => {
    if (!groupSearch.trim()) return groups;
    const q = groupSearch.toLowerCase();
    return groups.filter(g =>
      g.name.toLowerCase().includes(q) || g.jid.toLowerCase().includes(q)
    );
  }, [groups, groupSearch]);

  const selectedGroup = useMemo(() =>
    groups.find(g => g.jid === groupId),
  [groups, groupId]);

  const parseContacts = useCallback((input: string): string[] => {
    return input
      .split(/[\n,;]+/)
      .map(c => c.trim())
      .filter(c => c.length > 0);
  }, []);

  const handleValidate = useCallback(async () => {
    const contacts = parseContacts(rawInput);
    if (contacts.length === 0) return toast.error("Nenhum contato informado");
    if (!groupId.trim()) return toast.error("Selecione um grupo");
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
        body: { action: "check-participants", groupId, deviceId: selectedDeviceId, contacts: validationResult.valid },
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
        body: { action: "process", groupId, deviceId: selectedDeviceId, contacts, concurrency: 3 },
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
  const selectedDevice = devices.find((d: any) => d.id === selectedDeviceId);
  const contactCount = rawInput.trim() ? parseContacts(rawInput).length : 0;

  const stepItems = [
    { key: "import", label: "Importar", icon: Upload },
    { key: "preview", label: "Revisão", icon: Search },
    { key: "processing", label: "Processando", icon: RefreshCw },
    { key: "done", label: "Concluído", icon: CheckCircle2 },
  ];

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
            <UserPlus className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Adição em Massa</h1>
            <p className="text-sm text-muted-foreground">Adicione membros em lote a um grupo do WhatsApp</p>
          </div>
        </div>
        {step !== "import" && (
          <Button variant="outline" size="sm" onClick={handleReset} className="gap-2">
            <RefreshCw className="w-3.5 h-3.5" />
            Novo Lote
          </Button>
        )}
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 bg-card/50 border border-border/50 rounded-2xl p-2">
        {stepItems.map((s, i, arr) => {
          const isCurrent = step === s.key;
          const isPast = arr.findIndex(x => x.key === step) > i;
          return (
            <div key={s.key} className="flex items-center gap-1 flex-1">
              <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all w-full justify-center ${
                isCurrent
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                  : isPast
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground"
              }`}>
                <s.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < arr.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />}
            </div>
          );
        })}
      </div>

      {/* ══ IMPORT ══ */}
      {step === "import" && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          {/* Left: Config */}
          <div className="xl:col-span-2 space-y-5">
            <Card className="border-border/40 bg-card/80 backdrop-blur-sm shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold flex items-center gap-2.5">
                  <Shield className="w-4.5 h-4.5 text-primary" />
                  Configuração
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Instance selector */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Instância
                  </label>
                  <Select value={selectedDeviceId} onValueChange={handleDeviceChange}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Selecione uma instância" />
                    </SelectTrigger>
                    <SelectContent>
                      {allDevicesForSelect.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>
                          <div className="flex items-center gap-2.5">
                            <div className={`w-2 h-2 rounded-full ${isDeviceOnline(d.status) ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                            <span className="font-medium">{d.name}</span>
                            {d.number && <span className="text-muted-foreground text-xs">({d.number})</span>}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {allDevicesForSelect.length === 0 && (
                    <p className="text-xs text-destructive mt-1.5">Nenhuma instância Uazapi encontrada</p>
                  )}
                  {selectedDevice && selectedDevice.status !== "connected" && (
                    <p className="text-xs text-amber-500 mt-1.5">⚠ Instância desconectada</p>
                  )}
                </div>

                {/* Group selector */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Grupo de Destino
                  </label>
                  {isLoadingGroups ? (
                    <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Carregando grupos...
                    </div>
                  ) : groups.length > 0 ? (
                    <div className="space-y-2">
                      <Input
                        value={groupSearch}
                        onChange={e => setGroupSearch(e.target.value)}
                        placeholder="Buscar grupo..."
                        className="h-9 text-sm"
                      />
                      <div className="max-h-[240px] overflow-y-auto rounded-xl border border-border/40 divide-y divide-border/20">
                        {filteredGroups.map(g => (
                          <button
                            key={g.jid}
                            onClick={() => setGroupId(g.jid)}
                            className={`w-full text-left px-3.5 py-3 transition-colors hover:bg-muted/50 ${
                              groupId === g.jid ? "bg-primary/10 border-l-2 border-l-primary" : ""
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{g.name}</p>
                                <p className="text-[10px] text-muted-foreground/60 font-mono truncate mt-0.5">{g.jid}</p>
                              </div>
                              {g.participants > 0 && (
                                <Badge variant="outline" className="text-[10px] shrink-0 ml-2">
                                  {g.participants} <Users className="w-2.5 h-2.5 ml-0.5 inline" />
                                </Badge>
                              )}
                            </div>
                          </button>
                        ))}
                        {filteredGroups.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-4">Nenhum grupo encontrado</p>
                        )}
                      </div>
                    </div>
                  ) : selectedDeviceId ? (
                    <div className="rounded-xl border border-dashed border-border/40 p-4 text-center">
                      <Globe className="w-5 h-5 text-muted-foreground/40 mx-auto mb-1.5" />
                      <p className="text-xs text-muted-foreground">Nenhum grupo encontrado nesta instância</p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/40 p-4 text-center">
                      <p className="text-xs text-muted-foreground">Selecione uma instância primeiro</p>
                    </div>
                  )}
                </div>

                {/* Selected group summary */}
                {selectedGroup && (
                  <div className="rounded-xl bg-primary/5 border border-primary/15 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{selectedGroup.name}</p>
                        <p className="text-[10px] text-muted-foreground/60 font-mono">{selectedGroup.jid}</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick stats */}
            {contactCount > 0 && (
              <Card className="border-border/40 bg-card/80">
                <CardContent className="py-4 px-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <BarChart3 className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-foreground">{contactCount}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Contatos detectados</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right: Import */}
          <div className="xl:col-span-3">
            <Card className="border-border/40 bg-card/80 backdrop-blur-sm shadow-sm h-full">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold flex items-center gap-2.5">
                  <Upload className="w-4.5 h-4.5 text-primary" />
                  Importar Contatos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <Tabs defaultValue="paste">
                  <TabsList className="w-full grid grid-cols-2 h-10 bg-muted/50">
                    <TabsTrigger value="paste" className="text-xs font-semibold">Colar Números</TabsTrigger>
                    <TabsTrigger value="file" className="text-xs font-semibold">Arquivo CSV/TXT</TabsTrigger>
                  </TabsList>
                  <TabsContent value="paste" className="mt-4">
                    <Textarea
                      value={rawInput}
                      onChange={e => setRawInput(e.target.value)}
                      placeholder={"5562999999999\n5521988888888\n\nSepare por linha, vírgula ou ;"}
                      className="min-h-[300px] font-mono text-xs resize-none bg-muted/20 border-border/40"
                    />
                  </TabsContent>
                  <TabsContent value="file" className="mt-4">
                    <div className="border-2 border-dashed border-border/40 rounded-2xl p-10 text-center transition-colors hover:border-primary/30 hover:bg-primary/5 cursor-pointer">
                      <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground mb-1">Arraste ou selecione um arquivo</p>
                      <p className="text-[10px] text-muted-foreground/50 mb-4">CSV ou TXT com um número por linha</p>
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
                        className="text-xs mx-auto"
                      />
                    </div>
                  </TabsContent>
                </Tabs>

                <Button
                  onClick={handleValidate}
                  disabled={isValidating || !rawInput.trim() || !groupId.trim() || !selectedDeviceId}
                  className="w-full h-12 gap-2 text-sm font-semibold rounded-xl shadow-md shadow-primary/10"
                  size="lg"
                >
                  {isValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {isValidating ? "Validando..." : "Validar e Revisar"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ══ PREVIEW ══ */}
      {step === "preview" && validationResult && (
        <div className="space-y-6">
          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Total", value: validationResult.total, icon: Users, color: "text-foreground", border: "border-border/40" },
              { label: "Válidos", value: validationResult.validCount, icon: CheckCircle2, color: "text-emerald-500", border: "border-emerald-500/20" },
              { label: "Inválidos", value: validationResult.invalidCount, icon: XCircle, color: "text-destructive", border: "border-destructive/20" },
              { label: "Duplicados", value: validationResult.duplicateCount, icon: Copy, color: "text-amber-500", border: "border-amber-500/20" },
              { label: "Já no Grupo", value: participantCheck?.alreadyExistsCount ?? "—", icon: Users, color: "text-blue-500", border: "border-blue-500/20" },
              { label: "Prontos", value: participantCheck?.readyCount ?? "—", icon: Play, color: "text-primary", border: "border-primary/20" },
            ].map(s => (
              <Card key={s.label} className={`${s.border} bg-card/80`}>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{s.label}</span>
                  </div>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Selected group info */}
          {selectedGroup && (
            <Card className="border-primary/15 bg-primary/5">
              <CardContent className="py-3 px-5 flex items-center gap-3">
                <Globe className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">{selectedGroup.name}</span>
                <span className="text-xs text-muted-foreground font-mono">{selectedGroup.jid}</span>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            {!participantCheck && (
              <Button onClick={handleCheckParticipants} disabled={isChecking} variant="outline" className="gap-2 h-10">
                {isChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Verificar Existentes
              </Button>
            )}
            <Button onClick={() => setConfirmOpen(true)} disabled={totalToProcess === 0} className="gap-2 h-10 shadow-md shadow-primary/10">
              <Play className="w-4 h-4" />
              Iniciar ({totalToProcess} contatos)
            </Button>
            <Button variant="ghost" onClick={handleReset} className="gap-2 h-10 text-muted-foreground">
              <Trash2 className="w-4 h-4" />
              Descartar
            </Button>
          </div>

          {/* Detail cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
                      <div key={i} className="text-xs font-mono text-destructive/80 bg-destructive/5 rounded-lg px-3 py-1.5">{phone}</div>
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
                      <div key={i} className="text-xs font-mono text-amber-500/80 bg-amber-500/5 rounded-lg px-3 py-1.5">{phone}</div>
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
                      <div key={i} className="text-xs font-mono text-blue-500/80 bg-blue-500/5 rounded-lg px-3 py-1.5">{phone}</div>
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
        <div className="flex flex-col items-center justify-center py-20 space-y-8">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold text-foreground">Processando Contatos</h2>
            <p className="text-sm text-muted-foreground">Adicionando {totalToProcess} contatos ao grupo...</p>
            <p className="text-xs text-muted-foreground/50">Não feche esta página.</p>
          </div>
          <div className="w-full max-w-lg">
            <Progress value={undefined} className="h-2.5" />
          </div>
        </div>
      )}

      {/* ══ DONE ══ */}
      {step === "done" && processResult && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Sucesso", value: processResult.ok, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" },
              { label: "Já Existente", value: processResult.already, color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20" },
              { label: "Falhas", value: processResult.fail, color: "text-destructive", bg: "bg-destructive/10 border-destructive/20" },
              { label: "Duração", value: `${processResult.durationSec}s`, color: "text-muted-foreground", bg: "bg-muted/50 border-border/40" },
            ].map(s => (
              <Card key={s.label} className={`border ${s.bg}`}>
                <CardContent className="pt-5 pb-4 px-5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{s.label}</span>
                  <p className={`text-3xl font-bold ${s.color} mt-1`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filters */}
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
                className="text-xs h-8 rounded-lg"
              >
                {f.label}
              </Button>
            ))}
          </div>

          {/* Results table */}
          <Card className="border-border/40 bg-card/80">
            <CardContent className="p-0">
              <div className="max-h-[450px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/30 bg-muted/30">
                      <TableHead className="text-xs w-14 font-semibold">#</TableHead>
                      <TableHead className="text-xs font-semibold">Contato</TableHead>
                      <TableHead className="text-xs font-semibold">Status</TableHead>
                      <TableHead className="text-xs font-semibold">Detalhe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResults.map((r, i) => (
                      <TableRow key={i} className="border-border/15 hover:bg-muted/20">
                        <TableCell className="text-xs text-muted-foreground font-mono">{i + 1}</TableCell>
                        <TableCell className="text-xs font-mono font-medium">{r.phone}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-semibold ${
                              r.status === "completed" ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/5" :
                              r.status === "already_exists" ? "border-blue-500/30 text-blue-500 bg-blue-500/5" :
                              "border-destructive/30 text-destructive bg-destructive/5"
                            }`}
                          >
                            {r.status === "completed" ? "Sucesso" : r.status === "already_exists" ? "Já existe" : "Falha"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate">{r.error || "—"}</TableCell>
                      </TableRow>
                    ))}
                    {filteredResults.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-10 text-sm text-muted-foreground">Nenhum resultado</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleReset} className="gap-2 h-11 rounded-xl">
            <RefreshCw className="w-4 h-4" />
            Novo Lote
          </Button>
        </div>
      )}

      {/* Confirm dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Processamento</AlertDialogTitle>
            <AlertDialogDescription>
              Serão processados <strong>{totalToProcess}</strong> contatos para adição ao grupo
              {selectedGroup && <> <strong>{selectedGroup.name}</strong></>}. Esta ação não pode ser desfeita.
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
