import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { IconBadge } from "@/components/ui/icon-badge";
import type { PerformanceMetrics } from "@/hooks/useDashboardStats";

interface Props {
  performance: PerformanceMetrics;
}

export function PerformanceBlock({ performance }: Props) {
  const metrics = [
    {
      label: "Entrega Média",
      value: `${performance.avgDeliveryRate}%`,
      icon: Activity,
    },
    {
      label: "Falhas Médias",
      value: `${performance.avgFailRate}%`,
      icon: BarChart3,
    },
    {
      label: "Média Hoje / Chip",
      value: String(performance.avgDailyVolume),
      icon: BarChart3,
    },
    {
      label: "Crescimento 7d",
      value: `${performance.growthLast7Days >= 0 ? "+" : ""}${performance.growthLast7Days}%`,
      icon: performance.growthLast7Days >= 0 ? TrendingUp : TrendingDown,
    },
  ];

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
          <IconBadge size="sm" variant="primary">
            <BarChart3 className="w-3.5 h-3.5" />
          </IconBadge>
          Desempenho Operacional
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {metrics.map((m) => (
            <div key={m.label} className="p-3 rounded-lg bg-muted/10 border border-border/20">
              <div className="flex items-center gap-2 mb-1">
                <IconBadge size="sm" variant="muted">
                  <m.icon className="w-3.5 h-3.5" />
                </IconBadge>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{m.label}</span>
              </div>
              <p className="text-lg font-semibold text-foreground">{m.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
