import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { useWelcomeQueue, useWelcomeMessageLogs } from "@/hooks/useWelcomeAutomation";
import { TrendingUp, Send, AlertTriangle, Timer, Info, Activity } from "lucide-react";
import { format } from "date-fns";

interface Props {
  automationId: string;
}

/**
 * Performance dashboard:
 * - Success rate %
 * - Messages sent today
 * - Failures by type (classified)
 * - Average send time (queue → processed)
 */
export function WelcomePerformanceDashboard({ automationId }: Props) {
  const { data: queue } = useWelcomeQueue(automationId);
  const { data: logs } = useWelcomeMessageLogs(automationId, 500);

  const metrics = useMemo(() => {
    const items = queue || [];
    const todayStr = format(new Date(), "yyyy-MM-dd");

    const sent = items.filter(i => i.status === "sent");
    const failed = items.filter(i => i.status === "failed");
    const processedTotal = sent.length + failed.length;
    const successRate = processedTotal > 0 ? (sent.length / processedTotal) * 100 : 0;

    const sentToday = sent.filter(i => (i.processed_at || "").startsWith(todayStr)).length;
    const failedToday = failed.filter(i => (i.processed_at || "").startsWith(todayStr)).length;

    // Average send time (queued_at → processed_at) for items sent today
    const durations = sent
      .filter(i => i.processed_at && i.queued_at)
      .map(i => new Date(i.processed_at!).getTime() - new Date(i.queued_at).getTime())
      .filter(ms => ms > 0 && ms < 1000 * 60 * 60 * 6); // sanity cap 6h
    const avgMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const avgSec = Math.round(avgMs / 1000);

    // Failures by classification
    const classify = (reason: string | null): string => {
      const r = (reason || "").toLowerCase();
      if (!r) return "Outros";
      if (r.includes("timeout") || r.includes("etimedout")) return "Timeout";
      if (r.includes("not registered") || r.includes("invalid") || r.includes("não registr")) return "Número inválido";
      if (r.includes("disconnect") || r.includes("offline") || r.includes("desconect")) return "Device offline";
      if (r.includes("block") || r.includes("ban") || r.includes("403") || r.includes("401")) return "Bloqueio/Auth";
      if (r.includes("limit") || r.includes("cooldown") || r.includes("429")) return "Limite/Rate";
      if (r.includes("5")) return "API instável";
      return "Outros";
    };
    const failByType: Record<string, number> = {};
    for (const f of failed) {
      const k = classify(f.error_reason);
      failByType[k] = (failByType[k] || 0) + 1;
    }
    const failBuckets = Object.entries(failByType).sort((a, b) => b[1] - a[1]);

    // Recent activity (sparkline-ish from logs)
    const last24h = (logs || []).filter(l => Date.now() - new Date(l.created_at).getTime() < 24 * 3600 * 1000);

    return { successRate, sentToday, failedToday, avgSec, failBuckets, processedTotal, last24h };
  }, [queue, logs]);

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      {/* Success rate */}
      <Card className="border-border/40 bg-gradient-to-br from-emerald-500/5 to-transparent">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Taxa de sucesso</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {metrics.successRate.toFixed(1)}<span className="text-base text-muted-foreground">%</span>
          </div>
          <Progress value={metrics.successRate} className="h-1.5" />
          <p className="text-[10px] text-muted-foreground">{metrics.processedTotal} mensagens processadas</p>
        </CardContent>
      </Card>

      {/* Sent today */}
      <Card className="border-border/40 bg-gradient-to-br from-blue-500/5 to-transparent">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Enviadas hoje</span>
            <Send className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-foreground">{metrics.sentToday}</div>
          <p className="text-[10px] text-muted-foreground">
            {metrics.failedToday > 0 ? `${metrics.failedToday} falha(s) hoje` : "Sem falhas hoje"}
          </p>
        </CardContent>
      </Card>

      {/* Avg send time */}
      <Card className="border-border/40 bg-gradient-to-br from-purple-500/5 to-transparent">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              Tempo médio
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-3 h-3 text-muted-foreground/70" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    Tempo desde a entrada na fila até o envio efetivo. Inclui delays inteligentes de humanização.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
            <Timer className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {metrics.avgSec > 60 ? `${Math.round(metrics.avgSec / 60)}min` : `${metrics.avgSec}s`}
          </div>
          <p className="text-[10px] text-muted-foreground">por envio (mediana móvel)</p>
        </CardContent>
      </Card>

      {/* Failures by type */}
      <Card className="border-border/40 bg-gradient-to-br from-red-500/5 to-transparent">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Falhas por tipo</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          {metrics.failBuckets.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2 flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-emerald-400" /> Nenhuma falha registrada
            </div>
          ) : (
            <div className="space-y-1">
              {metrics.failBuckets.slice(0, 4).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground truncate">{k}</span>
                  <span className="font-mono font-semibold text-red-400">{v}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
