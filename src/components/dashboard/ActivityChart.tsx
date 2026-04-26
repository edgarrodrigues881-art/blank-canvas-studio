import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface WarmupPoint {
  label: string;
  volume?: number;
  entregas: number;
  entregasPrev?: number;
  crescimento?: number;
}

interface Props {
  data: WarmupPoint[];
  /** Optional title override (e.g. "30 dias", "Tudo") */
  periodLabel?: string;
  /** Optional slot rendered in the top-right (e.g. PeriodPicker) */
  headerRight?: React.ReactNode;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border/60 rounded-xl px-4 py-3 shadow-2xl backdrop-blur-md">
      <p className="text-xs font-semibold text-foreground mb-2 capitalize">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-xs mb-1 last:mb-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-semibold text-foreground tabular-nums ml-auto">
            {Number(entry.value || 0).toLocaleString("pt-BR")}
          </span>
        </div>
      ))}
    </div>
  );
};

export const ActivityChart = React.memo(function ActivityChart({
  data,
  periodLabel = "7 dias",
  headerRight,
}: Props) {
  const totalEntregas = data.reduce((sum, d) => sum + (d.entregas || 0), 0);
  const totalPrev = data.reduce((sum, d) => sum + (d.entregasPrev || 0), 0);

  const variation =
    totalPrev > 0
      ? Math.round(((totalEntregas - totalPrev) / totalPrev) * 100)
      : totalEntregas > 0
      ? 100
      : 0;

  const isUp = variation > 0;
  const isDown = variation < 0;
  const VarIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const varColor = isUp
    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
    : isDown
    ? "text-red-400 bg-red-500/10 border-red-500/20"
    : "text-muted-foreground bg-muted/30 border-border/40";

  const ACCENT = "hsl(152, 69%, 53%)";
  const PREV = "hsl(220, 9%, 55%)";

  // Smart X axis: avoid label overlap on long periods
  const xInterval =
    data.length > 60 ? Math.ceil(data.length / 8) - 1 :
    data.length > 30 ? Math.ceil(data.length / 10) - 1 :
    data.length > 15 ? 1 : 0;

  return (
    <Card className="border-border/50 bg-card w-full col-span-full overflow-hidden">
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Mensagens Entregues — {periodLabel}
          </CardTitle>
          <div className="flex items-center gap-3 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: ACCENT }} />
              <span className="text-muted-foreground">Período atual</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-3 h-[2px] rounded-sm"
                style={{
                  background: `repeating-linear-gradient(90deg, ${PREV} 0 3px, transparent 3px 6px)`,
                }}
              />
              <span className="text-muted-foreground">Período anterior</span>
            </div>
            {headerRight}
          </div>
        </div>
        <div className="mt-1 flex items-end gap-3 flex-wrap">
          <div>
            <span className="text-2xl font-bold text-foreground tabular-nums">
              {totalEntregas.toLocaleString("pt-BR")}
            </span>
            <span className="text-xs text-muted-foreground ml-1.5">mensagens entregues</span>
          </div>
          <div
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-semibold ${varColor}`}
          >
            <VarIcon className="w-3 h-3" />
            {isUp ? "+" : ""}
            {variation}% vs semana anterior
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="gradEntregas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                opacity={0.35}
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                dy={8}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
              {/* Previous week (dashed reference line, no fill) */}
              <Area
                type="monotone"
                dataKey="entregasPrev"
                stroke={PREV}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fill="transparent"
                name="Semana anterior"
                dot={false}
                activeDot={{ r: 4, fill: PREV, stroke: "hsl(var(--background))", strokeWidth: 2 }}
              />
              {/* Current week */}
              <Area
                type="monotone"
                dataKey="entregas"
                stroke={ACCENT}
                strokeWidth={2.5}
                fill="url(#gradEntregas)"
                name="Esta semana"
                dot={{ r: 3, fill: ACCENT, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: ACCENT, stroke: "hsl(var(--background))", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});
