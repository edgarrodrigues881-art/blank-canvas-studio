import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pause, Play, StopCircle, Eye, RefreshCw, Loader2 } from "lucide-react";
import { useWarmupEngine } from "@/hooks/useWarmupEngine";
import AdminCycleDetail from "./AdminCycleDetail";

interface CycleRow {
  id: string;
  user_id: string;
  device_id: string;
  chip_state: string;
  days_total: number;
  day_index: number;
  phase: string;
  is_running: boolean;
  started_at: string;
  updated_at: string;
  last_error: string | null;
  devices?: { name: string; number: string | null } | null;
  profiles?: { full_name: string | null; email?: string } | null;
}

const phaseColors: Record<string, string> = {
  pre_24h: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  groups_only: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  autosave_enabled: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  community_enabled: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  completed: "bg-green-500/15 text-green-400 border-green-500/30",
  paused: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  error: "bg-destructive/15 text-destructive border-destructive/30",
};

const AdminWarmupCycles = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const engine = useWarmupEngine();
  const [statusFilter, setStatusFilter] = useState("all");
  const [chipFilter, setChipFilter] = useState("all");
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);

  const { data: cycles = [], isLoading } = useQuery({
    queryKey: ["admin-warmup-cycles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warmup_cycles")
        .select("*, devices(name, number)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as CycleRow[];
    },
  });

  const filtered = cycles.filter(c => {
    if (statusFilter !== "all") {
      if (statusFilter === "running" && (!c.is_running || c.phase === "completed")) return false;
      if (statusFilter === "paused" && c.phase !== "paused") return false;
      if (statusFilter === "error" && c.phase !== "error") return false;
      if (statusFilter === "completed" && c.phase !== "completed") return false;
    }
    if (chipFilter !== "all" && c.chip_state !== chipFilter) return false;
    return true;
  });

  const handleAction = async (action: "pause" | "resume" | "stop", deviceId: string) => {
    try {
      await engine.mutateAsync({ action, device_id: deviceId });
      qc.invalidateQueries({ queryKey: ["admin-warmup-cycles"] });
      toast({ title: `Ação "${action}" executada` });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  if (selectedCycleId) {
    return <AdminCycleDetail cycleId={selectedCycleId} onBack={() => setSelectedCycleId(null)} />;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] h-9 text-sm bg-card border-border">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="running">Rodando</SelectItem>
            <SelectItem value="paused">Pausado</SelectItem>
            <SelectItem value="error">Erro</SelectItem>
            <SelectItem value="completed">Concluído</SelectItem>
          </SelectContent>
        </Select>

        <Select value={chipFilter} onValueChange={setChipFilter}>
          <SelectTrigger className="w-[150px] h-9 text-sm bg-card border-border">
            <SelectValue placeholder="Chip" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="new">Chip Novo</SelectItem>
            <SelectItem value="recovered">Chip Recuperado</SelectItem>
            <SelectItem value="unstable">Chip Fraco</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["admin-warmup-cycles"] })}>
          <RefreshCw size={12} className="mr-1" /> Atualizar
        </Button>

        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} ciclos</span>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Nenhum ciclo encontrado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="px-4 py-2.5 text-left font-medium">Usuário</th>
                  <th className="px-4 py-2.5 text-left font-medium">Instância</th>
                  <th className="px-4 py-2.5 text-left font-medium">Chip</th>
                  <th className="px-4 py-2.5 text-left font-medium">Fase</th>
                  <th className="px-4 py-2.5 text-left font-medium">Dia</th>
                  <th className="px-4 py-2.5 text-left font-medium">Início</th>
                  <th className="px-4 py-2.5 text-left font-medium">Último update</th>
                  <th className="px-4 py-2.5 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(c => {
                  const userName = c.user_id.slice(0, 8);
                  const deviceName = (c.devices as any)?.name || "—";
                  const deviceNumber = (c.devices as any)?.number || "";
                  const isActive = c.is_running && c.phase !== "completed" && c.phase !== "paused";

                  return (
                    <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 text-foreground">{userName}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-foreground">{deviceName}</span>
                        {deviceNumber && <span className="text-muted-foreground text-[10px] ml-1">{deviceNumber}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className="text-[10px]">{c.chip_state}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge className={`text-[10px] border ${phaseColors[c.phase] || "bg-muted text-muted-foreground"}`}>
                          {c.phase}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-foreground">{c.day_index}/{c.days_total}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">
                        {new Date(c.started_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">
                        {new Date(c.updated_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedCycleId(c.id)} className="h-7 px-2">
                            <Eye size={13} />
                          </Button>
                          {isActive && (
                            <Button variant="ghost" size="sm" onClick={() => handleAction("pause", c.device_id)} className="h-7 px-2 text-yellow-400">
                              <Pause size={13} />
                            </Button>
                          )}
                          {c.phase === "paused" && (
                            <Button variant="ghost" size="sm" onClick={() => handleAction("resume", c.device_id)} className="h-7 px-2 text-emerald-400">
                              <Play size={13} />
                            </Button>
                          )}
                          {c.phase !== "completed" && (
                            <Button variant="ghost" size="sm" onClick={() => {
                              if (confirm("Finalizar este ciclo?")) handleAction("stop", c.device_id);
                            }} className="h-7 px-2 text-destructive">
                              <StopCircle size={13} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminWarmupCycles;
