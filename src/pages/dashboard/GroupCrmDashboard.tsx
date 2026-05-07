import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Layers,
  Megaphone,
  FileText,
  LayoutDashboard,
  UsersRound,
  Activity,
  CheckCircle2,
  TrendingUp,
  Zap,
  Calendar,
  Send,
  Plus,
  AlertTriangle,
  Eye,
  Pencil,
  PauseCircle,
  PlayCircle,
  Clock,
  type LucideIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

// ---- Mock fallback data (until backend is fully wired) ----
const MOCK_CHART_7 = [
  { day: "Seg", msgs: 4200 },
  { day: "Ter", msgs: 5800 },
  { day: "Qua", msgs: 5100 },
  { day: "Qui", msgs: 7200 },
  { day: "Sex", msgs: 9400 },
  { day: "Sáb", msgs: 6800 },
  { day: "Dom", msgs: 12847 },
];

const MOCK_UPCOMING = [
  { name: "Campanha Black Friday", when: "Hoje às 14:00", status: "ativo" as const },
  { name: "Entrada VIP", when: "Amanhã às 09:00", status: "ativo" as const },
  { name: "Promoção Semanal", when: "Seg, Qua e Sex às 08:00", status: "pendente" as const },
];

const MOCK_RECENT = [
  { name: "Black Friday", type: "Disparo único", status: "Ativa", next: "Hoje 14:00", groups: 58, result: "320/350" },
  { name: "Entrada VIP", type: "Recorrente semanal", status: "Ativa", next: "Amanhã 09:00", groups: 24, result: "—" },
  { name: "Carrossel Promo", type: "Carrossel", status: "Concluída", next: "—", groups: 87, result: "1.247/1.250" },
  { name: "Boas-vindas", type: "Manual", status: "Pausada", next: "—", groups: 12, result: "98/120" },
  { name: "Reativação", type: "Disparo único", status: "Com erro", next: "—", groups: 5, result: "12/45" },
];

const MOCK_ALERTS = [
  { text: "1 instância desconectada", severity: "high" as const, url: "/dashboard/devices" },
  { text: "3 campanhas pausadas", severity: "med" as const, url: "/dashboard/campaign-list" },
  { text: "2 agendamentos sem grupo selecionado", severity: "med" as const, url: "/dashboard/group-crm/schedule" },
  { text: "5 mensagens com falha no envio", severity: "low" as const, url: "/dashboard/campaign-list" },
];

const QUICK_ACTIONS: { title: string; url: string; icon: LucideIcon }[] = [
  { title: "Disparo em Grupo", url: "/dashboard/group-crm/group-send", icon: Layers },
  { title: "Campanhas", url: "/dashboard/campaign-list", icon: Megaphone },
  { title: "Disparo Agendado", url: "/dashboard/group-crm/schedule", icon: Calendar },
  { title: "Templates", url: "/dashboard/templates", icon: FileText },
];

type ChartRange = 7 | 15 | 30;

function statusBadge(status: string) {
  const map: Record<string, string> = {
    Ativa: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    Pausada: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    Concluída: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    "Com erro": "bg-rose-500/15 text-rose-400 border-rose-500/30",
    ativo: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    pausado: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    pendente: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  };
  return map[status] || "bg-muted text-muted-foreground border-border";
}

export default function GroupCrmDashboard() {
  const { user } = useAuth();
  const [range, setRange] = useState<ChartRange>(7);
  const [stats, setStats] = useState({
    groups: 248,
    activeCampaigns: 12,
    todaySchedules: 7,
    successRate: "98,4%",
  });

  // Light, optional, real-data hydration. Failures keep mock values.
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const [{ count: active }, { count: schedToday }] = await Promise.all([
          supabase
            .from("campaigns")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .in("status", ["running", "processing", "scheduled"]),
          supabase
            .from("campaigns")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("status", "scheduled")
            .gte("scheduled_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
            .lte("scheduled_at", new Date(new Date().setHours(23, 59, 59, 999)).toISOString()),
        ]);
        setStats((s) => ({
          ...s,
          activeCampaigns: active ?? s.activeCampaigns,
          todaySchedules: schedToday ?? s.todaySchedules,
        }));
      } catch {/* keep mock */ }
    })();
  }, [user?.id]);

  // Build chart data based on range (mock pattern repeated/extended)
  const chartData = (() => {
    if (range === 7) return MOCK_CHART_7;
    const labels = Array.from({ length: range }, (_, i) => `D-${range - i}`);
    return labels.map((d, i) => ({
      day: d,
      msgs: Math.round(3500 + Math.sin(i / 2) * 2200 + (i * 80) + Math.random() * 1500),
    }));
  })();

  const kpis = [
    { label: "Grupos totais", value: String(stats.groups), trend: "+12 esta semana", icon: UsersRound, color: "text-violet-400" },
    { label: "Campanhas ativas", value: String(stats.activeCampaigns), trend: "+3 vs ontem", icon: Activity, color: "text-emerald-400" },
    { label: "Agendamentos hoje", value: String(stats.todaySchedules), trend: "Próximo: 14:00", icon: Calendar, color: "text-cyan-400" },
    { label: "Taxa de sucesso", value: stats.successRate, trend: "+0,6%", icon: CheckCircle2, color: "text-amber-400" },
  ];

  return (
    <div className="container max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <LayoutDashboard className="w-4 h-4" />
          <span>CRM de Grupo</span>
        </div>
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Centro de Controle</h1>
            <p className="text-muted-foreground text-sm">
              Acompanhe campanhas, grupos, agendamentos e resultados em tempo real.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link to="/dashboard/group-crm/group-send"><Send className="w-4 h-4" /> Novo Disparo</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link to="/dashboard/campaign-list"><Megaphone className="w-4 h-4" /> Nova Campanha</Link>
            </Button>
            <Button asChild size="sm" className="gap-1.5 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:opacity-90">
              <Link to="/dashboard/group-crm/schedule"><Plus className="w-4 h-4" /> Novo Agendamento</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* 1. KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="relative overflow-hidden border-border/60">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{k.label}</span>
                <k.icon className={`w-4 h-4 ${k.color}`} />
              </div>
              <div className="text-2xl font-bold tracking-tight">{k.value}</div>
              <div className="text-[11px] text-emerald-500 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                {k.trend}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* 2. Chart + Upcoming */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border/60">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Volume de mensagens
            </CardTitle>
            <div className="flex items-center gap-1 bg-muted/40 rounded-md p-0.5">
              {([7, 15, 30] as ChartRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
                    range === r ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r} dias
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="h-[260px] pl-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="msgGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area type="monotone" dataKey="msgs" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#msgGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-cyan-400" />
              Próximos Agendamentos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[260px] overflow-y-auto">
            {MOCK_UPCOMING.map((u, i) => (
              <Link
                key={i}
                to="/dashboard/group-crm/schedule"
                className="block p-3 rounded-lg border border-border/50 hover:border-primary/40 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" /> {u.when}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] capitalize ${statusBadge(u.status)}`}>
                    {u.status}
                  </Badge>
                </div>
              </Link>
            ))}
            <Link to="/dashboard/group-crm/schedule" className="block text-center text-xs text-primary hover:underline pt-1">
              Ver todos →
            </Link>
          </CardContent>
        </Card>
      </section>

      {/* 4. Recent campaigns */}
      <section>
        <Card className="border-border/60">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-orange-400" />
              Campanhas Recentes
            </CardTitle>
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link to="/dashboard/campaign-list">Ver todas →</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-y border-border/60">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Nome</th>
                    <th className="px-4 py-2.5 font-medium">Tipo</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Próximo envio</th>
                    <th className="px-4 py-2.5 font-medium">Grupos</th>
                    <th className="px-4 py-2.5 font-medium">Resultado</th>
                    <th className="px-4 py-2.5 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_RECENT.map((c, i) => (
                    <tr key={i} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium truncate max-w-[180px]">{c.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.type}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`text-[10px] ${statusBadge(c.status)}`}>{c.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{c.next}</td>
                      <td className="px-4 py-3">{c.groups}</td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">{c.result}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild size="icon" variant="ghost" className="w-7 h-7" title="Ver">
                            <Link to="/dashboard/campaign-list"><Eye className="w-3.5 h-3.5" /></Link>
                          </Button>
                          <Button asChild size="icon" variant="ghost" className="w-7 h-7" title="Editar">
                            <Link to="/dashboard/campaign-list"><Pencil className="w-3.5 h-3.5" /></Link>
                          </Button>
                          <Button size="icon" variant="ghost" className="w-7 h-7" title={c.status === "Pausada" ? "Ativar" : "Pausar"}>
                            {c.status === "Pausada" ? <PlayCircle className="w-3.5 h-3.5 text-emerald-400" /> : <PauseCircle className="w-3.5 h-3.5 text-amber-400" />}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 5. Alerts + Quick actions */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Alertas e Pendências
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {MOCK_ALERTS.map((a, i) => {
              const sev =
                a.severity === "high" ? "border-rose-500/30 bg-rose-500/5 text-rose-300"
                  : a.severity === "med" ? "border-amber-500/30 bg-amber-500/5 text-amber-300"
                    : "border-cyan-500/30 bg-cyan-500/5 text-cyan-300";
              return (
                <Link key={i} to={a.url} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${sev} hover:opacity-80 transition`}>
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span className="text-sm">{a.text}</span>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              Atalhos rápidos
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {QUICK_ACTIONS.map((a) => (
              <Link key={a.url} to={a.url}>
                <div className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border border-border/50 hover:border-primary/40 hover:bg-muted/30 transition-colors text-center h-full">
                  <a.icon className="w-4 h-4 text-primary" />
                  <span className="text-[11px] font-medium leading-tight">{a.title}</span>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
