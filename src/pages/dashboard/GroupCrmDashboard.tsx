import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Layers,
  Megaphone,
  FileText,
  Users,
  LogIn,
  ArrowRightLeft,
  Heart,
  LayoutDashboard,
  UsersRound,
  Activity,
  Send,
  CheckCircle2,
  TrendingUp,
  Zap,
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

// ---- Placeholder data (UI only) ----
const kpis = [
  { label: "Grupos totais", value: "248", trend: "+12 esta semana", icon: UsersRound, color: "text-violet-400" },
  { label: "Grupos ativos hoje", value: "87", trend: "+5 vs ontem", icon: Activity, color: "text-emerald-400" },
  { label: "Mensagens enviadas hoje", value: "12.847", trend: "+18%", icon: Send, color: "text-cyan-400" },
  { label: "Taxa de sucesso", value: "98,4%", trend: "+0,6%", icon: CheckCircle2, color: "text-amber-400" },
];

const chartData = [
  { day: "Seg", msgs: 4200 },
  { day: "Ter", msgs: 5800 },
  { day: "Qua", msgs: 5100 },
  { day: "Qui", msgs: 7200 },
  { day: "Sex", msgs: 9400 },
  { day: "Sáb", msgs: 6800 },
  { day: "Dom", msgs: 12847 },
];

const realtime = [
  { type: "Disparo", text: "Campanha 'Black Friday' enviou 320 msgs", time: "agora", color: "bg-emerald-500" },
  { type: "Grupo", text: "Entrou em 4 novos grupos via convite", time: "2 min", color: "bg-violet-500" },
  { type: "Status", text: "Chip #12 reconectado com sucesso", time: "5 min", color: "bg-cyan-500" },
  { type: "Disparo", text: "Carrossel enviado para 58 grupos", time: "8 min", color: "bg-emerald-500" },
  { type: "Lead", text: "12 leads convertidos via @LID", time: "14 min", color: "bg-pink-500" },
];

const quickActions: { title: string; url: string; icon: LucideIcon; color: string }[] = [
  { title: "Disparo em Grupo", url: "/dashboard/group-crm/group-send", icon: Layers, color: "text-violet-400" },
  { title: "Campanhas", url: "/dashboard/campaign-list", icon: Megaphone, color: "text-orange-400" },
  { title: "Templates", url: "/dashboard/templates", icon: FileText, color: "text-cyan-400" },
  { title: "Template Carrossel", url: "/dashboard/carousel-templates", icon: Layers, color: "text-fuchsia-400" },
];

const acquisition: { title: string; description: string; url: string; icon: LucideIcon; color: string }[] = [
  { title: "Extrator de Grupos", description: "Extraia membros e dados de grupos.", url: "/dashboard/group-extractor", icon: Users, color: "text-indigo-400" },
  { title: "Entrada em Grupos", description: "Automatize a entrada via convites.", url: "/dashboard/group-join", icon: LogIn, color: "text-emerald-400" },
  { title: "Conversor de Lead (@LID)", description: "Converta @lid em números reais.", url: "/dashboard/lid-converter", icon: ArrowRightLeft, color: "text-pink-400" },
  { title: "Boas-vindas", description: "Mensagens automáticas a novos membros.", url: "/dashboard/welcome", icon: Heart, color: "text-rose-400" },
];

export default function GroupCrmDashboard() {
  return (
    <div className="container max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <LayoutDashboard className="w-4 h-4" />
          <span>CRM de Grupo</span>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Centro de Controle</h1>
            <p className="text-muted-foreground text-sm">
              Acompanhe métricas, atividade em tempo real e dispare ações em segundos.
            </p>
          </div>
          <Badge variant="outline" className="gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            ao vivo
          </Badge>
        </div>
      </header>

      {/* 1. KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="relative overflow-hidden">
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

      {/* 2. Chart + 3. Realtime activity */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Volume de mensagens — últimos 7 dias
            </CardTitle>
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-500" />
              Operação em tempo real
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[260px] overflow-y-auto">
            {realtime.map((r, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className={`w-2 h-2 rounded-full mt-1.5 ${r.color} shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {r.type}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{r.time}</span>
                  </div>
                  <p className="text-sm truncate">{r.text}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* 4. Quick actions */}
      <section className="space-y-3">
        <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground/60 font-semibold px-1 flex items-center gap-2">
          <Zap className="w-3 h-3" /> Ações rápidas
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {quickActions.map((a) => (
            <Link key={a.url} to={a.url}>
              <Card className="h-full transition-all hover:border-primary/40 hover:shadow-sm">
                <CardContent className="flex items-center gap-3 p-3">
                  <div className={`w-9 h-9 rounded-md bg-muted/40 flex items-center justify-center ${a.color}`}>
                    <a.icon className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-medium truncate">{a.title}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* 5. Acquisition (lower priority) */}
      <section className="space-y-3 pt-4 border-t border-border/40">
        <div className="px-1">
          <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground/60 font-semibold">
            Aquisição
          </h2>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            Ferramentas para crescer sua base de grupos e leads.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {acquisition.map((item) => (
            <Link key={item.url} to={item.url} className="group">
              <Card className="h-full transition-all hover:border-primary/40 bg-muted/20">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className={`w-8 h-8 rounded-md bg-background flex items-center justify-center ${item.color}`}>
                    <item.icon className="w-4 h-4" />
                  </div>
                  <CardTitle className="text-sm">{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
