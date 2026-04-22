import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Shuffle, Clock3, ShieldCheck } from "lucide-react";

const ITEMS = [
  {
    icon: Shuffle,
    title: "Distribuição inteligente",
    text: "O sistema distribui automaticamente os envios entre dispositivos para evitar bloqueios.",
    tone: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  },
  {
    icon: Clock3,
    title: "Delay humanizado",
    text: "Intervalos aleatórios entre envios simulam comportamento humano e reduzem risco de banimento.",
    tone: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  },
  {
    icon: ShieldCheck,
    title: "Limites e cooldown",
    text: "Cada device respeita um teto diário, limite por minuto e cooldown — pausando automaticamente quando necessário.",
    tone: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  },
  {
    icon: Sparkles,
    title: "Retry inteligente",
    text: "Erros temporários entram em retry com backoff progressivo. Erros permanentes são descartados sem desperdício.",
    tone: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
];

export function WelcomeSystemInfo() {
  return (
    <Card className="border-border/40 bg-gradient-to-br from-primary/[0.03] to-transparent">
      <CardContent className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map(({ icon: Icon, title, text, tone }) => (
            <div key={title} className="flex gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${tone}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <p className="text-xs font-semibold text-foreground">{title}</p>
                <p className="text-[11px] text-muted-foreground leading-snug">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
