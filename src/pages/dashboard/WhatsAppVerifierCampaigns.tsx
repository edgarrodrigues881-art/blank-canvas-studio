import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Search, Download, Loader2, Smartphone, Copy, Plus, CheckCircle2,
  XCircle, AlertTriangle, Phone, Upload, ArrowLeft, Trash2, StopCircle,
  Clock, Play, History, Pause, RefreshCw,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

function cleanAndDeduplicatePhones(raw: string): string[] {
  const lines = raw.split(/[\n,;]+/);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    let cleaned = line.replace(/[^0-9]/g, "");
    if (!cleaned || cleaned.length < 8) continue;
    if (cleaned.length >= 10 && cleaned.length <= 11 && !cleaned.startsWith("55")) cleaned = `55${cleaned}`;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
  }
  return result;
}

type ViewMode = "list" | "create" | "detail";

const ACTIVE_DEVICE_STATUSES = ["Ready", "Connected", "connected", "authenticated", "open", "active", "online"];

export default function WhatsAppVerifierCampaigns() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewMode>("list");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobName, setJobName] = useState("");
  const [selectedDevice, setSelectedDevice] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [swapDeviceId, setSwapDeviceId] = useState("");
  const [showSwapPanel, setShowSwapPanel] = useState(false);

  // All devices (for swap panel)
  const { data: allDevices = [] } = useQuery({
    queryKey: ["all-devices-verifier"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("id, name, number, status, uazapi_base_url")
        .not("uazapi_base_url", "is", null)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });

  const onlineDevices = useMemo(() => allDevices.filter((d: any) => ACTIVE_DEVICE_STATUSES.includes(d.status)), [allDevices]);

  const phones = useMemo(() => cleanAndDeduplicatePhones(rawInput), [rawInput]);

  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ["verify-jobs", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("verify_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    refetchInterval: 5_000,
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("verify-jobs-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "verify_jobs", filter: `user_id=eq.${user.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["verify-jobs", user.id] });
        if (selectedJobId) queryClient.invalidateQueries({ queryKey: ["verify-results", selectedJobId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient, selectedJobId]);

  useEffect(() => {
    if (jobsLoading || selectedJobId) return;
    if (jobs.length === 0) setView("create");
  }, [jobs.length, jobsLoading, selectedJobId]);

  const selectedJob = jobs.find((job: any) => job.id === selectedJobId);

  const { data: jobResults = [] } = useQuery({
    queryKey: ["verify-results", selectedJobId],
    queryFn: async () => {
      if (!selectedJobId) return [];
      const { data, error } = await supabase
        .from("verify_results")
        .select("*")
        .eq("job_id", selectedJobId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedJobId && view === "detail",
    refetchInterval: selectedJob?.status === "running" ? 3_000 : false,
  });

  // Get device info for a job
  const getDeviceInfo = useCallback((deviceId: string) => {
    return allDevices.find((d: any) => d.id === deviceId);
  }, [allDevices]);

  const createJob = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      if (!selectedDevice) throw new Error("Selecione uma instância");
      if (phones.length === 0) throw new Error("Nenhum número válido");
      if (phones.length > 5000) throw new Error("Máximo de 5000 números por campanha");

      const name = jobName.trim() || `Campanha ${new Date().toLocaleDateString("pt-BR")}`;
      const { data: job, error: jobErr } = await supabase
        .from("verify_jobs")
        .insert({ user_id: user.id, device_id: selectedDevice, name, total_phones: phones.length, status: "pending" } as any)
        .select()
        .single();
      if (jobErr || !job) throw new Error(jobErr?.message || "Erro ao criar campanha");

      for (let i = 0; i < phones.length; i += 500) {
        const batch = phones.slice(i, i + 500).map((phone) => ({
          job_id: (job as any).id, user_id: user.id, phone, status: "pending",
        }));
        const { error } = await supabase.from("verify_results").insert(batch as any);
        if (error) throw new Error(error.message);
      }
      return job as any;
    },
    onSuccess: (job: any) => {
      toast.success("Campanha criada!");
      queryClient.invalidateQueries({ queryKey: ["verify-jobs", user?.id] });
      setRawInput(""); setJobName(""); setSelectedDevice("");
      setSelectedJobId(job.id); setView("detail");
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao criar campanha"),
  });

  const pauseJob = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("verify_jobs").update({ status: "paused" } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campanha pausada");
      queryClient.invalidateQueries({ queryKey: ["verify-jobs", user?.id] });
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao pausar"),
  });

  const resumeJob = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("verify_jobs").update({ status: "pending" } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campanha retomada");
      queryClient.invalidateQueries({ queryKey: ["verify-jobs", user?.id] });
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao retomar"),
  });

  const swapDevice = useMutation({
    mutationFn: async ({ jobId, newDeviceId }: { jobId: string; newDeviceId: string }) => {
      const { error } = await supabase.from("verify_jobs").update({ device_id: newDeviceId } as any).eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Instância trocada! A campanha continuará de onde parou.");
      queryClient.invalidateQueries({ queryKey: ["verify-jobs", user?.id] });
      setShowSwapPanel(false);
      setSwapDeviceId("");
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao trocar instância"),
  });

  const cancelJob = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("verify_jobs").update({ status: "canceled", completed_at: new Date().toISOString() } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Campanha cancelada"); queryClient.invalidateQueries({ queryKey: ["verify-jobs", user?.id] }); },
    onError: (error: any) => toast.error(error?.message || "Erro ao cancelar"),
  });

  const deleteJob = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("verify_jobs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campanha excluída");
      queryClient.invalidateQueries({ queryKey: ["verify-jobs", user?.id] });
      if (selectedJobId) { setSelectedJobId(null); setView("list"); }
    },
    onError: (error: any) => toast.error(error?.message || "Erro ao excluir"),
  });

  const handleFileImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".txt,.csv";
    input.onchange = async (event: any) => {
      const file = event.target?.files?.[0];
      if (!file) return;
      const text = await file.text();
      setRawInput((prev) => (prev ? `${prev}\n${text}` : text));
      toast.success(`Arquivo "${file.name}" importado`);
    };
    input.click();
  }, []);

  const triggerDownload = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.style.display = "none";
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 150);
  }, []);

  const statusBadge = (status: string) => {
    switch (status) {
      case "success": return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1"><CheckCircle2 className="w-3 h-3" /> WhatsApp</Badge>;
      case "no_whatsapp": return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 gap-1"><XCircle className="w-3 h-3" /> Sem WhatsApp</Badge>;
      case "error": return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1"><AlertTriangle className="w-3 h-3" /> Erro</Badge>;
      case "pending": return <Badge className="bg-muted text-muted-foreground border-border gap-1"><Clock className="w-3 h-3" /> Pendente</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const jobStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><Clock className="w-3 h-3 mr-1" /> Aguardando</Badge>;
      case "running": return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Processando</Badge>;
      case "paused": return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30"><Pause className="w-3 h-3 mr-1" /> Pausada</Badge>;
      case "completed": return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><CheckCircle2 className="w-3 h-3 mr-1" /> Concluída</Badge>;
      case "failed": return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="w-3 h-3 mr-1" /> Falhou</Badge>;
      case "canceled": return <Badge className="bg-muted text-muted-foreground border-border"><StopCircle className="w-3 h-3 mr-1" /> Cancelada</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  // ─── CREATE VIEW ───
  if (view === "create") {
    return (
      <div className="space-y-6 p-4 md:p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          {jobs.length > 0 && (
            <Button variant="ghost" size="icon" onClick={() => setView("list")}><ArrowLeft className="w-5 h-5" /></Button>
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">Nova Campanha de Verificação</h1>
            <p className="text-muted-foreground text-sm">A campanha fica salva e continua em segundo plano.</p>
          </div>
          {jobs.length > 0 && (
            <Button variant="outline" onClick={() => setView("list")} className="gap-2"><History className="w-4 h-4" /> Ver histórico</Button>
          )}
        </div>
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nome da campanha</label>
              <Input placeholder="Ex: Leads Goiás Abril" value={jobName} onChange={(e) => setJobName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Instância</label>
              <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                <SelectTrigger className="bg-background/50"><SelectValue placeholder="Selecione uma instância conectada" /></SelectTrigger>
                <SelectContent>
                  {onlineDevices.map((device: any) => (
                    <SelectItem key={device.id} value={device.id}>
                      <span className="flex items-center gap-2"><Smartphone className="w-3.5 h-3.5" />{device.name} {device.number ? `(${device.number})` : ""}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Números para verificar</label>
                <span className="text-xs text-muted-foreground">{phones.length} válido{phones.length !== 1 ? "s" : ""}</span>
              </div>
              <Textarea placeholder={"Cole os números aqui, um por linha:\n5511999999999\n5521988888888"} value={rawInput} onChange={(e) => setRawInput(e.target.value)} className="min-h-[180px] bg-background/50 font-mono text-sm" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleFileImport}><Upload className="w-4 h-4 mr-1.5" /> Importar Lista</Button>
              <Button onClick={() => createJob.mutate()} disabled={createJob.isPending || phones.length === 0 || !selectedDevice} className="ml-auto">
                {createJob.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Play className="w-4 h-4 mr-1.5" />}
                {createJob.isPending ? "Criando..." : `Criar Campanha (${phones.length})`}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── DETAIL VIEW ───
  if (view === "detail" && selectedJob) {
    const job = selectedJob as any;
    const total = job.total_phones || 0;
    const verified = (job.success_count || 0) + (job.no_whatsapp_count || 0) + (job.error_count || 0);
    const pct = total > 0 ? (verified / total) * 100 : 0;
    const validResults = jobResults.filter((r: any) => r.status === "success");
    const isActive = job.status === "running" || job.status === "pending";
    const isPaused = job.status === "paused";
    const canResume = isPaused || job.status === "failed";
    const deviceInfo = getDeviceInfo(job.device_id);
    const deviceIsOnline = deviceInfo && ACTIVE_DEVICE_STATUSES.includes(deviceInfo.status);

    return (
      <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => { setView("list"); setSelectedJobId(null); setShowSwapPanel(false); }}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground">{job.name}</h1>
              {jobStatusBadge(job.status)}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">Criada em {new Date(job.created_at).toLocaleString("pt-BR")}</p>
          </div>
          <div className="flex items-center gap-2">
            {isActive && (
              <Button variant="outline" size="sm" onClick={() => pauseJob.mutate(job.id)} disabled={pauseJob.isPending}>
                <Pause className="w-4 h-4 mr-1.5" /> Pausar
              </Button>
            )}
            {canResume && (
              <Button size="sm" onClick={() => resumeJob.mutate(job.id)} disabled={resumeJob.isPending} className="bg-emerald-600 hover:bg-emerald-700">
                <Play className="w-4 h-4 mr-1.5" /> Retomar
              </Button>
            )}
            {(isActive || isPaused) && (
              <Button variant="destructive" size="sm" onClick={() => cancelJob.mutate(job.id)} disabled={cancelJob.isPending}>
                <StopCircle className="w-4 h-4 mr-1.5" /> Cancelar
              </Button>
            )}
          </div>
        </div>

        {/* Instance info */}
        <Card className="border-border/50 bg-card/50">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-muted-foreground" />
                <div>
                  <span className="font-medium text-foreground">
                    {deviceInfo ? `${deviceInfo.name}${deviceInfo.number ? ` (${deviceInfo.number})` : ""}` : "Instância removida"}
                  </span>
                  {deviceInfo && (
                    <Badge className={`ml-2 text-xs ${deviceIsOnline ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>
                      {deviceIsOnline ? "Online" : deviceInfo.status}
                    </Badge>
                  )}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setShowSwapPanel(!showSwapPanel); setSwapDeviceId(""); }}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Trocar instância
              </Button>
            </div>

            {showSwapPanel && (
              <div className="mt-4 pt-4 border-t border-border/50 flex items-end gap-3">
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Nova instância</label>
                  <Select value={swapDeviceId} onValueChange={setSwapDeviceId}>
                    <SelectTrigger className="bg-background/50"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {onlineDevices.filter((d: any) => d.id !== job.device_id).map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>
                          <span className="flex items-center gap-2"><Smartphone className="w-3.5 h-3.5" />{d.name} {d.number ? `(${d.number})` : ""}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" disabled={!swapDeviceId || swapDevice.isPending} onClick={() => swapDevice.mutate({ jobId: job.id, newDeviceId: swapDeviceId })}>
                  {swapDevice.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar troca"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Progress */}
        {(isActive || isPaused) && (
          <Card className="border-border/50 bg-card/50">
            <CardContent className="py-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Progresso</span>
                <span className="text-foreground font-medium">{verified} / {total}</span>
              </div>
              <Progress value={pct} className="h-2" />
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-border/50 p-3 text-center"><div className="text-2xl font-bold text-foreground">{total}</div><div className="text-xs text-muted-foreground">Total</div></div>
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-center"><div className="text-2xl font-bold text-emerald-400">{job.success_count || 0}</div><div className="text-xs text-emerald-400/70">Com WhatsApp</div></div>
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-center"><div className="text-2xl font-bold text-red-400">{job.no_whatsapp_count || 0}</div><div className="text-xs text-red-400/70">Sem WhatsApp</div></div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-center"><div className="text-2xl font-bold text-amber-400">{job.error_count || 0}</div><div className="text-xs text-amber-400/70">Erros</div></div>
        </div>

        {/* Export buttons */}
        {jobResults.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={validResults.length === 0} onClick={() => {
              navigator.clipboard.writeText(validResults.map((r: any) => r.phone).join("\n"));
              toast.success(`${validResults.length} números copiados!`);
            }}><Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar válidos ({validResults.length})</Button>
            <Button variant="outline" size="sm" disabled={validResults.length === 0} onClick={() => {
              const blob = new Blob(["\uFEFFNúmero\n" + validResults.map((r: any) => r.phone).join("\n")], { type: "text/csv;charset=utf-8" });
              triggerDownload(blob, `validos_${job.name.replace(/\s+/g, "_")}.csv`);
            }}><Download className="w-3.5 h-3.5 mr-1.5" /> Exportar válidos</Button>
            <Button variant="outline" size="sm" onClick={() => {
              const header = "Número,Status,Detalhe\n";
              const rows = jobResults.map((r: any) => `${r.phone},${r.status},${r.detail || ""}`).join("\n");
              const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8" });
              triggerDownload(blob, `verificacao_${job.name.replace(/\s+/g, "_")}.csv`);
            }}><Download className="w-3.5 h-3.5 mr-1.5" /> Exportar tudo</Button>
          </div>
        )}

        {/* Results table */}
        {jobResults.length > 0 && (
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="pb-3"><CardTitle className="text-base">Resultados ({jobResults.length}{jobResults.length >= 500 ? "+" : ""})</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <ScrollArea className="h-[400px]">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Número</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Detalhe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {jobResults.map((result: any, i: number) => (
                        <tr key={i} className="hover:bg-muted/10 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-foreground">{result.phone}</td>
                          <td className="px-4 py-2.5">{statusBadge(result.status)}</td>
                          <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">{result.detail || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ─── LIST VIEW ───
  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Phone className="w-6 h-6 text-primary" /> Campanhas de Verificação</h1>
          <p className="text-muted-foreground text-sm mt-1">Campanhas salvas que continuam rodando em segundo plano.</p>
        </div>
        <Button onClick={() => setView("create")} className="gap-1.5"><Plus className="w-4 h-4" /> Nova Campanha</Button>
      </div>

      {jobsLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : jobs.length === 0 ? (
        <Card className="border-border/50 bg-card/50">
          <CardContent className="py-12 text-center space-y-4">
            <Search className="w-10 h-10 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground">Nenhuma campanha criada ainda</p>
            <Button onClick={() => setView("create")} className="gap-2"><Plus className="w-4 h-4" /> Criar agora</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((job: any) => {
            const total = job.total_phones || 0;
            const verified = (job.success_count || 0) + (job.no_whatsapp_count || 0) + (job.error_count || 0);
            const pct = total > 0 ? (verified / total) * 100 : 0;
            const isActive = job.status === "running" || job.status === "pending";
            const isPaused = job.status === "paused";
            const devInfo = getDeviceInfo(job.device_id);

            return (
              <Card key={job.id} className="border-border/50 bg-card/50 hover:bg-card/80 transition-colors cursor-pointer" onClick={() => { setSelectedJobId(job.id); setView("detail"); }}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between mb-2 gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-semibold text-foreground">{job.name}</h3>
                      {jobStatusBadge(job.status)}
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {isActive && (
                        <Button variant="ghost" size="sm" className="h-7" onClick={() => pauseJob.mutate(job.id)} title="Pausar">
                          <Pause className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {isPaused && (
                        <Button variant="ghost" size="sm" className="h-7 text-emerald-400" onClick={() => resumeJob.mutate(job.id)} title="Retomar">
                          <Play className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {(isActive || isPaused) && (
                        <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => cancelJob.mutate(job.id)}>
                          <StopCircle className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {!isActive && !isPaused && (
                        <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => deleteJob.mutate(job.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2 flex-wrap">
                    {devInfo && (
                      <span className="flex items-center gap-1"><Smartphone className="w-3 h-3" />{devInfo.name}</span>
                    )}
                    <span>{total} números</span>
                    <span className="text-emerald-400">✓ {job.success_count || 0}</span>
                    <span className="text-red-400">✗ {job.no_whatsapp_count || 0}</span>
                    <span className="text-amber-400">⚠ {job.error_count || 0}</span>
                    <span className="ml-auto">{new Date(job.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>

                  {(isActive || isPaused) && <Progress value={pct} className="h-1.5" />}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}