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
  Zap,
  BarChart3,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import { format, subDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/* ── Hero KPI (large card) ── */
function HeroCard({
  total,
  closed,
  closeRate,
  totalValue,
  isLoading,
}: {
  total: number;
  closed: number;
  closeRate: number;
  totalValue: string;
  isLoading: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 p-6 sm:p-8 text-primary-foreground">
      {/* Decorative circles */}
      <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/[0.06]" />
      <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/[0.04]" />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center backdrop-blur-sm">
            <Zap className="w-4 h-4" />
          </div>
          <span className="text-sm font-medium text-white/70">Visão Geral</span>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-32 bg-white/20" />
            <Skeleton className="h-4 w-48 bg-white/10" />
          </div>
        ) : (
          <>
            <div className="flex items-end gap-3 mb-1">
              <span className="text-5xl sm:text-6xl font-extrabold tracking-tighter leading-none">
                {total}
              </span>
              <span className="text-lg font-medium text-white/60 mb-1.5">leads</span>
            </div>
            <p className="text-sm text-white/50 mt-3">
              {closed} fechados · Taxa {closeRate}% · {totalValue} em pipeline
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Metric Card (each with unique accent) ── */
function MetricCard({
  label,
  value,
  icon: Icon,
  accent, // tailwind color classes
  sub,
  isLoading,
  onClick,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  accent: { bg: string; text: string; ring: string };
  sub?: string;
  isLoading: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative text-left w-full rounded-2xl border p-5 transition-all duration-200",
        "bg-card hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5",
        "border-border/40 hover:border-border/60",
        "group"
      )}
    >
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-4", accent.bg)}>
        <Icon className={cn("w-5 h-5", accent.text)} />
      </div>
      {isLoading ? (
        <>
          <Skeleton className="h-8 w-20 mb-1" />
          <Skeleton className="h-3 w-24" />
        </>
      ) : (
        <>
          <p className="text-3xl font-extrabold text-foreground tracking-tight leading-none">
            {value}
          </p>
          <p className="text-xs text-muted-foreground mt-1.5 font-medium">{label}</p>
          {sub && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</p>}
        </>
      )}
      <ArrowUpRight className="absolute top-4 right-4 w-4 h-4 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors" />
    </button>
  );
}

/* ── Funnel Row ── */
function FunnelBar({
  name,
  value,
  maxVal,
  prevVal,
  color,
  isLast,
}: {
  name: string;
  value: number;
  maxVal: number;
  prevVal?: number;
  color: string;
  isLast: boolean;
}) {
  const pct = maxVal > 0 ? Math.round((value / maxVal) * 100) : 0;
  const conv = prevVal ? Math.round((value / prevVal) * 100) : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
          <span className="text-xs font-semibold text-foreground">{name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground tabular-nums">{value}</span>
          {conv !== null && (
            <span className="text-[10px] text-muted-foreground tabular-nums bg-muted/40 px-1.5 py-0.5 rounded">
              {conv}%
            </span>
          )}
        </div>
      </div>
      <div className="h-7 bg-muted/15 rounded-lg overflow-hidden">
        <div
          className="h-full rounded-lg transition-all duration-700 ease-out flex items-center justify-end pr-2.5"
          style={{ width: `${Math.max(pct, 6)}%`, background: color }}
        >
          {pct > 10 && (
            <span className="text-[10px] font-bold text-white drop-shadow-sm tabular-nums">
              {pct}%
            </span>
          )}
        </div>
      </div>
      {!isLast && (
        <div className="flex justify-center my-0.5">
          <ArrowRight className="w-3 h-3 text-muted-foreground/15 rotate-90" />
        </div>
      )}
    </div>
  );
}

/* ── Quick Nav ── */
function QuickNav({ navigate }: { navigate: (path: string) => void }) {
  const items = [
    { label: "Leads", path: "/dashboard/leads", icon: Users, color: "bg-blue-500/10 text-blue-500" },
    { label: "Pipeline", path: "/dashboard/pipeline", icon: Target, color: "bg-purple-500/10 text-purple-500" },
    { label: "Agendamentos", path: "/dashboard/crm-agendamentos", icon: Clock, color: "bg-amber-500/10 text-amber-500" },
    { label: "Disparos", path: "/dashboard/crm-dispatches", icon: MessageSquareMore, color: "bg-emerald-500/10 text-emerald-500" },
  ];

  return (
    <div className="flex gap-2 flex-wrap">
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => navigate(item.path)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border/40 bg-card/60 hover:bg-card hover:shadow-sm hover:border-border/60 transition-all duration-200 group"
        >
          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", item.color)}>
            <item.icon className="w-3.5 h-3.5" />
          </div>
          <span className="text-sm font-medium text-foreground">{item.label}</span>
          <ArrowUpRight className="w-3 h-3 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
        </button>
      ))}
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
      dailyChart.push({
        day: label.charAt(0).toUpperCase() + label.slice(1),
        leads: dailyMap[key] || 0,
      });
    }

    const totalValue = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(pipelineValue);

    return {
      total, responseRate, interestRate, closeRate, closed,
      stages, dailyChart, schedules: scheduleCount, totalValue,
    };
  }, [leads, scheduleCount]);

  const pipeline = [
    { name: "Novo Lead", value: m.stages["novo"] || 0, color: "#3b82f6" },
    { name: "Respondeu", value: m.stages["respondeu"] || 0, color: "#06b6d4" },
    { name: "Interessado", value: m.stages["interessado"] || 0, color: "#f59e0b" },
    { name: "Negociação", value: m.stages["negociacao"] || 0, color: "#a855f7" },
    { name: "Fechado", value: m.stages["fechado"] || 0, color: "#10b981" },
  ];

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Row 1: Hero + 4 metric cards — asymmetric layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Hero — spans 5 cols */}
        <div className="lg:col-span-5">
          <HeroCard
            total={m.total}
            closed={m.closed}
            closeRate={m.closeRate}
            totalValue={m.totalValue}
            isLoading={isLoading}
          />
        </div>

        {/* 4 metric cards — spans 7 cols, 2×2 grid */}
        <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-3">
          <MetricCard
            label="Taxa de Resposta"
            value={`${m.responseRate}%`}
            icon={MessageSquareMore}
            accent={{ bg: "bg-blue-500/10", text: "text-blue-500", ring: "ring-blue-500/20" }}
            sub="Leads que responderam"
            isLoading={isLoading}
          />
          <MetricCard
            label="Taxa de Interesse"
            value={`${m.interestRate}%`}
            icon={Sparkles}
            accent={{ bg: "bg-amber-500/10", text: "text-amber-500", ring: "ring-amber-500/20" }}
            sub="Interessados + negociando"
            isLoading={isLoading}
          />
          <MetricCard
            label="Fechados"
            value={m.closed}
            icon={CheckCircle2}
            accent={{ bg: "bg-emerald-500/10", text: "text-emerald-500", ring: "ring-emerald-500/20" }}
            sub="Vendas concluídas"
            isLoading={isLoading}
          />
          <MetricCard
            label="Agendamentos"
            value={m.schedules}
            icon={CalendarCheck}
            accent={{ bg: "bg-purple-500/10", text: "text-purple-500", ring: "ring-purple-500/20" }}
            sub="Pendentes"
            isLoading={isLoading}
            onClick={() => navigate("/dashboard/crm-agendamentos")}
          />
        </div>
      </div>

      {/* Row 2: Charts — asymmetric 7/5 split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Area chart — larger */}
        <div className="lg:col-span-7 rounded-2xl border border-border/40 bg-card/80 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Novos Leads</h2>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Últimos 7 dias</p>
            </div>
          </div>
          {isLoading ? (
            <Skeleton className="h-[220px] w-full rounded-xl" />
          ) : (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={m.dailyChart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="crmGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.4} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      fontSize: 12,
                      color: "hsl(var(--foreground))",
                      boxShadow: "0 8px 24px -4px rgba(0,0,0,0.15)",
                    }}
                    cursor={{ stroke: "hsl(var(--primary))", strokeWidth: 1, strokeDasharray: "4 4" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="leads"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    fill="url(#crmGrad)"
                    dot={{ r: 4, fill: "hsl(var(--primary))", strokeWidth: 2, stroke: "hsl(var(--card))" }}
                    activeDot={{ r: 6, strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Funnel — smaller */}
        <div className="lg:col-span-5 rounded-2xl border border-border/40 bg-card/80 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Funil de Conversão</h2>
          </div>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="space-y-0.5">
              {pipeline.map((s, i) => (
                <FunnelBar
                  key={s.name}
                  name={s.name}
                  value={s.value}
                  maxVal={pipeline[0].value || 1}
                  prevVal={i > 0 ? pipeline[i - 1].value : undefined}
                  color={s.color}
                  isLast={i === pipeline.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Quick Navigation */}
      <QuickNav navigate={navigate} />
    </div>
  );
};

export default CRMDashboard;
