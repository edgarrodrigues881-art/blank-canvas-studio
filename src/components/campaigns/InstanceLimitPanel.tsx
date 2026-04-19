import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Smartphone, RotateCcw, AlertTriangle, CheckCircle2, PauseCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Props {
  campaignId: string;
  campaignStatus: string;
  deviceIds: string[];
  limitPerInstance: number;
}

interface DeviceMeta {
  id: string;
  name: string | null;
  number: string | null;
  status: string | null;
}

type RuntimeStatus = "active" | "paused" | "limit_reached" | "idle";

export function InstanceLimitPanel({ campaignId, campaignStatus, deviceIds, limitPerInstance }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [resettingId, setResettingId] = useState<string | null>(null);

  const isCampaignRunning = ["running", "processing"].includes(campaignStatus);

  // Per-instance sent counts — pulled live from campaign_contacts
  const { data: counts = {} } = useQuery({
    queryKey: ["campaign-instance-counts", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_contacts")
        .select("device_id, status")
        .eq("campaign_id", campaignId)
        .in("status", ["sent", "delivered"]);
      if (error) throw error;
      const map: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        if (!row.device_id) return;
        map[row.device_id] = (map[row.device_id] || 0) + 1;
      });
      return map;
    },
    refetchInterval: () => {
      if (document.hidden) return false;
      return isCampaignRunning ? 3000 : 15000;
    },
  });

  const { data: devices = [] } = useQuery<DeviceMeta[]>({
    queryKey: ["instance-panel-devices", deviceIds.join(",")],
    queryFn: async () => {
      if (deviceIds.length === 0) return [];
      const { data, error } = await supabase
        .from("devices")
        .select("id, name, number, status")
        .in("id", deviceIds);
      if (error) throw error;
      return data || [];
    },
    enabled: deviceIds.length > 0,
    staleTime: 30_000,
  });

  const rows = useMemo(() => {
    return deviceIds.map((id) => {
      const meta = devices.find((d) => d.id === id);
      const sent = counts[id] || 0;
      const limit = limitPerInstance > 0 ? limitPerInstance : 0;
      const limitReached = limit > 0 && sent >= limit;
      const isOnline = meta?.status && ["Ready", "Connected", "authenticated", "open", "active"].includes(meta.status);

      let runtime: RuntimeStatus = "idle";
      if (limitReached) runtime = "limit_reached";
      else if (!isOnline) runtime = "paused";
      else if (isCampaignRunning) runtime = "active";
      else runtime = "idle";

      return { id, meta, sent, limit, limitReached, runtime };
    });
  }, [deviceIds, devices, counts, limitPerInstance, isCampaignRunning]);

  const handleReset = async (deviceId: string) => {
    setResettingId(deviceId);
    try {
      // Reset = clear the device_id reference on already-sent rows so the contador resets to 0.
      // We DO NOT undo the actual sends — we only zero the per-instance counter.
      const { error } = await supabase
        .from("campaign_contacts")
        .update({ device_id: null })
        .eq("campaign_id", campaignId)
        .eq("device_id", deviceId)
        .in("status", ["sent", "delivered"]);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["campaign-instance-counts", campaignId] });
      toast({ title: "Contador resetado", description: "A instância pode voltar a enviar." });
    } catch (e: any) {
      toast({ title: "Erro ao resetar", description: e.message, variant: "destructive" });
    } finally {
      setResettingId(null);
    }
  };

  if (deviceIds.length === 0) return null;

  const limitLabel = limitPerInstance > 0 ? limitPerInstance : "∞";

  return (
    <div className="rounded-xl border border-border/30 bg-card/50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <div className="flex items-center gap-2">
          <Smartphone className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">Limite por instância</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            ({limitLabel} mensagens cada)
          </span>
        </div>
      </div>

      <div className="divide-y divide-border/20">
        {rows.map(({ id, meta, sent, limit, limitReached, runtime }) => {
          const pct = limit > 0 ? Math.min(100, Math.round((sent / limit) * 100)) : 0;
          const statusConfig = {
            active:        { label: "Ativa",            cls: "text-primary",       Icon: CheckCircle2 },
            paused:        { label: "Pausada",          cls: "text-yellow-400",    Icon: PauseCircle },
            limit_reached: { label: "Limite atingido",  cls: "text-destructive",   Icon: AlertTriangle },
            idle:          { label: "Aguardando",       cls: "text-muted-foreground", Icon: PauseCircle },
          }[runtime];
          const StatusIcon = statusConfig.Icon;

          return (
            <div
              key={id}
              className={cn(
                "px-4 py-3 transition-colors",
                limitReached && "bg-destructive/5 border-l-2 border-l-destructive",
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {meta?.name || "Instância"}
                    </p>
                    <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium", statusConfig.cls)}>
                      <StatusIcon className="w-3 h-3" />
                      {statusConfig.label}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">
                    {meta?.number || "—"}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className={cn(
                      "text-sm font-bold tabular-nums",
                      limitReached ? "text-destructive" : "text-foreground",
                    )}>
                      {sent} {limit > 0 && <span className="text-muted-foreground/70 font-normal">/ {limit}</span>}
                    </p>
                    {limit > 0 && (
                      <div className="w-24 h-1 mt-1 rounded-full bg-muted/40 overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            limitReached ? "bg-destructive" : pct > 80 ? "bg-yellow-400" : "bg-primary",
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        disabled={resettingId === id || sent === 0}
                        onClick={() => handleReset(id)}
                      >
                        <RotateCcw className={cn("w-3.5 h-3.5", resettingId === id && "animate-spin")} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Resetar contador desta instância</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {limitReached && (
                <p className="mt-2 text-[10px] text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Esta instância parou porque atingiu o limite configurado.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
