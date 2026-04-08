import { Badge } from "@/components/ui/badge";
import { Activity, Clock, Smartphone, Pause, Play, Trash2 } from "lucide-react";
import type { GroupInteraction } from "@/hooks/useGroupInteraction";
import { formatBrazilTime, getBrazilNow } from "@/lib/brazilTime";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

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

function getTimeRemaining(endHour: string): string {
  const now = getBrazilNow();
  const [h, m] = endHour.split(":").map(Number);
  const end = new Date(now);
  end.setHours(h, m, 0, 0);
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return "Encerrado";
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  return hrs > 0 ? `${hrs}h ${mins % 60}m restantes` : `${mins}m restantes`;
}

interface GIStatusPanelProps {
  interaction: GroupInteraction;
  deviceName?: string;
  // Device selector props
  eligibleDevices?: any[];
  selectedDeviceId?: string | null;
  onDeviceChange?: (id: string) => void;
  // Action props
  displayStatus?: string;
  onAction?: (action: string) => void;
  actionPending?: boolean;
  onDelete?: () => void;
}

export default function GIStatusPanel({
  interaction,
  deviceName,
  eligibleDevices = [],
  selectedDeviceId,
  onDeviceChange,
  displayStatus,
  onAction,
  actionPending,
  onDelete,
}: GIStatusPanelProps) {
  const cfg = statusConfig[interaction.status] || statusConfig.idle;
  const inSchedule = isWithinSchedule(interaction.start_hour, interaction.end_hour);
  const status = displayStatus || interaction.status;

  return (
    <div className="space-y-3">
      {/* Name badge */}
      <div className="rounded-xl border border-border/30 bg-card px-4 py-2.5 inline-flex items-center gap-2">
        <span className="text-xs font-semibold text-foreground">{interaction.name}</span>
      </div>

      {/* Two cards side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* LEFT: Resumo + Instância + Horário */}
        <div className="rounded-2xl border border-border/30 bg-card p-5 flex flex-col gap-5">
          {/* Resumo */}
          <div>
            <div className="flex items-center gap-2 text-muted-foreground mb-3">
              <Activity className="w-3.5 h-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">Resumo</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-medium">Status</span>
                <Badge variant="outline" className={`text-[10px] w-fit ${cfg.color}`}>{cfg.label}</Badge>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-medium">Mensagens</span>
                <span className="font-mono text-lg font-bold text-foreground leading-tight">{interaction.total_messages_sent ?? 0}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-medium">Grupos</span>
                <span className="text-lg font-bold text-foreground leading-tight">{(interaction.group_ids || []).length}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-medium">Último envio</span>
                <span className="text-xs text-muted-foreground">{interaction.last_sent_at ? formatBrazilTime(interaction.last_sent_at) : "—"}</span>
              </div>
            </div>
          </div>

          <div className="h-px bg-border/20" />

          {/* Instância */}
          <div>
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Smartphone className="w-3.5 h-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">Instância</span>
            </div>
            <span className="text-sm font-semibold text-foreground">{deviceName || "Sem instância"}</span>
          </div>

          <div className="h-px bg-border/20" />

          {/* Horário */}
          <div>
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">Horário</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${inSchedule ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"}`} />
                <span className="text-xs">{inSchedule ? getTimeRemaining(interaction.end_hour) : "Encerrado"}</span>
              </div>
              <span className="text-xs text-muted-foreground">{interaction.start_hour} – {interaction.end_hour}</span>
            </div>
          </div>
        </div>

        {/* RIGHT: Dispositivo + Ações */}
        <div className="rounded-2xl border border-border/30 bg-card p-5 flex flex-col gap-5">
          <div>
            <div className="flex items-center gap-2 text-muted-foreground mb-3">
              <Smartphone className="w-3.5 h-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">Dispositivo</span>
            </div>
            {onDeviceChange ? (
              <Select value={selectedDeviceId || ""} onValueChange={onDeviceChange}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Selecionar dispositivo" />
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
              <span className="text-sm text-foreground">{deviceName || "—"}</span>
            )}
            {onDeviceChange && eligibleDevices.length === 0 && (
              <p className="text-xs text-muted-foreground mt-2">Nenhum dispositivo encontrado.</p>
            )}
          </div>

          <div className="flex-1" />

          {/* Action buttons */}
          {onAction && (
            <div className="flex items-center gap-3 pt-3 border-t border-border/10">
              {status === "running" ? (
                <button
                  onClick={() => onAction("pause")}
                  disabled={actionPending}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/30 disabled:opacity-40 text-xs font-medium transition-all"
                >
                  <Pause className="w-3.5 h-3.5" strokeWidth={1.8} /> Pausar
                </button>
              ) : (
                <button
                  onClick={() => onAction("start")}
                  disabled={actionPending}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium transition-all"
                >
                  <Play className="w-3.5 h-3.5" strokeWidth={1.8} /> {status === "paused" ? "Retomar" : "Iniciar"}
                </button>
              )}

              {onDelete && (
                <div className="ml-auto">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground/40 hover:text-destructive"
                    onClick={onDelete}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
