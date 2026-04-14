import { LayoutDashboard, Users, GitBranch, MessageSquare, TrendingUp, CalendarClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

const stats = [
  { label: "Leads ativos", value: "—", icon: Users, color: "text-primary" },
  { label: "Conversas abertas", value: "—", icon: MessageSquare, color: "text-emerald-500" },
  { label: "Pipeline", value: "—", icon: GitBranch, color: "text-violet-500" },
  { label: "Agendamentos hoje", value: "—", icon: CalendarClock, color: "text-amber-500" },
];

const CRMDashboard = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <LayoutDashboard className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Dashboard CRM</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card border-border">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <TrendingUp className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-1">CRM em construção</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Em breve você terá métricas completas de leads, conversões e desempenho do seu atendimento aqui.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default CRMDashboard;
