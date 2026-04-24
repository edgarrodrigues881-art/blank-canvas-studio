import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, ArrowUpRight, ArrowDownRight, DollarSign, Handshake, Users, TrendingUp, MessageCircle, Clock, AlertTriangle, XCircle } from "lucide-react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, ComposedChart, Bar, Line, Area, Legend,
} from "recharts";
import { TrendingDown } from "lucide-react";
import { format, subDays, startOfDay, endOfDay, differenceInMinutes, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

type Period = "7d" | "30d" | "90d" | "all";

const DEFAULT_PIPELINE_STAGES = [
  { key: "novo", label: "Novo Lead", color: "#3b82f6" },
  { key: "respondeu", label: "Respondeu", color: "#06b6d4" },
  { key: "interessado", label: "Interessado", color: "#f59e0b" },
  { key: "agendado", label: "Agendado", color: "#8b5cf6" },
  { key: "negociacao", label: "Negociação", color: "#f97316" },
  { key: "fechado", label: "Fechado", color: "#22c55e" },
  { key: "perdido", label: "Perdido", color: "#ef4444" },
];
const DEFAULT_KEYS = new Set(DEFAULT_PIPELINE_STAGES.map(s => s.key));
const TAIL_KEYS = new Set(["fechado", "perdido"]);

const CUSTOM_COLOR_MAP: Record<string, string> = {
  azul: "#3b82f6", ciano: "#06b6d4", ambar: "#f59e0b",
  roxo: "#8b5cf6", laranja: "#f97316", verde: "#22c55e",
};

const TEMP_LABELS: Record<string, { label: string; color: string }> = {
  frio: { label: "Frio", color: "#9ca3af" }, // gray
  morno: { label: "Morno", color: "#f59e0b" }, // amber
  quente: { label: "Quente", color: "#ef4444" }, // red
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
  borderRadius: "4px",
  fontSize: 11,
  color: "hsl(var(--foreground))",
};

// Featured big card — blue gradient, white text (matches CRM Dashboard "Total de Leads" hero)
function FeaturedMetricCard({
  label,
  value,
  icon: Icon,
  deltaLabel,
  loading,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  deltaLabel?: string;
  loading?: boolean;
}) {
  return (
    <div
      className="relative rounded-xl p-5 flex flex-col justify-between min-h-[160px] overflow-hidden text-white shadow-md"
      style={{ background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)" }}
    >
      <div className="flex items-start justify-between">
        <p className="text-[11px] uppercase tracking-[0.14em] font-medium text-white/80">{label}</p>
        <div className="h-9 w-9 rounded-lg bg-white/15 flex items-center justify-center backdrop-blur-sm">
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
      {loading ? (
        <Skeleton className="h-10 w-40 mt-2 bg-white/20" />
      ) : (
        <div className="mt-3">
          <p className="text-[34px] leading-none font-bold tracking-tight tabular-nums text-white">
            {value}
          </p>
          {deltaLabel && (
            <div className="flex items-center gap-1 mt-3 text-[12px] font-medium text-white/90">
              <ArrowUpRight className="h-3.5 w-3.5" />
              {deltaLabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Compact metric card — white bg, colored icon + soft border, value + colored delta
function MetricCard({
  label,
  value,
  icon: Icon,
  accentColor,
  delta,
  loading,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  accentColor: string;
  delta?: { value: number; positive?: boolean; label?: string } | null;
  loading?: boolean;
}) {
  return (
    <div
      className="relative bg-card rounded-xl p-4 flex flex-col justify-between min-h-[130px] transition-colors duration-200 overflow-hidden shadow-sm"
      style={{ border: `1px solid ${accentColor}33` }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ backgroundColor: accentColor }}
      />
      <div className="flex items-start justify-between">
        <div
          className="h-9 w-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${accentColor}1a` }}
        >
          <Icon className="h-[18px] w-[18px]" style={{ color: accentColor }} />
        </div>
      </div>
      <div className="mt-2">
        <p className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground font-medium">{label}</p>
        {loading ? (
          <Skeleton className="h-7 w-20 mt-2" />
        ) : (
          <>
            <p className="text-[24px] leading-tight font-semibold tracking-tight mt-1 tabular-nums text-foreground">
              {value}
            </p>
            {delta && (
              <div
                className="flex items-center gap-1 mt-1 text-[11px] font-medium tabular-nums"
                style={{ color: delta.positive ? "#22c55e" : accentColor }}
              >
                {delta.positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {delta.label ?? `${Math.abs(delta.value).toFixed(1)}%`}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Section title — clean, no icons
function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-[15px] font-medium text-foreground tracking-tight">{children}</h2>
      {right}
    </div>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card border border-border rounded-md p-5 transition-colors duration-200 ${className}`}>{children}</div>
  );
}

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

  const { data: customStages = [] } = useQuery({
    queryKey: ["crm-report-pipeline-stages", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("key,label,color,position")
        .eq("user_id", user.id)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data || []) as Array<{ key: string; label: string; color: string; position: number }>;
    },
    enabled: !!user,
    staleTime: 120_000,
  });

  const hiddenDefaults = useMemo(() => {
    try {
      const raw = localStorage.getItem("pipeline_hidden_defaults");
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch { return new Set<string>(); }
  }, []);

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
    const lost = byStage["perdido"] || 0;
    const conversionRate = total > 0 ? (closed / total) * 100 : 0;

    const responseTimes = conversations
      .filter((c: any) => c.last_message_at && c.created_at)
      .map((c: any) => differenceInMinutes(new Date(c.last_message_at), new Date(c.created_at)))
      .filter((m: number) => m > 0 && m < 1440);
    const avgResponseMin = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length)
      : 0;

    const dailyMap: Record<string, { ts: number; leads: number; responses: number }> = {};
    for (const l of leads) {
      const d = startOfDay(new Date(l.created_at));
      const key = format(d, "yyyy-MM-dd");
      if (!dailyMap[key]) dailyMap[key] = { ts: d.getTime(), leads: 0, responses: 0 };
      dailyMap[key].leads++;
    }
    for (const c of conversations) {
      const d = startOfDay(new Date(c.created_at));
      const key = format(d, "yyyy-MM-dd");
      if (!dailyMap[key]) dailyMap[key] = { ts: d.getTime(), leads: 0, responses: 0 };
      if ((c as any).first_reply_at) dailyMap[key].responses++;
    }

    const byOrigin: Record<string, number> = {};
    for (const l of leads) {
      const origin = l.origin || "Manual";
      byOrigin[origin] = (byOrigin[origin] || 0) + 1;
    }

    const now = new Date();
    const forgottenLeads = leads.filter((l: any) => {
      if (!l.last_message_at) return true;
      const hours = differenceInHours(now, new Date(l.last_message_at));
      const stage = l.pipeline_stage || "novo";
      return hours > 48 && !["fechado", "perdido"].includes(stage);
    }).length;

    const closedLeads = leads.filter((l: any) => l.pipeline_stage === "fechado" && l.first_contact_at && l.last_message_at);
    const avgCloseMin = closedLeads.length > 0
      ? Math.round(closedLeads.reduce((a: number, l: any) =>
          a + differenceInMinutes(new Date(l.last_message_at), new Date(l.first_contact_at)), 0) / closedLeads.length)
      : 0;

    return {
      total, responseRate, conversionRate, avgResponseMin,
      totalEstimatedValue, totalClosedValue,
      byStage, byTemp, byOrigin, dailyMap,
      forgottenLeads, lost, avgCloseMin,
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
    const items: { text: string; type: "alert" | "warning" | "opportunity"; action?: { label: string; route: string } }[] = [];
    if (todayPanel.pendingResponse > 0) {
      items.push({ text: `${todayPanel.pendingResponse} leads sem resposta há mais de 24h`, type: "alert", action: { label: "Responder", route: "/dashboard/leads" } });
    }
    if (metrics.responseRate < 30 && metrics.total > 5) {
      items.push({ text: `Taxa de resposta baixa (${metrics.responseRate.toFixed(0)}%). Revise a abordagem inicial.`, type: "warning", action: { label: "Detalhes", route: "/dashboard/leads" } });
    }
    if (todayPanel.hotPending > 0) {
      items.push({ text: `${todayPanel.hotPending} leads quentes aguardando ação — priorize o contato`, type: "alert", action: { label: "Responder", route: "/dashboard/leads" } });
    }
    if (metrics.conversionRate > 10) {
      items.push({ text: `Boa taxa de conversão (${metrics.conversionRate.toFixed(1)}%). Continue com a estratégia atual.`, type: "opportunity" });
    }
    if (todayPanel.nearClose > 0) {
      items.push({ text: `${todayPanel.nearClose} oportunidades em negociação — próximas de fechar`, type: "opportunity", action: { label: "Detalhes", route: "/dashboard/pipeline" } });
    }
    if (metrics.forgottenLeads > 0) {
      items.push({ text: `${metrics.forgottenLeads} leads esquecidos (sem contato há 48h+)`, type: "warning", action: { label: "Detalhes", route: "/dashboard/leads" } });
    }
    if (items.length === 0) {
      items.push({ text: "Acompanhe suas métricas para gerar insights mais precisos.", type: "opportunity" });
    }
    return items;
  }, [todayPanel, metrics]);

  const funnelData = useMemo(() => {
    return PIPELINE_STAGES.map((s, i, arr) => {
      const count = metrics.byStage[s.key] || 0;
      const prevCount = i > 0 ? (metrics.byStage[arr[i - 1].key] || 0) : metrics.total;
      const dropPct = prevCount > 0 ? ((1 - count / prevCount) * 100) : 0;
      return { name: s.label, value: count, dropPct: i > 0 ? dropPct : 0 };
    });
  }, [metrics]);

  const activityData = useMemo(() => {
    return Object.values(metrics.dailyMap)
      .sort((a, b) => a.ts - b.ts)
      .map((d) => ({
        day: format(new Date(d.ts), "dd/MM", { locale: ptBR }),
        leads: d.leads,
        responses: d.responses,
      }));
  }, [metrics.dailyMap]);

  const tempData = useMemo(() => {
    const tempColors: Record<string, string> = { frio: "#3b82f6", morno: "#f59e0b", quente: "#ef4444" };
    return ["frio", "morno", "quente"].map(t => ({
      name: TEMP_LABELS[t]?.label || t,
      key: t,
      value: metrics.byTemp[t] || 0,
      fill: tempColors[t],
      pct: metrics.total > 0 ? ((metrics.byTemp[t] || 0) / metrics.total * 100) : 0,
    }));
  }, [metrics]);

  // Origin — WhatsApp blue dominant, others in cyan/violet/amber palette
  const originData = useMemo(() => {
    const entries = Object.entries(metrics.byOrigin)
      .map(([origin, count]) => ({ name: origin, value: count }))
      .sort((a, b) => b.value - a.value);
    const palette = ["#06b6d4", "#8b5cf6", "#f59e0b", "#22c55e", "#ef4444"];
    return entries.map((e, i) => ({
      ...e,
      fill: /whats/i.test(e.name) || i === 0 ? "#3b82f6" : palette[(i - 1) % palette.length],
    }));
  }, [metrics.byOrigin]);

  const formatResponseTime = (mins: number) => {
    if (mins <= 0) return "—";
    if (mins < 60) return `${mins}min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  };

  const formatCurrency = (val: number) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

  const periodLabel: Record<Period, string> = {
    "7d": "7 dias",
    "30d": "30 dias",
    "90d": "90 dias",
    "all": "Tudo",
  };

  const toggleCheck = (key: string) => setCheckedItems(prev => ({ ...prev, [key]: !prev[key] }));

  const insightBorderClass = {
    alert: "border-l-red-500",
    warning: "border-l-amber-500",
    opportunity: "border-l-foreground",
  };

  return (
    <div className="bg-background min-h-screen -m-4 p-6 text-foreground transition-colors duration-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Performance de Vendas</h1>
          <p className="text-[12px] text-muted-foreground mt-1">Métricas, funil e insights para tomada de decisão</p>
        </div>
        {/* Period pill selector */}
        <div className="flex items-center gap-1 bg-card border border-border rounded-full p-1">
          {(Object.keys(periodLabel) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-[11px] px-3 py-1.5 rounded-full transition-all font-medium border ${
                period === p
                  ? "bg-muted text-foreground border-border"
                  : "bg-transparent text-muted-foreground border-transparent hover:text-foreground"
              }`}
            >
              {periodLabel[p]}
            </button>
          ))}
        </div>
      </div>

      {/* KPI row 1 — Featured (col-span-2 wide) + 3 small */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
        <div className="md:col-span-2">
          <FeaturedMetricCard
            label="Receita Fechada"
            value={formatCurrency(metrics.totalClosedValue)}
            icon={DollarSign}
            deltaLabel={metrics.totalClosedValue > 0 ? `+${formatCurrency(metrics.totalClosedValue)} no período` : undefined}
            loading={isLoading}
          />
        </div>
        <MetricCard
          label="Em Negociação"
          value={formatCurrency(metrics.totalEstimatedValue)}
          icon={Handshake}
          accentColor="#06b6d4"
          loading={isLoading}
        />
        <MetricCard
          label="Total de Leads"
          value={metrics.total.toLocaleString("pt-BR")}
          icon={Users}
          accentColor="#3b82f6"
          loading={isLoading}
        />
        <MetricCard
          label="Taxa de Conversão"
          value={`${metrics.conversionRate.toFixed(1)}%`}
          icon={TrendingUp}
          accentColor="#8b5cf6"
          delta={metrics.conversionRate > 0 ? { value: metrics.conversionRate, positive: metrics.conversionRate > 5 } : null}
          loading={isLoading}
        />
      </div>

      {/* KPI row 2 — 4 small cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MetricCard
          label="Taxa de Resposta"
          value={`${metrics.responseRate.toFixed(1)}%`}
          icon={MessageCircle}
          accentColor="#f59e0b"
          loading={isLoading}
        />
        <MetricCard
          label="Tempo Médio Resposta"
          value={formatResponseTime(metrics.avgResponseMin)}
          icon={Clock}
          accentColor="#6b7280"
          loading={isLoading}
        />
        <MetricCard
          label="Leads Esquecidos"
          value={metrics.forgottenLeads.toLocaleString("pt-BR")}
          icon={AlertTriangle}
          accentColor="#f97316"
          delta={metrics.forgottenLeads > 0 ? { value: (metrics.forgottenLeads / Math.max(metrics.total, 1)) * 100, positive: false } : null}
          loading={isLoading}
        />
        <MetricCard
          label="Leads Perdidos"
          value={metrics.lost.toLocaleString("pt-BR")}
          icon={XCircle}
          accentColor="#ef4444"
          delta={metrics.lost > 0 ? { value: (metrics.lost / Math.max(metrics.total, 1)) * 100, positive: false } : null}
          loading={isLoading}
        />
      </div>

      {/* Checklist + Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
        {/* Checklist */}
        <Panel>
          <SectionTitle>Checklist do Dia</SectionTitle>
          <div className="space-y-2">
            {[
              { key: "pending", label: `Responder ${todayPanel.pendingResponse} leads pendentes`, value: todayPanel.pendingResponse },
              { key: "hot", label: `Contatar ${todayPanel.hotPending} leads quentes`, value: todayPanel.hotPending },
              { key: "close", label: `Fechar ${todayPanel.nearClose} negociações`, value: todayPanel.nearClose },
            ].map((item) => (
              <div
                key={item.key}
                onClick={() => toggleCheck(item.key)}
                className="flex items-center gap-3 py-2 px-1 cursor-pointer group"
              >
                <Checkbox
                  checked={!!checkedItems[item.key]}
                  onCheckedChange={() => toggleCheck(item.key)}
                  className="shrink-0 h-4 w-4 rounded-[3px] border-border data-[state=checked]:bg-foreground data-[state=checked]:border-foreground data-[state=checked]:text-background"
                />
                <span className={`text-[12.5px] flex-1 ${
                  checkedItems[item.key] ? "line-through text-muted-foreground/60" : "text-foreground"
                }`}>
                  {item.label}
                </span>
                {item.value > 0 && !checkedItems[item.key] && (
                  <span className="text-[10.5px] font-semibold tabular-nums px-2 py-0.5 rounded bg-muted text-foreground border border-border">
                    {item.value}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Panel>

        {/* Insights */}
        <Panel className="lg:col-span-2">
          <SectionTitle>Insights Inteligentes</SectionTitle>
          <div className="space-y-2">
            {insights.map((insight, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-sm bg-muted/40 border-l-2 ${insightBorderClass[insight.type]}`}
              >
                <p className="text-[12.5px] leading-snug flex-1 text-foreground/85">{insight.text}</p>
                {insight.action && (
                  <button
                    className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    onClick={() => navigate(insight.action!.route)}
                  >
                    {insight.action.label}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Charts row 1 — Leads vs Respostas (full) */}
      <Panel className="mb-3">
        {(() => {
          const totalLeads = activityData.reduce((s, d) => s + (d.leads || 0), 0);
          const totalResponses = activityData.reduce((s, d) => s + (d.responses || 0), 0);
          const isPositive = totalLeads >= totalResponses;
          return (
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-[15px] font-medium text-foreground tracking-tight">Leads vs Respostas</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">Atividade no período</p>
              </div>
              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                  isPositive ? "bg-blue-500/10 text-blue-500" : "bg-red-500/10 text-red-500"
                }`}>
                  {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {totalLeads > 0 ? "+" : ""}{totalLeads}
                </div>
                <div className="text-right">
                  <p className="text-[22px] font-extrabold text-foreground leading-none tabular-nums">{totalLeads}</p>
                  <p className="text-[10.5px] text-muted-foreground mt-0.5">no período</p>
                </div>
              </div>
            </div>
          );
        })()}
        {isLoading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : activityData.length === 0 ? (
          <div className="h-[260px] flex items-center justify-center text-[12px] text-muted-foreground">Sem dados no período</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={activityData} margin={{ left: -10, right: 10, top: 5, bottom: 0 }}>
              <defs>
                <linearGradient id="leadsBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.25} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded-md border border-border bg-card/95 backdrop-blur-sm px-3 py-2 shadow-lg">
                      <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1.5">{label}</p>
                      {payload.map((entry: any) => (
                        <div key={entry.dataKey} className="flex items-center gap-2 text-[12px]">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                          <span className="text-muted-foreground">{entry.name}</span>
                          <span className="text-foreground font-semibold tabular-nums ml-auto">{entry.value}</span>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }} iconType="circle" />
              <Bar dataKey="leads" name="Novos Leads" fill="url(#leadsBarGrad)" radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Line type="monotone" dataKey="responses" name="Respostas" stroke="#22c55e" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: "#22c55e", stroke: "hsl(var(--card))", strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Panel>

      {/* Charts row 2 — Funnel (2 cols) + Lead Quality (1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
        <Panel className="lg:col-span-2">
          <SectionTitle>Funil de Conversão</SectionTitle>
          {isLoading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : (
            <div className="space-y-2">
              {funnelData.map((stage, i) => {
                const maxValue = Math.max(...funnelData.map(s => s.value), 1);
                const pct = Math.round((stage.value / maxValue) * 100);
                const stageColors = ["#3b82f6", "#06b6d4", "#f59e0b", "#8b5cf6", "#22c55e"];
                const color = stageColors[i] ?? "#3b82f6";
                return (
                  <div
                    key={stage.name}
                    className="flex items-center gap-3 py-2.5 px-3 rounded-xl transition-all duration-300 hover:bg-muted/20"
                  >
                    <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ background: color }} />
                    <span className="text-xs text-muted-foreground w-24 shrink-0 truncate font-medium">{stage.name}</span>
                    <div className="flex-1 h-3 bg-muted/25 rounded-full overflow-hidden shadow-inner">
                      <div
                        className="h-full rounded-full transition-all duration-1000 ease-out"
                        style={{
                          width: `${Math.max(pct, 6)}%`,
                          background: `linear-gradient(90deg, ${color}, ${color}dd)`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-extrabold text-foreground tabular-nums w-10 text-right">
                      {stage.value}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel>
          <SectionTitle>Qualidade dos Leads</SectionTitle>
          {isLoading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : (
            <div className="space-y-4">
              {tempData.map((item) => {
                const maxVal = Math.max(...tempData.map(t => t.value), 1);
                const pct = Math.round((item.value / maxVal) * 100);
                return (
                  <div
                    key={item.name}
                    className="flex items-center gap-3 py-2.5 px-3 rounded-xl transition-all duration-300 hover:bg-muted/20"
                  >
                    <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ background: item.fill }} />
                    <span className="text-xs text-muted-foreground w-16 shrink-0 truncate font-medium">{item.name}</span>
                    <div className="flex-1 h-3 bg-muted/25 rounded-full overflow-hidden shadow-inner">
                      <div
                        className="h-full rounded-full transition-all duration-1000 ease-out"
                        style={{
                          width: `max(4px, ${Math.max(pct, 6)}%)`,
                          minWidth: 4,
                          background: `linear-gradient(90deg, ${item.fill}, ${item.fill}dd)`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-extrabold text-foreground tabular-nums w-10 text-right">
                      {item.value}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* Charts row 3 — Origin donut (full) */}
      <Panel>
        <SectionTitle>Leads por Origem</SectionTitle>
        {isLoading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : originData.length === 0 ? (
          <div className="h-[160px] flex items-center justify-center text-[12px] text-muted-foreground">Sem dados no período</div>
        ) : (
          <div className="flex items-center gap-8">
            <div className="relative" style={{ width: 220, height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={originData} cx="50%" cy="50%" innerRadius={62} outerRadius={100} paddingAngle={2} dataKey="value" stroke="hsl(var(--card))" strokeWidth={2}>
                    {originData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[28px] font-bold text-foreground tabular-nums leading-none">
                  {originData.reduce((sum, o) => sum + o.value, 0)}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Total</span>
              </div>
            </div>
            <div className="flex-1 space-y-2.5">
              {originData.map((o) => (
                <div key={o.name} className="flex items-center justify-between text-[12px]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: o.fill }} />
                    <span className="text-foreground/85">{o.name}</span>
                  </div>
                  <span className="font-semibold tabular-nums text-foreground">{o.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
