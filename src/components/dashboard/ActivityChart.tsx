import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
} from "recharts";
import { Activity, TrendingUp } from "lucide-react";

interface WarmupPoint {
  label: string;
  date?: string;
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

const ACCENT = "hsl(152, 76%, 50%)";
const ACCENT_SOFT = "hsl(152, 76%, 60%)";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0]?.value || 0);
  return (
    <div className="bg-popover/95 border border-border/60 rounded-xl px-3.5 py-2.5 shadow-2xl backdrop-blur-md">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-semibold mb-1 capitalize">
        {label}
      </p>
      <div className="flex items-baseline gap-1.5">
        <span
          className="w-2 h-2 rounded-full shrink-0 self-center"
          style={{ background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }}
        />
        <span className="text-base font-bold text-foreground tabular-nums">
          {value.toLocaleString("pt-BR")}
        </span>
        <span className="text-[11px] text-muted-foreground">mensagens</span>
      </div>
    </div>
  );
};

export const ActivityChart = React.memo(function ActivityChart({
  data,
  periodLabel = "7 dias",
  headerRight,
}: Props) {
  const { totalEntregas, peakValue, peakLabel, avgPerDay, activeDays } = useMemo(() => {
    const totalEntregas = data.reduce((sum, d) => sum + (d.entregas || 0), 0);
    let peakValue = 0;
    let peakLabel = "";
    let activeDays = 0;
    data.forEach((d) => {
      const v = d.entregas || 0;
      if (v > peakValue) {
        peakValue = v;
        peakLabel = d.label;
      }
      if (v > 0) activeDays++;
    });
    const avgPerDay = data.length > 0 ? Math.round(totalEntregas / data.length) : 0;
    return { totalEntregas, peakValue, peakLabel, avgPerDay, activeDays };
  }, [data]);

  // Smart X axis: avoid label overlap on long periods
  const xInterval =
    data.length > 60
      ? Math.ceil(data.length / 8) - 1
      : data.length > 30
      ? Math.ceil(data.length / 10) - 1
      : data.length > 15
      ? 1
      : 0;

  // Find the peak data point for the marker
  const peakPoint = useMemo(
    () => data.find((d) => (d.entregas || 0) === peakValue && peakValue > 0),
    [data, peakValue]
  );

  return (
    <Card className="relative border-border/50 bg-card w-full col-span-full overflow-hidden">
      {/* Subtle ambient glow behind the card content */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(900px 280px at 50% 100%, hsl(152, 76%, 50%, 0.06), transparent 70%)",
        }}
      />

      <CardHeader className="relative pb-2">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <span
                className="inline-flex items-center justify-center w-7 h-7 rounded-lg ring-1 ring-emerald-500/20"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(152,76%,50%,0.18), hsl(152,76%,50%,0.04))",
                }}
              >
                <Activity className="w-3.5 h-3.5 text-emerald-300" strokeWidth={2.2} />
              </span>
              Mensagens Entregues
              <span className="text-muted-foreground/60 font-normal">— {periodLabel}</span>
            </CardTitle>

            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-foreground tabular-nums tracking-tight leading-none">
                {totalEntregas.toLocaleString("pt-BR")}
              </span>
              <span className="text-xs text-muted-foreground">mensagens</span>
            </div>
          </div>

          {/* Right slot: aux metrics + optional headerRight (PeriodPicker) */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:flex items-center gap-3 mr-1">
              <MetricChip
                label="Pico"
                value={peakValue.toLocaleString("pt-BR")}
                hint={peakLabel}
                accent
              />
              <MetricChip
                label="Média/dia"
                value={avgPerDay.toLocaleString("pt-BR")}
              />
              <MetricChip
                label="Dias ativos"
                value={`${activeDays}/${data.length}`}
              />
            </div>
            {headerRight}
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative pt-0">
        {/* Mobile metrics — shown below the title on small screens */}
        <div className="sm:hidden flex items-center gap-2 mb-3">
          <MetricChip
            label="Pico"
            value={peakValue.toLocaleString("pt-BR")}
            hint={peakLabel}
            accent
          />
          <MetricChip label="Média/dia" value={avgPerDay.toLocaleString("pt-BR")} />
        </div>

        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 18, right: 14, left: -10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="gradAreaRich" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.45} />
                  <stop offset="55%" stopColor={ACCENT} stopOpacity={0.12} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradStroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.85} />
                  <stop offset="100%" stopColor={ACCENT_SOFT} stopOpacity={1} />
                </linearGradient>
                <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <CartesianGrid
                strokeDasharray="2 6"
                stroke="hsl(var(--border))"
                opacity={0.25}
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                dy={10}
                interval={xInterval}
                minTickGap={20}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                width={48}
                tickFormatter={(v) =>
                  v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v)
                }
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{
                  stroke: ACCENT,
                  strokeWidth: 1,
                  strokeDasharray: "3 3",
                  opacity: 0.5,
                }}
              />

              <Area
                type="monotone"
                dataKey="entregas"
                stroke="url(#gradStroke)"
                strokeWidth={2.5}
                fill="url(#gradAreaRich)"
                name="Mensagens"
                dot={data.length <= 15 ? { r: 3, fill: ACCENT, strokeWidth: 0 } : false}
                activeDot={{
                  r: 6,
                  fill: ACCENT,
                  stroke: "hsl(var(--background))",
                  strokeWidth: 2,
                  style: { filter: `drop-shadow(0 0 6px ${ACCENT})` },
                }}
                style={{ filter: "url(#lineGlow)" }}
              />

              {/* Peak marker */}
              {peakPoint && peakValue > 0 && (
                <ReferenceDot
                  x={peakPoint.label}
                  y={peakValue}
                  r={5}
                  fill={ACCENT}
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                  isFront
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});

/** Compact metric chip used in the chart header */
function MetricChip({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-end leading-tight px-2.5 py-1.5 rounded-lg border ${
        accent
          ? "border-emerald-500/20 bg-emerald-500/5"
          : "border-border/40 bg-muted/20"
      }`}
    >
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground/70 font-semibold">
        {label}
      </span>
      <span
        className={`text-[12px] font-bold tabular-nums ${
          accent ? "text-emerald-300" : "text-foreground"
        }`}
      >
        {value}
      </span>
      {hint && (
        <span className="text-[9px] text-muted-foreground/60 -mt-0.5 capitalize">
          {hint}
        </span>
      )}
    </div>
  );
}
