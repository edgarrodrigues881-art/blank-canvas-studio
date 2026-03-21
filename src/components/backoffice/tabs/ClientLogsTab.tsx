import { Badge } from "@/components/ui/badge";
import { ScrollText, Shield, CreditCard, MessageSquare, Monitor, Settings, Trash2, UserCog, KeyRound, Bell, RefreshCw, FileText } from "lucide-react";

interface Props {
  detail: any;
}

const actionConfig: Record<string, { label: string; icon: any; color: string; bgColor: string }> = {
  "update-client": { label: "Dados atualizados", icon: UserCog, color: "text-sky-400", bgColor: "bg-sky-500/10" },
  "update-subscription": { label: "Plano alterado", icon: FileText, color: "text-violet-400", bgColor: "bg-violet-500/10" },
  "reset-password": { label: "Senha resetada", icon: Shield, color: "text-amber-400", bgColor: "bg-amber-500/10" },
  "force-logout": { label: "Logout forçado", icon: RefreshCw, color: "text-destructive", bgColor: "bg-destructive/10" },
  "toggle-status": { label: "Status alterado", icon: Settings, color: "text-orange-400", bgColor: "bg-orange-500/10" },
  "set-role": { label: "Role alterada", icon: Shield, color: "text-pink-400", bgColor: "bg-pink-500/10" },
  "create-device": { label: "Instância criada", icon: Monitor, color: "text-primary", bgColor: "bg-primary/10" },
  "delete-device": { label: "Instância removida", icon: Trash2, color: "text-destructive", bgColor: "bg-destructive/10" },
  "add-payment": { label: "Pagamento registrado", icon: CreditCard, color: "text-primary", bgColor: "bg-primary/10" },
  "delete-payment": { label: "Pagamento removido", icon: CreditCard, color: "text-destructive", bgColor: "bg-destructive/10" },
  "update-payment": { label: "Pagamento editado", icon: CreditCard, color: "text-sky-400", bgColor: "bg-sky-500/10" },
  "send-message": { label: "Mensagem enviada", icon: MessageSquare, color: "text-primary", bgColor: "bg-primary/10" },
  "delete-message": { label: "Mensagem removida", icon: MessageSquare, color: "text-destructive", bgColor: "bg-destructive/10" },
  "toggle-notification": { label: "Notificação alterada", icon: Bell, color: "text-amber-400", bgColor: "bg-amber-500/10" },
  "create-cycle": { label: "Ciclo criado", icon: RefreshCw, color: "text-violet-400", bgColor: "bg-violet-500/10" },
  "auto-trial": { label: "Trial automático", icon: KeyRound, color: "text-primary", bgColor: "bg-primary/10" },
  "add-tokens": { label: "Tokens adicionados", icon: KeyRound, color: "text-primary", bgColor: "bg-primary/10" },
  "delete-token": { label: "Token removido", icon: KeyRound, color: "text-destructive", bgColor: "bg-destructive/10" },
  "delete-all-tokens": { label: "Tokens limpos", icon: Trash2, color: "text-destructive", bgColor: "bg-destructive/10" },
  "update-monitor-token": { label: "Token monitor", icon: Bell, color: "text-sky-400", bgColor: "bg-sky-500/10" },
};

const defaultConfig = { label: "", icon: Settings, color: "text-muted-foreground", bgColor: "bg-muted/50" };

function groupByDate(logs: any[]): Record<string, any[]> {
  const groups: Record<string, any[]> = {};
  for (const log of logs) {
    const date = new Date(log.created_at).toLocaleDateString("pt-BR");
    if (!groups[date]) groups[date] = [];
    groups[date].push(log);
  }
  return groups;
}

const ClientLogsTab = ({ detail }: Props) => {
  const logs = detail?.admin_logs || [];
  const grouped = groupByDate(logs);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <ScrollText size={18} className="text-primary" />
        </div>
        <div>
          <h3 className="text-base font-bold text-foreground">Histórico de Ações</h3>
          <p className="text-xs text-muted-foreground">{logs.length} registro{logs.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <ScrollText size={32} className="mb-2 opacity-20" />
          <p className="text-sm">Nenhuma ação registrada</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, dateLogs]) => (
            <div key={date} className="space-y-1.5">
              {/* Date header */}
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{date}</span>
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] text-muted-foreground/60">{dateLogs.length} ação{dateLogs.length !== 1 ? "ões" : ""}</span>
              </div>

              {/* Log entries */}
              {dateLogs.map((log: any) => {
                const cfg = actionConfig[log.action] || { ...defaultConfig, label: log.action };
                const Icon = cfg.icon;
                const time = new Date(log.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

                return (
                  <div key={log.id} className="group flex items-start gap-3 bg-card border border-border rounded-xl px-4 py-3 hover:border-primary/15 hover:shadow-sm transition-all duration-200">
                    {/* Icon */}
                    <div className={`w-7 h-7 rounded-lg ${cfg.bgColor} flex items-center justify-center shrink-0 mt-0.5`}>
                      <Icon size={13} className={cfg.color} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                      </div>
                      {log.details && (
                        <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-2">{log.details}</p>
                      )}
                    </div>

                    {/* Time */}
                    <span className="text-[11px] text-muted-foreground/50 tabular-nums shrink-0 mt-0.5">{time}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClientLogsTab;
