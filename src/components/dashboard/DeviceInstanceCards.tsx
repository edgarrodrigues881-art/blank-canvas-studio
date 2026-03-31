import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Wifi, WifiOff, Flame, Pause, Globe, Loader2 } from "lucide-react";
import type { ChipInfo } from "@/hooks/useDashboardStats";
import { useNavigate } from "react-router-dom";

const statusConfig: Record<string, { color: string; bg: string; label: string; icon: typeof Wifi }> = {
  connected: { color: "text-emerald-400", bg: "bg-emerald-500/20", label: "Conectado", icon: Wifi },
  warming: { color: "text-amber-400", bg: "bg-amber-500/20", label: "Aquecendo", icon: Flame },
  disconnected: { color: "text-red-400", bg: "bg-red-500/20", label: "Desconectado", icon: WifiOff },
  paused: { color: "text-muted-foreground", bg: "bg-muted/30", label: "Pausado", icon: Pause },
  syncing: { color: "text-blue-400", bg: "bg-blue-500/20", label: "Sincronizando", icon: Loader2 },
};

function getChipStatus(chip: ChipInfo): string {
  if (chip.status === "Loading") return "syncing";
  if (!chip.connected) return "disconnected";
  if (chip.warmupStatus === "running") return "warming";
  if (chip.warmupStatus === "paused") return "paused";
  return "connected";
}

interface Props {
  chips: ChipInfo[];
  isLoading: boolean;
}

export function DeviceInstanceCards({ chips, isLoading }: Props) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="border-border/50 bg-card animate-pulse">
            <CardContent className="p-4 h-28" />
          </Card>
        ))}
      </div>
    );
  }

  if (chips.length === 0) {
    return (
      <Card className="border-border/50 bg-card border-dashed">
        <CardContent className="p-6 text-center">
          <WifiOff className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nenhuma instância criada</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/dashboard/devices")}>
            Criar instância
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {chips.map((chip) => {
        const st = statusConfig[getChipStatus(chip)] || statusConfig.disconnected;
        const StatusIcon = st.icon;

        return (
          <Card
            key={chip.id}
            className="border-border/50 bg-card hover:border-border/80 transition-colors cursor-pointer"
            onClick={() => navigate("/dashboard/devices")}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                {/* Avatar + Info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    {chip.profilePicture ? (
                      <img
                        src={chip.profilePicture}
                        alt={chip.name}
                        className="w-10 h-10 rounded-full object-cover ring-2 ring-border/30"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                          (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                        }}
                      />
                    ) : null}
                    <div className={`${chip.profilePicture ? "hidden" : ""} w-10 h-10 rounded-full bg-muted/30 flex items-center justify-center text-xs font-bold text-muted-foreground`}>
                      {chip.name.slice(0, 2).toUpperCase()}
                    </div>
                    {/* Status dot */}
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${st.bg}`}>
                      <span className={`block w-full h-full rounded-full ${getChipStatus(chip) === "connected" ? "bg-emerald-400" : getChipStatus(chip) === "warming" ? "bg-amber-400" : getChipStatus(chip) === "disconnected" ? "bg-red-400" : "bg-muted-foreground"}`} />
                    </span>
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{chip.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{chip.number || "Sem número"}</p>
                  </div>
                </div>

                {/* Status badge */}
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium ${st.bg} ${st.color} shrink-0`}>
                  <StatusIcon className="w-3 h-3" />
                  {st.label}
                </div>
              </div>

              {/* Meta row */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30">
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  {chip.warmupStatus && (
                    <span className="flex items-center gap-1">
                      <Flame className="w-3 h-3 text-amber-400" />
                      Dia {chip.warmupDay}/{chip.warmupTotal}
                    </span>
                  )}
                  {chip.proxyHost && (
                    <span className="flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      {chip.proxyHost.length > 15 ? chip.proxyHost.slice(0, 15) + "…" : chip.proxyHost}
                    </span>
                  )}
                  <span>
                    {chip.volumeToday} msg hoje
                  </span>
                </div>
                {!chip.connected && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1 text-primary hover:text-primary/80"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate("/dashboard/devices");
                    }}
                  >
                    <RefreshCw className="w-3 h-3" />
                    Reconectar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
