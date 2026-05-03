import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Layers,
  Megaphone,
  FileText,
  UsersRound,
  Users,
  LogIn,
  ArrowRightLeft,
  Heart,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";

interface Section {
  label: string;
  items: { title: string; description: string; url: string; icon: LucideIcon; color: string }[];
}

const sections: Section[] = [
  {
    label: "Operação",
    items: [
      { title: "Disparo em Grupo", description: "Envio massivo para múltiplos grupos com mídia e carrossel.", url: "/dashboard/group-crm/group-send", icon: Layers, color: "text-violet-400" },
      { title: "Campanhas", description: "Acompanhe o status e métricas das suas campanhas ativas.", url: "/dashboard/campaign-list", icon: Megaphone, color: "text-orange-400" },
      { title: "Templates", description: "Modelos de mensagens prontos para reutilização.", url: "/dashboard/templates", icon: FileText, color: "text-cyan-400" },
      { title: "Template Carrossel", description: "Crie sequências de cards para envio em carrossel.", url: "/dashboard/carousel-templates", icon: Layers, color: "text-fuchsia-400" },
    ],
  },
  {
    label: "Aquisição",
    items: [
      { title: "Extrator de Grupos", description: "Extraia membros e dados de grupos do WhatsApp.", url: "/dashboard/group-extractor", icon: Users, color: "text-indigo-400" },
      { title: "Entrada em Grupos", description: "Automatize a entrada em grupos via convites.", url: "/dashboard/group-join", icon: LogIn, color: "text-emerald-400" },
      { title: "Conversor de Lead (@LID)", description: "Converta identificadores @lid em números reais.", url: "/dashboard/lid-converter", icon: ArrowRightLeft, color: "text-pink-400" },
      { title: "Boas-vindas", description: "Mensagens automáticas para novos membros do grupo.", url: "/dashboard/welcome", icon: Heart, color: "text-rose-400" },
    ],
  },
];

export default function GroupCrmDashboard() {
  return (
    <div className="container max-w-6xl mx-auto px-4 py-8 space-y-8">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <LayoutDashboard className="w-4 h-4" />
          <span>CRM de Grupo</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Centralize toda a operação de mensagens, captura e gestão de grupos do WhatsApp em um só lugar.
        </p>
      </header>

      {sections.map((section) => (
        <section key={section.label} className="space-y-3">
          <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground/60 font-semibold px-1">
            {section.label}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {section.items.map((item) => (
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
        </section>
      ))}
    </div>
  );
}
