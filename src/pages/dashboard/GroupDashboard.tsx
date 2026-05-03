import { Users, CheckCircle2, XCircle, Link2, LogIn, Clock, Send, Heart, Plus, Search, Megaphone, FileText, Settings2, Zap } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";

const GroupDashboard = () => {
  const navigate = useNavigate();

  const stats = [
    { label: "Total de Grupos", value: 1250, icon: Users, tone: "blue" as const },
    { label: "Grupos Ativos", value: 842, icon: CheckCircle2, tone: "emerald" as const },
    { label: "Grupos com Falha", value: 12, icon: XCircle, tone: "red" as const },
    { label: "Links Importados", value: 4500, icon: Link2, tone: "orange" as const },
    { label: "Entradas Realizadas", value: 320, icon: LogIn, tone: "indigo" as const },
    { label: "Pedidos Pendentes", value: 45, icon: Clock, tone: "amber" as const },
    { label: "Mensagens Enviadas", value: 12400, icon: Send, tone: "violet" as const },
    { label: "Boas-vindas Enviadas", value: 185, icon: Heart, tone: "pink" as const },
  ];

  const quickActions = [
    { label: "Importar Lista de Grupos", icon: Plus, onClick: () => navigate("/dashboard/groups-import") },
    { label: "Extrair Links", icon: Search, onClick: () => navigate("/dashboard/group-invite-extractor") },
    { label: "Nova Campanha de Grupo", icon: Megaphone, onClick: () => navigate("/dashboard/group-join/new") },
    { label: "Criar Template de Grupo", icon: FileText, onClick: () => navigate("/dashboard/templates") },
    { label: "Configurar Boas-vindas", icon: Settings2, onClick: () => navigate("/dashboard/welcome") },
  ];

  const recentActivities = [
    { id: 1, group: "Vendas Automotivas SP", action: "Envio de Campanha", instance: "Chip 01", status: "Concluído", date: "Hoje, 14:30" },
    { id: 2, group: "Marketing Digital Brasil", action: "Entrada em Grupo", instance: "Chip 03", status: "Pendente", date: "Hoje, 14:15" },
    { id: 3, group: "Networking Empresarial", action: "Extração de Membros", instance: "Chip 02", status: "Falhou", date: "Hoje, 13:50" },
    { id: 4, group: "Promoções Diárias", action: "Mensagem de Boas-vindas", instance: "Chip 01", status: "Em execução", date: "Hoje, 13:45" },
    { id: 5, group: "Grupo de Estudos", action: "Envio de Campanha", instance: "Chip 04", status: "Pausado", date: "Ontem, 18:20" },
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
    <div className="space-y-6 sm:space-y-10">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Gestão de Grupos</h1>
        <p className="text-muted-foreground text-sm sm:text-base">Controle suas listas, entradas, campanhas e automações para grupos.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-500" />
          Ações Rápidas
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {quickActions.map((action) => (
            <Button
              key={action.label}
              variant="outline"
              className="h-auto py-4 px-4 flex flex-col items-center gap-3 bg-card hover:bg-muted/50 border-border/50 rounded-xl transition-all hover:scale-[1.02]"
              onClick={action.onClick}
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <action.icon className="w-5 h-5 text-primary" />
              </div>
              <span className="text-xs font-medium text-center line-clamp-2">{action.label}</span>
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Últimas Atividades de Grupos</h2>
        <Card className="border-border/50 bg-card overflow-hidden rounded-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border/50">
                <tr>
                  <th className="px-6 py-4">Grupo</th>
                  <th className="px-6 py-4">Tipo de Ação</th>
                  <th className="px-6 py-4">Instância</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Data</th>
                  <th className="px-6 py-4">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {recentActivities.map((activity) => (
                  <tr key={activity.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{activity.group}</td>
                    <td className="px-6 py-4 text-muted-foreground">{activity.action}</td>
                    <td className="px-6 py-4 text-muted-foreground">{activity.instance}</td>
                    <td className="px-6 py-4">{getStatusBadge(activity.status)}</td>
                    <td className="px-6 py-4 text-muted-foreground">{activity.date}</td>
                    <td className="px-6 py-4">
                      <Button variant="ghost" size="sm" className="h-8 text-xs">Ver Detalhes</Button>
                    </td>
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
