import {
  Users,
  CheckCircle2,
  Link2,
  LogIn,
  Send,
  Megaphone,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const GroupDashboard = () => {
  const stats = [
    { label: "Total de Grupos", value: 1250, icon: Users, tone: "blue" as const },
    { label: "Grupos Ativos", value: 842, icon: CheckCircle2, tone: "emerald" as const },
    { label: "Links Importados", value: 4500, icon: Link2, tone: "orange" as const },
    { label: "Entradas Realizadas", value: 320, icon: LogIn, tone: "sky" as const },
    { label: "Campanhas Ativas", value: 12, icon: Megaphone, tone: "amber" as const },
    { label: "Mensagens Enviadas", value: 12400, icon: Send, tone: "violet" as const },
  ];

  const recentActivities = [
    { id: 1, group: "Vendas Automotivas SP", action: "Envio de Campanha", instance: "Chip 01", status: "Concluído", date: "Hoje, 14:30" },
    { id: 2, group: "Marketing Digital Brasil", action: "Entrada em Grupo", instance: "Chip 03", status: "Pendente", date: "Hoje, 14:15" },
    { id: 3, group: "Networking Empresarial", action: "Extração de Membros", instance: "Chip 02", status: "Falhou", date: "Hoje, 13:50" },
    { id: 4, group: "Promoções Diárias", action: "Mensagem de Boas-vindas", instance: "Chip 01", status: "Em execução", date: "Hoje, 13:45" },
    { id: 5, group: "Grupo de Estudos", action: "Envio de Campanha", instance: "Chip 04", status: "Pausado", date: "Ontem, 18:20" },
  ];

  const campaignStatus = [
    { name: "Promo Black Friday", sent: 8420, total: 10000, status: "Em execução" },
    { name: "Lançamento Curso", sent: 3200, total: 3200, status: "Concluído" },
    { name: "Reativação Leads", sent: 0, total: 1500, status: "Pausado" },
  ];

  const joinStatus = [
    { name: "Lote SP - Janeiro", joined: 142, total: 200, status: "Em execução" },
    { name: "Networking RJ", joined: 80, total: 80, status: "Concluído" },
    { name: "Grupos Educação", joined: 12, total: 100, status: "Pendente" },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Concluído": return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Concluído</Badge>;
      case "Pendente": return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Pendente</Badge>;
      case "Falhou": return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Falhou</Badge>;
      case "Em execução": return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse">Em execução</Badge>;
      case "Pausado": return <Badge className="bg-gray-500/10 text-gray-500 border-gray-500/20">Pausado</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Gestão de Grupos</h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Controle seus grupos, membros, entradas, campanhas e automações em um único painel.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
        {stats.map((s) => (
          <StatCard
            key={s.label}
            label={s.label}
            value={s.value}
            icon={s.icon}
            tone={s.tone}
            showStatusDot={false}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/50 bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Status das Campanhas</h2>
          </div>
          <div className="space-y-3">
            {campaignStatus.map((c) => {
              const pct = Math.round((c.sent / c.total) * 100);
              return (
                <div key={c.name} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-foreground truncate">{c.name}</span>
                    {getStatusBadge(c.status)}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{c.sent}/{c.total}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="border-border/50 bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Status das Entradas</h2>
          </div>
          <div className="space-y-3">
            {joinStatus.map((c) => {
              const pct = Math.round((c.joined / c.total) * 100);
              return (
                <div key={c.name} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-foreground truncate">{c.name}</span>
                    {getStatusBadge(c.status)}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{c.joined}/{c.total}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Últimas Atividades</h2>
        <Card className="border-border/50 bg-card overflow-hidden rounded-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/40 text-muted-foreground font-medium border-b border-border/50">
                <tr>
                  <th className="px-5 py-3">Grupo</th>
                  <th className="px-5 py-3">Ação</th>
                  <th className="px-5 py-3">Instância</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {recentActivities.map((activity) => (
                  <tr key={activity.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3 font-medium text-foreground">{activity.group}</td>
                    <td className="px-5 py-3 text-muted-foreground">{activity.action}</td>
                    <td className="px-5 py-3 text-muted-foreground">{activity.instance}</td>
                    <td className="px-5 py-3">{getStatusBadge(activity.status)}</td>
                    <td className="px-5 py-3 text-muted-foreground">{activity.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default GroupDashboard;
