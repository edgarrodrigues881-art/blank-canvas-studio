import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Megaphone, Smartphone, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface TimelineEvent {
  id: string;
  type: "campaign" | "device" | "message";
  title: string;
  description: string;
  timestamp: string;
}

interface Props {
  events: TimelineEvent[];
}

const iconMap = {
  campaign: { icon: Megaphone, color: "text-teal-400 bg-teal-500/15" },
  device: { icon: Smartphone, color: "text-emerald-400 bg-emerald-500/15" },
  message: { icon: Send, color: "text-violet-400 bg-violet-500/15" },
};

export function ActivityTimeline({ events }: Props) {
  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
          <Clock className="w-4 h-4 text-teal-400" />
          Atividades Recentes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Nenhuma atividade recente</p>
        ) : (
          events.slice(0, 6).map((evt, i) => {
            const cfg = iconMap[evt.type];
            const Icon = cfg.icon;
            return (
              <div
                key={evt.id}
                className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors animate-fade-in"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${cfg.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{evt.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{evt.description}</p>
                </div>
                <span className="text-[10px] text-muted-foreground/70 shrink-0 whitespace-nowrap">
                  {formatDistanceToNow(new Date(evt.timestamp), { addSuffix: true, locale: ptBR })}
                </span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
