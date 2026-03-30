import { Card } from "@/components/ui/card";
import { AnimatedCounter } from "@/components/dashboard/AnimatedCounter";
import {
  Users, Clock, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Shield,
} from "lucide-react";

interface StatsProps {
  total: number;
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  ignored: number;
  duplicate_blocked: number;
}

const STAT_ITEMS = [
  { key: "total", label: "Total", icon: Users, gradient: "from-slate-500/20 to-slate-600/10", iconColor: "text-slate-300", borderColor: "border-slate-500/20" },
  { key: "pending", label: "Pendentes", icon: Clock, gradient: "from-yellow-500/20 to-yellow-600/10", iconColor: "text-yellow-400", borderColor: "border-yellow-500/20" },
  { key: "processing", label: "Processando", icon: RefreshCw, gradient: "from-blue-500/20 to-blue-600/10", iconColor: "text-blue-400", borderColor: "border-blue-500/20" },
  { key: "sent", label: "Enviados", icon: CheckCircle2, gradient: "from-emerald-500/20 to-emerald-600/10", iconColor: "text-emerald-400", borderColor: "border-emerald-500/20" },
  { key: "failed", label: "Falhas", icon: AlertTriangle, gradient: "from-red-500/20 to-red-600/10", iconColor: "text-red-400", borderColor: "border-red-500/20" },
  { key: "ignored", label: "Ignorados", icon: XCircle, gradient: "from-gray-500/20 to-gray-600/10", iconColor: "text-gray-400", borderColor: "border-gray-500/20" },
  { key: "duplicate_blocked", label: "Duplicados", icon: Shield, gradient: "from-orange-500/20 to-orange-600/10", iconColor: "text-orange-400", borderColor: "border-orange-500/20" },
] as const;

export function WelcomeStatsCards({ stats }: { stats: StatsProps }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {STAT_ITEMS.map(s => {
        const Icon = s.icon;
        const value = stats[s.key];
        return (
          <Card key={s.key} className={`relative overflow-hidden border ${s.borderColor} bg-gradient-to-br ${s.gradient}`}>
            <div className="p-4 flex flex-col items-center gap-1.5">
              <div className={`w-8 h-8 rounded-lg bg-background/50 flex items-center justify-center ${s.iconColor}`}>
                <Icon className={`w-4 h-4 ${s.key === "processing" ? "animate-spin" : ""}`} />
              </div>
              <AnimatedCounter value={value} className="text-xl font-bold text-foreground" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{s.label}</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
