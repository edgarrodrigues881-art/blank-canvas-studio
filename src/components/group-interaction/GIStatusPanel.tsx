import { Badge } from "@/components/ui/badge";
import { Activity, Clock, MessageCircle, Users, Zap, Smartphone } from "lucide-react";
import type { GroupInteraction } from "@/hooks/useGroupInteraction";
import { formatBrazilTime, getBrazilNow } from "@/lib/brazilTime";

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

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

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
}

export default function GIStatusPanel({ interaction, deviceName }: GIStatusPanelProps) {
  const cfg = statusConfig[interaction.status] || statusConfig.idle;
  const inSchedule = isWithinSchedule(interaction.start_hour, interaction.end_hour);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Status Card */}
      <div className="rounded-2xl border border-border/30 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Activity className="w-4 h-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">Resumo</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-medium">Status</span>
            <Badge variant="outline" className={`text-[10px] w-fit ${cfg.color}`}>
              {cfg.label}
            </Badge>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-medium">Mensagens</span>
            <span className="font-mono text-lg font-bold text-foreground">{interaction.total_messages_sent ?? 0}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-medium">Grupos</span>
            <span className="text-lg font-bold text-foreground">{(interaction.group_ids || []).length}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-medium">Último envio</span>
            <span className="text-xs text-muted-foreground mt-0.5">
              {interaction.last_sent_at ? formatBrazilTime(interaction.last_sent_at) : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Instance + Schedule Card */}
      <div className="rounded-2xl border border-border/30 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Smartphone className="w-4 h-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">Instância & Horário</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1 col-span-2">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-medium">Dispositivo</span>
            <span className="text-sm font-semibold text-foreground truncate">{deviceName || "Sem instância"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-medium">Janela</span>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${inSchedule ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"}`} />
              <span className="text-xs">{inSchedule ? getTimeRemaining(interaction.end_hour) : "Encerrado"}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-medium">Horário</span>
            <span className="text-xs text-muted-foreground">{interaction.start_hour} – {interaction.end_hour}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
