import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3, Users, TrendingUp, MessageSquare, Clock, Target, Percent, UserCheck,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, FunnelChart, Funnel, LabelList,
} from "recharts";
import { format, subDays, startOfDay, endOfDay, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";

type Period = "7d" | "30d" | "90d" | "all";

const PIPELINE_STAGES = [
  { key: "novo", label: "Novo Lead", color: "hsl(var(--primary))" },
  { key: "respondeu", label: "Respondeu", color: "#3b82f6" },
  { key: "interessado", label: "Interessado", color: "#f59e0b" },
  { key: "negociacao", label: "Negociação", color: "#8b5cf6" },
  { key: "fechado", label: "Fechado", color: "#10b981" },
  { key: "perdido", label: "Perdido", color: "#ef4444" },
];

const ORIGIN_COLORS = ["hsl(var(--primary))", "#3b82f6", "#f59e0b", "#8b5cf6", "#10b981", "#ef4444"];

const TEMP_CONFIG: Record<string, { label: string; color: string }> = {
  frio: { label: "Frio", color: "#3b82f6" },
  morno: { label: "Morno", color: "#f59e0b" },
  quente: { label: "Quente", color: "#ef4444" },
  cliente: { label: "Cliente", color: "#10b981" },
  perdido: { label: "Perdido", color: "#6b7280" },
};

function usePeriodRange(period: Period) {
  return useMemo(() => {
    const now = new Date();
    switch (period) {
      case "7d": return { from: startOfDay(subDays(now, 7)).toISOString(), to: endOfDay(now).toISOString() };
      case "30d": return { from: startOfDay(subDays(now, 30)).toISOString(), to: endOfDay(now).toISOString() };
      case "90d": return { from: startOfDay(subDays(now, 90)).toISOString(), to: endOfDay(now).toISOString() };
      case "all": return { from: "2020-01-01T00:00:00Z", to: endOfDay(now).toISOString() };
    }
  }, [period]);
}

export default function CRMReports() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("30d");
  const { from, to } = usePeriodRange(period);

  // Fetch all service_contacts (leads)
  const { data: leads = [], isLoading: loadingLeads } = useQuery({
    queryKey: ["crm-report-leads", user?.id, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("service_contacts")
        .select("id, origin, lead_temperature, tags, created_at, first_contact_at, last_message_at")
        .eq("user_id", user.id)
        .gte("created_at", from)
        .lte("created_at", to)
        .limit(5000);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user,
    staleTime: 120_000,
  });

  // Fetch conversations for response time calc
  const { data: conversations = [], isLoading: loadingConv } = useQuery({
    queryKey: ["crm-report-conv", user?.id, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("conversations")
        .select("id, created_at, first_reply_at, attending_status")
        .eq("user_id", user.id)
        .gte("created_at", from)
        .lte("created_at", to)
        .limit(5000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 120_000,
  });

  const isLoading = loadingLeads || loadingConv;

  // ── Metrics ──
  const metrics = useMemo(() => {
    const total = leads.length;

    // Map lead_temperature to pipeline-like stages for funnel
    const tempToStage: Record<string, string> = {
      frio: "novo",
      morno: "respondeu",
      quente: "interessado",
      cliente: "fechado",
      perdido: "perdido",
    };

    const byStage: Record<string, number> = {};
    for (const l of leads) {
      const stage = tempToStage[l.lead_temperature || "frio"] || "novo";
      byStage[stage] = (byStage[stage] || 0) + 1;
    }

    // Response rate: leads that are not "frio"
    const responded = leads.filter((l: any) => l.lead_temperature && l.lead_temperature !== "frio").length;
    const responseRate = total > 0 ? (responded / total) * 100 : 0;

    // Interest rate: quente + cliente
    const interested = leads.filter((l: any) =>
      ["quente", "cliente"].includes(l.lead_temperature || "")
    ).length;
    const interestRate = total > 0 ? (interested / total) * 100 : 0;

    // Close rate
    const closed = byStage["fechado"] || 0;
    const closeRate = total > 0 ? (closed / total) * 100 : 0;

    // Avg response time from conversations
    const responseTimes = conversations
      .filter((c: any) => c.first_reply_at && c.created_at)
      .map((c: any) => differenceInMinutes(new Date(c.first_reply_at), new Date(c.created_at)));
    const avgResponseMin = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length)
      : 0;

    // By origin
    const byOrigin: Record<string, number> = {};
    for (const l of leads) {
      const origin = l.origin || "Manual";
      byOrigin[origin] = (byOrigin[origin] || 0) + 1;
    }

    // By temperature
    const byTemp: Record<string, number> = {};
    for (const l of leads) {
      const temp = l.lead_temperature || "frio";
      byTemp[temp] = (byTemp[temp] || 0) + 1;
    }

    // Daily new leads (for chart)
    const dailyLeads: Record<string, number> = {};
    for (const l of leads) {
      const day = format(new Date(l.created_at), "dd/MM", { locale: ptBR });
      dailyLeads[day] = (dailyLeads[day] || 0) + 1;
    }

    return {
      total, responseRate, interestRate, closeRate, avgResponseMin,
      byStage, byOrigin, byTemp, dailyLeads,
    };
  }, [leads, conversations]);

  // Chart data
  const funnelData = useMemo(() => {
    return PIPELINE_STAGES
      .filter(s => s.key !== "perdido")
      .map(s => ({
        name: s.label,
        value: metrics.byStage[s.key] || 0,
        fill: s.color,
      }));
  }, [metrics.byStage]);

  const originData = useMemo(() => {
    return Object.entries(metrics.byOrigin).map(([origin, count], i) => ({
      name: origin,
      value: count,
      fill: ORIGIN_COLORS[i % ORIGIN_COLORS.length],
    }));
  }, [metrics.byOrigin]);

  const tempData = useMemo(() => {
    return Object.entries(metrics.byTemp).map(([temp, count]) => ({
      name: TEMP_CONFIG[temp]?.label || temp,
      value: count,
      fill: TEMP_CONFIG[temp]?.color || "#6b7280",
    }));
  }, [metrics.byTemp]);

  const dailyData = useMemo(() => {
    return Object.entries(metrics.dailyLeads).map(([day, count]) => ({
      day,
      leads: count,
    }));
  }, [metrics.dailyLeads]);

  const formatResponseTime = (mins: number) => {
    if (mins < 60) return `${mins}min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  };

  const statCards = [
    { title: "Total de Leads", value: metrics.total.toLocaleString("pt-BR"), icon: Users, color: "text-blue-400", bg: "bg-blue-500/10" },
    { title: "Taxa de Resposta", value: `${metrics.responseRate.toFixed(1)}%`, icon: Percent, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { title: "Taxa de Interesse", value: `${metrics.interestRate.toFixed(1)}%`, icon: TrendingUp, color: "text-amber-400", bg: "bg-amber-500/10" },
    { title: "Taxa de Fechamento", value: `${metrics.closeRate.toFixed(1)}%`, icon: Target, color: "text-purple-400", bg: "bg-purple-500/10" },
    { title: "Tempo Médio de Resposta", value: formatResponseTime(metrics.avgResponseMin), icon: Clock, color: "text-cyan-400", bg: "bg-cyan-500/10" },
    { title: "Leads Fechados", value: (metrics.byStage["fechado"] || 0).toLocaleString("pt-BR"), icon: UserCheck, color: "text-green-400", bg: "bg-green-500/10" },
  ];

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relatórios do CRM</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Métricas de vendas, conversão e performance
          </p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="90d">Últimos 90 dias</SelectItem>
            <SelectItem value="all">Tudo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card) => (
          <Card key={card.title} className="border-border/40 bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${card.bg}`}>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground truncate">{card.title}</p>
                  {isLoading ? (
                    <Skeleton className="h-6 w-14 mt-0.5" />
                  ) : (
                    <p className="text-lg font-bold">{card.value}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline Funnel */}
        <Card className="border-border/40 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Conversão por Etapa do Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : funnelData.every(d => d.value === 0) ? (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                Sem dados no período
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={funnelData} layout="vertical" margin={{ left: 20, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={90} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [value, "Leads"]}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {funnelData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            {/* Conversion percentages */}
            {!isLoading && metrics.total > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {PIPELINE_STAGES.filter(s => s.key !== "perdido").map(stage => {
                  const count = metrics.byStage[stage.key] || 0;
                  const pct = ((count / metrics.total) * 100).toFixed(1);
                  return (
                    <div key={stage.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                      {stage.label}: <span className="font-medium text-foreground">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Leads by Origin */}
        <Card className="border-border/40 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Leads por Origem
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : originData.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                Sem dados no período
              </div>
            ) : (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={280}>
                  <PieChart>
                    <Pie
                      data={originData}
                      cx="50%" cy="50%"
                      innerRadius={50} outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {originData.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {originData.map((o) => (
                    <div key={o.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: o.fill }} />
                        <span className="text-muted-foreground">{o.name}</span>
                      </div>
                      <span className="font-semibold">{o.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Daily new leads */}
        <Card className="border-border/40 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Novos Leads por Dia
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : dailyData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">
                Sem dados no período
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [value, "Leads"]}
                  />
                  <Bar dataKey="leads" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Temperature Distribution */}
        <Card className="border-border/40 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Distribuição por Temperatura
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : tempData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">
                Sem dados no período
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                {tempData.map((item) => {
                  const pct = metrics.total > 0 ? (item.value / metrics.total) * 100 : 0;
                  return (
                    <div key={item.name} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
                          <span>{item.name}</span>
                        </div>
                        <span className="font-semibold">{item.value} <span className="text-muted-foreground font-normal text-xs">({pct.toFixed(1)}%)</span></span>
                      </div>
                      <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: item.fill }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lost leads info */}
      {!isLoading && (metrics.byStage["perdido"] || 0) > 0 && (
        <Card className="border-border/40 bg-card/50 border-red-500/20">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <Target className="h-4 w-4 text-red-400" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {metrics.byStage["perdido"]} leads perdidos no período
              </p>
              <p className="text-xs text-muted-foreground">
                Taxa de perda: {((metrics.byStage["perdido"] / metrics.total) * 100).toFixed(1)}%
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
