import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers, UsersRound, LayoutDashboard } from "lucide-react";

const items = [
  {
    title: "Disparo em Grupo",
    description: "Envie mensagens em massa para múltiplos grupos com carrossel e mídia.",
    url: "/dashboard/group-crm/group-send",
    icon: Layers,
    color: "text-violet-400",
  },
  {
    title: "Grupos",
    description: "Gerencie e visualize todos os grupos capturados pelos seus dispositivos.",
    url: "/dashboard/group-crm/groups",
    icon: UsersRound,
    color: "text-indigo-400",
  },
];

export default function GroupCrmDashboard() {
  return (
    <div className="container max-w-6xl mx-auto px-4 py-8 space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <LayoutDashboard className="w-4 h-4" />
          <span>CRM de Grupo</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Centralize a operação de mensagens e gerenciamento de grupos do WhatsApp.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map((item) => (
          <Link key={item.url} to={item.url} className="group">
            <Card className="h-full transition-all hover:border-primary/40 hover:shadow-md">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <div className={`w-10 h-10 rounded-lg bg-muted/40 flex items-center justify-center ${item.color}`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <CardTitle className="text-base">{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
