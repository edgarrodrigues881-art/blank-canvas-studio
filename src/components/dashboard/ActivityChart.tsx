import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { XAxis, YAxis, Tooltip, ResponsiveContainer, Bar, BarChart } from "recharts";
import { BarChart3 } from "lucide-react";

interface WarmupPoint {
  label: string;
  volume: number;
  entregas: number;
  crescimento: number;
}

interface Props {
  data: WarmupPoint[];
}

export const ActivityChart = React.memo(function ActivityChart({ data }: Props) {
  return (
    <Card className="border-border/50 bg-card w-full col-span-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
          Evolução do Aquecimento — 7 dias
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted) / 0.2)" }}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Bar
                dataKey="volume"
                fill="hsl(217, 91%, 60%)"
                opacity={0.7}
                barSize={14}
                radius={[3, 3, 0, 0]}
                name="Volume"
              />
              <Bar
                dataKey="entregas"
                fill="hsl(152, 69%, 53%)"
                opacity={0.8}
                barSize={14}
                radius={[3, 3, 0, 0]}
                name="Entregas"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "hsl(217, 91%, 60%)" }} /> Volume</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "hsl(152, 69%, 53%)" }} /> Entregas</span>
        </div>
      </CardContent>
    </Card>
  );
});
