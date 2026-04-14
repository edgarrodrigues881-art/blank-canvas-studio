import { useMemo } from "react";
import {
  LayoutDashboard,
  Users,
  MessageSquareMore,
  Sparkles,
  CheckCircle2,
  CalendarCheck,
  TrendingUp,
  TrendingDown,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  FunnelChart,
  Funnel,
  LabelList,
  Cell,
} from "recharts";

/* ── Fake data (replace with real queries later) ── */

const kpiCards = [
  {
    label: "Total de Leads",
    value: 248,
    delta: "+12%",
    up: true,
    icon: Users,
  },
  {
    label: "Taxa de Resposta",
    value: "64%",
    delta: "+3pp",
    up: true,
    icon: MessageSquareMore,
  },
  {
    label: "Taxa de Interesse",
    value: "38%",
    delta: "-2pp",
    up: false,
    icon: Sparkles,
  },
  {
    label: "Taxa de Fechamento",
    value: "14%",
    delta: "+1pp",
    up: true,
    icon: CheckCircle2,
  },
  {
    label: "Agendamentos",
    value: 37,
    delta: "+8",
    up: true,
    icon: CalendarCheck,
  },
];

const leadsPerDay = [
  { day: "Seg", leads: 32 },
  { day: "Ter", leads: 45 },
  { day: "Qua", leads: 28 },
  { day: "Qui", leads: 51 },
  { day: "Sex", leads: 40 },
  { day: "Sáb", leads: 18 },
  { day: "Dom", leads: 12 },
];

const pipelineStages = [
  { name: "Novo Lead", value: 248, fill: "hsl(var(--primary))" },
  { name: "Respondeu", value: 159, fill: "hsl(var(--primary) / .75)" },
  { name: "Interessado", value: 94, fill: "hsl(var(--primary) / .55)" },
  { name: "Agendado", value: 37, fill: "hsl(var(--primary) / .40)" },
  { name: "Fechado", value: 35, fill: "hsl(142 71% 45%)" },
];

/* ── Component ── */

const CRMDashboard = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <LayoutDashboard className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground leading-tight">Dashboard CRM</h1>
            <p className="text-xs text-muted-foreground">Visão geral de vendas e conversão</p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpiCards.map((kpi) => (
          <Card key={kpi.label} className="bg-card border-border relative overflow-hidden group">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <kpi.icon className="w-4 h-4 text-primary" />
                </div>
                <span
                  className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                    kpi.up
                      ? "bg-emerald-500/10 text-emerald-500"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {kpi.up ? <TrendingUp className="w-3 h-3 inline mr-0.5 -mt-0.5" /> : <TrendingDown className="w-3 h-3 inline mr-0.5 -mt-0.5" />}
                  {kpi.delta}
                </span>
              </div>
              <p className="text-2xl font-bold text-foreground leading-none">{kpi.value}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Leads por Dia */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Leads por dia
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">Últimos 7 dias</p>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leadsPerDay} barSize={28} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "hsl(var(--foreground))",
                    }}
                    cursor={{ fill: "hsl(var(--muted) / .3)" }}
                  />
                  <Bar dataKey="leads" radius={[6, 6, 0, 0]} fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Pipeline / Funil de Conversão */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Conversão por etapa
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">Funil de vendas atual</p>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="space-y-2.5">
              {pipelineStages.map((stage, i) => {
                const maxVal = pipelineStages[0].value;
                const pct = Math.round((stage.value / maxVal) * 100);
                const convRate = i > 0
                  ? Math.round((stage.value / pipelineStages[i - 1].value) * 100)
                  : 100;

                return (
                  <div key={stage.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-foreground">{stage.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground">{stage.value}</span>
                        {i > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            ({convRate}% conv.)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-7 bg-muted/30 rounded-lg overflow-hidden relative">
                      <div
                        className="h-full rounded-lg transition-all duration-700 ease-out flex items-center justify-end pr-2"
                        style={{
                          width: `${pct}%`,
                          background: stage.fill,
                          minWidth: "2rem",
                        }}
                      >
                        <span className="text-[10px] font-bold text-primary-foreground drop-shadow-sm">
                          {pct}%
                        </span>
                      </div>
                    </div>
                    {i < pipelineStages.length - 1 && (
                      <div className="flex justify-center my-0.5">
                        <ArrowRight className="w-3 h-3 text-muted-foreground/30 rotate-90" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CRMDashboard;
