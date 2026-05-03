import { 
  Users, 
  CheckCircle2, 
  XCircle, 
  Link2, 
  LogIn, 
  Clock, 
  Send, 
  Heart, 
  Plus, 
  Search, 
  Megaphone, 
  FileText, 
  Settings2, 
  Zap,
  LayoutDashboard,
  BarChart3,
  Download,
  UsersRound,
  BookUser,
  Layers,
  Settings,
  ChevronRight
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const GroupDashboard = () => {
  const navigate = useNavigate();

  const stats = [
    { label: "Total de Grupos", value: 1250, icon: Users, tone: "blue" as const },
    { label: "Grupos Ativos", value: 842, icon: CheckCircle2, tone: "emerald" as const },
    { label: "Links Importados", value: 4500, icon: Link2, tone: "orange" as const },
    { label: "Entradas Realizadas", value: 320, icon: LogIn, tone: "sky" as const },
    { label: "Campanhas Ativas", value: 12, icon: Megaphone, tone: "amber" as const },
    { label: "Mensagens Enviadas", value: 12400, icon: Send, tone: "violet" as const },
  ];

  const sections = [
    {
      label: "Visão Geral",
      items: [
        { title: "Dashboard de Grupos", description: "Visão geral e métricas de desempenho dos seus grupos.", url: "/dashboard/groups-dashboard", icon: LayoutDashboard, iconColor: "text-sky-400" },
        { title: "Relatórios de Grupos", description: "Relatórios detalhados de envios e interações.", url: "/dashboard/groups-reports", icon: BarChart3, iconColor: "text-emerald-400" },
      ]
    },
    {
      label: "Captação",
      items: [
        { title: "Importar Grupos", description: "Importe novas listas de grupos para sua base.", url: "/dashboard/groups-import", icon: Download, iconColor: "text-orange-400" },
        { title: "Extrator de Links", description: "Extraia links de convite de grupos automaticamente.", url: "/dashboard/group-invite-extractor", icon: Link2, iconColor: "text-blue-400" },
        { title: "Extrator de Grupos", description: "Extraia membros e informações de grupos existentes.", url: "/dashboard/group-extractor", icon: Users, iconColor: "text-indigo-400" },
        { title: "Entrada em Grupos", description: "Gerencie o processo de entrada em novos grupos.", url: "/dashboard/group-join", icon: LogIn, iconColor: "text-sky-400" },
      ]
    },
    {
      label: "Operação",
      items: [
        { title: "Meus Grupos", description: "Lista completa e gerenciamento dos seus grupos.", url: "/dashboard/groups", icon: UsersRound, iconColor: "text-violet-400" },
        { title: "Membros dos Grupos", description: "Gerencie os membros dos grupos captados.", url: "/dashboard/group-members", icon: BookUser, iconColor: "text-emerald-400" },
        { title: "Boas-vindas", description: "Configure mensagens automáticas de boas-vindas.", url: "/dashboard/welcome", icon: Heart, iconColor: "text-pink-400" },
        { title: "Disparo em Grupo", description: "Envie mensagens em massa para diversos grupos.", url: "/dashboard/group-carousel", icon: Layers, iconColor: "text-fuchsia-400" },
      ]
    },
    {
      label: "Automação",
      items: [
        { title: "Campanhas de Grupo", description: "Crie campanhas estruturadas para grupos.", url: "/dashboard/group-campaigns", icon: Megaphone, iconColor: "text-orange-400" },
        { title: "Templates de Grupo", description: "Gerencie modelos de mensagens para grupos.", url: "/dashboard/group-templates", icon: FileText, iconColor: "text-cyan-400" },
        { title: "Configurações de Grupos", description: "Ajustes gerais do módulo de grupos.", url: "/dashboard/groups-settings", icon: Settings, iconColor: "text-amber-400" },
      ]
    }
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
        <p className="text-muted-foreground text-sm sm:text-base">Gerencie listas, entradas, disparos, campanhas, membros e automações de grupos em um só lugar.</p>
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

      <div className="space-y-12">
        {sections.map((section) => (
          <div key={section.label} className="space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-foreground uppercase tracking-widest text-muted-foreground/50">
                {section.label}
              </h2>
              <div className="h-px flex-1 bg-border/50" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {section.items.map((item) => (
                <Card 
                  key={item.title}
                  className="group relative overflow-hidden border-border/50 bg-card/50 hover:bg-muted/30 transition-all duration-300 cursor-pointer rounded-xl flex flex-col"
                  onClick={() => navigate(item.url)}
                >
                  <div className="p-5 flex flex-col flex-1 gap-4">
                    <div className="flex items-start justify-between">
                      <div className={cn("p-2.5 rounded-xl bg-background/50 border border-border/50 transition-colors group-hover:bg-background group-hover:scale-110 duration-300", item.iconColor)}>
                        <item.icon className="w-6 h-6" strokeWidth={1.5} />
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                    
                    <div className="space-y-1.5">
                      <h3 className="font-bold text-foreground group-hover:text-primary transition-colors">
                        {item.title}
                      </h3>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        {item.description}
                      </p>
                    </div>
                    
                    <div className="mt-auto pt-4 flex items-center text-[11px] font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-wider">
                      Acessar funcionalidade
                    </div>
                  </div>
                  
                  {/* Hover accent */}
                  <div className="absolute bottom-0 left-0 h-1 w-0 bg-primary group-hover:w-full transition-all duration-500" />
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4 pt-4">
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
