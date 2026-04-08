import { useState, useMemo, useCallback, useEffect, useRef } from "react";
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
  Clock, Play, History, Pause, RefreshCw, FileSpreadsheet, Variable, Users,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

// ── Types ──
type ViewMode = "list" | "create" | "detail";
type ImportMode = "plain" | "spreadsheet";
type ColMapping = "telefone" | "var1" | "var2" | "var3" | "var4" | "var5" | "var6" | "var7" | "var8" | "var9" | "var10" | "ignorar";

const VAR_KEYS = ["var1","var2","var3","var4","var5","var6","var7","var8","var9","var10"] as const;

interface ImportedRow {
  phone: string;
  var1?: string; var2?: string; var3?: string; var4?: string; var5?: string;
  var6?: string; var7?: string; var8?: string; var9?: string; var10?: string;
}

const BATCH_SIZE = 10;
const ACTIVE_DEVICE_STATUSES = ["Ready", "Connected", "connected", "authenticated", "open", "active", "online"];

const MAPPING_OPTIONS: { value: ColMapping; label: string }[] = [
  { value: "ignorar", label: "Ignorar" },
  { value: "telefone", label: "Telefone" },
  { value: "var1", label: "Variável 1 (ex: Nome)" },
  { value: "var2", label: "Variável 2 (ex: Endereço)" },
  { value: "var3", label: "Variável 3 (ex: Comércio)" },
  { value: "var4", label: "Variável 4 (ex: Email)" },
  { value: "var5", label: "Variável 5 (ex: Cidade)" },
  { value: "var6", label: "Variável 6 (ex: Website)" },
  { value: "var7", label: "Variável 7 (ex: Instagram)" },
  { value: "var8", label: "Variável 8 (ex: Facebook)" },
  { value: "var9", label: "Variável 9 (ex: Avaliação)" },
  { value: "var10", label: "Variável 10" },
];

function cleanPhone(raw: string): string {
  let cleaned = raw.replace(/[^0-9]/g, "");
  if (cleaned.length >= 10 && cleaned.length <= 11 && !cleaned.startsWith("55")) cleaned = `55${cleaned}`;
  return cleaned.length >= 8 ? cleaned : "";
}

function cleanAndDeduplicatePhones(raw: string): string[] {
  const lines = raw.split(/[\n,;]+/);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    const cleaned = cleanPhone(line);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
  }
  return result;
}

function autoDetectMapping(headers: string[]): ColMapping[] {
  return headers.map((h) => {
    const low = h.toLowerCase().trim();
    if (/tel|phone|número|numero|celular|whats|fone/.test(low)) return "telefone";
    if (/^nome$|^name$|^cliente$/.test(low)) return "var1";
    if (/endere[cç]o|address|rua|logradouro|cep/.test(low)) return "var2";
    if (/com[eé]rcio|empresa|company|loja|negócio|negocio/.test(low)) return "var3";
    if (/email|e-mail/.test(low)) return "var4";
    if (/cidade|city|bairro/.test(low)) return "var5";
    return "ignorar";
  });
}

export default function WhatsAppVerifierCampaigns() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewMode>("list");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobName, setJobName] = useState("");
  const [selectedDevice, setSelectedDevice] = useState("");
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [rawInput, setRawInput] = useState("");
  const [showSwapPanel, setShowSwapPanel] = useState(false);

  // Spreadsheet import state
  const [importMode, setImportMode] = useState<ImportMode>("plain");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<any[][]>([]);
  const [columnMappings, setColumnMappings] = useState<ColMapping[]>([]);
  const [importedContacts, setImportedContacts] = useState<ImportedRow[]>([]);
  const [varLabels, setVarLabels] = useState<string[]>(["Var 1", "Var 2", "Var 3", "Var 4", "Var 5"]);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const phones = useMemo(() => {
    if (importMode === "spreadsheet") return importedContacts.map((c) => c.phone);
    return cleanAndDeduplicatePhones(rawInput);
  }, [rawInput, importMode, importedContacts]);

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
        .limit(5000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedJobId && view === "detail",
    refetchInterval: selectedJob?.status === "running" ? 3_000 : false,
  });

  const getDeviceInfo = useCallback((deviceId: string) => {
    return allDevices.find((d: any) => d.id === deviceId);
  }, [allDevices]);

  // ── Spreadsheet import handler ──
  const handleSpreadsheetImport = useCallback(async (file: File) => {
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (json.length < 2) { toast.warning("Planilha vazia ou sem dados"); return; }

      const headers = json[0].map((h: any) => String(h || "").trim());
      const rows = json.slice(1).filter((row: any[]) => row.some((c) => c !== ""));
      const mappings = autoDetectMapping(headers);

      setImportHeaders(headers);
      setImportRows(rows);
      setColumnMappings(mappings);
      setImportDialogOpen(true);
    } catch (err: any) {
      toast.error("Erro ao ler planilha: " + (err?.message || ""));
    }
  }, []);

  const confirmImport = useCallback(() => {
    const phoneIdx = columnMappings.indexOf("telefone");
    if (phoneIdx < 0) { toast.error("Mapeie ao menos a coluna de Telefone"); return; }

    const varIdxMap: Record<string, number> = {};
    const labels = ["Var 1", "Var 2", "Var 3", "Var 4", "Var 5"];
    (["var1", "var2", "var3", "var4", "var5"] as const).forEach((key, i) => {
      const idx = columnMappings.indexOf(key);
      if (idx >= 0) {
        varIdxMap[key] = idx;
        labels[i] = importHeaders[idx] || `Var ${i + 1}`;
      }
    });

    const seen = new Set<string>();
    const contacts: ImportedRow[] = [];
    for (const row of importRows) {
      const phone = cleanPhone(String(row[phoneIdx] || ""));
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      const entry: ImportedRow = { phone };
      if (varIdxMap.var1 !== undefined) entry.var1 = String(row[varIdxMap.var1] || "").trim();
      if (varIdxMap.var2 !== undefined) entry.var2 = String(row[varIdxMap.var2] || "").trim();
      if (varIdxMap.var3 !== undefined) entry.var3 = String(row[varIdxMap.var3] || "").trim();
      if (varIdxMap.var4 !== undefined) entry.var4 = String(row[varIdxMap.var4] || "").trim();
      if (varIdxMap.var5 !== undefined) entry.var5 = String(row[varIdxMap.var5] || "").trim();
      contacts.push(entry);
    }

    if (contacts.length === 0) { toast.warning("Nenhum número válido encontrado"); return; }
    setImportedContacts(contacts);
    setVarLabels(labels);
    setImportMode("spreadsheet");
    setImportDialogOpen(false);
    toast.success(`${contacts.length} contatos importados com variáveis`);
  }, [columnMappings, importHeaders, importRows]);

  const hasVars = importMode === "spreadsheet" && importedContacts.some((c) => c.var1 || c.var2 || c.var3 || c.var4 || c.var5);

  // ── Mutations ──
  const createJob = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      if (!selectedDevice && selectedDevices.length === 0) throw new Error("Selecione ao menos uma instância");
      if (phones.length === 0) throw new Error("Nenhum número válido");
      if (phones.length > 5000) throw new Error("Máximo de 5000 números por campanha");

      const deviceIds = selectedDevices.length > 0 ? selectedDevices : [selectedDevice];
      const primaryDeviceId = deviceIds[0];
      const name = jobName.trim() || `Campanha ${new Date().toLocaleDateString("pt-BR")}`;
      const { data: job, error: jobErr } = await supabase
        .from("verify_jobs")
        .insert({ user_id: user.id, device_id: primaryDeviceId, device_ids: deviceIds, name, total_phones: phones.length, status: "pending" } as any)
        .select()
        .single();
      if (jobErr || !job) throw new Error(jobErr?.message || "Erro ao criar campanha");

      // Build contacts with vars
      const contactMap = new Map<string, ImportedRow>();
      if (importMode === "spreadsheet") {
        for (const c of importedContacts) contactMap.set(c.phone, c);
      }

      for (let i = 0; i < phones.length; i += 500) {
        const batch = phones.slice(i, i + 500).map((phone) => {
          const vars = contactMap.get(phone);
          return {
            job_id: (job as any).id, user_id: user.id, phone, status: "pending",
            ...(vars?.var1 ? { var1: vars.var1 } : {}),
            ...(vars?.var2 ? { var2: vars.var2 } : {}),
            ...(vars?.var3 ? { var3: vars.var3 } : {}),
            ...(vars?.var4 ? { var4: vars.var4 } : {}),
            ...(vars?.var5 ? { var5: vars.var5 } : {}),
          };
        });
        const { error } = await supabase.from("verify_results").insert(batch as any);
        if (error) throw new Error(error.message);
      }
      return job as any;
    },
    onSuccess: (job: any) => {
      toast.success("Campanha criada!");
      queryClient.invalidateQueries({ queryKey: ["verify-jobs", user?.id] });
      setRawInput(""); setJobName(""); setSelectedDevice(""); setSelectedDevices([]);
      setImportedContacts([]); setImportMode("plain");
      setSelectedJobId(job.id); setView("detail");
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao criar campanha"),
  });

  const pauseJob = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("verify_jobs").update({ status: "paused" } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Campanha pausada"); queryClient.invalidateQueries({ queryKey: ["verify-jobs", user?.id] }); },
    onError: (err: any) => toast.error(err?.message || "Erro ao pausar"),
  });

  const resumeJob = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("verify_jobs").update({ status: "pending" } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Campanha retomada"); queryClient.invalidateQueries({ queryKey: ["verify-jobs", user?.id] }); },
    onError: (err: any) => toast.error(err?.message || "Erro ao retomar"),
  });

  const updateJobDevices = useMutation({
    mutationFn: async ({ jobId, deviceIds }: { jobId: string; deviceIds: string[] }) => {
      const { error } = await supabase.from("verify_jobs").update({ device_ids: deviceIds, device_id: deviceIds[0] || null } as any).eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Instâncias atualizadas!");
      queryClient.invalidateQueries({ queryKey: ["verify-jobs", user?.id] });
      setShowSwapPanel(false);
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao atualizar instâncias"),
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

  const handleFileImportPlain = useCallback(() => {
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

  // ── Sort results: success first, pending middle, no_whatsapp/error last ──
  const STATUS_ORDER: Record<string, number> = { success: 0, pending: 1, no_whatsapp: 2, error: 3 };
  const sortedResults = useMemo(() => {
    return [...jobResults].sort((a: any, b: any) => {
      const orderA = STATUS_ORDER[a.status] ?? 1;
      const orderB = STATUS_ORDER[b.status] ?? 1;
      return orderA - orderB;
    });
  }, [jobResults]);

  // ── Detect if results have vars ──
  const resultsHaveVars = useMemo(() => {
    return sortedResults.some((r: any) => r.var1 || r.var2 || r.var3 || r.var4 || r.var5);
  }, [sortedResults]);

  // Hidden file input for xlsx
  const handleSpreadsheetClick = () => {
    if (fileRef.current) fileRef.current.click();
  };

  // ═══════════════════════════════════════════
  // ─── CREATE VIEW ──────────────────────────
  // ═══════════════════════════════════════════
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
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Instâncias</label>
                <span className="text-xs text-muted-foreground">
                  {selectedDevices.length > 0 ? `${selectedDevices.length} selecionada(s)` : "Selecione ao menos uma"}
                  {selectedDevices.length > 1 && ` — ${selectedDevices.length * BATCH_SIZE} números/lote`}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Selecione múltiplas instâncias para verificar mais rápido. Cada chip verifica {BATCH_SIZE} números por lote.
                Se um chip desconectar, a campanha pausa automaticamente para você trocar.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto rounded-lg border border-border/30 p-2 bg-background/30">
                {onlineDevices.length === 0 ? (
                  <p className="text-xs text-muted-foreground col-span-2 text-center py-4">Nenhuma instância conectada</p>
                ) : (
                  onlineDevices.map((device: any) => {
                    const isSelected = selectedDevices.includes(device.id);
                    return (
                      <button
                        key={device.id}
                        type="button"
                        onClick={() => {
                          setSelectedDevices(prev =>
                            isSelected ? prev.filter(id => id !== device.id) : [...prev, device.id]
                          );
                          if (!selectedDevice) setSelectedDevice(device.id);
                        }}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border/50 bg-background/50 text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                          isSelected ? "border-primary bg-primary" : "border-muted-foreground/40"
                        }`}>
                          {isSelected && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                        </div>
                        <Smartphone className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{device.name} {device.number ? `(${device.number})` : ""}</span>
                      </button>
                    );
                  })
                )}
              </div>
              {onlineDevices.length > 2 && (
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" className="text-xs h-7" onClick={() => setSelectedDevices(onlineDevices.map((d: any) => d.id))}>
                    Selecionar todas
                  </Button>
                  {selectedDevices.length > 0 && (
                    <Button type="button" variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={() => setSelectedDevices([])}>
                      Limpar seleção
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Import mode toggle */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Números para verificar</label>
                <span className="text-xs text-muted-foreground">{phones.length} válido{phones.length !== 1 ? "s" : ""}</span>
              </div>

              {importMode === "plain" ? (
                <>
                  <Textarea placeholder={"Cole os números aqui, um por linha:\n5511999999999\n5521988888888"} value={rawInput} onChange={(e) => setRawInput(e.target.value)} className="min-h-[180px] bg-background/50 font-mono text-sm" />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={handleFileImportPlain}><Upload className="w-4 h-4 mr-1.5" /> Importar TXT/CSV</Button>
                    <Button variant="outline" size="sm" onClick={handleSpreadsheetClick} className="gap-1.5">
                      <FileSpreadsheet className="w-4 h-4" /> Importar Planilha com Variáveis
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl border border-primary/20 bg-card/60 backdrop-blur overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-muted/10">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium text-foreground">{importedContacts.length} contatos importados</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setImportMode("plain"); setImportedContacts([]); }}>
                        <XCircle className="w-3.5 h-3.5 mr-1" /> Limpar
                      </Button>
                    </div>

                    {(() => {
                      const activeVarKeys = varLabels.map((_, vi) => `var${vi + 1}` as keyof ImportedRow).filter((key) => importedContacts.some((cc) => cc[key]));
                      const activeVarLabels = varLabels.filter((_, vi) => importedContacts.some((c) => c[`var${vi + 1}` as keyof ImportedRow]));
                      return (
                        <ScrollArea className="h-[340px]">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm" style={{ minWidth: `${200 + activeVarKeys.length * 220}px` }}>
                              <thead className="bg-muted/20 sticky top-0 z-10">
                                <tr>
                                  <th className="text-left px-3 py-2 text-[10px] font-medium text-muted-foreground w-[40px]">#</th>
                                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-[150px]">Telefone</th>
                                  {activeVarLabels.map((label, vi) => (
                                    <th key={vi} className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-[220px]">{label}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/20">
                                {importedContacts.map((c, i) => (
                                  <tr key={i} className="hover:bg-muted/10 transition-colors">
                                    <td className="px-3 py-2 text-[10px] text-muted-foreground/50">{i + 1}</td>
                                    <td className="px-3 py-2 font-mono text-sm text-foreground">{c.phone}</td>
                                    {activeVarKeys.map((key, vi) => (
                                      <td key={vi} className="px-3 py-2 text-xs text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap max-w-[220px]" title={String(c[key] || "")}>
                                        {c[key] || "—"}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </ScrollArea>
                      );
                    })()}

                    <div className="px-4 py-2 border-t border-border/30 bg-muted/10 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">Total: {importedContacts.length} leads</span>
                      {(() => {
                        const activeLabels = varLabels.filter((_, vi) => importedContacts.some((c) => c[`var${vi + 1}` as keyof ImportedRow]));
                        return activeLabels.length > 0 ? (
                          <span className="text-[10px] text-muted-foreground">Variáveis: {activeLabels.join(", ")}</span>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <Button onClick={() => createJob.mutate()} disabled={createJob.isPending || phones.length === 0 || selectedDevices.length === 0}>
                {createJob.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Play className="w-4 h-4 mr-1.5" />}
                {createJob.isPending ? "Criando..." : `Criar Campanha (${phones.length})`}
                {selectedDevices.length > 1 && ` · ${selectedDevices.length} chips`}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Hidden file input */}
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleSpreadsheetImport(file);
            e.target.value = "";
          }}
        />

        {/* Column Mapping Dialog */}
        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
           <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Variable className="w-5 h-5 text-primary" /> Mapear Colunas</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">Indique qual coluna corresponde a cada campo. Pelo menos "Telefone" é obrigatório.</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[200px] overflow-y-auto pr-1">
              {importHeaders.map((header, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-sm font-medium min-w-[100px] truncate" title={header}>{header || `Coluna ${idx + 1}`}</span>
                  <Select value={columnMappings[idx] || "ignorar"} onValueChange={(v) => {
                    const newMaps = [...columnMappings];
                    newMaps[idx] = v as ColMapping;
                    setColumnMappings(newMaps);
                  }}>
                    <SelectTrigger className="flex-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MAPPING_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {/* Preview — show more rows with scroll */}
            {importRows.length > 0 && (
              <div className="rounded-lg border border-border/30 overflow-hidden flex-1 min-h-0">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-border/20">
                  <span className="text-xs font-medium text-muted-foreground">Prévia dos dados</span>
                  <span className="text-[10px] text-muted-foreground">{importRows.length} linhas total</span>
                </div>
                <ScrollArea className="h-[260px]">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs" style={{ minWidth: `${importHeaders.length * 140}px` }}>
                      <thead className="bg-muted/30 sticky top-0 z-10">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[40px]">#</th>
                          {importHeaders.map((h, i) => (
                            <th key={i} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {importRows.map((row, ri) => (
                          <tr key={ri} className="hover:bg-muted/10 transition-colors">
                            <td className="px-3 py-1.5 text-muted-foreground/50 text-[10px]">{ri + 1}</td>
                            {row.map((cell: any, ci: number) => (
                              <td key={ci} className="px-3 py-1.5 text-foreground/80 whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]" title={String(cell || "")}>
                                {String(cell || "—")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ScrollArea>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Cancelar</Button>
              <Button onClick={confirmImport} disabled={!columnMappings.includes("telefone")}>
                Confirmar Importação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // ─── DETAIL VIEW ──────────────────────────
  // ═══════════════════════════════════════════
  if (view === "detail" && selectedJob) {
    const job = selectedJob as any;
    const total = job.total_phones || 0;
    const verified = (job.success_count || 0) + (job.no_whatsapp_count || 0) + (job.error_count || 0);
    const pct = total > 0 ? (verified / total) * 100 : 0;
    const validResults = sortedResults.filter((r: any) => r.status === "success");
    const isActive = job.status === "running" || job.status === "pending";
    const isPaused = job.status === "paused";
    const canResume = isPaused || job.status === "failed";
    const jobDeviceIds: string[] = Array.isArray(job.device_ids) && job.device_ids.length > 0 ? job.device_ids : job.device_id ? [job.device_id] : [];
    const jobDevices = jobDeviceIds.map((id: string) => getDeviceInfo(id)).filter(Boolean);
    const deviceInfo = getDeviceInfo(job.device_id);
    const deviceIsOnline = deviceInfo && ACTIVE_DEVICE_STATUSES.includes(deviceInfo.status);

    // Detect which var columns have data
    const activeVars = [1, 2, 3, 4, 5].filter((n) => sortedResults.some((r: any) => r[`var${n}`]));

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
              {resultsHaveVars && <Badge variant="outline" className="text-[10px] border-primary/30 text-primary"><Variable className="w-3 h-3 mr-1" /> Com variáveis</Badge>}
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

        {/* Instance info — compact */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Smartphone className="w-4 h-4" />
            <span className="font-medium text-foreground">{jobDevices.length} instância{jobDevices.length !== 1 ? "s" : ""}</span>
            <span>·</span>
            <span>{jobDevices.filter((d: any) => ACTIVE_DEVICE_STATUSES.includes(d.status)).length} online</span>
          </div>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowSwapPanel(!showSwapPanel)}>
            {showSwapPanel ? "Fechar" : "Gerenciar"}
          </Button>
        </div>

        {job.last_error && (isPaused || job.status === "failed") && (
          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {job.last_error}
          </div>
        )}

        {/* Manage panel — toggle devices on/off */}
        {showSwapPanel && (
          <Card className="border-border/50 bg-card/50">
            <CardContent className="py-4 space-y-3">
              <p className="text-xs text-muted-foreground">Marque ou desmarque instâncias para esta campanha. Ao remover, a campanha pausa automaticamente.</p>
              <ScrollArea className="max-h-[280px]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {allDevices.filter((d: any) => d.uazapi_base_url && ACTIVE_DEVICE_STATUSES.includes(d.status)).map((d: any) => {
                    const isOn = ACTIVE_DEVICE_STATUSES.includes(d.status);
                    const isInJob = jobDeviceIds.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={async () => {
                          const newIds = isInJob
                            ? jobDeviceIds.filter((id: string) => id !== d.id)
                            : [...jobDeviceIds, d.id];
                          if (newIds.length === 0) { toast.error("Mínimo 1 instância"); return; }
                          // Auto-pause when removing a device to avoid errors
                          if (isInJob && (job.status === "running" || job.status === "pending")) {
                            await supabase.from("verify_jobs").update({ status: "paused" } as any).eq("id", job.id);
                            toast.info("Campanha pausada para trocar instâncias");
                          }
                          updateJobDevices.mutate({ jobId: job.id, deviceIds: newIds });
                        }}
                        disabled={updateJobDevices.isPending}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm transition-all ${
                          isInJob
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border/50 bg-background/50 text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                          isInJob ? "border-primary bg-primary" : "border-muted-foreground/40"
                        }`}>
                          {isInJob && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                        </div>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${isOn ? "bg-emerald-400" : "bg-red-400"}`} />
                        <span className="truncate">{d.name}{d.number ? ` (${d.number})` : ""}</span>
                        {!isOn && <span className="text-[10px] text-red-400/70 ml-auto">Offline</span>}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

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
        {sortedResults.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={validResults.length === 0} onClick={() => {
              const headerCols = ["Número"];
              if (activeVars.length > 0) activeVars.forEach((n) => headerCols.push(`Var${n}`));
              const header = "\uFEFF" + headerCols.join(";") + "\n";
              const rows = validResults.map((r: any) => {
                const cols = [r.phone];
                if (activeVars.length > 0) activeVars.forEach((n) => cols.push(r[`var${n}`] || ""));
                return cols.join(";");
              }).join("\n");
              const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
              triggerDownload(blob, `validos_${job.name.replace(/\s+/g, "_")}.csv`);
            }}><Download className="w-3.5 h-3.5 mr-1.5" /> Exportar válidos ({validResults.length})</Button>

            <Button variant="outline" size="sm" onClick={() => {
              const headerCols = ["Número", "Status"];
              if (activeVars.length > 0) activeVars.forEach((n) => headerCols.push(`Var${n}`));
              const header = "\uFEFF" + headerCols.join(";") + "\n";
              const rows = sortedResults.map((r: any) => {
                const cols = [r.phone, r.status];
                if (activeVars.length > 0) activeVars.forEach((n) => cols.push(r[`var${n}`] || ""));
                return cols.join(";");
              }).join("\n");
              const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
              triggerDownload(blob, `verificacao_${job.name.replace(/\s+/g, "_")}.csv`);
            }}><Download className="w-3.5 h-3.5 mr-1.5" /> Exportar tudo</Button>

            <Button
              variant="default"
              size="sm"
              disabled={validResults.length === 0}
              className="bg-primary hover:bg-primary/90 gap-1.5"
              onClick={async () => {
                if (!user || validResults.length === 0) return;
                try {
                  // Fetch existing phones to avoid duplicates
                  const phonesToCheck = validResults.map((r: any) => r.phone);
                  const { data: existing } = await supabase
                    .from("contacts")
                    .select("phone")
                    .eq("user_id", user.id)
                    .in("phone", phonesToCheck.slice(0, 1000));
                  const existingSet = new Set((existing || []).map((c: any) => c.phone));

                  const newContacts = validResults.filter((r: any) => !existingSet.has(r.phone));
                  if (newContacts.length === 0) {
                    toast.info("Todos os números já estão nos seus contatos!");
                    return;
                  }

                  const batchSize = 200;
                  let inserted = 0;
                  for (let i = 0; i < newContacts.length; i += batchSize) {
                    const batch = newContacts.slice(i, i + batchSize).map((r: any) => ({
                      user_id: user.id,
                      phone: r.phone,
                      name: r.var1 || r.phone,
                      var1: r.var1 || "",
                      var2: r.var2 || "",
                      var3: r.var3 || "",
                      var4: r.var4 || "",
                      var5: r.var5 || "",
                      var6: "",
                      var7: "",
                      var8: "",
                      var9: "",
                      var10: "",
                    }));
                    const { error } = await supabase.from("contacts").insert(batch);
                    if (error) throw error;
                    inserted += batch.length;
                  }
                  toast.success(`${inserted} contatos adicionados! (${existingSet.size > 0 ? existingSet.size + " já existiam" : "nenhum duplicado"})`);
                } catch (err: any) {
                  toast.error("Erro ao importar: " + (err?.message || ""));
                }
              }}
            >
              <Users className="w-3.5 h-3.5" /> Adicionar aos Contatos ({validResults.length})
            </Button>

            {(() => {
              const pendingResults = sortedResults.filter((r: any) => r.status === "pending");
              if (pendingResults.length === 0) return null;
              return (
                <Button variant="outline" size="sm" onClick={() => {
                  const headerCols = ["Número"];
                  if (activeVars.length > 0) activeVars.forEach((n) => headerCols.push(`Var${n}`));
                  const header = "\uFEFF" + headerCols.join(";") + "\n";
                  const rows = pendingResults.map((r: any) => {
                    const cols = [r.phone];
                    if (activeVars.length > 0) activeVars.forEach((n) => cols.push(r[`var${n}`] || ""));
                    return cols.join(";");
                  }).join("\n");
                  const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
                  triggerDownload(blob, `pendentes_${job.name.replace(/\s+/g, "_")}.csv`);
                }}><Download className="w-3.5 h-3.5 mr-1.5" /> Exportar pendentes ({pendingResults.length})</Button>
              );
            })()}
          </div>
        )}

        {/* Results table */}
        {sortedResults.length > 0 && (
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="pb-3"><CardTitle className="text-base">Resultados ({sortedResults.length}{sortedResults.length >= 500 ? "+" : ""})</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <ScrollArea className="h-[400px]">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm table-fixed" style={{ minWidth: `${300 + activeVars.length * 200}px` }}>
                      <thead className="bg-muted/30 sticky top-0 z-10">
                        <tr>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-[160px]">Número</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-[120px]">Status</th>
                          {activeVars.map((n) => (
                            <th key={n} className="text-left px-4 py-2.5 font-medium text-muted-foreground w-[200px]">Var {n}</th>
                          ))}
                          {activeVars.length === 0 && (
                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Detalhe</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {sortedResults.map((result: any, i: number) => (
                          <tr key={i} className="hover:bg-muted/10 transition-colors">
                            <td className="px-4 py-2.5 font-mono text-foreground">{result.phone}</td>
                            <td className="px-4 py-2.5">{statusBadge(result.status)}</td>
                            {activeVars.map((n) => (
                              <td key={n} className="px-4 py-2.5 text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap" title={result[`var${n}`] || ""}>
                                {result[`var${n}`] || "—"}
                              </td>
                            ))}
                            {activeVars.length === 0 && (
                              <td className="px-4 py-2.5 text-muted-foreground">{result.detail || "—"}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ScrollArea>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // ─── LIST VIEW ────────────────────────────
  // ═══════════════════════════════════════════
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
            const listDeviceIds: string[] = Array.isArray(job.device_ids) && job.device_ids.length > 0 ? job.device_ids : job.device_id ? [job.device_id] : [];
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
                    <span className="flex items-center gap-1">
                      <Smartphone className="w-3 h-3" />
                      {listDeviceIds.length > 1 ? `${listDeviceIds.length} chips` : devInfo ? devInfo.name : "—"}
                    </span>
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
