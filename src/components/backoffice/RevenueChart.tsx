import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { BarChart3 } from "lucide-react";
import { format, eachMonthOfInterval, subMonths, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";

interface RevenueChartProps {
  payments: any[];
  costs: any[];
}

function fmt(v: number) {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-xs">
      <p className="font-bold text-foreground mb-2 capitalize">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center gap-2 mb-1">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-bold text-foreground">{fmt(entry.value)}</span>
        </div>
      ))}
    </div>
  );
};

const RevenueChart = ({ payments, costs }: RevenueChartProps) => {
  const chartData = useMemo(() => {
    const now = new Date();
    const months = eachMonthOfInterval({
      start: subMonths(startOfMonth(now), 5),
      end: startOfMonth(now),
    });

    return months.map(month => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      const interval = { start: monthStart, end: monthEnd };

      const received = (payments || [])
        .filter((p: any) => isWithinInterval(new Date(p.paid_at), interval))
        .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

      const fees = (payments || [])
        .filter((p: any) => isWithinInterval(new Date(p.paid_at), interval))
        .reduce((sum: number, p: any) => sum + Number(p.fee || 0), 0);

      const opCosts = (costs || [])
        .filter((c: any) => isWithinInterval(new Date(c.cost_date), interval))
        .reduce((sum: number, c: any) => sum + Number(c.amount), 0);

      const totalCosts = opCosts + fees;
      const net = received - totalCosts;

      return {
        month: format(month, "MMM yy", { locale: ptBR }),
        Recebida: Number(received.toFixed(2)),
        Custos: Number(totalCosts.toFixed(2)),
        Líquida: Number(net.toFixed(2)),
      };
    });
  }, [payments, costs]);

  const hasData = chartData.some(d => d.Recebida > 0 || d.Custos > 0);

  if (!hasData) {
    return (
      <div className="bg-card rounded-xl border border-border p-5">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.15em] mb-4">Receita Mensal</p>
        <div className="flex items-center justify-center h-[200px] text-muted-foreground/50 text-sm">
          Sem dados de receita para exibir
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-5">
        <BarChart3 size={16} className="text-primary" />
        <p className="text-xs font-bold text-foreground uppercase tracking-[0.12em]">Receita Mensal (6 meses)</p>
      </div>
      <div className="h-[240px] sm:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barGap={2} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 14%)" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "hsl(0 0% 45%)", fontWeight: 500 }}
              tickLine={false}
              axisLine={{ stroke: "hsl(0 0% 14%)" }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(0 0% 45%)", fontWeight: 500 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `R$${(v / 1000).toFixed(v >= 1000 ? 1 : 0)}${v >= 1000 ? "k" : ""}`}
              width={55}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(0 0% 10%)" }} />
            <Legend
              iconType="square"
              iconSize={10}
              wrapperStyle={{ fontSize: "11px", color: "hsl(0 0% 45%)", paddingTop: "8px", fontWeight: 500 }}
            />
            <Bar dataKey="Recebida" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
            <Bar dataKey="Custos" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={32} />
            <Bar dataKey="Líquida" fill="#60a5fa" radius={[4, 4, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default RevenueChart;
