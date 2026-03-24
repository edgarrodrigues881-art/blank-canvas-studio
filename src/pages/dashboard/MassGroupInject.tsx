import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  Users, Upload, Search, CheckCircle2, XCircle,
  Loader2, Play, Trash2, Copy, Shield, RefreshCw,
  FileText, BarChart3, UserPlus, ChevronRight, Globe,
  Clock, Pause, ArrowLeftRight, Settings2, Timer,
  StopCircle, AlertTriangle, TrendingUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
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

interface ContactResult {
  phone: string;
  status: string;
  error?: string;
  deviceUsed?: string;
}

interface GroupInfo {
  jid: string;
  name: string;
  participants: number;
}

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default function MassGroupInject() {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("import");
  const [groupId, setGroupId] = useState("");
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [rawInput, setRawInput] = useState("");
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [participantCheck, setParticipantCheck] = useState<ParticipantCheckResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
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

  // Real-time processing state
  const [liveResults, setLiveResults] = useState<ContactResult[]>([]);
  const [liveOk, setLiveOk] = useState(0);
  const [liveFail, setLiveFail] = useState(0);
  const [liveAlready, setLiveAlready] = useState(0);
  const [liveTotal, setLiveTotal] = useState(0);
  const [liveCurrentPhone, setLiveCurrentPhone] = useState("");
  const [liveCurrentDevice, setLiveCurrentDevice] = useState("");
  const [liveStatus, setLiveStatus] = useState<"running" | "paused" | "waiting_pause" | "done" | "cancelled">("running");
  const [liveStartTime, setLiveStartTime] = useState(0);
  const [liveElapsed, setLiveElapsed] = useState(0);

  const cancelRef = useRef(false);
  const pauseRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

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
      const groupsList = data?.groups || [];
      setGroups(groupsList);
      if (groupsList.length === 0) {
        toast.info("Nenhum grupo encontrado nesta instância. Tente outra ou use 'Link do Grupo'.");
      }
    } catch (e: any) {
      console.error("Error fetching groups:", e);
      toast.error("Erro ao buscar grupos da instância");
    } finally {
      setIsLoadingGroups(false);
    }
  }, []);

  // Load groups from ALL selected devices (merge results)
  const handleLoadGroupsFromAll = useCallback(async (deviceIds: string[]) => {
    if (deviceIds.length === 0) return;
    setGroups([]);
    setGroupId("");
    setIsLoadingGroups(true);
    const allGroups: GroupInfo[] = [];
    const seenJids = new Set<string>();
    try {
      for (const did of deviceIds) {
        try {
          const { data } = await supabase.functions.invoke("mass-group-inject", {
            body: { action: "list-groups", deviceId: did },
          });
          for (const g of (data?.groups || [])) {
            if (!seenJids.has(g.jid)) {
              seenJids.add(g.jid);
              allGroups.push(g);
            }
          }
        } catch { /* skip failed device */ }
      }
      setGroups(allGroups);
      if (allGroups.length === 0) {
        toast.info("Nenhum grupo encontrado. Tente 'Link do Grupo' ou 'JID Manual'.");
      }
    } finally {
      setIsLoadingGroups(false);
    }
  }, []);

  const handleDeviceToggle = useCallback((deviceId: string) => {
    const willBeSelected = !selectedDeviceIds.includes(deviceId);
    toggleDevice(deviceId);
    
    if (willBeSelected) {
      // Always reload groups when selecting a device
      const newIds = [...selectedDeviceIds, deviceId];
      // Load from the newly selected device (or first selected)
      handleLoadGroups(selectedDeviceIds.length === 0 ? deviceId : newIds[0]);
    } else {
      // If deselecting the primary device, reload from next primary
      const remaining = selectedDeviceIds.filter(id => id !== deviceId);
      if (remaining.length > 0 && selectedDeviceIds[0] === deviceId) {
        handleLoadGroups(remaining[0]);
      } else if (remaining.length === 0) {
        setGroups([]);
        setGroupId("");
      }
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

  // Client-side dedup on paste/change
  const handleRawInputChange = useCallback((value: string) => {
    const lines = value.split(/[\n,;]+/).map(c => c.trim()).filter(c => c.length > 0);
    const seen = new Set<string>();
    const unique: string[] = [];
    let removedCount = 0;
    for (const line of lines) {
      const digits = line.replace(/\D/g, "");
      const key = digits.length >= 10 ? digits : line;
      if (seen.has(key)) {
        removedCount++;
        continue;
      }
      seen.add(key);
      unique.push(line);
    }
    setRawInput(unique.join("\n"));
    if (removedCount > 0) {
      toast.info(`${removedCount} número(s) duplicado(s) removido(s)`);
    }
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

  // ═══ PROCESS CONTACTS ONE BY ONE FROM CLIENT ═══
  const handleProcess = useCallback(async () => {
    const contacts = participantCheck?.ready || validationResult?.valid || [];
    if (contacts.length === 0) return toast.error("Nenhum contato para processar");
    setConfirmOpen(false);
    setIsProcessing(true);
    setIsPaused(false);
    cancelRef.current = false;
    pauseRef.current = false;
    setCompletedSteps(prev => new Set([...prev, "preview"]));
    setStep("processing");

    // Reset live state
    setLiveResults([]);
    setLiveOk(0);
    setLiveFail(0);
    setLiveAlready(0);
    setLiveTotal(contacts.length);
    setLiveCurrentPhone("");
    setLiveCurrentDevice("");
    setLiveStatus("running");
    const start = Date.now();
    setLiveStartTime(start);
    setLiveElapsed(0);

    // Timer for elapsed
    timerRef.current = setInterval(() => {
      setLiveElapsed(Math.round((Date.now() - start) / 1000));
    }, 1000);

    let ok = 0, fail = 0, already = 0;
    const results: ContactResult[] = [];
    let currentDeviceIndex = 0;
    let addedWithCurrentDevice = 0;
    let processedSincePause = 0;

    for (let i = 0; i < contacts.length; i++) {
      // Check cancel
      if (cancelRef.current) {
        setLiveStatus("cancelled");
        break;
      }

      // Check pause
      while (pauseRef.current) {
        setLiveStatus("paused");
        await new Promise(r => setTimeout(r, 500));
        if (cancelRef.current) break;
      }
      if (cancelRef.current) {
        setLiveStatus("cancelled");
        break;
      }
      setLiveStatus("running");

      const phone = contacts[i];
      const deviceId = selectedDeviceIds[currentDeviceIndex % selectedDeviceIds.length];
      const deviceName = (devices as any[]).find((d: any) => d.id === deviceId)?.name || deviceId;

      setLiveCurrentPhone(phone);
      setLiveCurrentDevice(deviceName);

      try {
        const { data, error } = await supabase.functions.invoke("mass-group-inject", {
          body: { action: "add-single", groupId, deviceId, phone },
        });
        if (error) throw error;

        const result: ContactResult = {
          phone,
          status: data?.status || "failed",
          error: data?.error,
          deviceUsed: deviceName,
        };

        results.push(result);
        setLiveResults(prev => [...prev, result]);

        if (data?.status === "completed") {
          ok++;
          setLiveOk(prev => prev + 1);
          addedWithCurrentDevice++;
          processedSincePause++;
          // Maybe rotate
          if (rotateAfter > 0 && addedWithCurrentDevice >= rotateAfter) {
            currentDeviceIndex++;
            addedWithCurrentDevice = 0;
          }
        } else if (data?.status === "already_exists") {
          already++;
          setLiveAlready(prev => prev + 1);
          processedSincePause++;
        } else {
          fail++;
          setLiveFail(prev => prev + 1);
          processedSincePause++;
        }
      } catch (e: any) {
        fail++;
        setLiveFail(prev => prev + 1);
        processedSincePause++;
        const result: ContactResult = { phone, status: "failed", error: e.message || "Erro", deviceUsed: deviceName };
        results.push(result);
        setLiveResults(prev => [...prev, result]);
      }

      // Delay between contacts (skip on last)
      if (i < contacts.length - 1 && !cancelRef.current) {
        const delay = randomBetween(minDelay, maxDelay);
        await new Promise(r => setTimeout(r, delay * 1000));
      }

      // Pause after X contacts
      if (pauseAfter > 0 && processedSincePause >= pauseAfter && i < contacts.length - 1 && !cancelRef.current) {
        setLiveStatus("waiting_pause");
        await new Promise(r => setTimeout(r, pauseDuration * 1000));
        processedSincePause = 0;
      }
    }

    clearInterval(timerRef.current);
    setLiveElapsed(Math.round((Date.now() - start) / 1000));
    setLiveStatus(cancelRef.current ? "cancelled" : "done");
    setIsProcessing(false);
    setCompletedSteps(prev => new Set([...prev, "processing"]));
    setStep("done");
    toast.success(`Concluído: ${ok} sucesso, ${fail} falhas, ${already} já existentes`);
  }, [participantCheck, validationResult, groupId, selectedDeviceIds, devices, minDelay, maxDelay, pauseAfter, pauseDuration, rotateAfter]);

  const handlePause = useCallback(() => {
    pauseRef.current = !pauseRef.current;
    setIsPaused(pauseRef.current);
  }, []);

  const handleCancel = useCallback(() => {
    cancelRef.current = true;
    pauseRef.current = false;
    setIsPaused(false);
  }, []);

  const handleReset = useCallback(() => {
    cancelRef.current = true;
    pauseRef.current = false;
    clearInterval(timerRef.current);
    setStep("import");
    setRawInput("");
    setValidationResult(null);
    setParticipantCheck(null);
    setActiveFilter("all");
    setCompletedSteps(new Set());
    setLiveResults([]);
    setLiveOk(0);
    setLiveFail(0);
    setLiveAlready(0);
    setLiveTotal(0);
    setIsProcessing(false);
    setIsPaused(false);
    setLiveStatus("running");
  }, []);

  const handleStepClick = useCallback((targetStep: Step) => {
    if (isProcessing) return;
    const stepOrder: Step[] = ["import", "preview", "processing", "done"];
    const targetIdx = stepOrder.indexOf(targetStep);
    const currentIdx = stepOrder.indexOf(step);
    if (targetIdx < currentIdx) { setStep(targetStep); return; }
    if (completedSteps.has(targetStep) || (targetIdx === currentIdx + 1 && completedSteps.has(step))) {
      setStep(targetStep);
    }
  }, [step, completedSteps, isProcessing]);

  const filteredResults = useMemo(() => {
    const results = step === "done" ? liveResults : liveResults;
    if (activeFilter === "all") return results;
    return results.filter(r => r.status === activeFilter);
  }, [liveResults, activeFilter, step]);

  const totalToProcess = participantCheck?.readyCount ?? validationResult?.validCount ?? 0;
  const contactCount = rawInput.trim() ? parseContacts(rawInput).length : 0;
  const liveProcessed = liveOk + liveFail + liveAlready;
  const liveProgress = liveTotal > 0 ? Math.round((liveProcessed / liveTotal) * 100) : 0;

  const stepItems = [
    { key: "import" as Step, label: "Importar", icon: Upload },
    { key: "preview" as Step, label: "Revisão", icon: Search },
    { key: "processing" as Step, label: "Processando", icon: RefreshCw },
    { key: "done" as Step, label: "Concluído", icon: CheckCircle2 },
  ];

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

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
        {step !== "import" && !isProcessing && (
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
                {/* Instance selector */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Instâncias ({selectedDeviceIds.length} selecionada{selectedDeviceIds.length !== 1 ? "s" : ""})
                  </label>
                  <div className="max-h-[180px] overflow-y-auto rounded-xl border border-border/40 divide-y divide-border/20">
                    {devices.map((d: any) => {
                      const online = isDeviceOnline(d.status);
                      const selected = selectedDeviceIds.includes(d.id);
                      return (
                        <label key={d.id} className={`flex items-center gap-3 px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-muted/30 ${selected ? "bg-primary/5" : ""}`}>
                          <Checkbox checked={selected} onCheckedChange={() => handleDeviceToggle(d.id)} />
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
                    {([
                      { key: "list" as const, label: "Meus Grupos" },
                      { key: "link" as const, label: "Link do Grupo" },
                      { key: "jid" as const, label: "JID Manual" },
                    ]).map(m => (
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
                          <Button variant="ghost" size="sm" onClick={() => selectedDeviceIds.length > 1 ? handleLoadGroupsFromAll(selectedDeviceIds) : handleLoadGroups(primaryDeviceId)} className="w-full gap-2 text-xs h-8">
                            <RefreshCw className="w-3 h-3" /> Recarregar Grupos {selectedDeviceIds.length > 1 ? "(todas instâncias)" : ""}
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

                  {groupInputMode === "link" && (
                    <div className="space-y-3">
                      <Input value={groupLink} onChange={e => setGroupLink(e.target.value)} placeholder="https://chat.whatsapp.com/XXXXXXXX" className="h-11 font-mono text-sm" />
                      <p className="text-[10px] text-muted-foreground/60">Cole o link de convite do grupo.</p>
                      <Button onClick={handleResolveLink} disabled={isResolvingLink || !groupLink.trim() || !primaryDeviceId} variant="outline" className="w-full gap-2 h-10" size="sm">
                        {isResolvingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        {isResolvingLink ? "Resolvendo..." : "Resolver Link"}
                      </Button>
                    </div>
                  )}

                  {groupInputMode === "jid" && (
                    <div className="space-y-2">
                      <Input value={groupId} onChange={e => setGroupId(e.target.value)} placeholder="120363XXXXXXXXXX@g.us" className="h-11 font-mono text-sm" />
                      <p className="text-[10px] text-muted-foreground/60">Identificador completo do grupo (JID)</p>
                    </div>
                  )}
                </div>

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
                    <p className="text-[10px] text-muted-foreground/60 mt-1">Pausa de {pauseDuration}s após cada {pauseAfter} contatos</p>
                  )}
                </div>

                {selectedDeviceIds.length > 1 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground" />
                      <label className="text-xs font-semibold text-muted-foreground">Trocar instância após X adições</label>
                    </div>
                    <Input type="number" min={0} value={rotateAfter} onChange={e => setRotateAfter(Number(e.target.value) || 0)} placeholder="0 = sem rotação" className="h-9 text-sm" />
                    {rotateAfter > 0 && (
                      <p className="text-[10px] text-muted-foreground/60 mt-1">Troca de instância após cada {rotateAfter} adições</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

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
                    <TabsTrigger value="file" className="text-xs font-semibold">Arquivo CSV/TXT/XLSX</TabsTrigger>
                  </TabsList>
                  <TabsContent value="paste" className="mt-4">
                    <Textarea
                      value={rawInput}
                      onChange={e => setRawInput(e.target.value)}
                      onBlur={() => { if (rawInput.trim()) handleRawInputChange(rawInput); }}
                      placeholder={"5562999999999\n5521988888888\n\nSepare por linha, vírgula ou ;\nDuplicados são removidos automaticamente."}
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
                              handleRawInputChange(numbers.join('\n'));
                              toast.success(`${numbers.length} números importados de ${file.name}`);
                            } catch (err) {
                              toast.error('Erro ao ler arquivo Excel');
                            }
                          } else {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              handleRawInputChange(ev.target?.result as string || "");
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

          {(selectedGroup || groupId) && (
            <Card className="border-primary/15 bg-primary/5">
              <CardContent className="py-3 px-5 flex items-center gap-3">
                <Globe className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">{selectedGroup?.name || "Grupo"}</span>
                <span className="text-xs text-muted-foreground font-mono">{groupId}</span>
              </CardContent>
            </Card>
          )}

          {/* Actions - CENTERED */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
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

      {/* ══ PROCESSING — Real-time progress ══ */}
      {step === "processing" && (
        <div className="space-y-6">
          {/* Live stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Processados", value: `${liveProcessed}/${liveTotal}`, color: "text-foreground", bg: "border-border/40" },
              { label: "Sucesso", value: liveOk, color: "text-emerald-500", bg: "border-emerald-500/20" },
              { label: "Já Existe", value: liveAlready, color: "text-blue-500", bg: "border-blue-500/20" },
              { label: "Falhas", value: liveFail, color: "text-destructive", bg: "border-destructive/20" },
              { label: "Tempo", value: formatTime(liveElapsed), color: "text-muted-foreground", bg: "border-border/40" },
            ].map(s => (
              <Card key={s.label} className={`${s.bg} bg-card/80`}>
                <CardContent className="pt-4 pb-3 px-4">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{s.label}</span>
                  <p className={`text-2xl font-bold ${s.color} mt-1`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Progress bar */}
          <Card className="border-border/40 bg-card/80">
            <CardContent className="py-5 px-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {liveStatus === "running" && <Loader2 className="w-5 h-5 text-primary animate-spin" />}
                  {liveStatus === "paused" && <Pause className="w-5 h-5 text-amber-500" />}
                  {liveStatus === "waiting_pause" && <Clock className="w-5 h-5 text-amber-500 animate-pulse" />}
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {liveStatus === "running" && "Processando..."}
                      {liveStatus === "paused" && "Pausado"}
                      {liveStatus === "waiting_pause" && `Pausa automática (${pauseDuration}s)...`}
                      {liveStatus === "cancelled" && "Cancelado"}
                    </p>
                    {liveCurrentPhone && liveStatus === "running" && (
                      <p className="text-xs text-muted-foreground">
                        Adicionando <span className="font-mono">{liveCurrentPhone}</span> via <span className="text-primary">{liveCurrentDevice}</span>
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-lg font-bold text-primary">{liveProgress}%</span>
              </div>
              <Progress value={liveProgress} className="h-3" />
              <p className="text-[10px] text-muted-foreground/50 text-center">
                Você pode fechar esta tela — o processo continuará em segundo plano, mas perderá o acompanhamento visual.
              </p>
            </CardContent>
          </Card>

          {/* Pause / Cancel buttons - CENTERED */}
          <div className="flex gap-3 justify-center">
            <Button
              onClick={handlePause}
              variant="outline"
              className="gap-2 h-11 min-w-[140px]"
              disabled={!isProcessing}
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              {isPaused ? "Retomar" : "Pausar"}
            </Button>
            <Button
              onClick={handleCancel}
              variant="destructive"
              className="gap-2 h-11 min-w-[140px]"
              disabled={!isProcessing}
            >
              <StopCircle className="w-4 h-4" />
              Cancelar
            </Button>
          </div>

          {/* Live results feed */}
          {liveResults.length > 0 && (
            <Card className="border-border/40 bg-card/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Resultados em Tempo Real
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[300px] overflow-y-auto">
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
                      {[...liveResults].reverse().slice(0, 50).map((r, i) => (
                        <TableRow key={liveResults.length - i} className="border-border/15 hover:bg-muted/20">
                          <TableCell className="text-xs text-muted-foreground font-mono">{liveResults.length - i}</TableCell>
                          <TableCell className="text-xs font-mono font-medium">{r.phone}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] font-semibold ${
                              r.status === "completed" ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/5" :
                              r.status === "already_exists" ? "border-blue-500/30 text-blue-500 bg-blue-500/5" :
                              "border-destructive/30 text-destructive bg-destructive/5"
                            }`}>
                              {r.status === "completed" ? "✓ Sucesso" : r.status === "already_exists" ? "Já existe" : "✗ Falha"}
                            </Badge>
                          </TableCell>
                          {selectedDeviceIds.length > 1 && (
                            <TableCell className="text-xs text-muted-foreground">{r.deviceUsed || "—"}</TableCell>
                          )}
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{r.error || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ══ DONE ══ */}
      {step === "done" && liveResults.length > 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {[
              { label: "Sucesso", value: liveOk, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" },
              { label: "Já Existente", value: liveAlready, color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20" },
              { label: "Falhas", value: liveFail, color: "text-destructive", bg: "bg-destructive/10 border-destructive/20" },
              { label: "Total", value: liveProcessed, color: "text-foreground", bg: "bg-muted/50 border-border/40" },
              { label: "Duração", value: formatTime(liveElapsed), color: "text-muted-foreground", bg: "bg-muted/50 border-border/40" },
            ].map(s => (
              <Card key={s.label} className={`border ${s.bg}`}>
                <CardContent className="pt-5 pb-4 px-5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{s.label}</span>
                  <p className={`text-3xl font-bold ${s.color} mt-1`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {liveStatus === "cancelled" && (
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardContent className="py-3 px-5 flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <p className="text-sm text-amber-500 font-medium">Processamento cancelado pelo usuário. {liveTotal - liveProcessed} contatos não foram processados.</p>
              </CardContent>
            </Card>
          )}

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {[
              { key: "all", label: `Todos (${liveResults.length})` },
              { key: "completed", label: `Sucesso (${liveOk})` },
              { key: "already_exists", label: `Existente (${liveAlready})` },
              { key: "failed", label: `Falhas (${liveFail})` },
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

          <div className="flex justify-center">
            <Button onClick={handleReset} className="gap-2 h-11 rounded-xl">
              <RefreshCw className="w-4 h-4" />
              Novo Lote
            </Button>
          </div>
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
