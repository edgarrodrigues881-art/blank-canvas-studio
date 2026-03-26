import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Users, Zap, CheckCircle2, XCircle, Clock, AlertTriangle, BarChart3 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const CommunityOverviewTab = () => {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["community-stats-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("community-core", {
        body: { action: "community_stats" },
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const stats = data || {};

  const statCards = [
    { label: "Membros ativos", value: stats.total_members || 0, icon: Users, color: "text-blue-400" },
    { label: "Elegíveis agora", value: stats.eligible_now || 0, icon: CheckCircle2, color: "text-emerald-400" },
    { label: "Bloqueadas", value: stats.blocked_now || 0, icon: XCircle, color: "text-amber-400" },
    { label: "Sessões ativas", value: stats.active_sessions || 0, icon: Zap, color: "text-purple-400" },
    { label: "Concluídas hoje", value: stats.completed_today || 0, icon: CheckCircle2, color: "text-teal-400" },
    { label: "Falhadas hoje", value: stats.failed_today || 0, icon: AlertTriangle, color: "text-red-400" },
  ];

  const blockReasons = stats.block_reasons || {};
  const reasonLabels: Record<string, string> = {
    device_disconnected: "Desconectado",
    cooldown_active: "Em cooldown",
    daily_limit_reached: "Limite diário",
    session_active: "Em sessão",
    outside_window: "Fora do horário",
    no_active_cycle: "Sem ciclo ativo",
    warmup_day_too_early: "Dia insuficiente",
    community_day_not_started: "Com. não iniciado",
    pairs_limit_reached: "Limite de duplas",
    device_not_configured: "Não configurado",
  };

  const sessionsByHour = stats.sessions_by_hour || {};
  const maxHour = Math.max(...Object.values(sessionsByHour as Record<string, number>), 1);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Atualizado automaticamente</span>
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-8 px-2">
          <RefreshCw size={13} />
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((s) => (
          <Card key={s.label} className="border-border/50 bg-card/50">
            <CardContent className="p-3 text-center">
              <s.icon className={`w-4 h-4 mx-auto mb-1 ${s.color}`} />
              <div className="text-lg font-bold text-foreground">{s.value}</div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Block reasons */}
        <Card className="border-border/50 bg-card/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <XCircle className="w-4 h-4 text-amber-400" />
              Motivos de bloqueio
            </div>
            {Object.keys(blockReasons).length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma conta bloqueada</p>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(blockReasons).sort((a: any, b: any) => b[1] - a[1]).map(([reason, count]) => (
                  <div key={reason} className="flex items-center justify-between text-xs">
                    <span className="text-foreground">{reasonLabels[reason] || reason}</span>
                    <Badge variant="outline" className="text-[10px]">{count as number}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sessions by hour */}
        <Card className="border-border/50 bg-card/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <BarChart3 className="w-4 h-4 text-blue-400" />
              Sessões por hora (hoje)
            </div>
            <div className="flex items-end gap-1 h-20">
              {Array.from({ length: 24 }, (_, h) => {
                const count = (sessionsByHour[h] || 0) as number;
                const height = count > 0 ? Math.max(8, (count / maxHour) * 100) : 4;
                return (
                  <div key={h} className="flex-1 flex flex-col items-center gap-0.5">
                    <div
                      className={`w-full rounded-sm transition-all ${count > 0 ? "bg-primary" : "bg-muted/50"}`}
                      style={{ height: `${height}%` }}
                      title={`${h}h: ${count} sessões`}
                    />
                    {h % 4 === 0 && <span className="text-[8px] text-muted-foreground">{h}h</span>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top devices */}
        <Card className="border-border/50 bg-card/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Zap className="w-4 h-4 text-purple-400" />
              Contas mais ativas hoje
            </div>
            <ScrollArea className="max-h-40">
              <div className="space-y-1">
                {(stats.top_devices || []).map((d: any) => (
                  <div key={d.device_id} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-muted/30">
                    <span className="font-mono text-foreground">{d.device_id.substring(0, 8)}…</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{d.messages_today} msgs</span>
                      <span className="text-muted-foreground">{d.pairs_today} duplas</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Error devices */}
        <Card className="border-border/50 bg-card/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              Contas com erro
            </div>
            <ScrollArea className="max-h-40">
              {(stats.error_devices || []).length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum erro ativo</p>
              ) : (
                <div className="space-y-1">
                  {(stats.error_devices || []).map((d: any) => (
                    <div key={d.device_id} className="flex items-start gap-2 text-[10px] px-2 py-1 rounded bg-destructive/5">
                      <span className="font-mono text-foreground shrink-0">{d.device_id.substring(0, 8)}…</span>
                      <span className="text-destructive truncate">{d.error}</span>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Recent audit */}
      {(stats.recent_audit || []).length > 0 && (
        <Card className="border-border/50 bg-card/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Clock className="w-4 h-4 text-teal-400" />
              Eventos recentes
            </div>
            <ScrollArea className="max-h-48">
              <div className="space-y-1">
                {(stats.recent_audit || []).map((log: any) => (
                  <div key={log.id} className="flex items-start gap-2 text-[10px] px-2 py-1 rounded bg-muted/30">
                    <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${
                      log.level === "error" ? "bg-red-400" : log.level === "warn" ? "bg-amber-400" : "bg-teal-400"
                    }`} />
                    <span className="text-foreground flex-1 truncate">{log.message}</span>
                    <Badge variant="outline" className="text-[8px] shrink-0">{log.event_type}</Badge>
                    <span className="text-muted-foreground shrink-0">
                      {new Date(log.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CommunityOverviewTab;
