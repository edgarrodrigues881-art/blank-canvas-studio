import { useState, useMemo } from "react";
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
import {
  ArrowLeft, Link2, LogIn, Settings2, Shuffle, Play,
  Save, CheckCircle2, XCircle, AlertTriangle, Loader2, Search
} from "lucide-react";
import { toast } from "sonner";

function extractInviteCode(link: string): string | null {
  try {
    const cleaned = link.trim();
    if (!cleaned.includes("chat.whatsapp.com/")) return null;
    const code = cleaned.split("chat.whatsapp.com/")[1]?.split("?")[0]?.split("/")[0]?.trim();
    return code && code.length >= 10 ? code : null;
  } catch { return null; }
}

export default function GroupJoinCampaignNew() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [linksRaw, setLinksRaw] = useState("");
  const [minDelay, setMinDelay] = useState(10);
  const [maxDelay, setMaxDelay] = useState(30);
  const [pauseEvery, setPauseEvery] = useState(5);
  const [pauseDuration, setPauseDuration] = useState(180);
  const [shuffle, setShuffle] = useState(false);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deviceSearch, setDeviceSearch] = useState("");

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
  });

  const onlineDevices = devices.filter((d) => ["Connected", "Ready", "authenticated"].includes(d.status));

  const parsedLinks = useMemo(() => {
    const lines = linksRaw.split("\n").map(l => l.trim()).filter(Boolean);
    const unique = [...new Set(lines)];
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const l of unique) {
      if (extractInviteCode(l)) valid.push(l);
      else invalid.push(l);
    }
    return { valid, invalid, duplicatesRemoved: lines.length - unique.length };
  }, [linksRaw]);

  const filteredDevices = devices.filter(d =>
    !deviceSearch || d.name.toLowerCase().includes(deviceSearch.toLowerCase()) || d.number?.includes(deviceSearch)
  );

  const toggleDevice = (id: string) => {
    setSelectedDevices(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
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
      let links = parsedLinks.valid;
      if (shuffle) {
        links = [...links].sort(() => Math.random() - 0.5);
      }

      const queueItems: { device_id: string; device_name: string; group_link: string; group_name: string }[] = [];
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

      const { error: queueError } = await supabase
        .from("group_join_queue" as any)
        .insert(queueItems.map(item => ({
          campaign_id: campaignId,
          user_id: user.id,
          ...item,
          status: "pending",
        })) as any);

      if (queueError) throw queueError;

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
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/group-join")} className="rounded-xl h-9 w-9">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground">Nova Campanha de Entrada</h1>
          <p className="text-xs text-muted-foreground">Importe links e configure a execução</p>
        </div>
      </div>

      {/* Block 1 — Info */}
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

      {/* Block 2 — Links */}
      <div className="rounded-2xl border border-border/20 bg-card/80 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary" /> Importar Links dos Grupos
        </h2>
        <Textarea
          value={linksRaw}
          onChange={e => setLinksRaw(e.target.value)}
          placeholder={"Cole aqui os links dos grupos, um por linha\n\nhttps://chat.whatsapp.com/xxxx\nhttps://chat.whatsapp.com/yyyy\nhttps://chat.whatsapp.com/zzzz"}
          rows={8}
          className="rounded-xl font-mono text-xs"
        />
        <div className="flex flex-wrap gap-3 text-xs">
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
      </div>

      {/* Block 3 — Devices */}
      <div className="rounded-2xl border border-border/20 bg-card/80 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-primary" /> Selecionar Instâncias
          </h2>
          {onlineDevices.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => setSelectedDevices(prev => prev.length === onlineDevices.length ? [] : onlineDevices.map(d => d.id))}
            >
              {selectedDevices.length === onlineDevices.length ? "Desmarcar tudo" : "Selecionar online"}
            </Button>
          )}
        </div>

        {devices.length > 5 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
            <Input value={deviceSearch} onChange={e => setDeviceSearch(e.target.value)} placeholder="Buscar instância..." className="pl-9 rounded-xl h-9 text-xs" />
          </div>
        )}

        <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
          {filteredDevices.map(d => {
            const online = ["Connected", "Ready", "authenticated"].includes(d.status);
            return (
              <label
                key={d.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                  selectedDevices.includes(d.id) ? "bg-primary/5 border border-primary/20" : "hover:bg-muted/30 border border-transparent"
                }`}
              >
                <Checkbox checked={selectedDevices.includes(d.id)} onCheckedChange={() => toggleDevice(d.id)} />
                <div className={`w-2 h-2 rounded-full shrink-0 ${online ? "bg-emerald-400" : "bg-muted-foreground/30"}`} />
                <span className="text-xs font-medium truncate flex-1">{d.name}</span>
                <span className="text-[10px] text-muted-foreground/50 font-mono">{d.number}</span>
              </label>
            );
          })}
        </div>
        {selectedDevices.length > 0 && (
          <p className="text-[11px] text-muted-foreground/60">
            {selectedDevices.length} instância(s) × {parsedLinks.valid.length} links = <strong>{selectedDevices.length * parsedLinks.valid.length}</strong> entradas
          </p>
        )}
      </div>

      {/* Block 4 — Execution Config */}
      <div className="rounded-2xl border border-border/20 bg-card/80 p-5 space-y-5">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary" /> Configurações de Execução
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Delay mínimo (seg): {minDelay}s</label>
            <Slider value={[minDelay]} onValueChange={([v]) => { setMinDelay(v); if (v > maxDelay) setMaxDelay(v); }} min={3} max={120} step={1} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Delay máximo (seg): {maxDelay}s</label>
            <Slider value={[maxDelay]} onValueChange={([v]) => { setMaxDelay(v); if (v < minDelay) setMinDelay(v); }} min={3} max={120} step={1} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Pausar a cada: {pauseEvery} grupos</label>
            <Slider value={[pauseEvery]} onValueChange={([v]) => setPauseEvery(v)} min={2} max={30} step={1} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Duração da pausa: {Math.floor(pauseDuration / 60)}min {pauseDuration % 60}s</label>
            <Slider value={[pauseDuration]} onValueChange={([v]) => setPauseDuration(v)} min={30} max={600} step={10} />
          </div>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <Checkbox checked={shuffle} onCheckedChange={(v) => setShuffle(!!v)} />
          <Shuffle className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Embaralhar ordem dos links</span>
        </label>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 pb-8">
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
