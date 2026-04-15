import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Users,
  MessageSquareMore,
  Sparkles,
  CheckCircle2,
  CalendarCheck,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ArrowUpRight,
  Clock,
  Target,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, subDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";

/* ── Sub-components ── */

function KPICard({
  label,
  value,
  delta,
  up,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: string | number;
  delta: string;
  up: boolean;
  icon: React.ElementType;
  onClick?: () => void;
}) {
  return (
    <Card
      className="group border-border/40 bg-card/80 hover:bg-card hover:shadow-md transition-all duration-200 cursor-pointer"
      onClick={onClick}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="w-9 h-9 rounded-xl bg-primary/8 flex items-center justify-center">
            <Icon className="w-[18px] h-[18px] text-primary" />
          </div>
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              up
                ? "bg-emerald-500/10 text-emerald-500"
                : "bg-red-500/10 text-red-500"
            }`}
          >
            {up ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {delta}
          </span>
        </div>
        <p className="text-2xl font-bold text-foreground tracking-tight leading-none">
          {value}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1.5 font-medium">
          {label}
        </p>
      </CardContent>
    </Card>
  );
}

function FunnelStage({
  name,
  value,
  maxVal,
  prevVal,
  fill,
  isLast,
}: {
  name: string;
  value: number;
  maxVal: number;
  prevVal?: number;
  fill: string;
  isLast: boolean;
}) {
  const pct = maxVal > 0 ? Math.round((value / maxVal) * 100) : 0;
  const convRate = prevVal ? Math.round((value / prevVal) * 100) : 100;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-foreground">{name}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground tabular-nums">
            {value}
          </span>
          {prevVal !== undefined && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {convRate}% conv.
            </span>
          )}
        </div>
      </div>
      <div className="h-8 bg-muted/20 rounded-lg overflow-hidden">
        <div
          className="h-full rounded-lg transition-all duration-700 ease-out flex items-center justify-end pr-2.5"
          style={{
            width: `${Math.max(pct, 8)}%`,
            background: fill,
          }}
        >
          <span className="text-[10px] font-bold text-primary-foreground drop-shadow-sm tabular-nums">
            {pct}%
          </span>
        </div>
      </div>
      {!isLast && (
        <div className="flex justify-center my-1">
          <ArrowRight className="w-3 h-3 text-muted-foreground/20 rotate-90" />
        </div>
      )}
    </div>
  );
}

/* ── Main Component ── */

const CRMDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Fetch real lead data
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["crm-dashboard-leads", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("service_contacts")
        .select("id, pipeline_stage, lead_temperature, created_at, estimated_value")
        .eq("user_id", user.id)
        .limit(5000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // Fetch scheduled messages count
  const { data: scheduleCount = 0 } = useQuery({
    queryKey: ["crm-dashboard-schedules", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from("scheduled_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "pending");
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // Computed metrics
  const metrics = useMemo(() => {
    const total = leads.length;
    const stages: Record<string, number> = {};
    const dailyMap: Record<string, number> = {};
    const last7 = startOfDay(subDays(new Date(), 6));

    for (const l of leads) {
      const stage = (l as any).pipeline_stage || "novo";
      stages[stage] = (stages[stage] || 0) + 1;

      const d = new Date((l as any).created_at);
      if (d >= last7) {
        const key = format(d, "EEE", { locale: ptBR });
        dailyMap[key] = (dailyMap[key] || 0) + 1;
      }
    }

    const responded = total - (stages["novo"] || 0);
    const interested = (stages["interessado"] || 0) + (stages["negociacao"] || 0) + (stages["fechado"] || 0);
    const closed = stages["fechado"] || 0;

    const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0;
    const interestRate = total > 0 ? Math.round((interested / total) * 100) : 0;
    const closeRate = total > 0 ? Math.round((closed / total) * 100) : 0;

    // Build daily chart (last 7 days)
    const dailyChart: { day: string; leads: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const key = format(d, "EEE", { locale: ptBR });
      const dayLabel = format(d, "EEE", { locale: ptBR }).replace(".", "");
      dailyChart.push({
        day: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1),
        leads: dailyMap[key] || 0,
      });
    }

    return {
      total, responseRate, interestRate, closeRate,
      stages, dailyChart, schedules: scheduleCount,
    };
  }, [leads, scheduleCount]);

  const pipelineStages = [
    { name: "Novo Lead", value: metrics.stages["novo"] || 0, fill: "hsl(var(--primary))" },
    { name: "Respondeu", value: metrics.stages["respondeu"] || 0, fill: "hsl(var(--primary) / .75)" },
    { name: "Interessado", value: metrics.stages["interessado"] || 0, fill: "hsl(var(--primary) / .55)" },
    { name: "Negociação", value: metrics.stages["negociacao"] || 0, fill: "hsl(var(--primary) / .40)" },
    { name: "Fechado", value: metrics.stages["fechado"] || 0, fill: "hsl(142 71% 45%)" },
  ];

  const kpiCards = [
    { label: "Total de Leads", value: metrics.total, delta: `${metrics.total}`, up: true, icon: Users },
    { label: "Taxa de Resposta", value: `${metrics.responseRate}%`, delta: `${metrics.responseRate}%`, up: metrics.responseRate > 50, icon: MessageSquareMore },
    { label: "Taxa de Interesse", value: `${metrics.interestRate}%`, delta: `${metrics.interestRate}%`, up: metrics.interestRate > 30, icon: Sparkles },
    { label: "Taxa de Fechamento", value: `${metrics.closeRate}%`, delta: `${metrics.closeRate}%`, up: metrics.closeRate > 10, icon: CheckCircle2 },
    { label: "Agendamentos", value: metrics.schedules, delta: `${metrics.schedules}`, up: true, icon: CalendarCheck },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">
            Dashboard CRM
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Visão geral de vendas e conversão
          </p>
        </div>
        <button
          onClick={() => navigate("/dashboard/crm-reports")}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          Ver relatórios <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="border-border/40">
                <CardContent className="p-5">
                  <Skeleton className="h-9 w-9 rounded-xl mb-3" />
                  <Skeleton className="h-7 w-16 mb-1" />
                  <Skeleton className="h-3 w-20" />
                </CardContent>
              </Card>
            ))
          : kpiCards.map((kpi) => (
              <KPICard key={kpi.label} {...kpi} />
            ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Leads por Dia */}
        <Card className="border-border/40 bg-card/80">
          <div className="p-5 pb-0">
            <div className="flex items-center gap-2 mb-0.5">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">
                Novos leads
              </h2>
            </div>
            <p className="text-[11px] text-muted-foreground">Últimos 7 dias</p>
          </div>
          <div className="p-5 pt-3">
            {isLoading ? (
              <Skeleton className="h-[240px] w-full rounded-lg" />
            ) : (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={metrics.dailyChart}
                    barSize={28}
                    margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      vertical={false}
                      opacity={0.5}
                    />
                    <XAxis
                      dataKey="day"
                      axisLine={false}
                      tickLine={false}
                      tick={{
                        fill: "hsl(var(--muted-foreground))",
                        fontSize: 11,
                      }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{
                        fill: "hsl(var(--muted-foreground))",
                        fontSize: 11,
                      }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 10,
                        fontSize: 12,
                        color: "hsl(var(--foreground))",
                        boxShadow: "0 4px 12px -2px rgba(0,0,0,0.12)",
                      }}
                      cursor={{ fill: "hsl(var(--muted) / .2)" }}
                    />
                    <Bar
                      dataKey="leads"
                      radius={[6, 6, 0, 0]}
                      fill="hsl(var(--primary))"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Card>

        {/* Pipeline / Funil */}
        <Card className="border-border/40 bg-card/80">
          <div className="p-5 pb-0">
            <div className="flex items-center gap-2 mb-0.5">
              <Target className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">
                Funil de conversão
              </h2>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Pipeline de vendas atual
            </p>
          </div>
          <div className="p-5 pt-3">
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {pipelineStages.map((stage, i) => (
                  <FunnelStage
                    key={stage.name}
                    name={stage.name}
                    value={stage.value}
                    maxVal={pipelineStages[0].value || 1}
                    prevVal={i > 0 ? pipelineStages[i - 1].value : undefined}
                    fill={stage.fill}
                    isLast={i === pipelineStages.length - 1}
                  />
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Leads", path: "/dashboard/leads", icon: Users, desc: "Gerenciar contatos" },
          { label: "Pipeline", path: "/dashboard/pipeline", icon: Target, desc: "Funil de vendas" },
          { label: "Agendamentos", path: "/dashboard/crm-agendamentos", icon: Clock, desc: "Follow-ups e reuniões" },
          { label: "Disparos", path: "/dashboard/crm-dispatches", icon: MessageSquareMore, desc: "Campanhas CRM" },
        ].map((item) => (
          <button
            key={item.label}
            onClick={() => navigate(item.path)}
            className="group flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-card/50 hover:bg-card hover:shadow-sm hover:border-border/60 transition-all duration-200 text-left"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/8 flex items-center justify-center shrink-0 group-hover:bg-primary/12 transition-colors">
              <item.icon className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{item.label}</p>
              <p className="text-[11px] text-muted-foreground">{item.desc}</p>
            </div>
            <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40 ml-auto shrink-0 group-hover:text-primary/60 transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default CRMDashboard;
