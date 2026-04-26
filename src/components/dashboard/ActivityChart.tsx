import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
} from "recharts";
import { Activity } from "lucide-react";

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
const ACCENT_DIM = "hsl(152, 30%, 45%)";

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
  const { totalEntregas, peakValue, peakLabel } = useMemo(() => {
    const totalEntregas = data.reduce((sum, d) => sum + (d.entregas || 0), 0);
    let peakValue = 0;
    let peakLabel = "";
    data.forEach((d) => {
      const v = d.entregas || 0;
      if (v > peakValue) {
        peakValue = v;
        peakLabel = d.label;
      }
    });
    return { totalEntregas, peakValue, peakLabel };
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

  // Bar sizing — thinner for longer periods
  const barSize =
    data.length > 60 ? 4 : data.length > 30 ? 6 : data.length > 15 ? 10 : 22;
  const barRadius: [number, number, number, number] =
    data.length > 30 ? [2, 2, 0, 0] : [4, 4, 0, 0];

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

            <div className="mt-2 flex items-baseline gap-2 flex-wrap">
              <span className="text-3xl font-bold text-foreground tabular-nums tracking-tight leading-none">
                {totalEntregas.toLocaleString("pt-BR")}
              </span>
              <span className="text-xs text-muted-foreground">mensagens</span>
              {peakValue > 0 && peakLabel && (
                <span className="text-[11px] text-muted-foreground/70 ml-1">
                  · pico{" "}
                  <span className="text-emerald-300 font-semibold tabular-nums">
                    {peakValue.toLocaleString("pt-BR")}
                  </span>{" "}
                  <span className="capitalize">({peakLabel})</span>
                </span>
              )}
            </div>
          </div>

          {/* Right slot (PeriodPicker etc) */}
          {headerRight && <div className="flex items-center gap-2">{headerRight}</div>}
        </div>
      </CardHeader>

      <CardContent className="relative pt-2">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 18, right: 14, left: -10, bottom: 0 }}
              barCategoryGap={data.length > 30 ? "15%" : "25%"}
            >
              <defs>
                <linearGradient id="gradBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={1} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0.35} />
                </linearGradient>
                <linearGradient id="gradBarPeak" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(152, 90%, 65%)" stopOpacity={1} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0.55} />
                </linearGradient>
                <linearGradient id="gradBarDim" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT_DIM} stopOpacity={0.55} />
                  <stop offset="100%" stopColor={ACCENT_DIM} stopOpacity={0.18} />
                </linearGradient>
                <filter id="barGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
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
                cursor={{ fill: "hsl(var(--foreground))", opacity: 0.04 }}
              />

              <Bar
                dataKey="entregas"
                name="Mensagens"
                radius={barRadius}
                maxBarSize={barSize}
                isAnimationActive
                animationDuration={650}
              >
                {data.map((d, i) => {
                  const v = d.entregas || 0;
                  const isPeak = v === peakValue && peakValue > 0;
                  const isZero = v === 0;
                  const fill = isZero
                    ? "url(#gradBarDim)"
                    : isPeak
                    ? "url(#gradBarPeak)"
                    : "url(#gradBar)";
                  return (
                    <Cell
                      key={`c-${i}`}
                      fill={fill}
                      style={isPeak ? { filter: "url(#barGlow)" } : undefined}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});
