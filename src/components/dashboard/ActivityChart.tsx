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
} from "recharts";
import { TrendingUp } from "lucide-react";

interface WarmupPoint {
  label: string;
  volume: number;
  entregas: number;
  crescimento: number;
}

interface Props {
  data: WarmupPoint[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border/60 rounded-xl px-4 py-3 shadow-xl backdrop-blur-sm">
      <p className="text-xs font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-semibold text-foreground">{entry.value?.toLocaleString("pt-BR")}</span>
        </div>
      ))}
    </div>
  );
};

export const ActivityChart = React.memo(function ActivityChart({ data }: Props) {
  const totalEntregas = data.reduce((sum, d) => sum + (d.entregas || 0), 0);

  return (
    <Card className="border-border/50 bg-card w-full col-span-full overflow-hidden">
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Mensagens Entregues — 7 dias
          </CardTitle>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="w-2 h-2 rounded-full" style={{ background: "hsl(152, 69%, 53%)" }} />
            <span className="text-muted-foreground">Entregas confirmadas</span>
          </div>
        </div>
        <div className="mt-1">
          <span className="text-2xl font-bold text-foreground">{totalEntregas.toLocaleString("pt-BR")}</span>
          <span className="text-xs text-muted-foreground ml-1.5">mensagens entregues</span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="gradEntregas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(152, 69%, 53%)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="hsl(152, 69%, 53%)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
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
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="entregas"
                stroke="hsl(152, 69%, 53%)"
                strokeWidth={2.5}
                fill="url(#gradEntregas)"
                name="Entregas"
                dot={{ r: 3, fill: "hsl(152, 69%, 53%)", strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "hsl(152, 69%, 53%)", stroke: "hsl(var(--background))", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});
