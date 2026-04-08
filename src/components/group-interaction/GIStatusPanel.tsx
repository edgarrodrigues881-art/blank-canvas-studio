import { Badge } from "@/components/ui/badge";
import { Activity, Clock, Smartphone, Pause, Play, Trash2 } from "lucide-react";
import type { GroupInteraction } from "@/hooks/useGroupInteraction";
import { formatBrazilTime, getBrazilNow } from "@/lib/brazilTime";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const statusConfig: Record<string, { color: string; label: string }> = {
  idle: { color: "bg-muted text-muted-foreground", label: "Inativo" },
  running: { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", label: "Rodando" },
  paused: { color: "bg-amber-500/15 text-amber-400 border-amber-500/30", label: "Pausado" },
  completed: { color: "bg-blue-500/15 text-blue-400 border-blue-500/30", label: "Concluído" },
  error: { color: "bg-red-500/15 text-red-400 border-red-500/30", label: "Erro" },
};

function isWithinSchedule(startHour: string, endHour: string): boolean {
  const now = getBrazilNow();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = startHour.split(":").map(Number);
  const [endH, endM] = endHour.split(":").map(Number);
  if (![startH, startM, endH, endM].every(Number.isFinite)) return false;
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  if (startMinutes <= endMinutes) return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

function getTimeLabel(startHour: string, endHour: string): string {
  const now = getBrazilNow();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [endH, endM] = endHour.split(":").map(Number);
  const endMinutes = endH * 60 + endM;
  const diff = endMinutes - currentMinutes;
  if (diff <= 0) return "Encerrado";
  const hrs = Math.floor(diff / 60);
  return hrs > 0 ? `${hrs}h ${diff % 60}m` : `${diff}m`;
}

interface GIStatusPanelProps {
  interaction: GroupInteraction;
  deviceName?: string;
  eligibleDevices?: any[];
  allDevices?: any[];
  selectedDeviceId?: string | null;
  onDeviceChange?: (id: string) => void;
  onNameChange?: (name: string) => void;
  formName?: string;
  displayStatus?: string;
  onAction?: (action: string) => void;
  actionPending?: boolean;
  onDelete?: () => void;
}

export default function GIStatusPanel({
  interaction,
  deviceName,
  eligibleDevices = [],
  allDevices,
  selectedDeviceId,
  onDeviceChange,
  onNameChange,
  formName,
  displayStatus,
  onAction,
  actionPending,
  onDelete,
}: GIStatusPanelProps) {
  const cfg = statusConfig[interaction.status] || statusConfig.idle;
  const inSchedule = isWithinSchedule(interaction.start_hour, interaction.end_hour);
  const status = displayStatus || interaction.status;

  return (
    <div className="rounded-2xl border border-border/30 bg-card overflow-hidden">
      {/* Top row: Name + Status badge */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-2 border-b border-border/15">
        {onNameChange ? (
          <Input
            value={formName ?? interaction.name}
            onChange={(e) => onNameChange(e.target.value)}
            className="h-7 text-xs font-medium bg-muted/30 border border-border rounded-md shadow-sm focus-visible:ring-2 focus-visible:ring-primary/40 px-2 flex-1 max-w-[300px]"
          />
        ) : (
          <span className="text-xs font-semibold text-foreground flex-1 truncate">{interaction.name}</span>
        )}
        <Badge variant="outline" className={`text-[10px] shrink-0 ${cfg.color}`}>{cfg.label}</Badge>
      </div>

      {/* Main content: 3 columns */}
      <div className="grid grid-cols-[1fr_1px_1fr_1px_auto] items-stretch">
        {/* Col 1: Metrics */}
        <div className="px-5 py-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium">Mensagens</span>
              <span className="font-mono text-xl font-bold text-foreground leading-tight">{interaction.total_messages_sent ?? 0}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium">Grupos</span>
              <span className="text-xl font-bold text-foreground leading-tight">{(interaction.group_ids || []).length}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium">Horário</span>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${inSchedule ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"}`} />
                <span className="text-xs text-foreground">{interaction.start_hour} – {interaction.end_hour}</span>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium">Último envio</span>
              <span className="text-xs text-muted-foreground">{interaction.last_sent_at ? formatBrazilTime(interaction.last_sent_at) : "—"}</span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="bg-border/20" />

        {/* Col 2: Device */}
        <div className="px-5 py-4 flex flex-col justify-center">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium mb-2">Dispositivo</span>
          {onDeviceChange ? (
            <Select value={selectedDeviceId || ""} onValueChange={onDeviceChange}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Selecionar" />
              </SelectTrigger>
              <SelectContent>
                {eligibleDevices.map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} {d.number ? `(${d.number})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm font-semibold text-foreground">{deviceName || "—"}</span>
          )}
        </div>

        {/* Divider */}
        <div className="bg-border/20" />

        {/* Col 3: Actions */}
        {onAction && (
          <div className="px-5 py-4 flex flex-col items-center justify-center gap-2 min-w-[120px]">
            {status === "running" ? (
              <button
                onClick={() => onAction("pause")}
                disabled={actionPending}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/30 disabled:opacity-40 text-xs font-medium transition-all"
              >
                <Pause className="w-3.5 h-3.5" strokeWidth={1.8} /> Pausar
              </button>
            ) : (
              <button
                onClick={() => onAction("start")}
                disabled={actionPending}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium transition-all"
              >
                <Play className="w-3.5 h-3.5" strokeWidth={1.8} /> {status === "paused" ? "Retomar" : "Iniciar"}
              </button>
            )}
            {onDelete && (
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 h-8 text-xs"
                onClick={onDelete}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
