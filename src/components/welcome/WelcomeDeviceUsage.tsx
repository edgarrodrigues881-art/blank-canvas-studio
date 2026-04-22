import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Smartphone, Activity, Info, Zap, Snowflake, AlertOctagon } from "lucide-react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useWelcomeQueue, useWelcomeSenders } from "@/hooks/useWelcomeAutomation";

interface Props {
  automationId: string;
  maxPerAccount?: number;
}

/**
 * Live view of device usage for an automation:
 * - Sends per device (today)
 * - Status: active / overloaded / cooldown / idle
 * - Last activity timestamp
 */
export function WelcomeDeviceUsage({ automationId, maxPerAccount = 200 }: Props) {
  const { data: senders } = useWelcomeSenders(automationId);
  const { data: queue } = useWelcomeQueue(automationId);

  const deviceIds = useMemo(() => (senders || []).map((s: any) => s.device_id), [senders]);

  const { data: devices } = useQuery({
    queryKey: ["welcome-devices-meta", deviceIds.join(",")],
    queryFn: async () => {
      if (!deviceIds.length) return [];
      const { data, error } = await supabase
        .from("devices")
        .select("id, name, number, status")
        .in("id", deviceIds);
      if (error) throw error;
      return data || [];
    },
    enabled: deviceIds.length > 0,
    refetchInterval: 30_000,
  });

  const rows = useMemo(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const byDevice: Record<string, { sentToday: number; lastAt: string | null; sentRecent: number }> = {};

    for (const item of queue || []) {
      if (!item.sender_device_id || item.status !== "sent" || !item.processed_at) continue;
      const isToday = item.processed_at.startsWith(todayStr);
      const isRecent = Date.now() - new Date(item.processed_at).getTime() < 2 * 60 * 1000;
      const acc = byDevice[item.sender_device_id] || { sentToday: 0, lastAt: null, sentRecent: 0 };
      if (isToday) acc.sentToday++;
      if (isRecent) acc.sentRecent++;
      if (!acc.lastAt || acc.lastAt < item.processed_at) acc.lastAt = item.processed_at;
      byDevice[item.sender_device_id] = acc;
    }

    return (devices || []).map((d: any) => {
      const stat = byDevice[d.id] || { sentToday: 0, lastAt: null, sentRecent: 0 };
      const usagePct = Math.min(100, (stat.sentToday / Math.max(maxPerAccount, 1)) * 100);
      const onlineStatuses = ["Ready", "Connected", "connected", "authenticated", "open", "active", "online"];
      const online = onlineStatuses.includes(d.status);
      const cooldown = stat.lastAt && Date.now() - new Date(stat.lastAt).getTime() < 8000;

      let badge: { label: string; tone: string; icon: any };
      if (!online) badge = { label: "Offline", tone: "bg-red-500/15 text-red-400 border-red-500/30", icon: AlertOctagon };
      else if (stat.sentToday >= maxPerAccount) badge = { label: "Limite atingido", tone: "bg-red-500/15 text-red-400 border-red-500/30", icon: AlertOctagon };
      else if (stat.sentRecent >= 5) badge = { label: "Sobrecarregado", tone: "bg-orange-500/15 text-orange-400 border-orange-500/30", icon: Zap };
      else if (cooldown) badge = { label: "Em cooldown", tone: "bg-blue-500/15 text-blue-400 border-blue-500/30", icon: Snowflake };
      else if (stat.sentToday > 0) badge = { label: "Ativo", tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: Activity };
      else badge = { label: "Ocioso", tone: "bg-slate-500/15 text-slate-400 border-slate-500/30", icon: Smartphone };

      return { device: d, stat, usagePct, badge };
    }).sort((a, b) => b.stat.sentToday - a.stat.sentToday);
  }, [devices, queue, maxPerAccount]);

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Smartphone className="w-4 h-4 text-primary" />
          </div>
          Uso por dispositivo
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-muted-foreground/70" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                O sistema distribui automaticamente os envios entre dispositivos (rodízio inteligente) para evitar bloqueios e simular comportamento humano.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">Nenhum dispositivo configurado.</p>
        ) : (
          rows.map(({ device, stat, usagePct, badge }) => {
            const Icon = badge.icon;
            return (
              <div key={device.id} className="rounded-xl border border-border/30 bg-muted/10 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-background/60 flex items-center justify-center shrink-0">
                      <Smartphone className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{device.name || "Sem nome"}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{device.number || device.id.slice(0, 12)}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={`gap-1 text-[10px] border px-2 py-0.5 ${badge.tone}`}>
                    <Icon className="w-3 h-3" /> {badge.label}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{stat.sentToday} / {maxPerAccount} hoje</span>
                  <span>
                    {stat.lastAt
                      ? `há ${formatDistanceToNowStrict(new Date(stat.lastAt), { locale: ptBR })}`
                      : "sem atividade"}
                  </span>
                </div>
                <Progress value={usagePct} className="h-1" />
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
