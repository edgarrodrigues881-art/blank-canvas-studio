import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Users,
  MessageSquareMore,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  UserPlus,
  Reply,
  Send,
  Activity,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, subDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/* ── Stat Card ── */
function StatCard({
  label, value, sub, icon: Icon, iconBg, iconColor, isLoading, onClick,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; iconBg: string; iconColor: string;
  isLoading: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative text-left w-full rounded-xl border border-border/40 p-5 transition-all duration-200",
        "bg-card hover:border-border hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5 group"
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", iconBg)}>
          <Icon className={cn("w-5 h-5", iconColor)} />
        </div>
        <TrendingUp className="w-5 h-5 text-emerald-500/60" />
      </div>
      <p className="text-xs text-muted-foreground font-medium mb-1">{label}</p>
      {isLoading ? (
        <>
          <Skeleton className="h-8 w-20 mb-1" />
          <Skeleton className="h-3 w-24" />
        </>
      ) : (
        <>
          <p className="text-2xl font-bold text-foreground tracking-tight leading-none">{value}</p>
          {sub && <p className="text-xs text-emerald-500 font-medium mt-1.5">{sub}</p>}
        </>
      )}
    </button>
  );
}

/* ── Activity Item ── */
function ActivityItem({ icon: Icon, iconBg, iconColor, title, desc, time }: {
  icon: React.ElementType; iconBg: string; iconColor: string;
  title: string; desc: string; time: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3.5 border-b border-border/20 last:border-0 hover:bg-muted/20 -mx-2 px-2 rounded-lg transition-colors">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
        <Icon className={cn("w-[18px] h-[18px]", iconColor)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{title}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{desc}</p>
      </div>
      <span className="text-[11px] text-muted-foreground/50 whitespace-nowrap shrink-0">{time}</span>
    </div>
  );
}

/* ── Quick Stat with colored bar ── */
function QuickStat({ label, value, pct, barColor }: {
  label: string; value: string; pct: number; barColor: string;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm font-bold text-foreground">{value}</span>
      </div>
      <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${Math.min(pct, 100)}%`, background: barColor }}
        />
      </div>
    </div>
  );
}

/* ── Funnel Row ── */
function FunnelItem({ name, value, maxVal, color }: {
  name: string; value: number; maxVal: number; color: string;
}) {
  const pct = maxVal > 0 ? Math.round((value / maxVal) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-24 shrink-0 truncate">{name}</span>
      <div className="flex-1 h-2 bg-muted/20 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${Math.max(pct, 4)}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold text-foreground tabular-nums w-8 text-right">{value}</span>
    </div>
  );
}

/* ══════════════════════════════════════════ */
/* ══  MAIN COMPONENT  ════════════════════ */
/* ══════════════════════════════════════════ */

const CRMDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

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

  const m = useMemo(() => {
    const total = leads.length;
    const stages: Record<string, number> = {};
    const dailyMap: Record<string, number> = {};
    const last7 = startOfDay(subDays(new Date(), 6));
    let pipelineValue = 0;

    for (const l of leads) {
      const stage = (l as any).pipeline_stage || "novo";
      stages[stage] = (stages[stage] || 0) + 1;
      pipelineValue += (l as any).estimated_value || 0;
      const d = new Date((l as any).created_at);
      if (d >= last7) {
        const key = format(d, "yyyy-MM-dd");
        dailyMap[key] = (dailyMap[key] || 0) + 1;
      }
    }

    const responded = total - (stages["novo"] || 0);
    const interested = (stages["interessado"] || 0) + (stages["negociacao"] || 0) + (stages["fechado"] || 0);
    const closed = stages["fechado"] || 0;
    const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0;
    const interestRate = total > 0 ? Math.round((interested / total) * 100) : 0;
    const closeRate = total > 0 ? Math.round((closed / total) * 100) : 0;

    const dailyChart: { day: string; leads: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const key = format(d, "yyyy-MM-dd");
      const label = format(d, "EEE", { locale: ptBR }).replace(".", "");
      dailyChart.push({ day: label.charAt(0).toUpperCase() + label.slice(1), leads: dailyMap[key] || 0 });
    }

    return {
      total, responseRate, interestRate, closeRate, closed,
      stages, dailyChart, schedules: scheduleCount,
      responded, interested, pipelineValue,
    };
  }, [leads, scheduleCount]);

  const pipeline = [
    { name: "Novo Lead", value: m.stages["novo"] || 0, color: "#3b82f6" },
    { name: "Respondeu", value: m.stages["respondeu"] || 0, color: "#06b6d4" },
    { name: "Interessado", value: m.stages["interessado"] || 0, color: "#f59e0b" },
    { name: "Negociação", value: m.stages["negociacao"] || 0, color: "#a855f7" },
    { name: "Fechado", value: m.stages["fechado"] || 0, color: "#10b981" },
  ];

  const activities = [
    { icon: DollarSign, title: "Lead convertido", desc: "Negócio fechado com sucesso", time: "2 min", iconBg: "bg-emerald-500/15", iconColor: "text-emerald-500" },
    { icon: UserPlus, title: "Novo lead capturado", desc: "Entrada via prospecção ativa", time: "5 min", iconBg: "bg-blue-500/15", iconColor: "text-blue-500" },
    { icon: Reply, title: "Lead respondeu", desc: "Demonstrou interesse no produto", time: "12 min", iconBg: "bg-purple-500/15", iconColor: "text-purple-500" },
    { icon: Send, title: "Follow-up enviado", desc: "Mensagem de acompanhamento", time: "30 min", iconBg: "bg-amber-500/15", iconColor: "text-amber-500" },
    { icon: Activity, title: "Pipeline atualizado", desc: "Lead movido para negociação", time: "1h", iconBg: "bg-red-500/15", iconColor: "text-red-500" },
  ];

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Dashboard CRM</h1>
        <p className="text-sm text-muted-foreground mt-1">Visão geral do seu pipeline de vendas</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total de Leads" value={m.total}
          sub={`+${m.dailyChart.reduce((s, d) => s + d.leads, 0)} esta semana`}
          icon={Users} iconBg="bg-blue-500/15" iconColor="text-blue-500"
          isLoading={isLoading} onClick={() => navigate("/dashboard/leads")} />
        <StatCard label="Conversas Ativas" value={m.responded}
          sub={`${m.responseRate}% de resposta`}
          icon={MessageSquareMore} iconBg="bg-emerald-500/15" iconColor="text-emerald-500"
          isLoading={isLoading} onClick={() => navigate("/dashboard/conversations")} />
        <StatCard label="Oportunidades" value={m.interested}
          sub={`${m.interestRate}% do total`}
          icon={Sparkles} iconBg="bg-purple-500/15" iconColor="text-purple-500"
          isLoading={isLoading} onClick={() => navigate("/dashboard/pipeline")} />
        <StatCard label="Conversões" value={m.closed}
          sub={`${m.closeRate}% de conversão`}
          icon={CheckCircle2} iconBg="bg-amber-500/15" iconColor="text-amber-500"
          isLoading={isLoading} />
      </div>

      {/* Content: Activity + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Recent Activity */}
        <div className="lg:col-span-7 rounded-xl border border-border/40 bg-card p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold text-foreground">Atividade do CRM</h2>
            <button onClick={() => navigate("/dashboard/leads")}
              className="text-xs font-medium text-primary hover:underline">Ver todos</button>
          </div>
          <div>{activities.map((a, i) => <ActivityItem key={i} {...a} />)}</div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl border border-border/40 bg-card p-5">
            <h2 className="text-base font-semibold text-foreground mb-5">Métricas do CRM</h2>
            <div className="space-y-5">
              <QuickStat label="Taxa de Resposta" value={`${m.responseRate}%`} pct={m.responseRate} barColor="#3b82f6" />
              <QuickStat label="Conversão" value={`${m.closeRate}%`} pct={m.closeRate} barColor="#f59e0b" />
              <QuickStat label="Leads Ativos" value={`${m.total - m.closed}`}
                pct={m.total > 0 ? ((m.total - m.closed) / m.total) * 100 : 0} barColor="#10b981" />
            </div>
          </div>

          <div className="rounded-xl border border-border/40 bg-card p-5">
            <h2 className="text-base font-semibold text-foreground mb-4">Funil de Vendas</h2>
            <div className="space-y-3">
              {pipeline.map((s) => (
                <FunnelItem key={s.name} name={s.name} value={s.value} maxVal={pipeline[0].value || 1} color={s.color} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-border/40 bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Novos Leads</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Últimos 7 dias</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-foreground">{m.dailyChart.reduce((s, d) => s + d.leads, 0)}</p>
            <p className="text-xs text-muted-foreground">esta semana</p>
          </div>
        </div>
        {isLoading ? (
          <Skeleton className="h-[200px] w-full rounded-xl" />
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={m.dailyChart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="crmGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.4} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{
                  background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))",
                  borderRadius: 12, fontSize: 12, color: "hsl(var(--foreground))",
                  boxShadow: "0 8px 24px -4px rgba(0,0,0,0.15)",
                }} />
                <Area type="monotone" dataKey="leads" stroke="#3b82f6" strokeWidth={2.5} fill="url(#crmGrad)"
                  dot={{ r: 4, fill: "#3b82f6", strokeWidth: 2, stroke: "hsl(var(--card))" }}
                  activeDot={{ r: 6, strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default CRMDashboard;
