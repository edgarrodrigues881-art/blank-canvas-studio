import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Users, TrendingUp, Clock, Target, Percent, UserCheck,
  DollarSign, Lightbulb, AlertTriangle, CalendarDays, Flame, Snowflake, ThermometerSun,
  ArrowDown, MessageSquare, Reply, BarChart3,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import { format, subDays, startOfDay, endOfDay, differenceInMinutes, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";

type Period = "7d" | "30d" | "90d" | "all";

const PIPELINE_STAGES = [
  { key: "novo", label: "Novo Lead", color: "#6366f1" },
  { key: "respondeu", label: "Respondeu", color: "#3b82f6" },
  { key: "interessado", label: "Interessado", color: "#f59e0b" },
  { key: "negociacao", label: "Negociação", color: "#8b5cf6" },
  { key: "fechado", label: "Fechado", color: "#10b981" },
];

const TEMP_CONFIG: Record<string, { label: string; color: string; icon: typeof Snowflake }> = {
  frio: { label: "Frio", color: "#3b82f6", icon: Snowflake },
  morno: { label: "Morno", color: "#f59e0b", icon: ThermometerSun },
  quente: { label: "Quente", color: "#ef4444", icon: Flame },
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

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: 12,
};

export default function CRMReports() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("30d");
  const { from, to } = usePeriodRange(period);

  const { data: leads = [], isLoading: loadingLeads } = useQuery({
    queryKey: ["crm-report-leads", user?.id, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("service_contacts")
        .select("id, origin, lead_temperature, pipeline_stage, estimated_value, priority, tags, created_at, first_contact_at, last_message_at")
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

  const { data: conversations = [], isLoading: loadingConv } = useQuery({
    queryKey: ["crm-report-conv", user?.id, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("conversations")
        .select("id, created_at, attending_status, last_message_at")
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

  // All leads (no period filter) for "today" panel
  const { data: allLeads = [] } = useQuery({
    queryKey: ["crm-report-all-leads", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("service_contacts")
        .select("id, name, lead_temperature, pipeline_stage, estimated_value, last_message_at, priority")
        .eq("user_id", user.id)
        .limit(5000);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user,
    staleTime: 120_000,
  });

  const isLoading = loadingLeads || loadingConv;

  const metrics = useMemo(() => {
    const total = leads.length;

    const byStage: Record<string, number> = {};
    const byTemp: Record<string, number> = {};
    let totalEstimatedValue = 0;
    let totalClosedValue = 0;

    for (const l of leads) {
      const stage = l.pipeline_stage || "novo";
      byStage[stage] = (byStage[stage] || 0) + 1;

      const temp = l.lead_temperature || "frio";
      byTemp[temp] = (byTemp[temp] || 0) + 1;

      const val = parseFloat(l.estimated_value) || 0;
      if (stage === "fechado" || temp === "cliente") {
        totalClosedValue += val;
      } else if (["interessado", "negociacao"].includes(stage) || ["quente", "morno"].includes(temp)) {
        totalEstimatedValue += val;
      }
    }

    // Response rate
    const responded = leads.filter((l: any) => {
      const stage = l.pipeline_stage || "";
      return ["respondeu", "interessado", "negociacao", "fechado"].includes(stage);
    }).length;
    const responseRate = total > 0 ? (responded / total) * 100 : 0;

    // Conversion rate (fechado / total)
    const closed = byStage["fechado"] || 0;
    const conversionRate = total > 0 ? (closed / total) * 100 : 0;

    // Avg response time: estimate from conversation created_at to last_message_at
    const responseTimes = conversations
      .filter((c: any) => c.last_message_at && c.created_at)
      .map((c: any) => differenceInMinutes(new Date(c.last_message_at), new Date(c.created_at)))
      .filter((m: number) => m > 0 && m < 1440); // cap at 24h for relevance
    const avgResponseMin = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length)
      : 0;

    // Daily data for activity chart
    const dailyMap: Record<string, { leads: number; responses: number }> = {};
    for (const l of leads) {
      const day = format(new Date(l.created_at), "dd/MM", { locale: ptBR });
      if (!dailyMap[day]) dailyMap[day] = { leads: 0, responses: 0 };
      dailyMap[day].leads++;
    }
    for (const c of conversations) {
      const day = format(new Date(c.created_at), "dd/MM", { locale: ptBR });
      if (!dailyMap[day]) dailyMap[day] = { leads: 0, responses: 0 };
      if ((c as any).first_reply_at) dailyMap[day].responses++;
    }

    // By origin
    const byOrigin: Record<string, number> = {};
    for (const l of leads) {
      const origin = l.origin || "Manual";
      byOrigin[origin] = (byOrigin[origin] || 0) + 1;
    }

    return {
      total, responseRate, conversionRate, avgResponseMin,
      totalEstimatedValue, totalClosedValue,
      byStage, byTemp, byOrigin, dailyMap,
    };
  }, [leads, conversations]);

  // Today panel data
  const todayPanel = useMemo(() => {
    const now = new Date();
    const noResponseHours = 24;

    const pendingResponse = allLeads.filter((l: any) => {
      if (!l.last_message_at) return false;
      const hours = differenceInHours(now, new Date(l.last_message_at));
      const stage = l.pipeline_stage || "novo";
      return hours > noResponseHours && !["fechado", "perdido"].includes(stage);
    });

    const hotPending = allLeads.filter((l: any) =>
      l.lead_temperature === "quente" && !["fechado", "perdido"].includes(l.pipeline_stage || "")
    );

    const nearClose = allLeads.filter((l: any) =>
      l.pipeline_stage === "negociacao"
    );

    return { pendingResponse: pendingResponse.length, hotPending: hotPending.length, nearClose: nearClose.length };
  }, [allLeads]);

  // Insights
  const insights = useMemo(() => {
    const items: { text: string; type: "warning" | "info" | "success" }[] = [];

    if (todayPanel.pendingResponse > 0) {
      items.push({ text: `${todayPanel.pendingResponse} leads sem resposta há mais de 24h`, type: "warning" });
    }
    if (metrics.responseRate < 30 && metrics.total > 5) {
      items.push({ text: `Taxa de resposta baixa (${metrics.responseRate.toFixed(0)}%). Considere revisar a abordagem inicial.`, type: "warning" });
    }
    if (todayPanel.hotPending > 0) {
      items.push({ text: `${todayPanel.hotPending} leads quentes aguardando ação — priorize o contato!`, type: "warning" });
    }
    if (metrics.conversionRate > 10) {
      items.push({ text: `Boa taxa de conversão (${metrics.conversionRate.toFixed(1)}%). Continue com a estratégia atual.`, type: "success" });
    }
    if (todayPanel.nearClose > 0) {
      items.push({ text: `${todayPanel.nearClose} oportunidades em negociação — próximas de fechar!`, type: "info" });
    }
    if (items.length === 0) {
      items.push({ text: "Acompanhe suas métricas para gerar insights mais precisos.", type: "info" });
    }
    return items;
  }, [todayPanel, metrics]);

  // Chart data
  const funnelData = useMemo(() => {
    return PIPELINE_STAGES.map((s, i, arr) => {
      const count = metrics.byStage[s.key] || 0;
      const prevCount = i > 0 ? (metrics.byStage[arr[i - 1].key] || 0) : metrics.total;
      const dropPct = prevCount > 0 ? ((1 - count / prevCount) * 100) : 0;
      return { name: s.label, value: count, fill: s.color, dropPct: i > 0 ? dropPct : 0 };
    });
  }, [metrics]);

  const activityData = useMemo(() => {
    return Object.entries(metrics.dailyMap).map(([day, d]) => ({
      day, leads: d.leads, responses: d.responses,
    }));
  }, [metrics.dailyMap]);

  const tempData = useMemo(() => {
    return ["frio", "morno", "quente"].map(t => ({
      name: TEMP_CONFIG[t]?.label || t,
      value: metrics.byTemp[t] || 0,
      fill: TEMP_CONFIG[t]?.color || "#6b7280",
      pct: metrics.total > 0 ? ((metrics.byTemp[t] || 0) / metrics.total * 100) : 0,
    }));
  }, [metrics]);

  const originData = useMemo(() => {
    const colors = ["#6366f1", "#3b82f6", "#f59e0b", "#8b5cf6", "#10b981", "#ef4444"];
    return Object.entries(metrics.byOrigin).map(([origin, count], i) => ({
      name: origin, value: count, fill: colors[i % colors.length],
    }));
  }, [metrics.byOrigin]);

  const formatResponseTime = (mins: number) => {
    if (mins < 60) return `${mins}min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  };

  const formatCurrency = (val: number) => {
    return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
  };

  const kpiCards = [
    { title: "Total de Leads", value: metrics.total.toLocaleString("pt-BR"), icon: Users, color: "text-blue-400", bg: "bg-blue-500/10" },
    { title: "Taxa de Resposta", value: `${metrics.responseRate.toFixed(1)}%`, icon: Percent, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { title: "Taxa de Conversão", value: `${metrics.conversionRate.toFixed(1)}%`, icon: Target, color: "text-purple-400", bg: "bg-purple-500/10" },
    { title: "Tempo Médio Resposta", value: formatResponseTime(metrics.avgResponseMin), icon: Clock, color: "text-cyan-400", bg: "bg-cyan-500/10" },
    { title: "Em Negociação", value: formatCurrency(metrics.totalEstimatedValue), icon: DollarSign, color: "text-amber-400", bg: "bg-amber-500/10" },
    { title: "Receita Fechada", value: formatCurrency(metrics.totalClosedValue), icon: UserCheck, color: "text-green-400", bg: "bg-green-500/10" },
  ];

  const insightColors = { warning: "border-amber-500/30 bg-amber-500/5", info: "border-blue-500/30 bg-blue-500/5", success: "border-emerald-500/30 bg-emerald-500/5" };
  const insightIcons = { warning: AlertTriangle, info: Lightbulb, success: TrendingUp };
  const insightTextColors = { warning: "text-amber-400", info: "text-blue-400", success: "text-emerald-400" };

  return (
    <div className="space-y-4 p-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Performance de Vendas</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Métricas, funil e insights para tomada de decisão</p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[150px] h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7 dias</SelectItem>
            <SelectItem value="30d">30 dias</SelectItem>
            <SelectItem value="90d">90 dias</SelectItem>
            <SelectItem value="all">Tudo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map((card) => (
          <Card key={card.title} className="border-border/40 bg-card/50">
            <CardContent className="p-3">
              <div className="flex items-center gap-2.5">
                <div className={`p-1.5 rounded-lg ${card.bg}`}>
                  <card.icon className={`h-3.5 w-3.5 ${card.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-muted-foreground truncate leading-tight">{card.title}</p>
                  {isLoading ? (
                    <Skeleton className="h-5 w-12 mt-0.5" />
                  ) : (
                    <p className="text-base font-bold leading-tight mt-0.5">{card.value}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Today Panel + Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Today */}
        <Card className="border-border/40 bg-card/50">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Painel do Dia
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2.5">
            {[
              { label: "Leads para responder", value: todayPanel.pendingResponse, color: "text-amber-400", badgeColor: todayPanel.pendingResponse > 0 ? "destructive" as const : "secondary" as const },
              { label: "Leads quentes pendentes", value: todayPanel.hotPending, color: "text-red-400", badgeColor: todayPanel.hotPending > 0 ? "destructive" as const : "secondary" as const },
              { label: "Próximas de fechar", value: todayPanel.nearClose, color: "text-emerald-400", badgeColor: "secondary" as const },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
                <span className="text-xs text-muted-foreground">{item.label}</span>
                <Badge variant={item.badgeColor} className="text-xs font-bold tabular-nums">
                  {item.value}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Insights */}
        <Card className="border-border/40 bg-card/50 lg:col-span-2">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-400" />
              Insights Inteligentes
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            {insights.map((insight, i) => {
              const Icon = insightIcons[insight.type];
              return (
                <div key={i} className={`flex items-start gap-2.5 p-2.5 rounded-lg border ${insightColors[insight.type]}`}>
                  <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${insightTextColors[insight.type]}`} />
                  <p className="text-xs leading-relaxed">{insight.text}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Funnel + Lead Quality */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Funnel */}
        <Card className="border-border/40 bg-card/50 lg:col-span-2">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Funil de Conversão
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {isLoading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : (
              <div className="space-y-2">
                {funnelData.map((stage, i) => {
                  const maxValue = Math.max(...funnelData.map(s => s.value), 1);
                  const widthPct = Math.max((stage.value / maxValue) * 100, 8);
                  return (
                    <div key={stage.name} className="space-y-1">
                      {i > 0 && stage.dropPct > 0 && (
                        <div className="flex items-center gap-1 ml-2">
                          <ArrowDown className="h-2.5 w-2.5 text-red-400" />
                          <span className="text-[9px] text-red-400 font-medium">-{stage.dropPct.toFixed(0)}%</span>
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-muted-foreground w-[90px] shrink-0 text-right">{stage.name}</span>
                        <div className="flex-1 relative">
                          <div
                            className="h-8 rounded-md flex items-center px-3 transition-all duration-500"
                            style={{ width: `${widthPct}%`, backgroundColor: stage.fill }}
                          >
                            <span className="text-[11px] font-bold text-white drop-shadow-sm">{stage.value}</span>
                          </div>
                        </div>
                        {metrics.total > 0 && (
                          <span className="text-[10px] text-muted-foreground w-[40px] shrink-0 text-right">
                            {((stage.value / metrics.total) * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lead Quality */}
        <Card className="border-border/40 bg-card/50">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Flame className="h-4 w-4 text-red-400" />
              Qualidade dos Leads
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <div className="space-y-4">
                {tempData.map((item) => {
                  const Icon = TEMP_CONFIG[item.name.toLowerCase()]?.icon || Snowflake;
                  return (
                    <div key={item.name} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5" style={{ color: item.fill }} />
                          <span className="text-xs font-medium">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold">{item.value}</span>
                          <span className="text-[10px] text-muted-foreground">({item.pct.toFixed(0)}%)</span>
                        </div>
                      </div>
                      <div className="h-2.5 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.max(item.pct, 2)}%`, backgroundColor: item.fill }}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Summary ring */}
                <div className="pt-2 border-t border-border/20">
                  <div className="flex items-center justify-center gap-4">
                    <ResponsiveContainer width={80} height={80}>
                      <PieChart>
                        <Pie data={tempData.filter(d => d.value > 0)} cx="50%" cy="50%" innerRadius={22} outerRadius={35} paddingAngle={3} dataKey="value">
                          {tempData.filter(d => d.value > 0).map((entry, index) => (
                            <Cell key={index} fill={entry.fill} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1">
                      {tempData.filter(d => d.value > 0).map(d => (
                        <div key={d.name} className="flex items-center gap-1.5 text-[10px]">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.fill }} />
                          <span className="text-muted-foreground">{d.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity + Origin */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Activity Chart */}
        <Card className="border-border/40 bg-card/50">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Leads vs Respostas
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {isLoading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : activityData.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">Sem dados no período</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={activityData} margin={{ left: -10, right: 10, top: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="leads" name="Novos Leads" stroke="#6366f1" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="responses" name="Respostas" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Origin */}
        <Card className="border-border/40 bg-card/50">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Reply className="h-4 w-4 text-primary" />
              Leads por Origem
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {isLoading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : originData.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">Sem dados no período</div>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie data={originData} cx="50%" cy="50%" innerRadius={40} outerRadius={75} paddingAngle={3} dataKey="value">
                      {originData.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {originData.map((o) => (
                    <div key={o.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: o.fill }} />
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

      {/* Lost leads */}
      {!isLoading && (metrics.byStage["perdido"] || 0) > 0 && (
        <Card className="border-border/40 bg-card/50 border-red-500/20">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-red-500/10">
              <Target className="h-3.5 w-3.5 text-red-400" />
            </div>
            <div>
              <p className="text-xs font-medium">
                {metrics.byStage["perdido"]} leads perdidos no período
              </p>
              <p className="text-[10px] text-muted-foreground">
                Taxa de perda: {((metrics.byStage["perdido"] / metrics.total) * 100).toFixed(1)}%
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
