import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "./WelcomeStatusBadge";
import { useQueueItemLogs, type WelcomeQueueItem } from "@/hooks/useWelcomeAutomation";
import { format } from "date-fns";
import {
  CheckCircle2, AlertTriangle, Loader2, Activity, MessageSquare, Smartphone, Clock,
} from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  item: WelcomeQueueItem | null;
}

function resultTone(result: string | null) {
  const r = (result || "").toLowerCase();
  if (r === "sent" || r === "success" || r === "ok") {
    return { icon: CheckCircle2, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", label: "Sucesso" };
  }
  if (r === "failed" || r === "error") {
    return { icon: AlertTriangle, color: "text-red-400 bg-red-500/10 border-red-500/30", label: "Falha" };
  }
  return { icon: Activity, color: "text-blue-400 bg-blue-500/10 border-blue-500/30", label: r || "—" };
}

export function WelcomeQueueItemLogs({ open, onClose, item }: Props) {
  const { data: logs, isLoading } = useQueueItemLogs(item?.id);

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            Histórico do envio
          </SheetTitle>
        </SheetHeader>

        {!item ? null : (
          <div className="flex-1 overflow-hidden flex flex-col gap-4 mt-4">
            {/* Item summary */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-mono font-semibold text-foreground">{item.participant_phone}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {item.participant_name || "—"} · {item.group_name || item.group_id.slice(0, 18)}
                  </p>
                </div>
                <StatusBadge status={item.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-border/30">
                <Metric icon={Clock} label="Detectado" value={format(new Date(item.detected_at), "dd/MM HH:mm:ss")} />
                <Metric icon={Clock} label="Agendado" value={item.send_at ? format(new Date(item.send_at), "dd/MM HH:mm:ss") : "—"} />
                <Metric icon={Activity} label="Tentativas" value={String(item.attempts)} />
                <Metric icon={Clock} label="Processado" value={item.processed_at ? format(new Date(item.processed_at), "dd/MM HH:mm:ss") : "—"} />
              </div>
              {item.error_reason && (
                <div className="text-[11px] text-red-400 border-t border-border/30 pt-2 mt-1">
                  <span className="font-semibold">Último erro:</span> {item.error_reason}
                </div>
              )}
            </div>

            {/* Logs list */}
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tentativas registradas
              </h3>
              <Badge variant="outline" className="text-[10px]">{logs?.length || 0}</Badge>
            </div>

            <ScrollArea className="flex-1 -mx-2 pr-2">
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : !logs?.length ? (
                <div className="text-center py-12 text-xs text-muted-foreground">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Nenhuma tentativa registrada ainda
                </div>
              ) : (
                <ol className="relative border-l border-border/40 ml-3 space-y-3 py-1">
                  {logs.map((log, idx) => {
                    const t = resultTone(log.result);
                    const Icon = t.icon;
                    return (
                      <li key={log.id} className="ml-4 relative">
                        <span className={`absolute -left-[22px] top-1.5 w-3 h-3 rounded-full border-2 border-background ${t.color.split(" ")[1]}`} />
                        <div className="rounded-xl border border-border/40 bg-card p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant="outline" className={`gap-1 text-[10px] border ${t.color}`}>
                              <Icon className="w-3 h-3" /> {t.label}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              #{logs.length - idx} · {format(new Date(log.created_at), "dd/MM HH:mm:ss")}
                            </span>
                          </div>
                          {log.sender_device_id && (
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                              <Smartphone className="w-3 h-3" />
                              <span className="font-mono truncate">{log.sender_device_id.slice(0, 18)}…</span>
                            </div>
                          )}
                          {log.message_text && (
                            <div className="text-[11px] text-foreground/80 bg-muted/30 rounded-lg p-2 line-clamp-3">
                              {log.message_text}
                            </div>
                          )}
                          {log.external_response && (
                            <details className="text-[10px] text-muted-foreground">
                              <summary className="cursor-pointer hover:text-foreground">Resposta da API</summary>
                              <pre className="mt-1.5 overflow-x-auto max-h-32 bg-muted/30 rounded p-2 text-[10px]">
                                {JSON.stringify(log.external_response, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </ScrollArea>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wider">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-[11px] font-medium text-foreground font-mono">{value}</div>
    </div>
  );
}
