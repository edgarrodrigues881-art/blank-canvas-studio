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
const ACCENT_BRIGHT = "hsl(152, 95%, 65%)";

const CustomTooltip = ({ active, payload, label, avg }: any) => {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0]?.value || 0);
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
      {avg > 0 && value > 0 && (
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
    const avgPerDay = activeDays > 0 ? Math.round(totalEntregas / activeDays) : 0;
    return { totalEntregas, peakValue, peakLabel, avgPerDay, activeDays };
  }, [data]);

  const peakPoint = useMemo(
    () => data.find((d) => (d.entregas || 0) === peakValue && peakValue > 0),
    [data, peakValue]
  );

  // Smart X axis
  const xInterval =
    data.length > 60
      ? Math.ceil(data.length / 8) - 1
      : data.length > 30
      ? Math.ceil(data.length / 10) - 1
      : data.length > 15
      ? 1
      : 0;

  return (
    <Card className="relative border-border/50 bg-card w-full col-span-full overflow-hidden">
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(900px 320px at 50% 100%, hsl(152, 76%, 50%, 0.08), transparent 70%)",
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
              {avgPerDay > 0 && (
                <span className="text-[11px] text-muted-foreground/70">
                  · média{" "}
                  <span className="text-foreground font-semibold tabular-nums">
                    {avgPerDay.toLocaleString("pt-BR")}
                  </span>
                  /dia
                </span>
              )}
            </div>
          </div>

          {headerRight && <div className="flex items-center gap-2">{headerRight}</div>}
        </div>
      </CardHeader>

      <CardContent className="relative pt-2">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 22, right: 18, left: -8, bottom: 0 }}
            >
              <defs>
                {/* Area gradient — bright at top, fades to nothing */}
                <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT_BRIGHT} stopOpacity={0.55} />
                  <stop offset="40%" stopColor={ACCENT} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                </linearGradient>
                {/* Stroke gradient — slight horizontal sheen */}
                <linearGradient id="strokeGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={1} />
                  <stop offset="50%" stopColor={ACCENT_BRIGHT} stopOpacity={1} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={1} />
                </linearGradient>
                {/* Soft glow for the line */}
                <filter id="lineSoftGlow" x="-20%" y="-50%" width="140%" height="200%">
                  <feGaussianBlur stdDeviation="2.5" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                {/* Strong glow for the peak dot */}
                <filter id="peakDotGlow" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="3" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <CartesianGrid
                strokeDasharray="2 6"
                stroke="hsl(var(--border))"
                opacity={0.18}
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
                cursor={{
                  stroke: ACCENT,
                  strokeWidth: 1,
                  strokeDasharray: "3 4",
                  opacity: 0.5,
                }}
              />

              <Area
                type="monotone"
                dataKey="entregas"
                stroke="url(#strokeGrad)"
                strokeWidth={2.4}
                fill="url(#areaFill)"
                name="Entregas"
                dot={false}
                activeDot={{
                  r: 5,
                  fill: ACCENT_BRIGHT,
                  stroke: "hsl(var(--background))",
                  strokeWidth: 2,
                  style: { filter: `drop-shadow(0 0 8px ${ACCENT})` },
                }}
                style={{ filter: "url(#lineSoftGlow)" }}
                isAnimationActive
                animationDuration={750}
              />

              {/* Peak marker */}
              {peakPoint && peakValue > 0 && (
                <ReferenceDot
                  x={peakPoint.label}
                  y={peakValue}
                  r={5}
                  fill={ACCENT_BRIGHT}
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                  isFront
                  style={{ filter: "url(#peakDotGlow)" }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});
