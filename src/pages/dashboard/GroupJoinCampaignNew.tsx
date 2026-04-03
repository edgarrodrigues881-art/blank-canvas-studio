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
  ArrowLeft, Link2, LogIn, Settings2, Shuffle, Play, Save,
  CheckCircle2, XCircle, AlertTriangle, Loader2, Search,
  Upload, FileSpreadsheet, ClipboardPaste, Users, Zap, Layers
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

/* ── Helpers ── */
const LINK_REGEX = /(?:https?:\/\/)?chat\.whatsapp\.com\/[A-Za-z0-9_-]+(?:\?[^\s]*)?/gi;
const TRAILING_LINK_NOISE_REGEX = /[),.;:!?\]\}"'>]+$/g;

function stripTrailingLinkNoise(value: string): string {
  return value.trim().replace(TRAILING_LINK_NOISE_REGEX, "");
}

function extractInviteCode(link: string): string | null {
  try {
    const cleaned = stripTrailingLinkNoise(link)
      .replace(/^https?:\/\//i, "")
      .replace(/^chat\.whatsapp\.com\//i, "");
    const code = cleaned.split(/[/?#\s]/)[0]?.trim();
    return code && /^[A-Za-z0-9_-]{10,}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

function normalizeLink(link: string): string {
  const candidate = stripTrailingLinkNoise(String(link || "").trim());
  if (!candidate) return "";
  const matched = candidate.match(/((?:https?:\/\/)?chat\.whatsapp\.com\/[^\s]+)/i)?.[1] ?? candidate;
  const inviteCode = extractInviteCode(matched);
  if (!inviteCode) return stripTrailingLinkNoise(matched.replace(/^http:\/\//i, "https://"));
  return `https://chat.whatsapp.com/${inviteCode}`;
}

function extractLinksFromText(raw: string): string[] {
  return (raw.match(LINK_REGEX) || []).map(normalizeLink).filter(Boolean);
}

type ParsedResult = { valid: string[]; invalid: string[]; duplicatesRemoved: number; total: number };

function parseLinks(raw: string): ParsedResult {
  const lines = raw
    .split("\n")
    .flatMap((line) => {
      const extracted = extractLinksFromText(line);
      if (extracted.length > 0) return extracted;
      const normalized = normalizeLink(line);
      return normalized ? [normalized] : [];
    })
    .filter(Boolean);
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
    if (extractInviteCode(l)) valid.push(l); else invalid.push(l);
  }
  return { valid, invalid, duplicatesRemoved, total };
}

export default function GroupJoinCampaignNew() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const description = "";
  const [linksRaw, setLinksRaw] = useState("");
  const [importTab, setImportTab] = useState("paste");
  const [distributionMode, setDistributionMode] = useState<"single" | "distribute">("distribute");
  const [minDelay, setMinDelay] = useState(40);
  const [maxDelay, setMaxDelay] = useState(90);
  const [pauseEvery, setPauseEvery] = useState(20);
  const [pauseDuration, setPauseDuration] = useState(900);
  const [limitPerInstance, setLimitPerInstance] = useState(0);
  const [skipFailFast, setSkipFailFast] = useState(true);
  const shuffleLinks = false;
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [deviceSearch, setDeviceSearch] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: devices = [] } = useQuery({
    queryKey: ["devices-for-group-join"],
    queryFn: async () => {
      const { data } = await supabase.from("devices").select("id, name, number, status").eq("user_id", user!.id).neq("login_type", "report_wa").order("name");
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
    return sorted.filter(d => d.name.toLowerCase().includes(deviceSearch.toLowerCase()) || d.number?.includes(deviceSearch));
  }, [devices, deviceSearch]);

  const toggleDevice = (id: string) => {
    setSelectedDevices(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  };

  const distributionPreview = useMemo(() => {
    if (selectedDevices.length === 0 || parsedLinks.valid.length === 0) return [];
    if (distributionMode === "single") {
      return selectedDevices.map(id => ({ id, name: devices.find(d => d.id === id)?.name || id, count: parsedLinks.valid.length }));
    }
    if (limitPerInstance > 0) {
      // Each instance gets up to limitPerInstance links, then rotates
      const counts = new Map<string, number>();
      selectedDevices.forEach(id => counts.set(id, 0));
      let idx = 0;
      for (let i = 0; i < parsedLinks.valid.length; i++) {
        const deviceId = selectedDevices[idx % selectedDevices.length];
        counts.set(deviceId, (counts.get(deviceId) || 0) + 1);
        if ((counts.get(deviceId) || 0) % limitPerInstance === 0) idx++;
      }
      return selectedDevices.map(id => ({ id, name: devices.find(d => d.id === id)?.name || id, count: counts.get(id) || 0 }));
    }
    const perInstance = Math.floor(parsedLinks.valid.length / selectedDevices.length);
    const remainder = parsedLinks.valid.length % selectedDevices.length;
    return selectedDevices.map((id, i) => ({ id, name: devices.find(d => d.id === id)?.name || id, count: perInstance + (i < remainder ? 1 : 0) }));
  }, [selectedDevices, parsedLinks.valid.length, distributionMode, devices, limitPerInstance]);

  const totalQueueItems = useMemo(() => {
    if (distributionMode === "single") return selectedDevices.length * parsedLinks.valid.length;
    return parsedLinks.valid.length;
  }, [distributionMode, selectedDevices.length, parsedLinks.valid.length]);

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
            if (val.includes("chat.whatsapp.com/")) links.push(...extractLinksFromText(val));
          }
        }
        if (links.length === 0) { toast.error("Nenhum link encontrado no arquivo"); return; }
        setLinksRaw(prev => { const existing = prev.trim(); return existing ? existing + "\n" + links.join("\n") : links.join("\n"); });
        toast.success(`${links.length} links importados`);
      } catch { toast.error("Erro ao processar arquivo"); }
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
    if (hasOffline) { toast.error("Remova instâncias desconectadas antes de continuar"); return; }

    setIsSubmitting(true);
    try {
      let links = [...parsedLinks.valid];
      if (shuffleLinks) links.sort(() => Math.random() - 0.5);

      const queueItems: { device_id: string; device_name: string; group_link: string; group_name: string }[] = [];
      if (distributionMode === "single") {
        for (const deviceId of selectedDevices) {
          const dev = devices.find(d => d.id === deviceId);
          for (const link of links) {
            queueItems.push({ device_id: deviceId, device_name: dev?.name || deviceId, group_link: link, group_name: extractInviteCode(link)?.substring(0, 12) || link });
          }
        }
      } else {
        // Distribute with optional limit per instance
        let idx = 0;
        let countOnCurrent = 0;
        for (let i = 0; i < links.length; i++) {
          const deviceId = selectedDevices[idx % selectedDevices.length];
          const dev = devices.find(d => d.id === deviceId);
          queueItems.push({ device_id: deviceId, device_name: dev?.name || deviceId, group_link: links[i], group_name: extractInviteCode(links[i])?.substring(0, 12) || links[i] });
          countOnCurrent++;
          if (limitPerInstance > 0 && countOnCurrent >= limitPerInstance) {
            idx++;
            countOnCurrent = 0;
          }
        }
      }

      const status = startNow ? "running" : "draft";
      const { data: campData, error: campError } = await supabase
        .from("group_join_campaigns" as any)
        .insert({ user_id: user.id, name: name.trim(), description: description.trim(), status, total_items: queueItems.length, device_ids: selectedDevices, group_links: links, min_delay: minDelay, max_delay: maxDelay, pause_every: pauseEvery, pause_duration: pauseDuration, limit_per_instance: limitPerInstance > 0 ? limitPerInstance : null } as any)
        .select("id").single();
      if (campError) throw campError;
      const campaignId = (campData as any)?.id;

      const batchSize = 500;
      for (let i = 0; i < queueItems.length; i += batchSize) {
        const batch = queueItems.slice(i, i + batchSize);
        const { error: queueError } = await supabase.from("group_join_queue" as any).insert(batch.map(item => ({ campaign_id: campaignId, user_id: user.id, ...item, status: "pending" })) as any);
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
    <div className="mx-auto w-full max-w-7xl px-4 pb-12 sm:px-6 lg:px-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/group-join")} className="rounded-xl h-10 w-10">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Nova Campanha</h1>
          <p className="text-sm text-muted-foreground">Configure importação, instâncias e regras de execução</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left Column */}
        <div className="xl:col-span-7 space-y-6">
          {/* Campaign Info */}
          <section className="rounded-2xl border border-border/30 bg-card p-6 space-y-4">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <LogIn className="w-4 h-4 text-primary" />
              </div>
              <h2 className="text-sm font-bold text-foreground">Informações</h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nome da campanha *</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Grupos de vendas — Lote 1" className="rounded-xl h-10" />
              </div>
            </div>
          </section>

          {/* Import Links */}
          <section className="rounded-2xl border border-border/30 bg-card p-6 space-y-4">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <Link2 className="w-4 h-4 text-primary" />
              </div>
              <h2 className="text-sm font-bold text-foreground">Importar Links</h2>
            </div>

            <Tabs value={importTab} onValueChange={setImportTab}>
              <TabsList className="bg-muted/20 border border-border/20 rounded-xl p-1 h-auto w-full">
                <TabsTrigger value="paste" className="text-xs rounded-lg gap-1.5 px-4 py-2 flex-1">
                  <ClipboardPaste className="w-3.5 h-3.5" /> Colar Links
                </TabsTrigger>
                <TabsTrigger value="file" className="text-xs rounded-lg gap-1.5 px-4 py-2 flex-1">
                  <FileSpreadsheet className="w-3.5 h-3.5" /> CSV / Excel
                </TabsTrigger>
              </TabsList>

              <TabsContent value="paste" className="mt-3">
                <Textarea
                  value={linksRaw}
                  onChange={e => setLinksRaw(e.target.value)}
                  placeholder={"Cole os links aqui, um por linha:\n\nhttps://chat.whatsapp.com/xxxx\nhttps://chat.whatsapp.com/yyyy"}
                  rows={8}
                  className="rounded-xl font-mono text-xs leading-relaxed"
                />
              </TabsContent>

              <TabsContent value="file" className="mt-3">
                <div className="border-2 border-dashed border-border/25 rounded-xl p-10 text-center hover:border-primary/30 transition-colors">
                  <Upload className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-xs text-muted-foreground mb-1">Arraste ou clique para importar</p>
                  <p className="text-[10px] text-muted-foreground/50 mb-4">Formatos: .csv, .xlsx — links detectados automaticamente</p>
                  <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} className="hidden" />
                  <Button variant="outline" size="sm" className="rounded-xl text-xs gap-1.5" onClick={() => fileRef.current?.click()}>
                    <Upload className="w-3.5 h-3.5" /> Selecionar Arquivo
                  </Button>
                </div>
                {linksRaw && (
                  <div className="mt-3">
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Links importados (editável)</label>
                    <Textarea value={linksRaw} onChange={e => setLinksRaw(e.target.value)} rows={5} className="rounded-xl font-mono text-xs" />
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* Validation Summary */}
            {linksRaw.trim() && (
              <div className="rounded-xl border border-border/20 bg-muted/10 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Análise dos links</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="text-center">
                    <p className="text-lg font-bold text-foreground">{parsedLinks.total}</p>
                    <p className="text-[10px] text-muted-foreground">Importados</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-primary">{parsedLinks.valid.length}</p>
                    <p className="text-[10px] text-muted-foreground">Válidos</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-lg font-bold ${parsedLinks.invalid.length > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{parsedLinks.invalid.length}</p>
                    <p className="text-[10px] text-muted-foreground">Inválidos</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-lg font-bold ${parsedLinks.duplicatesRemoved > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>{parsedLinks.duplicatesRemoved}</p>
                    <p className="text-[10px] text-muted-foreground">Duplicados</p>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right Column */}
        <div className="xl:col-span-5 space-y-6">
          {/* Instances */}
          <section className="rounded-2xl border border-border/30 bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Users className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-sm font-bold text-foreground">Instâncias</h2>
              </div>
              {onlineDevices.length > 0 && (
                <Button variant="ghost" size="sm" className="text-[10px] h-7" onClick={() => setSelectedDevices(prev => prev.length === onlineDevices.length ? [] : onlineDevices.map(d => d.id))}>
                  {selectedDevices.length === onlineDevices.length ? "Desmarcar" : "Todas online"}
                </Button>
              )}
            </div>

            {/* Mode */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { mode: "single" as const, label: "Instância Única", desc: "Todos os links por instância", icon: Zap },
                { mode: "distribute" as const, label: "Distribuição", desc: "1 grupo = 1 instância", icon: Layers },
              ].map(m => (
                <button
                  key={m.mode}
                  onClick={() => setDistributionMode(m.mode)}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    distributionMode === m.mode ? "border-primary/40 bg-primary/5 shadow-sm" : "border-border/20 hover:border-border/40"
                  }`}
                >
                  <m.icon className={`w-4 h-4 mb-1 ${distributionMode === m.mode ? "text-primary" : "text-muted-foreground/40"}`} />
                  <p className="text-xs font-semibold text-foreground">{m.label}</p>
                  <p className="text-[10px] text-muted-foreground/60">{m.desc}</p>
                </button>
              ))}
            </div>

            {devices.length > 5 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
                <Input value={deviceSearch} onChange={e => setDeviceSearch(e.target.value)} placeholder="Buscar instância..." className="pl-9 rounded-xl h-9 text-xs" />
              </div>
            )}

            <div className="max-h-48 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
              {filteredDevices.map(d => {
                const online = ["Connected", "Ready", "authenticated"].includes(d.status);
                return (
                  <label key={d.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${!online ? "opacity-40 cursor-not-allowed" : "cursor-pointer"} ${selectedDevices.includes(d.id) ? "bg-primary/5 border border-primary/20" : "hover:bg-muted/20 border border-transparent"}`}>
                    <Checkbox checked={selectedDevices.includes(d.id)} disabled={!online} onCheckedChange={() => online && toggleDevice(d.id)} />
                    <div className={`w-2 h-2 rounded-full shrink-0 ${online ? "bg-emerald-400" : "bg-destructive/50"}`} />
                    <span className="text-xs font-medium truncate flex-1">{d.name}</span>
                    <span className="text-[10px] text-muted-foreground/40 font-mono">{d.number}</span>
                  </label>
                );
              })}
            </div>

            {/* Distribution Preview */}
            {distributionPreview.length > 0 && (
              <div className="rounded-xl border border-border/15 bg-muted/10 p-3 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Distribuição</p>
                {distributionPreview.map(dp => (
                  <div key={dp.id} className="flex items-center justify-between text-xs">
                    <span className="text-foreground/80 truncate">{dp.name}</span>
                    <span className="font-mono text-primary font-bold">{dp.count}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-xs pt-2 border-t border-border/15">
                  <span className="font-semibold text-foreground">Total de operações</span>
                  <span className="font-mono font-bold text-primary">{totalQueueItems}</span>
                </div>
              </div>
            )}
          </section>

          {/* Execution Config */}
          <section className="rounded-2xl border border-border/30 bg-card p-6 space-y-5">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <Settings2 className="w-4 h-4 text-primary" />
              </div>
              <h2 className="text-sm font-bold text-foreground">Configurações</h2>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Delay mínimo (s)</label>
                  <Input type="number" min={0} value={minDelay || ""} onChange={e => { const v = parseInt(e.target.value) || 0; setMinDelay(v); if (v > maxDelay) setMaxDelay(v); }} className="rounded-xl w-28 text-xs h-9" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Delay máximo (s)</label>
                  <Input type="number" min={0} value={maxDelay || ""} onChange={e => { const v = parseInt(e.target.value) || 0; setMaxDelay(v); if (v < minDelay) setMinDelay(v); }} className="rounded-xl w-28 text-xs h-9" />
                </div>
              </div>


              {distributionMode === "distribute" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Troca de conta</label>
                  <Input
                    type="number"
                    min={1}
                    value={limitPerInstance || ""}
                    onChange={e => setLimitPerInstance(Math.max(0, parseInt(e.target.value) || 0))}
                    onBlur={() => { if (limitPerInstance < 1) setLimitPerInstance(1); }}
                    className="rounded-xl w-28 text-xs h-9"
                    placeholder="1"
                  />
                </div>
              )}

              {distributionMode === "single" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Pausar a cada (grupos)</label>
                    <Input type="number" min={0} value={pauseEvery || ""} onChange={e => setPauseEvery(Math.max(0, parseInt(e.target.value) || 0))} className="rounded-xl w-28 text-xs h-9" placeholder="0" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Duração da pausa (s)</label>
                    <Input type="number" min={0} value={pauseDuration || ""} onChange={e => setPauseDuration(Math.max(0, parseInt(e.target.value) || 0))} className="rounded-xl w-28 text-xs h-9" placeholder="0" />
                  </div>
                </div>
              )}

              <div className="space-y-2.5 pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <Checkbox checked={skipFailFast} onCheckedChange={(v) => setSkipFailFast(!!v)} />
                  <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Pular links que não funcionam</span>
                </label>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Summary + Actions — Full Width */}
      <div className="mt-8 space-y-4">
        {canSubmit && (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Resumo da campanha</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: "Links válidos", value: parsedLinks.valid.length },
                { label: "Instâncias", value: selectedDevices.length },
                { label: "Modo", value: distributionMode === "single" ? "Única" : "Distribuição" },
                { label: "Total operações", value: totalQueueItems, accent: true },
              ].map((s, i) => (
                <div key={i} className="text-center">
                  <p className={`text-xl font-bold ${s.accent ? 'text-primary' : 'text-foreground'}`}>{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="ghost" onClick={() => navigate("/dashboard/group-join")} className="rounded-xl h-12 px-6 text-sm">
            <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
          </Button>
          <div className="flex-1" />
          <Button onClick={() => handleSubmit(false)} variant="outline" disabled={!canSubmit} className="rounded-xl h-12 px-6 text-sm gap-2">
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Rascunho
          </Button>
          <Button onClick={() => handleSubmit(true)} disabled={!canSubmit} className="rounded-xl h-12 px-8 text-sm gap-2 shadow-lg">
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Iniciar Campanha
          </Button>
        </div>
      </div>
    </div>
  );
}
