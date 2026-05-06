import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UsersRound, Activity, Users, MessageSquare, Sparkles } from "lucide-react";

const kpis = [
  { label: "Total de grupos", value: "—", icon: UsersRound, color: "text-violet-400" },
  { label: "Grupos ativos", value: "—", icon: Activity, color: "text-emerald-400" },
  { label: "Participantes totais", value: "—", icon: Users, color: "text-sky-400" },
  { label: "Mensagens monitoradas", value: "—", icon: MessageSquare, color: "text-amber-400" },
];

export default function GroupManagerDashboard() {
  return (
    <div className="space-y-8 p-1">
      {/* Header */}
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <UsersRound className="w-5 h-5 text-violet-400" />
          <h1 className="text-2xl font-bold tracking-tight">Gerenciador de Grupo</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Centro de controle dedicado para administração e monitoramento de grupos.
        </p>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4 flex items-start gap-3">
              <div className="rounded-lg bg-muted/50 p-2.5">
                <k.icon className={`w-5 h-5 ${k.color}`} strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                  {k.label}
                </p>
                <p className="text-2xl font-bold mt-0.5">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Welcome */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="w-5 h-5 text-violet-400" />
            Bem-vindo ao Gerenciador de Grupo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Este é o ambiente dedicado para gerenciamento de grupos. Em breve novas funções
            serão adicionadas aqui — monitoramento, moderação, métricas detalhadas e muito mais.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
