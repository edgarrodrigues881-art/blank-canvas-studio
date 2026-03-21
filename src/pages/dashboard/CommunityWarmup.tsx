import { useState, useMemo } from "react";
import {
  Heart, Smartphone, Play, Pause, LogOut, Settings2, Clock, Zap, Shield,
  Activity, BarChart3, ChevronDown, ChevronUp, Info, AlertTriangle,
  CheckCircle2, Timer, Users, RefreshCw, Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { useCommunityWarmup, CommunityWarmupConfig } from "@/hooks/useCommunityWarmup";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const DAY_OPTIONS = [
  { value: "mon", label: "Seg" },
  { value: "tue", label: "Ter" },
  { value: "wed", label: "Qua" },
  { value: "thu", label: "Qui" },
  { value: "fri", label: "Sex" },
  { value: "sat", label: "Sáb" },
  { value: "sun", label: "Dom" },
];

const INTENSITY_INFO = {
  low: { label: "Baixo", color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20", desc: "Menor frequência, pausas maiores, limite diário menor (~30)" },
  medium: { label: "Médio", color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20", desc: "Frequência equilibrada, pausas moderadas, limite intermediário (~60)" },
  high: { label: "Alto", color: "text-red-400", bg: "bg-red-400/10", border: "border-red-400/20", desc: "Frequência maior, pausas menores dentro de intervalo seguro (~120)" },
};

const STATUS_MAP: Record<string, { icon: typeof Activity; color: string; label: string }> = {
  active: { icon: Activity, color: "text-emerald-400", label: "Ativo na comunidade" },
  waiting: { icon: Timer, color: "text-blue-400", label: "Aguardando próxima rodada" },
  paused: { icon: Pause, color: "text-amber-400", label: "Pausado manualmente" },
  inactive: { icon: AlertTriangle, color: "text-muted-foreground", label: "Inativo" },
  outside_hours: { icon: Clock, color: "text-muted-foreground", label: "Fora do horário programado" },
  limit_reached: { icon: Shield, color: "text-amber-400", label: "Limite diário atingido" },
};

function StatusBadge({ status }: { status: string }) {
  const info = STATUS_MAP[status] || STATUS_MAP.inactive;
  const Icon = info.icon;
  return (
    <div className={cn("flex items-center gap-1.5 text-xs font-medium", info.color)}>
      <Icon className="w-3.5 h-3.5" />
      {info.label}
    </div>
  );
}

function DeviceCard({
  config,
  deviceName,
  deviceNumber,
  deviceStatus,
  onToggle,
  onLeave,
  onUpdate,
}: {
  config: CommunityWarmupConfig;
  deviceName: string;
  deviceNumber: string | null;
  deviceStatus: string;
  onToggle: () => void;
  onLeave: () => void;
  onUpdate: (params: any) => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [localDays, setLocalDays] = useState<string[]>(config.active_days || []);
  const intensity = INTENSITY_INFO[config.intensity as keyof typeof INTENSITY_INFO] || INTENSITY_INFO.medium;
  const isOnline = ["Connected", "Ready", "authenticated"].includes(deviceStatus);
  const progress = config.daily_limit > 0 ? Math.min((config.interactions_today / config.daily_limit) * 100, 100) : 0;

  const toggleDay = (day: string) => {
    const next = localDays.includes(day) ? localDays.filter(d => d !== day) : [...localDays, day];
    setLocalDays(next);
    onUpdate({ config_id: config.id, active_days: next });
  };

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center border", config.is_active ? "bg-primary/10 border-primary/20" : "bg-muted/50 border-border")}>
              <Smartphone className={cn("w-4 h-4", config.is_active ? "text-primary" : "text-muted-foreground")} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{deviceName}</p>
              <div className="flex items-center gap-2">
                {deviceNumber && <span className="text-[11px] text-muted-foreground">{deviceNumber}</span>}
                <span className={cn("w-1.5 h-1.5 rounded-full", isOnline ? "bg-emerald-400" : "bg-red-400")} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={config.is_active} onCheckedChange={onToggle} />
          </div>
        </div>

        {/* Status + Stats */}
        <div className="px-4 pb-3 space-y-3">
          <StatusBadge status={config.status} />

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Interações hoje</span>
              <span className="font-medium text-foreground">{config.interactions_today}/{config.daily_limit}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-muted/30 px-2.5 py-2 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5">Intensidade</p>
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", intensity.bg, intensity.border, intensity.color)}>
                {intensity.label}
              </Badge>
            </div>
            <div className="rounded-lg bg-muted/30 px-2.5 py-2 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5">Horário</p>
              <p className="text-[11px] font-medium text-foreground">{config.start_hour}-{config.end_hour}</p>
            </div>
            <div className="rounded-lg bg-muted/30 px-2.5 py-2 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5">Última</p>
              <p className="text-[11px] font-medium text-foreground">
                {config.last_interaction_at
                  ? formatDistanceToNow(new Date(config.last_interaction_at), { addSuffix: true, locale: ptBR })
                  : "—"
                }
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center border-t border-border/30">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          >
            <Settings2 className="w-3.5 h-3.5" />
            Configurar
            {showSettings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <div className="w-px h-6 bg-border/30" />
          <button
            onClick={onLeave}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] text-red-400/80 hover:text-red-400 hover:bg-red-400/5 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </button>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="border-t border-border/30 p-4 space-y-4 bg-muted/10">
            {/* Intensity */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Intensidade</label>
              <Select
                value={config.intensity}
                onValueChange={(v) => onUpdate({ config_id: config.id, intensity: v as any })}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(INTENSITY_INFO).map(([key, info]) => (
                    <SelectItem key={key} value={key} className="text-xs">
                      <span className={info.color}>{info.label}</span> — {info.desc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Hours */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Início</label>
                <Select
                  value={config.start_hour}
                  onValueChange={(v) => onUpdate({ config_id: config.id, start_hour: v })}
                >
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => {
                      const h = `${String(i).padStart(2, "0")}:00`;
                      return <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Término</label>
                <Select
                  value={config.end_hour}
                  onValueChange={(v) => onUpdate({ config_id: config.id, end_hour: v })}
                >
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => {
                      const h = `${String(i).padStart(2, "0")}:00`;
                      return <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Active days */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Dias ativos</label>
              <div className="flex gap-1.5 flex-wrap">
                {DAY_OPTIONS.map(day => (
                  <button
                    key={day.value}
                    onClick={() => toggleDay(day.value)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors border",
                      localDays.includes(day.value)
                        ? "bg-primary/15 text-primary border-primary/30"
                        : "bg-muted/30 text-muted-foreground border-border/50 hover:border-border"
                    )}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Daily limit */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">Limite diário</label>
                <span className="text-xs text-muted-foreground">{config.daily_limit} interações</span>
              </div>
              <Slider
                value={[config.daily_limit]}
                onValueChange={([v]) => onUpdate({ config_id: config.id, daily_limit: v })}
                min={10}
                max={200}
                step={5}
                className="w-full"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CommunityWarmup() {
  const { devices, configs, logs, isLoading, logsLoading, join, leave, toggle, update } = useCommunityWarmup();
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [selectedIntensity, setSelectedIntensity] = useState<"low" | "medium" | "high">("medium");
  const [showRules, setShowRules] = useState(false);

  const configMap = useMemo(() => {
    const map = new Map<string, CommunityWarmupConfig>();
    configs.forEach(c => map.set(c.device_id, c));
    return map;
  }, [configs]);

  const availableDevices = useMemo(
    () => devices.filter(d => !configMap.has(d.id)),
    [devices, configMap]
  );

  const activeCount = configs.filter(c => c.is_active).length;
  const totalInteractions = configs.reduce((sum, c) => sum + c.interactions_today, 0);

  const handleJoin = async () => {
    if (!selectedDevice) return;
    try {
      await join.mutateAsync({ device_id: selectedDevice, intensity: selectedIntensity });
      toast({ title: "✅ Entrou na comunidade", description: "Sua instância foi adicionada ao aquecimento comunitário." });
      setSelectedDevice("");
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleLeave = async (configId: string) => {
    try {
      await leave.mutateAsync(configId);
      toast({ title: "Saiu da comunidade", description: "Instância removida do aquecimento comunitário." });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleToggle = async (configId: string, currentActive: boolean) => {
    try {
      await toggle.mutateAsync({ config_id: configId, is_active: !currentActive });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleUpdate = async (params: any) => {
    try {
      await update.mutateAsync(params);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto px-4 py-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 shrink-0">
            <Heart className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Aquecimento Comunitário</h1>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-lg">
              Participe de uma rede de aquecimento compartilhada. Suas instâncias interagem automaticamente com outros participantes de forma equilibrada, segura e com controle total.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowRules(!showRules)}
          className="gap-1.5 text-xs shrink-0"
        >
          <Info className="w-3.5 h-3.5" />
          Regras de uso
        </Button>
      </div>

      {/* Rules panel */}
      {showRules && (
        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardContent className="p-4 space-y-2 text-xs text-muted-foreground">
            <p className="text-sm font-semibold text-foreground mb-2">📋 Regras do Aquecimento Comunitário</p>
            <ul className="space-y-1.5 list-none">
              {[
                "As interações são distribuídas de forma equilibrada entre todos os participantes",
                "O sistema alterna os pares automaticamente para evitar repetição",
                "Respeite os horários e limites configurados para manter a segurança",
                "Os intervalos entre mensagens são variáveis para simular comportamento natural",
                "Você pode pausar ou sair da comunidade a qualquer momento",
                "Cada instância deve estar conectada (online) para participar",
                "O limite diário é respeitado automaticamente pelo sistema",
                "Pausas automáticas são aplicadas após blocos de interações",
              ].map((rule, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  {rule}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Stats overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Participando</p>
              <p className="text-lg font-bold text-foreground">{configs.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-400/10 flex items-center justify-center">
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ativos</p>
              <p className="text-lg font-bold text-foreground">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-400/10 flex items-center justify-center">
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Interações hoje</p>
              <p className="text-lg font-bold text-foreground">{totalInteractions}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-400/10 flex items-center justify-center">
              <Gauge className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Instâncias</p>
              <p className="text-lg font-bold text-foreground">{devices.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Join section */}
      {availableDevices.length > 0 && (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.03] to-transparent">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Play className="w-4 h-4 text-primary" />
              Entrar na Comunidade
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue placeholder="Selecione a instância" />
                </SelectTrigger>
                <SelectContent>
                  {availableDevices.map(d => (
                    <SelectItem key={d.id} value={d.id} className="text-xs">
                      {d.name} {d.number ? `(${d.number})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedIntensity} onValueChange={(v) => setSelectedIntensity(v as any)}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(INTENSITY_INFO).map(([key, info]) => (
                    <SelectItem key={key} value={key} className="text-xs">
                      <span className={info.color}>{info.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleJoin}
                disabled={!selectedDevice || join.isPending}
                className="h-10 gap-2 text-xs"
              >
                <Heart className="w-3.5 h-3.5" />
                {join.isPending ? "Entrando..." : "Entrar na Comunidade"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active devices */}
      {configs.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-primary" />
            Minhas instâncias na comunidade
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {configs.map(config => {
              const device = devices.find(d => d.id === config.device_id);
              return (
                <DeviceCard
                  key={config.id}
                  config={config}
                  deviceName={device?.name || "Instância"}
                  deviceNumber={device?.number || null}
                  deviceStatus={device?.status || "disconnected"}
                  onToggle={() => handleToggle(config.id, config.is_active)}
                  onLeave={() => handleLeave(config.id)}
                  onUpdate={handleUpdate}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <Card className="border-dashed border-border/50">
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center">
              <Heart className="w-6 h-6 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-foreground">Nenhuma instância na comunidade</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Adicione suas instâncias ao aquecimento comunitário para participar de interações automatizadas e equilibradas.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Activity logs */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          Histórico de atividade
        </h2>
        <Card className="border-border/50">
          <CardContent className="p-0">
            {logsLoading ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-3/4" />
              </div>
            ) : logs.length === 0 ? (
              <div className="py-10 text-center text-xs text-muted-foreground">
                Nenhuma atividade registrada ainda.
              </div>
            ) : (
              <ScrollArea className="max-h-[350px]">
                <div className="divide-y divide-border/30">
                  {logs.map(log => (
                    <div key={log.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                      <div className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        log.status === "success" ? "bg-emerald-400" : "bg-red-400"
                      )} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-foreground truncate">
                          {log.event_type === "interaction" ? "Interação" : log.event_type}
                          {log.interaction_type && <span className="text-muted-foreground"> · {log.interaction_type}</span>}
                        </p>
                        {log.message_preview && (
                          <p className="text-[11px] text-muted-foreground/70 truncate">{log.message_preview}</p>
                        )}
                      </div>
                      {log.intensity && (
                        <Badge variant="outline" className="text-[9px] px-1.5">
                          {log.intensity}
                        </Badge>
                      )}
                      {log.delay_applied_seconds && (
                        <span className="text-[10px] text-muted-foreground/50 shrink-0">
                          {log.delay_applied_seconds}s
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground/50 shrink-0 min-w-[60px] text-right">
                        {format(new Date(log.created_at), "HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
