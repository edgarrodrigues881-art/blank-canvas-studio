import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Bar,
  Line,
  ComposedChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
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
const ACCENT_DIM = "hsl(152, 20%, 40%)";
const AVG_LINE = "hsl(48, 95%, 60%)";

const CustomTooltip = ({ active, payload, label, avg }: any) => {
  if (!active || !payload?.length) return null;
  const value = Number(payload.find((p: any) => p.dataKey === "entregas")?.value || 0);
  const diff = avg > 0 ? Math.round(((value - avg) / avg) * 100) : 0;
  return (
    <div className="bg-popover/95 border border-border/60 rounded-xl px-3.5 py-2.5 shadow-2xl backdrop-blur-md min-w-[160px]">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-semibold mb-1.5 capitalize">
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
        <span className="text-[11px] text-muted-foreground">msgs</span>
      </div>
      {avg > 0 && (
        <div className="mt-1 pt-1.5 border-t border-border/40 flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground/70">vs média</span>
          <span
            className={`font-semibold tabular-nums ${
              diff >= 0 ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            {diff >= 0 ? "+" : ""}
            {diff}%
          </span>
        </div>
      )}
    </div>
  );
};

export const ActivityChart = React.memo(function ActivityChart({
  data,
  periodLabel = "7 dias",
  headerRight,
}: Props) {
  const { totalEntregas, peakValue, peakLabel, avgPerDay, activeDays } = useMemo(() => {
    let totalEntregas = 0;
    let peakValue = 0;
    let peakLabel = "";
    let activeDays = 0;
    data.forEach((d) => {
      const v = d.entregas || 0;
      totalEntregas += v;
      if (v > peakValue) {
        peakValue = v;
        peakLabel = d.label;
      }
      if (v > 0) activeDays++;
    });
    // Average computed only on active days for a more useful baseline
    const avgPerDay = activeDays > 0 ? Math.round(totalEntregas / activeDays) : 0;
    return { totalEntregas, peakValue, peakLabel, avgPerDay, activeDays };
  }, [data]);

  // Inject avg line value + a tiny baseline marker for zero-days
  const chartData = useMemo(() => {
    // baseline = ~1.2% of peak, so it shows as a thin line at the axis
    const baselineHeight = peakValue > 0 ? Math.max(peakValue * 0.012, 1) : 0;
    return data.map((d) => ({
      ...d,
      avg: avgPerDay,
      baseline: (d.entregas || 0) === 0 ? baselineHeight : 0,
    }));
  }, [data, avgPerDay, peakValue]);

  // Smart X axis: avoid label overlap on long periods
  const xInterval =
    data.length > 60
      ? Math.ceil(data.length / 8) - 1
      : data.length > 30
      ? Math.ceil(data.length / 10) - 1
      : data.length > 15
      ? 1
      : 0;

  // Thin bars — sparkline-like
  const barSize =
    data.length > 60 ? 3 : data.length > 30 ? 5 : data.length > 15 ? 8 : 14;

  return (
    <Card className="relative border-border/50 bg-card w-full col-span-full overflow-hidden">
      {/* Subtle ambient glow */}
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

            {/* Inline legend */}
            <div className="mt-2 flex items-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ background: ACCENT }}
                />
                Entregas/dia
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="w-3.5 h-[2px] rounded-full"
                  style={{
                    background: AVG_LINE,
                    boxShadow: `0 0 6px ${AVG_LINE}`,
                  }}
                />
                Média ({avgPerDay.toLocaleString("pt-BR")}/dia · {activeDays} ativos)
              </span>
            </div>
          </div>

          {headerRight && <div className="flex items-center gap-2">{headerRight}</div>}
        </div>
      </CardHeader>

      <CardContent className="relative pt-2">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 18, right: 14, left: -10, bottom: 0 }}
              barCategoryGap={data.length > 30 ? "20%" : "35%"}
            >
              <defs>
                <linearGradient id="gradBarThin" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(152, 90%, 60%)" stopOpacity={1} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0.55} />
                </linearGradient>
                <linearGradient id="gradBarPeakThin" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(152, 100%, 75%)" stopOpacity={1} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0.7} />
                </linearGradient>
                <filter id="peakGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <CartesianGrid
                strokeDasharray="2 6"
                stroke="hsl(var(--border))"
                opacity={0.2}
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
                content={<CustomTooltip avg={avgPerDay} />}
                cursor={{ fill: "hsl(var(--foreground))", opacity: 0.04 }}
              />

              {/* Reference line label — sits at avg */}
              {avgPerDay > 0 && (
                <ReferenceLine
                  y={avgPerDay}
                  stroke={AVG_LINE}
                  strokeDasharray="4 4"
                  strokeOpacity={0.4}
                  ifOverflow="extendDomain"
                />
              )}

              <Bar
                dataKey="entregas"
                name="Entregas"
                radius={[3, 3, 0, 0]}
                maxBarSize={barSize}
                isAnimationActive
                animationDuration={650}
              >
                {chartData.map((d, i) => {
                  const v = d.entregas || 0;
                  const isPeak = v === peakValue && peakValue > 0;
                  const fill = isPeak ? "url(#gradBarPeakThin)" : "url(#gradBarThin)";
                  return (
                    <Cell
                      key={`c-${i}`}
                      fill={v === 0 ? ACCENT_DIM : fill}
                      fillOpacity={v === 0 ? 0.2 : 1}
                      style={isPeak ? { filter: "url(#peakGlow)" } : undefined}
                    />
                  );
                })}
              </Bar>

              {/* Average line on top — solid, glowing */}
              <Line
                type="monotone"
                dataKey="avg"
                stroke={AVG_LINE}
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
                name="Média"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});
