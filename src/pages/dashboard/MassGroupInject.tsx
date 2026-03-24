import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  Users, Upload, Search, CheckCircle2, XCircle,
  Loader2, Play, Trash2, Copy, Shield, RefreshCw,
  FileText, BarChart3, UserPlus, ChevronRight, Globe,
  Clock, Pause, ArrowLeftRight, Settings2, Timer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
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
  results: Array<{ phone: string; status: string; error?: string; deviceUsed?: string }>;
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
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
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
  const [groupLink, setGroupLink] = useState("");
  const [isResolvingLink, setIsResolvingLink] = useState(false);
  const [groupInputMode, setGroupInputMode] = useState<"list" | "link" | "jid">("list");

  // Delay & rotation settings
  const [minDelay, setMinDelay] = useState(3);
  const [maxDelay, setMaxDelay] = useState(8);
  const [pauseAfter, setPauseAfter] = useState(0);
  const [pauseDuration, setPauseDuration] = useState(30);
  const [rotateAfter, setRotateAfter] = useState(0);

  // Track which steps have been completed for navigation
  const [completedSteps, setCompletedSteps] = useState<Set<Step>>(new Set());

  const { data: devices = [] } = useQuery({
    queryKey: ["user-devices-inject", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("id, name, number, status, uazapi_base_url, instance_type, login_type")
        .not("uazapi_base_url", "is", null);
      if (error) throw error;
      const filtered = (data || []).filter((d: any) =>
        d.instance_type !== "notificacao" && d.login_type !== "report_wa"
      );
      return filtered.sort((a: any, b: any) => {
        const numA = parseInt((a.name.match(/(\d+)\s*$/) || ["0", "0"])[1]);
        const numB = parseInt((b.name.match(/(\d+)\s*$/) || ["0", "0"])[1]);
        return numA - numB;
      });
    },
    enabled: !!user,
  });

  const isDeviceOnline = (status: string) => {
    const s = status?.toLowerCase();
    return s === "connected" || s === "ready" || s === "active";
  };

  const toggleDevice = useCallback((deviceId: string) => {
    setSelectedDeviceIds(prev =>
      prev.includes(deviceId)
        ? prev.filter(id => id !== deviceId)
        : [...prev, deviceId]
    );
  }, []);

  const primaryDeviceId = selectedDeviceIds[0] || "";

  const handleLoadGroups = useCallback(async (deviceId: string) => {
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

  // Load groups when first device is selected
  const handleDeviceToggle = useCallback((deviceId: string) => {
    const willBeSelected = !selectedDeviceIds.includes(deviceId);
    toggleDevice(deviceId);
    if (willBeSelected && selectedDeviceIds.length === 0) {
      handleLoadGroups(deviceId);
    }
  }, [selectedDeviceIds, toggleDevice, handleLoadGroups]);

  const handleResolveLink = useCallback(async () => {
    if (!groupLink.trim() || !primaryDeviceId) return;
    setIsResolvingLink(true);
    try {
      const { data, error } = await supabase.functions.invoke("mass-group-inject", {
        body: { action: "resolve-link", deviceId: primaryDeviceId, link: groupLink.trim() },
      });
      if (error) throw error;
      if (data?.jid) {
        setGroupId(data.jid);
        toast.success(`Grupo encontrado: ${data.name || data.jid}`);
      } else {
        toast.error(data?.error || "Não foi possível resolver o link");
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao resolver link do grupo");
    } finally {
      setIsResolvingLink(false);
    }
  }, [groupLink, primaryDeviceId]);

  const filteredGroups = useMemo(() => {
    if (!groupSearch.trim()) return groups;
    const q = groupSearch.toLowerCase();
    return groups.filter(g => g.name.toLowerCase().includes(q) || g.jid.toLowerCase().includes(q));
  }, [groups, groupSearch]);

  const selectedGroup = useMemo(() => groups.find(g => g.jid === groupId), [groups, groupId]);

  const parseContacts = useCallback((input: string): string[] => {
    return input.split(/[\n,;]+/).map(c => c.trim()).filter(c => c.length > 0);
  }, []);

  const handleValidate = useCallback(async () => {
    const contacts = parseContacts(rawInput);
    if (contacts.length === 0) return toast.error("Nenhum contato informado");
    if (!groupId.trim()) return toast.error("Selecione um grupo");
    if (selectedDeviceIds.length === 0) return toast.error("Selecione pelo menos uma instância");

    setIsValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke("mass-group-inject", {
        body: { action: "validate", contacts },
      });
      if (error) throw error;
      setValidationResult(data);
      setCompletedSteps(prev => new Set([...prev, "import"]));
      setStep("preview");
      toast.success(`${data.validCount} contatos válidos encontrados`);
    } catch (e: any) {
      toast.error(e.message || "Erro na validação");
    } finally {
      setIsValidating(false);
    }
  }, [rawInput, groupId, selectedDeviceIds, parseContacts]);

  const handleCheckParticipants = useCallback(async () => {
    if (!validationResult?.valid.length) return;
    setIsChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("mass-group-inject", {
        body: { action: "check-participants", groupId, deviceId: primaryDeviceId, contacts: validationResult.valid },
      });
      if (error) throw error;
      setParticipantCheck(data);
      toast.success(`${data.readyCount} contatos prontos para adição`);
    } catch (e: any) {
      toast.error(e.message || "Erro ao verificar participantes");
    } finally {
      setIsChecking(false);
    }
  }, [validationResult, groupId, primaryDeviceId]);

  const handleProcess = useCallback(async () => {
    const contacts = participantCheck?.ready || validationResult?.valid || [];
    if (contacts.length === 0) return toast.error("Nenhum contato para processar");
    setConfirmOpen(false);
    setIsProcessing(true);
    setCompletedSteps(prev => new Set([...prev, "preview"]));
    setStep("processing");
    try {
      const { data, error } = await supabase.functions.invoke("mass-group-inject", {
        body: {
          action: "process",
          groupId,
          deviceIds: selectedDeviceIds,
          contacts,
          concurrency: 1,
          minDelay,
          maxDelay,
          pauseAfter,
          pauseDuration,
          rotateAfter,
        },
      });
      if (error) throw error;
      setProcessResult(data);
      setCompletedSteps(prev => new Set([...prev, "processing"]));
      setStep("done");
      toast.success(`Concluído: ${data.ok} sucesso, ${data.fail} falhas`);
    } catch (e: any) {
      toast.error(e.message || "Erro no processamento");
      setStep("preview");
    } finally {
      setIsProcessing(false);
    }
  }, [participantCheck, validationResult, groupId, selectedDeviceIds, minDelay, maxDelay, pauseAfter, pauseDuration, rotateAfter]);

  const handleReset = useCallback(() => {
    setStep("import");
    setRawInput("");
    setValidationResult(null);
    setParticipantCheck(null);
    setProcessResult(null);
    setActiveFilter("all");
    setCompletedSteps(new Set());
  }, []);

  const handleStepClick = useCallback((targetStep: Step) => {
    if (isProcessing) return;
    const stepOrder: Step[] = ["import", "preview", "processing", "done"];
    const targetIdx = stepOrder.indexOf(targetStep);
    const currentIdx = stepOrder.indexOf(step);

    // Can always go back
    if (targetIdx < currentIdx) {
      setStep(targetStep);
      return;
    }
    // Can go forward only to completed steps or the current+1
    if (completedSteps.has(targetStep) || (targetIdx === currentIdx + 1 && completedSteps.has(step))) {
      setStep(targetStep);
    }
  }, [step, completedSteps, isProcessing]);

  const filteredResults = useMemo(() => {
    if (!processResult?.results) return [];
    if (activeFilter === "all") return processResult.results;
    return processResult.results.filter(r => r.status === activeFilter);
  }, [processResult, activeFilter]);

  const totalToProcess = participantCheck?.readyCount ?? validationResult?.validCount ?? 0;
  const contactCount = rawInput.trim() ? parseContacts(rawInput).length : 0;

  const stepItems = [
    { key: "import" as Step, label: "Importar", icon: Upload },
    { key: "preview" as Step, label: "Revisão", icon: Search },
    { key: "processing" as Step, label: "Processando", icon: RefreshCw },
    { key: "done" as Step, label: "Concluído", icon: CheckCircle2 },
  ];

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-6">

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

      {/* Step indicator - clickable */}
      <div className="flex items-center gap-1 bg-card/50 border border-border/50 rounded-2xl p-2">
        {stepItems.map((s, i, arr) => {
          const isCurrent = step === s.key;
          const isPast = arr.findIndex(x => x.key === step) > i;
          const canClick = !isProcessing && (isPast || completedSteps.has(s.key) || isCurrent);
          return (
            <div key={s.key} className="flex items-center gap-1 flex-1">
              <button
                onClick={() => canClick && handleStepClick(s.key)}
                disabled={!canClick}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all w-full justify-center ${
                  isCurrent
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : isPast
                      ? "bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                      : canClick
                        ? "text-muted-foreground hover:bg-muted/50 cursor-pointer"
                        : "text-muted-foreground/40 cursor-not-allowed"
                }`}
              >
                <s.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{s.label}</span>
              </button>
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
                  <Shield className="w-4 h-4 text-primary" />
                  Configuração
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Instance selector - multi-select with checkboxes */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Instâncias ({selectedDeviceIds.length} selecionada{selectedDeviceIds.length !== 1 ? "s" : ""})
                  </label>
                  <div className="max-h-[180px] overflow-y-auto rounded-xl border border-border/40 divide-y divide-border/20">
                    {devices.map((d: any) => {
                      const online = isDeviceOnline(d.status);
                      const selected = selectedDeviceIds.includes(d.id);
                      return (
                        <label
                          key={d.id}
                          className={`flex items-center gap-3 px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-muted/30 ${
                            selected ? "bg-primary/5" : ""
                          }`}
                        >
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() => handleDeviceToggle(d.id)}
                          />
                          <div className={`w-2 h-2 rounded-full shrink-0 ${online ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-medium">{d.name}</span>
                            {d.number && <span className="text-xs text-muted-foreground ml-1.5">({d.number})</span>}
                          </div>
                        </label>
                      );
                    })}
                    {devices.length === 0 && (
                      <p className="text-xs text-destructive text-center py-4">Nenhuma instância Uazapi encontrada</p>
                    )}
                  </div>
                  {selectedDeviceIds.length > 1 && (
                    <p className="text-[10px] text-primary mt-1.5">✓ Rotação entre {selectedDeviceIds.length} instâncias ativa</p>
                  )}
                </div>

                {/* Group selector */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Grupo de Destino
                  </label>
                  <div className="flex gap-1 mb-3 bg-muted/30 p-1 rounded-lg">
                    {[
                      { key: "list" as const, label: "Meus Grupos" },
                      { key: "link" as const, label: "Link do Grupo" },
                      { key: "jid" as const, label: "JID Manual" },
                    ].map(m => (
                      <button
                        key={m.key}
                        onClick={() => setGroupInputMode(m.key)}
                        className={`flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-all ${
                          groupInputMode === m.key
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {/* Mode: List */}
                  {groupInputMode === "list" && (
                    <>
                      {!primaryDeviceId ? (
                        <div className="rounded-xl border border-dashed border-border/40 p-4 text-center">
                          <p className="text-xs text-muted-foreground">Selecione uma instância primeiro</p>
                        </div>
                      ) : isLoadingGroups ? (
                        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Carregando grupos...
                        </div>
                      ) : groups.length > 0 ? (
                        <div className="space-y-2">
                          <Input value={groupSearch} onChange={e => setGroupSearch(e.target.value)} placeholder="Buscar grupo..." className="h-9 text-sm" />
                          <div className="max-h-[200px] overflow-y-auto rounded-xl border border-border/40 divide-y divide-border/20">
                            {filteredGroups.map(g => (
                              <button key={g.jid} onClick={() => setGroupId(g.jid)} className={`w-full text-left px-3.5 py-2.5 transition-colors hover:bg-muted/50 ${groupId === g.jid ? "bg-primary/10 border-l-2 border-l-primary" : ""}`}>
                                <div className="flex items-center justify-between">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">{g.name}</p>
                                    <p className="text-[10px] text-muted-foreground/60 font-mono truncate mt-0.5">{g.jid}</p>
                                  </div>
                                  {g.participants > 0 && <Badge variant="outline" className="text-[10px] shrink-0 ml-2">{g.participants}</Badge>}
                                </div>
                              </button>
                            ))}
                            {filteredGroups.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nenhum grupo encontrado</p>}
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => handleLoadGroups(primaryDeviceId)} className="w-full gap-2 text-xs h-8">
                            <RefreshCw className="w-3 h-3" /> Recarregar Grupos
                          </Button>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-border/40 p-4 text-center space-y-2">
                          <Globe className="w-5 h-5 text-muted-foreground/40 mx-auto" />
                          <p className="text-xs text-muted-foreground">Nenhum grupo encontrado</p>
                          <p className="text-[10px] text-muted-foreground/50">Use "Link do Grupo" ou "JID Manual"</p>
                        </div>
                      )}
                    </>
                  )}

                  {/* Mode: Link */}
                  {groupInputMode === "link" && (
                    <div className="space-y-3">
                      <Input value={groupLink} onChange={e => setGroupLink(e.target.value)} placeholder="https://chat.whatsapp.com/XXXXXXXX" className="h-11 font-mono text-sm" />
                      <p className="text-[10px] text-muted-foreground/60">Cole o link de convite do grupo. O sistema vai resolver o JID automaticamente.</p>
                      <Button onClick={handleResolveLink} disabled={isResolvingLink || !groupLink.trim() || !primaryDeviceId} variant="outline" className="w-full gap-2 h-10" size="sm">
                        {isResolvingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        {isResolvingLink ? "Resolvendo..." : "Resolver Link"}
                      </Button>
                    </div>
                  )}

                  {/* Mode: JID Manual */}
                  {groupInputMode === "jid" && (
                    <div className="space-y-2">
                      <Input value={groupId} onChange={e => setGroupId(e.target.value)} placeholder="120363XXXXXXXXXX@g.us" className="h-11 font-mono text-sm" />
                      <p className="text-[10px] text-muted-foreground/60">Identificador completo do grupo (JID)</p>
                    </div>
                  )}
                </div>

                {/* Selected group summary */}
                {groupId && (
                  <div className="rounded-xl bg-primary/5 border border-primary/15 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{selectedGroup?.name || "Grupo selecionado"}</p>
                        <p className="text-[10px] text-muted-foreground/60 font-mono">{groupId}</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Delay & Rotation Settings */}
            <Card className="border-border/40 bg-card/80 backdrop-blur-sm shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2.5">
                  <Settings2 className="w-4 h-4 text-primary" />
                  Configurações Avançadas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Delay between contacts */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Timer className="w-3.5 h-3.5 text-muted-foreground" />
                    <label className="text-xs font-semibold text-muted-foreground">Delay entre contatos (segundos)</label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10px] text-muted-foreground/60">Mín</span>
                      <Input type="number" min={1} max={120} value={minDelay} onChange={e => setMinDelay(Number(e.target.value) || 1)} className="h-9 text-sm mt-1" />
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground/60">Máx</span>
                      <Input type="number" min={1} max={300} value={maxDelay} onChange={e => setMaxDelay(Math.max(Number(e.target.value) || 1, minDelay))} className="h-9 text-sm mt-1" />
                    </div>
                  </div>
                </div>

                {/* Pause after X */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Pause className="w-3.5 h-3.5 text-muted-foreground" />
                    <label className="text-xs font-semibold text-muted-foreground">Pausa após X adições</label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10px] text-muted-foreground/60">A cada</span>
                      <Input type="number" min={0} value={pauseAfter} onChange={e => setPauseAfter(Number(e.target.value) || 0)} placeholder="0 = sem pausa" className="h-9 text-sm mt-1" />
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground/60">Duração (s)</span>
                      <Input type="number" min={5} max={600} value={pauseDuration} onChange={e => setPauseDuration(Number(e.target.value) || 30)} className="h-9 text-sm mt-1" />
                    </div>
                  </div>
                  {pauseAfter > 0 && (
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      Pausa de {pauseDuration}s após cada {pauseAfter} contatos
                    </p>
                  )}
                </div>

                {/* Rotate after X */}
                {selectedDeviceIds.length > 1 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground" />
                      <label className="text-xs font-semibold text-muted-foreground">Trocar instância após X adições</label>
                    </div>
                    <Input type="number" min={0} value={rotateAfter} onChange={e => setRotateAfter(Number(e.target.value) || 0)} placeholder="0 = sem rotação" className="h-9 text-sm" />
                    {rotateAfter > 0 && (
                      <p className="text-[10px] text-muted-foreground/60 mt-1">
                        Troca de instância após cada {rotateAfter} adições bem-sucedidas
                      </p>
                    )}
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
                  <Upload className="w-4 h-4 text-primary" />
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
                    <label className="block border-2 border-dashed border-border/40 rounded-2xl p-10 text-center transition-colors hover:border-primary/30 hover:bg-primary/5 cursor-pointer">
                      <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground mb-1">Arraste ou clique para selecionar</p>
                      <p className="text-[10px] text-muted-foreground/50 mb-2">CSV, TXT ou XLSX — um número por linha</p>
                      <input
                        type="file"
                        accept=".csv,.txt,.xlsx,.xls"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const ext = file.name.split('.').pop()?.toLowerCase();

                          if (ext === 'xlsx' || ext === 'xls') {
                            try {
                              const XLSX = await import('xlsx');
                              const buffer = await file.arrayBuffer();
                              const wb = XLSX.read(buffer, { type: 'array' });
                              const numbers: string[] = [];
                              for (const sheetName of wb.SheetNames) {
                                const ws = wb.Sheets[sheetName];
                                const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
                                for (const row of rows) {
                                  for (const cell of row) {
                                    const val = String(cell ?? '').trim();
                                    if (val && /\d{8,}/.test(val.replace(/\D/g, ''))) {
                                      numbers.push(val.replace(/\D/g, ''));
                                    }
                                  }
                                }
                              }
                              setRawInput(numbers.join('\n'));
                              toast.success(`${numbers.length} números importados de ${file.name}`);
                            } catch (err) {
                              toast.error('Erro ao ler arquivo Excel');
                            }
                          } else {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              setRawInput(ev.target?.result as string || "");
                              toast.success(`Arquivo carregado: ${file.name}`);
                            };
                            reader.readAsText(file);
                          }
                          e.target.value = '';
                        }}
                      />
                      {rawInput && <p className="text-xs text-primary mt-2">✓ Dados carregados</p>}
                    </label>
                  </TabsContent>
                </Tabs>

                <Button
                  onClick={handleValidate}
                  disabled={isValidating || !rawInput.trim() || !groupId.trim() || selectedDeviceIds.length === 0}
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

          {/* Config summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="border-border/40 bg-card/60">
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <Timer className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs font-semibold text-foreground">Delay: {minDelay}s – {maxDelay}s</p>
                  <p className="text-[10px] text-muted-foreground">Intervalo aleatório entre contatos</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/40 bg-card/60">
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <Users className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs font-semibold text-foreground">{selectedDeviceIds.length} instância{selectedDeviceIds.length !== 1 ? "s" : ""}</p>
                  <p className="text-[10px] text-muted-foreground">{rotateAfter > 0 ? `Rotação a cada ${rotateAfter}` : "Sem rotação"}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/40 bg-card/60">
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <Pause className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs font-semibold text-foreground">{pauseAfter > 0 ? `Pausa a cada ${pauseAfter}` : "Sem pausa"}</p>
                  <p className="text-[10px] text-muted-foreground">{pauseAfter > 0 ? `${pauseDuration}s de espera` : "Processamento contínuo"}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Selected group info */}
          {(selectedGroup || groupId) && (
            <Card className="border-primary/15 bg-primary/5">
              <CardContent className="py-3 px-5 flex items-center gap-3">
                <Globe className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">{selectedGroup?.name || "Grupo"}</span>
                <span className="text-xs text-muted-foreground font-mono">{groupId}</span>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="ghost" onClick={() => setStep("import")} className="gap-2 h-10 text-muted-foreground">
              ← Voltar
            </Button>
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
            <p className="text-xs text-muted-foreground/50">
              {selectedDeviceIds.length} instância{selectedDeviceIds.length !== 1 ? "s" : ""} • Delay {minDelay}–{maxDelay}s
              {pauseAfter > 0 && ` • Pausa a cada ${pauseAfter}`}
            </p>
            <p className="text-[10px] text-muted-foreground/40 mt-4">Não feche esta página.</p>
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
              <Button key={f.key} variant={activeFilter === f.key ? "default" : "outline"} size="sm" onClick={() => setActiveFilter(f.key)} className="text-xs h-8 rounded-lg">
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
                      {selectedDeviceIds.length > 1 && <TableHead className="text-xs font-semibold">Instância</TableHead>}
                      <TableHead className="text-xs font-semibold">Detalhe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResults.map((r, i) => (
                      <TableRow key={i} className="border-border/15 hover:bg-muted/20">
                        <TableCell className="text-xs text-muted-foreground font-mono">{i + 1}</TableCell>
                        <TableCell className="text-xs font-mono font-medium">{r.phone}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] font-semibold ${
                            r.status === "completed" ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/5" :
                            r.status === "already_exists" ? "border-blue-500/30 text-blue-500 bg-blue-500/5" :
                            "border-destructive/30 text-destructive bg-destructive/5"
                          }`}>
                            {r.status === "completed" ? "Sucesso" : r.status === "already_exists" ? "Já existe" : "Falha"}
                          </Badge>
                        </TableCell>
                        {selectedDeviceIds.length > 1 && (
                          <TableCell className="text-xs text-muted-foreground">{r.deviceUsed || "—"}</TableCell>
                        )}
                        <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate">{r.error || "—"}</TableCell>
                      </TableRow>
                    ))}
                    {filteredResults.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={selectedDeviceIds.length > 1 ? 5 : 4} className="text-center py-10 text-sm text-muted-foreground">Nenhum resultado</TableCell>
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
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Serão processados <strong>{totalToProcess}</strong> contatos para adição ao grupo
                  {selectedGroup && <> <strong>{selectedGroup.name}</strong></>}.
                </p>
                <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-xs">
                  <p>📱 {selectedDeviceIds.length} instância{selectedDeviceIds.length !== 1 ? "s" : ""}</p>
                  <p>⏱ Delay: {minDelay}s – {maxDelay}s (aleatório)</p>
                  {pauseAfter > 0 && <p>⏸ Pausa de {pauseDuration}s a cada {pauseAfter} contatos</p>}
                  {rotateAfter > 0 && <p>🔄 Troca de instância a cada {rotateAfter} adições</p>}
                </div>
              </div>
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
