import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, Clock, MessageCircle, Users, Zap } from "lucide-react";
import type { GroupInteraction } from "@/hooks/useGroupInteraction";

const statusConfig: Record<string, { color: string; label: string }> = {
  idle: { color: "bg-muted text-muted-foreground", label: "Inativo" },
  running: { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", label: "Rodando" },
  paused: { color: "bg-amber-500/15 text-amber-400 border-amber-500/30", label: "Pausado" },
  completed: { color: "bg-blue-500/15 text-blue-400 border-blue-500/30", label: "Concluído" },
  error: { color: "bg-red-500/15 text-red-400 border-red-500/30", label: "Erro" },
};

function isWithinSchedule(startHour: string, endHour: string): boolean {
  const now = new Date();
  const current = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return current >= startHour && current <= endHour;
}

function getTimeRemaining(endHour: string): string {
  const now = new Date();
  const [h, m] = endHour.split(":").map(Number);
  const end = new Date(now);
  end.setHours(h, m, 0, 0);
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return "Encerrado";
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  return hrs > 0 ? `${hrs}h ${mins % 60}m restantes` : `${mins}m restantes`;
}

export default function GIStatusPanel({ interaction }: { interaction: GroupInteraction }) {
  const cfg = statusConfig[interaction.status] || statusConfig.idle;
  const inSchedule = isWithinSchedule(interaction.start_hour, interaction.end_hour);

  const stats = [
    {
      icon: Activity,
      label: "Status",
      value: (
        <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>
          {cfg.label}
        </Badge>
      ),
    },
    {
      icon: MessageCircle,
      label: "Interações hoje",
      value: <span className="font-mono text-sm">{interaction.today_count ?? 0}</span>,
    },
    {
      icon: Users,
      label: "Grupos",
      value: <span className="text-sm">{(interaction.group_ids || []).length}</span>,
    },
    {
      icon: Clock,
      label: "Janela",
      value: (
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${inSchedule ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"}`} />
          <span className="text-xs">{inSchedule ? getTimeRemaining(interaction.end_hour) : "Fora do horário"}</span>
        </div>
      ),
    },
    {
      icon: Zap,
      label: "Último envio",
      value: (
        <span className="text-xs text-muted-foreground">
          {interaction.last_sent_at
            ? new Date(interaction.last_sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
            : "—"}
        </span>
      ),
    },
  ];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <s.icon className="w-3.5 h-3.5" />
                <span className="text-[11px] uppercase tracking-wider font-medium">{s.label}</span>
              </div>
              {s.value}
            </div>
          ))}
        </div>
        {interaction.last_error && (
          <div className="mt-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            {interaction.last_error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
