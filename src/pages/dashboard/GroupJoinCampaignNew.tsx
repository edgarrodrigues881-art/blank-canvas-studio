import { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Link2, LogIn, Settings2, Shuffle, Play, Save,
  CheckCircle2, XCircle, AlertTriangle, Loader2, Search,
  Upload, FileSpreadsheet, ClipboardPaste, Users, Zap, Layers
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

/* ── Helpers ── */
function extractInviteCode(link: string): string | null {
  try {
    const cleaned = link.trim();
    if (!cleaned.includes("chat.whatsapp.com/")) return null;
    const code = cleaned.split("chat.whatsapp.com/")[1]?.split("?")[0]?.split("/")[0]?.trim();
    return code && code.length >= 10 ? code : null;
  } catch { return null; }
}

function normalizeLink(link: string): string {
  let l = link.trim();
  if (l.startsWith("http://")) l = l.replace("http://", "https://");
  if (!l.startsWith("https://") && l.includes("chat.whatsapp.com/")) l = "https://" + l;
  return l;
}

type ParsedResult = {
  valid: string[];
  invalid: string[];
  duplicatesRemoved: number;
  total: number;
};

function parseLinks(raw: string): ParsedResult {
  const lines = raw.split("\n").map(l => normalizeLink(l)).filter(Boolean);
  const total = lines.length;
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const l of lines) {
    const code = extractInviteCode(l);
    const key = code || l;
    if (!seen.has(key)) { seen.add(key); unique.push(l); }
  }
  const duplicatesRemoved = total - unique.length;
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const l of unique) {
    if (extractInviteCode(l)) valid.push(l);
    else invalid.push(l);
  }
  return { valid, invalid, duplicatesRemoved, total };
}

export default function GroupJoinCampaignNew() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  // Campaign config
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [linksRaw, setLinksRaw] = useState("");
  const [importTab, setImportTab] = useState("paste");

  // Distribution mode
  const [distributionMode, setDistributionMode] = useState<"single" | "distribute">("distribute");

  // Execution config
  const [minDelay, setMinDelay] = useState(40);
  const [maxDelay, setMaxDelay] = useState(90);
  const [pauseEvery, setPauseEvery] = useState(20);
  const [pauseDuration, setPauseDuration] = useState(900); // 15min
  const [limitPerInstance, setLimitPerInstance] = useState(0); // 0 = unlimited
  const [skipFailFast, setSkipFailFast] = useState(true);
  const [shuffleLinks, setShuffleLinks] = useState(false);
  const [validateBefore, setValidateBefore] = useState(false);

  // Devices
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [deviceSearch, setDeviceSearch] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: devices = [] } = useQuery({
    queryKey: ["devices-for-group-join"],
    queryFn: async () => {
      const { data } = await supabase
        .from("devices")
        .select("id, name, number, status")
        .eq("user_id", user!.id)
        .neq("login_type", "report_wa")
        .order("name");
      return data || [];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const onlineDevices = devices.filter(d => ["Connected", "Ready", "authenticated"].includes(d.status));
  const parsedLinks = useMemo(() => parseLinks(linksRaw), [linksRaw]);

  const filteredDevices = useMemo(() => {
    const sorted = [...devices].sort((a, b) => {
      const aOn = ["Connected", "Ready", "authenticated"].includes(a.status) ? 0 : 1;
      const bOn = ["Connected", "Ready", "authenticated"].includes(b.status) ? 0 : 1;
      if (aOn !== bOn) return aOn - bOn;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
    if (!deviceSearch) return sorted;
    return sorted.filter(d =>
      d.name.toLowerCase().includes(deviceSearch.toLowerCase()) || d.number?.includes(deviceSearch)
    );
  }, [devices, deviceSearch]);

  const toggleDevice = (id: string) => {
    setSelectedDevices(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  };

  // Distribution preview
  const distributionPreview = useMemo(() => {
    if (selectedDevices.length === 0 || parsedLinks.valid.length === 0) return [];
    if (distributionMode === "single") {
      return selectedDevices.map(id => ({
        id,
        name: devices.find(d => d.id === id)?.name || id,
        count: parsedLinks.valid.length,
      }));
    }
    // distribute evenly
    const perInstance = Math.floor(parsedLinks.valid.length / selectedDevices.length);
    const remainder = parsedLinks.valid.length % selectedDevices.length;
    return selectedDevices.map((id, i) => ({
      id,
      name: devices.find(d => d.id === id)?.name || id,
      count: perInstance + (i < remainder ? 1 : 0),
    }));
  }, [selectedDevices, parsedLinks.valid.length, distributionMode, devices]);

  const totalQueueItems = useMemo(() => {
    if (distributionMode === "single") {
      return selectedDevices.length * parsedLinks.valid.length;
    }
    return parsedLinks.valid.length;
  }, [distributionMode, selectedDevices.length, parsedLinks.valid.length]);

  // CSV/Excel handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        const links: string[] = [];
        for (const row of rows) {
          if (!Array.isArray(row)) continue;
          for (const cell of row) {
            const val = String(cell || "").trim();
            if (val.includes("chat.whatsapp.com/")) {
              links.push(normalizeLink(val));
            }
          }
        }

        if (links.length === 0) {
          toast.error("Nenhum link de grupo encontrado no arquivo");
          return;
        }

        setLinksRaw(prev => {
          const existing = prev.trim();
          return existing ? existing + "\n" + links.join("\n") : links.join("\n");
        });
        toast.success(`${links.length} links importados do arquivo`);
      } catch {
        toast.error("Erro ao processar arquivo");
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const canSubmit = name.trim() && parsedLinks.valid.length > 0 && selectedDevices.length > 0 && !isSubmitting;

  const handleSubmit = async (startNow: boolean) => {
    if (!user || !canSubmit) return;

    const hasOffline = selectedDevices.some(id => {
      const d = devices.find(dev => dev.id === id);
      return d && !["Connected", "Ready", "authenticated"].includes(d.status);
    });
    if (hasOffline) {
      toast.error("Remova instâncias desconectadas antes de continuar");
      return;
    }

    setIsSubmitting(true);
    try {
      let links = [...parsedLinks.valid];
      if (shuffleLinks) links.sort(() => Math.random() - 0.5);

      // Build queue based on distribution mode
      const queueItems: { device_id: string; device_name: string; group_link: string; group_name: string }[] = [];

      if (distributionMode === "single") {
        // Each device gets ALL links
        for (const deviceId of selectedDevices) {
          const dev = devices.find(d => d.id === deviceId);
          for (const link of links) {
            queueItems.push({
              device_id: deviceId,
              device_name: dev?.name || deviceId,
              group_link: link,
              group_name: link.split("chat.whatsapp.com/")[1]?.substring(0, 12) || link,
            });
          }
        }
      } else {
        // Distribute: each link goes to ONE device (round-robin)
        for (let i = 0; i < links.length; i++) {
          const deviceId = selectedDevices[i % selectedDevices.length];
          const dev = devices.find(d => d.id === deviceId);
          queueItems.push({
            device_id: deviceId,
            device_name: dev?.name || deviceId,
            group_link: links[i],
            group_name: links[i].split("chat.whatsapp.com/")[1]?.substring(0, 12) || links[i],
          });
        }
      }

      const status = startNow ? "running" : "draft";

      const { data: campData, error: campError } = await supabase
        .from("group_join_campaigns" as any)
        .insert({
          user_id: user.id,
          name: name.trim(),
          description: description.trim(),
          status,
          total_items: queueItems.length,
          device_ids: selectedDevices,
          group_links: links,
          min_delay: minDelay,
          max_delay: maxDelay,
          pause_every: pauseEvery,
          pause_duration: pauseDuration,
        } as any)
        .select("id")
        .single();

      if (campError) throw campError;
      const campaignId = (campData as any)?.id;

      // Insert in batches of 500
      const batchSize = 500;
      for (let i = 0; i < queueItems.length; i += batchSize) {
        const batch = queueItems.slice(i, i + batchSize);
        const { error: queueError } = await supabase
          .from("group_join_queue" as any)
          .insert(batch.map(item => ({
            campaign_id: campaignId,
            user_id: user.id,
            ...item,
            status: "pending",
          })) as any);
        if (queueError) throw queueError;
      }

      if (startNow) {
        supabase.functions.invoke("process-group-join-campaign", { body: { campaign_id: campaignId } }).catch(() => {});
      }

      toast.success(startNow ? "Campanha iniciada!" : "Campanha salva como rascunho");
      navigate("/dashboard/group-join");
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar campanha");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/group-join")} className="rounded-xl h-9 w-9">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground">Nova Campanha de Entrada</h1>
          <p className="text-xs text-muted-foreground">Configure a importação, instâncias e regras de execução</p>
        </div>
      </div>

      {/* Block 1 — Campaign Info */}
      <div className="rounded-2xl border border-border/20 bg-card/80 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <LogIn className="w-4 h-4 text-primary" /> Informações da Campanha
        </h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome da campanha *</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Grupos de vendas - Lote 1" className="rounded-xl" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Descrição (opcional)</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Observações sobre esta campanha" className="rounded-xl" />
          </div>
        </div>
      </div>

      {/* Block 2 — Import Links */}
      <div className="rounded-2xl border border-border/20 bg-card/80 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary" /> Importar Links dos Grupos
        </h2>

        <Tabs value={importTab} onValueChange={setImportTab}>
          <TabsList className="bg-muted/10 border border-border/15 rounded-xl p-1 h-auto">
            <TabsTrigger value="paste" className="text-xs rounded-lg gap-1.5 px-3 py-1.5">
              <ClipboardPaste className="w-3.5 h-3.5" /> Colar
            </TabsTrigger>
            <TabsTrigger value="file" className="text-xs rounded-lg gap-1.5 px-3 py-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5" /> CSV / Excel
            </TabsTrigger>
          </TabsList>

          <TabsContent value="paste" className="mt-3">
            <Textarea
              value={linksRaw}
              onChange={e => setLinksRaw(e.target.value)}
              placeholder={"Cole aqui os links, um por linha:\n\nhttps://chat.whatsapp.com/xxxx\nhttps://chat.whatsapp.com/yyyy"}
              rows={7}
              className="rounded-xl font-mono text-xs"
            />
          </TabsContent>

          <TabsContent value="file" className="mt-3">
            <div className="border-2 border-dashed border-border/20 rounded-xl p-8 text-center hover:border-primary/30 transition-colors">
              <Upload className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-xs text-muted-foreground/60 mb-3">
                Arraste ou clique para importar <strong>.csv</strong> ou <strong>.xlsx</strong>
              </p>
              <p className="text-[10px] text-muted-foreground/40 mb-4">
                O sistema detecta automaticamente a coluna com links do WhatsApp
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button variant="outline" size="sm" className="rounded-xl text-xs gap-1.5" onClick={() => fileRef.current?.click()}>
                <Upload className="w-3.5 h-3.5" /> Selecionar Arquivo
              </Button>
            </div>
            {linksRaw && (
              <div className="mt-3">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Links importados (editável)</label>
                <Textarea
                  value={linksRaw}
                  onChange={e => setLinksRaw(e.target.value)}
                  rows={5}
                  className="rounded-xl font-mono text-xs"
                />
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Validation Summary */}
        {linksRaw.trim() && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className="gap-1.5 bg-muted/10 text-muted-foreground border-border/20">
              {parsedLinks.total} importados
            </Badge>
            {parsedLinks.valid.length > 0 && (
              <Badge variant="outline" className="gap-1.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3" /> {parsedLinks.valid.length} válidos
              </Badge>
            )}
            {parsedLinks.invalid.length > 0 && (
              <Badge variant="outline" className="gap-1.5 bg-destructive/10 text-destructive border-destructive/20">
                <XCircle className="w-3 h-3" /> {parsedLinks.invalid.length} inválidos
              </Badge>
            )}
            {parsedLinks.duplicatesRemoved > 0 && (
              <Badge variant="outline" className="gap-1.5 bg-amber-500/10 text-amber-600 border-amber-500/20">
                <AlertTriangle className="w-3 h-3" /> {parsedLinks.duplicatesRemoved} duplicados removidos
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Block 3 — Instances & Distribution */}
      <div className="rounded-2xl border border-border/20 bg-card/80 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> Instâncias & Modo de Entrada
          </h2>
          {onlineDevices.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => setSelectedDevices(prev => prev.length === onlineDevices.length ? [] : onlineDevices.map(d => d.id))}
            >
              {selectedDevices.length === onlineDevices.length ? "Desmarcar" : "Todas online"}
            </Button>
          )}
        </div>

        {/* Distribution Mode */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setDistributionMode("single")}
            className={`rounded-xl border p-3 text-left transition-all ${
              distributionMode === "single"
                ? "border-primary/30 bg-primary/5"
                : "border-border/20 hover:border-border/30"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Zap className={`w-4 h-4 ${distributionMode === "single" ? "text-primary" : "text-muted-foreground/40"}`} />
              <span className="text-xs font-semibold text-foreground">Instância Única</span>
            </div>
            <p className="text-[10px] text-muted-foreground/60">Cada instância processa todos os links</p>
          </button>
          <button
            onClick={() => setDistributionMode("distribute")}
            className={`rounded-xl border p-3 text-left transition-all ${
              distributionMode === "distribute"
                ? "border-primary/30 bg-primary/5"
                : "border-border/20 hover:border-border/30"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Layers className={`w-4 h-4 ${distributionMode === "distribute" ? "text-primary" : "text-muted-foreground/40"}`} />
              <span className="text-xs font-semibold text-foreground">Distribuição</span>
            </div>
            <p className="text-[10px] text-muted-foreground/60">1 grupo = 1 instância, dividido igualmente</p>
          </button>
        </div>

        {/* Device search */}
        {devices.length > 5 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
            <Input value={deviceSearch} onChange={e => setDeviceSearch(e.target.value)} placeholder="Buscar instância..." className="pl-9 rounded-xl h-9 text-xs" />
          </div>
        )}

        <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
          {filteredDevices.map(d => {
            const online = ["Connected", "Ready", "authenticated"].includes(d.status);
            return (
              <label
                key={d.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                  !online ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                } ${
                  selectedDevices.includes(d.id) ? "bg-primary/5 border border-primary/20" : "hover:bg-muted/30 border border-transparent"
                }`}
              >
                <Checkbox
                  checked={selectedDevices.includes(d.id)}
                  disabled={!online}
                  onCheckedChange={() => online && toggleDevice(d.id)}
                />
                <div className={`w-2 h-2 rounded-full shrink-0 ${online ? "bg-emerald-400" : "bg-destructive/50"}`} />
                <span className="text-xs font-medium truncate flex-1">{d.name}</span>
                <span className="text-[10px] text-muted-foreground/50 font-mono">{d.number}</span>
                {!online && <span className="text-[9px] text-destructive/60 font-medium shrink-0">Offline</span>}
              </label>
            );
          })}
        </div>

        {/* Distribution Preview */}
        {distributionPreview.length > 0 && (
          <div className="bg-muted/5 rounded-xl border border-border/10 p-3 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              Prévia de distribuição
            </p>
            {distributionPreview.map(dp => (
              <div key={dp.id} className="flex items-center justify-between text-xs">
                <span className="text-foreground/80 truncate">{dp.name}</span>
                <span className="font-mono text-primary font-semibold">{dp.count} grupos</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-xs pt-1.5 border-t border-border/10">
              <span className="font-semibold text-foreground">Total de operações</span>
              <span className="font-mono font-bold text-primary">{totalQueueItems}</span>
            </div>
          </div>
        )}
      </div>

      {/* Block 4 — Execution Config */}
      <div className="rounded-2xl border border-border/20 bg-card/80 p-5 space-y-5">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary" /> Configurações de Execução
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Delay mínimo: {minDelay}s</label>
            <Slider value={[minDelay]} onValueChange={([v]) => { setMinDelay(v); if (v > maxDelay) setMaxDelay(v); }} min={5} max={180} step={1} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Delay máximo: {maxDelay}s</label>
            <Slider value={[maxDelay]} onValueChange={([v]) => { setMaxDelay(v); if (v < minDelay) setMinDelay(v); }} min={5} max={180} step={1} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Pausar a cada: {pauseEvery} tentativas</label>
            <Slider value={[pauseEvery]} onValueChange={([v]) => setPauseEvery(v)} min={3} max={50} step={1} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Duração da pausa: {Math.floor(pauseDuration / 60)}min</label>
            <Slider value={[pauseDuration]} onValueChange={([v]) => setPauseDuration(v)} min={60} max={1800} step={30} />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-2 block">Limite por instância (0 = sem limite)</label>
          <Input
            type="number"
            min={0}
            value={limitPerInstance}
            onChange={e => setLimitPerInstance(Math.max(0, parseInt(e.target.value) || 0))}
            className="rounded-xl w-32 text-xs"
            placeholder="0"
          />
        </div>

        <div className="space-y-2.5">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <Checkbox checked={shuffleLinks} onCheckedChange={(v) => setShuffleLinks(!!v)} />
            <Shuffle className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Embaralhar ordem dos links</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <Checkbox checked={skipFailFast} onCheckedChange={(v) => setSkipFailFast(!!v)} />
            <Zap className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Ao falhar validação, pular com delay curto</span>
          </label>
        </div>
      </div>

      {/* Summary */}
      {canSubmit && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <h3 className="text-xs font-semibold text-foreground mb-2">Resumo da Campanha</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground/60 block">Links válidos</span>
              <span className="font-bold text-foreground">{parsedLinks.valid.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground/60 block">Instâncias</span>
              <span className="font-bold text-foreground">{selectedDevices.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground/60 block">Modo</span>
              <span className="font-bold text-foreground">{distributionMode === "single" ? "Única" : "Distribuição"}</span>
            </div>
            <div>
              <span className="text-muted-foreground/60 block">Total operações</span>
              <span className="font-bold text-primary">{totalQueueItems}</span>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          onClick={() => handleSubmit(false)}
          variant="outline"
          disabled={!canSubmit}
          className="flex-1 gap-2 rounded-xl h-11"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar Rascunho
        </Button>
        <Button
          onClick={() => handleSubmit(true)}
          disabled={!canSubmit}
          className="flex-1 gap-2 rounded-xl h-11 shadow-md"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Iniciar Campanha
        </Button>
      </div>
    </div>
  );
}
