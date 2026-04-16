import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Users, TrendingUp, Clock, Target, Percent, UserCheck,
  DollarSign, Lightbulb, AlertTriangle, CalendarDays, Flame, Snowflake, ThermometerSun,
  ArrowDown, MessageSquare, Reply, BarChart3, ArrowRight, Timer, UserX, Eye,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend, ReferenceLine,
} from "recharts";
import { format, subDays, startOfDay, endOfDay, differenceInMinutes, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

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
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>("30d");
  const { from, to } = usePeriodRange(period);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

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

    const responded = leads.filter((l: any) => {
      const stage = l.pipeline_stage || "";
      return ["respondeu", "interessado", "negociacao", "fechado"].includes(stage);
    }).length;
    const responseRate = total > 0 ? (responded / total) * 100 : 0;
    const closed = byStage["fechado"] || 0;
    const conversionRate = total > 0 ? (closed / total) * 100 : 0;

    const responseTimes = conversations
      .filter((c: any) => c.last_message_at && c.created_at)
      .map((c: any) => differenceInMinutes(new Date(c.last_message_at), new Date(c.created_at)))
      .filter((m: number) => m > 0 && m < 1440);
    const avgResponseMin = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length)
      : 0;

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

    const byOrigin: Record<string, number> = {};
    for (const l of leads) {
      const origin = l.origin || "Manual";
      byOrigin[origin] = (byOrigin[origin] || 0) + 1;
    }

    // Forgotten leads (no message in 48h+, not closed/lost)
    const now = new Date();
    const forgottenLeads = leads.filter((l: any) => {
      if (!l.last_message_at) return true;
      const hours = differenceInHours(now, new Date(l.last_message_at));
      const stage = l.pipeline_stage || "novo";
      return hours > 48 && !["fechado", "perdido"].includes(stage);
    }).length;

    // Avg time to close
    const closedLeads = leads.filter((l: any) => l.pipeline_stage === "fechado" && l.first_contact_at && l.last_message_at);
    const avgCloseMin = closedLeads.length > 0
      ? Math.round(closedLeads.reduce((a: number, l: any) =>
          a + differenceInMinutes(new Date(l.last_message_at), new Date(l.first_contact_at)), 0) / closedLeads.length)
      : 0;

    return {
      total, responseRate, conversionRate, avgResponseMin,
      totalEstimatedValue, totalClosedValue,
      byStage, byTemp, byOrigin, dailyMap,
      forgottenLeads, avgCloseMin,
    };
  }, [leads, conversations]);

  const todayPanel = useMemo(() => {
    const now = new Date();
    const pendingResponse = allLeads.filter((l: any) => {
      if (!l.last_message_at) return false;
      const hours = differenceInHours(now, new Date(l.last_message_at));
      const stage = l.pipeline_stage || "novo";
      return hours > 24 && !["fechado", "perdido"].includes(stage);
    });
    const hotPending = allLeads.filter((l: any) =>
      l.lead_temperature === "quente" && !["fechado", "perdido"].includes(l.pipeline_stage || "")
    );
    const nearClose = allLeads.filter((l: any) => l.pipeline_stage === "negociacao");
    return { pendingResponse: pendingResponse.length, hotPending: hotPending.length, nearClose: nearClose.length };
  }, [allLeads]);

  const insights = useMemo(() => {
    const items: { text: string; type: "warning" | "info" | "success"; action?: { label: string; route: string } }[] = [];
    if (todayPanel.pendingResponse > 0) {
      items.push({ text: `${todayPanel.pendingResponse} leads sem resposta há mais de 24h`, type: "warning", action: { label: "Responder agora", route: "/dashboard/leads" } });
    }
    if (metrics.responseRate < 30 && metrics.total > 5) {
      items.push({ text: `Taxa de resposta baixa (${metrics.responseRate.toFixed(0)}%). Revise a abordagem inicial.`, type: "warning", action: { label: "Ver detalhes", route: "/dashboard/leads" } });
    }
    if (todayPanel.hotPending > 0) {
      items.push({ text: `${todayPanel.hotPending} leads quentes aguardando ação — priorize o contato!`, type: "warning", action: { label: "Responder agora", route: "/dashboard/leads" } });
    }
    if (metrics.conversionRate > 10) {
      items.push({ text: `Boa taxa de conversão (${metrics.conversionRate.toFixed(1)}%). Continue com a estratégia atual.`, type: "success" });
    }
    if (todayPanel.nearClose > 0) {
      items.push({ text: `${todayPanel.nearClose} oportunidades em negociação — próximas de fechar!`, type: "info", action: { label: "Ver detalhes", route: "/dashboard/pipeline" } });
    }
    if (metrics.forgottenLeads > 0) {
      items.push({ text: `${metrics.forgottenLeads} leads esquecidos (sem contato há 48h+)`, type: "warning", action: { label: "Ver detalhes", route: "/dashboard/leads" } });
    }
    if (items.length === 0) {
      items.push({ text: "Acompanhe suas métricas para gerar insights mais precisos.", type: "info" });
    }
    return items;
  }, [todayPanel, metrics]);

  const funnelData = useMemo(() => {
    return PIPELINE_STAGES.map((s, i, arr) => {
      const count = metrics.byStage[s.key] || 0;
      const prevCount = i > 0 ? (metrics.byStage[arr[i - 1].key] || 0) : metrics.total;
      const dropPct = prevCount > 0 ? ((1 - count / prevCount) * 100) : 0;
      return { name: s.label, value: count, fill: s.color, dropPct: i > 0 ? dropPct : 0 };
    });
  }, [metrics]);

  const activityData = useMemo(() => {
    const entries = Object.entries(metrics.dailyMap).map(([day, d]) => ({
      day, leads: d.leads, responses: d.responses,
    }));
    return entries;
  }, [metrics.dailyMap]);

  const avgResponsesPerDay = useMemo(() => {
    if (activityData.length === 0) return 0;
    const total = activityData.reduce((a, d) => a + d.responses, 0);
    return Math.round(total / activityData.length * 10) / 10;
  }, [activityData]);

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

  const formatCurrency = (val: number) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

  const insightColors = {
    warning: "border-red-500/40 bg-red-500/5",
    info: "border-blue-500/30 bg-blue-500/5",
    success: "border-emerald-500/30 bg-emerald-500/5",
  };
  const insightIcons = { warning: AlertTriangle, info: Lightbulb, success: TrendingUp };
  const insightTextColors = { warning: "text-red-400", info: "text-blue-400", success: "text-emerald-400" };

  const toggleCheck = (key: string) => setCheckedItems(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-3 p-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Performance de Vendas</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Métricas, funil e insights para tomada de decisão</p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[140px] h-9 text-sm">
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

      {/* Hero Revenue Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/20">
                <DollarSign className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-emerald-300/80 font-medium">Receita Fechada</p>
                {isLoading ? <Skeleton className="h-9 w-32 mt-1" /> : (
                  <p className="text-3xl font-black text-emerald-400 tracking-tight">{formatCurrency(metrics.totalClosedValue)}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20">
                <TrendingUp className="h-6 w-6 text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-amber-300/80 font-medium">Em Negociação</p>
                {isLoading ? <Skeleton className="h-9 w-32 mt-1" /> : (
                  <p className="text-3xl font-black text-amber-400 tracking-tight">{formatCurrency(metrics.totalEstimatedValue)}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {[
          { title: "Total de Leads", value: metrics.total.toLocaleString("pt-BR"), icon: Users, color: "text-blue-400", bg: "bg-blue-500/10" },
          { title: "Taxa de Resposta", value: `${metrics.responseRate.toFixed(1)}%`, icon: Percent, color: "text-cyan-400", bg: "bg-cyan-500/10" },
          { title: "Taxa de Conversão", value: `${metrics.conversionRate.toFixed(1)}%`, icon: Target, color: "text-purple-400", bg: "bg-purple-500/10" },
          { title: "Tempo Médio Resposta", value: formatResponseTime(metrics.avgResponseMin), icon: Clock, color: "text-indigo-400", bg: "bg-indigo-500/10" },
        ].map((card) => (
          <Card key={card.title} className="border-border/40 bg-card/50">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${card.bg}`}>
                  <card.icon className={`h-3.5 w-3.5 ${card.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-muted-foreground truncate">{card.title}</p>
                  {isLoading ? <Skeleton className="h-5 w-12 mt-0.5" /> : (
                    <p className="text-base font-bold leading-tight mt-0.5">{card.value}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Today Checklist + Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="border-border/40 bg-card/50">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Checklist do Dia
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-1.5">
            {[
              { key: "pending", label: `Responder ${todayPanel.pendingResponse} leads pendentes`, value: todayPanel.pendingResponse, urgent: true },
              { key: "hot", label: `Contatar ${todayPanel.hotPending} leads quentes`, value: todayPanel.hotPending, urgent: true },
              { key: "close", label: `Fechar ${todayPanel.nearClose} negociações`, value: todayPanel.nearClose, urgent: false },
            ].map((item) => (
              <div
                key={item.key}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg border transition-all cursor-pointer
                  ${checkedItems[item.key] ? "border-border/20 bg-muted/20 opacity-60" : item.urgent && item.value > 0 ? "border-red-500/30 bg-red-500/5" : "border-border/30 bg-muted/10"}`}
                onClick={() => toggleCheck(item.key)}
              >
                <Checkbox
                  checked={!!checkedItems[item.key]}
                  onCheckedChange={() => toggleCheck(item.key)}
                  className="shrink-0"
                />
                <span className={`text-xs flex-1 ${checkedItems[item.key] ? "line-through text-muted-foreground" : ""}`}>
                  {item.label}
                </span>
                {item.value > 0 && !checkedItems[item.key] && (
                  <Badge variant={item.urgent ? "destructive" : "secondary"} className="text-[10px] px-1.5 py-0">
                    {item.value}
                  </Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/50 lg:col-span-2">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-400" />
              Insights Inteligentes
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-1.5">
            {insights.map((insight, i) => {
              const Icon = insightIcons[insight.type];
              return (
                <div key={i} className={`flex items-center gap-2.5 p-2.5 rounded-lg border ${insightColors[insight.type]}`}>
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${insightTextColors[insight.type]}`} />
                  <p className="text-xs leading-snug flex-1">{insight.text}</p>
                  {insight.action && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2.5 text-[10px] font-semibold shrink-0"
                      onClick={() => navigate(insight.action!.route)}
                    >
                      {insight.action.label}
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Performance Card + Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Performance do Atendimento */}
        <Card className="border-border/40 bg-card/50">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Timer className="h-4 w-4 text-cyan-400" />
              Performance do Atendimento
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-3">
            {[
              { label: "Tempo médio de resposta", value: formatResponseTime(metrics.avgResponseMin), icon: Clock, color: "text-cyan-400" },
              { label: "Tempo médio até fechamento", value: metrics.avgCloseMin > 0 ? formatResponseTime(metrics.avgCloseMin) : "—", icon: Target, color: "text-emerald-400" },
              { label: "Leads esquecidos (48h+)", value: String(metrics.forgottenLeads), icon: UserX, color: metrics.forgottenLeads > 0 ? "text-red-400" : "text-muted-foreground" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/20">
                <item.icon className={`h-4 w-4 shrink-0 ${item.color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground">{item.label}</p>
                  <p className={`text-sm font-bold ${item.color}`}>{item.value}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

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
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <div className="space-y-1.5">
                {funnelData.map((stage, i) => {
                  const maxValue = Math.max(...funnelData.map(s => s.value), 1);
                  const widthPct = Math.max((stage.value / maxValue) * 100, 8);
                  const isLoss = stage.dropPct > 50;
                  return (
                    <div key={stage.name} className="space-y-0.5">
                      {i > 0 && stage.dropPct > 0 && (
                        <div className="flex items-center gap-1 ml-[102px]">
                          <ArrowDown className={`h-2.5 w-2.5 ${isLoss ? "text-red-400" : "text-muted-foreground"}`} />
                          <span className={`text-[9px] font-semibold ${isLoss ? "text-red-400" : "text-muted-foreground"}`}>
                            -{stage.dropPct.toFixed(0)}%
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-muted-foreground w-[90px] shrink-0 text-right">{stage.name}</span>
                        <div className="flex-1 relative">
                          <div
                            className="h-7 rounded-md flex items-center px-3 transition-all duration-500"
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
      </div>

      {/* Activity Area Chart + Lead Quality */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="border-border/40 bg-card/50 lg:col-span-2">
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                Leads vs Respostas
              </CardTitle>
              {avgResponsesPerDay > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  Média: {avgResponsesPerDay} resp/dia
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : activityData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">Sem dados no período</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={activityData} margin={{ left: -10, right: 10, top: 5 }}>
                  <defs>
                    <linearGradient id="gradLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gradResponses" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.15} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {avgResponsesPerDay > 0 && (
                    <ReferenceLine y={avgResponsesPerDay} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.5} />
                  )}
                  <Area type="monotone" dataKey="leads" name="Novos Leads" stroke="#6366f1" strokeWidth={2} fill="url(#gradLeads)" />
                  <Area type="monotone" dataKey="responses" name="Respostas" stroke="#10b981" strokeWidth={2} fill="url(#gradResponses)" />
                </AreaChart>
              </ResponsiveContainer>
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
              <Skeleton className="h-[180px] w-full" />
            ) : (
              <div className="space-y-3">
                {tempData.map((item) => {
                  const Icon = TEMP_CONFIG[item.name.toLowerCase()]?.icon || Snowflake;
                  return (
                    <div key={item.name} className="space-y-1">
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
                      <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.max(item.pct, 2)}%`, backgroundColor: item.fill }}
                        />
                      </div>
                    </div>
                  );
                })}
                <div className="pt-2 border-t border-border/20">
                  <div className="flex items-center justify-center gap-4">
                    <ResponsiveContainer width={70} height={70}>
                      <PieChart>
                        <Pie data={tempData.filter(d => d.value > 0)} cx="50%" cy="50%" innerRadius={20} outerRadius={32} paddingAngle={3} dataKey="value">
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
            <Skeleton className="h-[180px] w-full" />
          ) : originData.length === 0 ? (
            <div className="h-[120px] flex items-center justify-center text-xs text-muted-foreground">Sem dados no período</div>
          ) : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="40%" height={160}>
                <PieChart>
                  <Pie data={originData} cx="50%" cy="50%" innerRadius={35} outerRadius={65} paddingAngle={3} dataKey="value">
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

      {/* Lost leads */}
      {!isLoading && (metrics.byStage["perdido"] || 0) > 0 && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-red-500/10">
              <Target className="h-3.5 w-3.5 text-red-400" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium">
                {metrics.byStage["perdido"]} leads perdidos no período
              </p>
              <p className="text-[10px] text-muted-foreground">
                Taxa de perda: {((metrics.byStage["perdido"] / metrics.total) * 100).toFixed(1)}%
              </p>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => navigate("/dashboard/leads")}>
              <Eye className="h-3 w-3 mr-1" /> Ver leads
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
