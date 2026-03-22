import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  RefreshCw, AlertTriangle, CheckCircle2, XCircle, Clock,
  Activity, Loader2, Search, ChevronDown, ChevronUp,
} from "lucide-react";
import { Input } from "@/components/ui/input";

interface CycleDiag {
  id: string;
  user_id: string;
  device_id: string;
  chip_state: string;
  day_index: number;
  days_total: number;
  phase: string;
  is_running: boolean;
  daily_interaction_budget_target: number;
  daily_interaction_budget_used: number;
  last_daily_reset_at: string | null;
  last_error: string | null;
  started_at: string;
  first_24h_ends_at: string;
  devices?: { name: string; status: string; number: string | null } | null;
  profiles?: { full_name: string | null } | null;
}

interface AuditEntry {
  id: string;
  event_type: string;
  level: string;
  message: string;
  created_at: string;
  meta: any;
}

interface JobSummary {
  cycle_id: string;
  job_type: string;
  status: string;
  cnt: number;
}

const phaseLabel: Record<string, string> = {
  pre_24h: "Primeiras 24h",
  groups_only: "Grupos",
  autosave_enabled: "Auto Save",
  community_enabled: "Comunitário",
  community_ramp_up: "Com. Ramp-Up",
  community_stable: "Com. Estável",
  community_light: "Com. Light",
  completed: "Concluído",
  paused: "Pausado",
  error: "Erro",
};

const phaseColor: Record<string, string> = {
  pre_24h: "bg-amber-500/15 text-amber-400",
  groups_only: "bg-teal-500/15 text-teal-400",
  autosave_enabled: "bg-emerald-500/15 text-emerald-400",
  community_enabled: "bg-purple-500/15 text-purple-400",
  community_ramp_up: "bg-violet-500/15 text-violet-400",
  community_stable: "bg-purple-500/15 text-purple-400",
  completed: "bg-green-500/15 text-green-400",
  paused: "bg-yellow-500/15 text-yellow-400",
  error: "bg-destructive/15 text-destructive",
};

const levelIcon: Record<string, typeof CheckCircle2> = {
  info: CheckCircle2,
  warn: AlertTriangle,
  warning: AlertTriangle,
  error: XCircle,
};

const levelColor: Record<string, string> = {
  info: "text-emerald-400",
  warn: "text-amber-400",
  warning: "text-amber-400",
  error: "text-destructive",
};

function timeSince(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function brtTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

type DiagStatus = "ok" | "warning" | "error";

function getCycleStatus(c: CycleDiag): { status: DiagStatus; reason: string } {
  if (!c.is_running && c.phase === "paused") return { status: "warning", reason: "Pausado" };
  if (!c.is_running && c.phase === "error") return { status: "error", reason: c.last_error || "Erro" };
  if (!c.is_running && c.phase === "completed") return { status: "ok", reason: "Concluído" };
  if (c.phase === "pre_24h") return { status: "ok", reason: "Primeiras 24h" };

  const resetAge = c.last_daily_reset_at ? Date.now() - new Date(c.last_daily_reset_at).getTime() : Infinity;
  if (resetAge > 30 * 3600000) return { status: "error", reason: `Sem reset há ${Math.round(resetAge / 3600000)}h` };
  if (resetAge > 26 * 3600000) return { status: "warning", reason: `Reset atrasado (${Math.round(resetAge / 3600000)}h)` };

  const budgetPct = c.daily_interaction_budget_target > 0
    ? c.daily_interaction_budget_used / c.daily_interaction_budget_target
    : 0;

  const now = new Date();
  const brtHour = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(now));
  const expectedPct = Math.max(0, Math.min(1, (brtHour - 7) / 12));

  if (brtHour >= 15 && budgetPct < expectedPct * 0.3 && c.daily_interaction_budget_target > 0) {
    return { status: "warning", reason: `Baixa execução: ${Math.round(budgetPct * 100)}% do budget (esperado ~${Math.round(expectedPct * 100)}%)` };
  }

  const devStatus = (c.devices as any)?.status;
  if (devStatus && !["Ready", "Connected", "authenticated"].includes(devStatus)) {
    return { status: "warning", reason: `Dispositivo: ${devStatus}` };
  }

  return { status: "ok", reason: `Budget: ${c.daily_interaction_budget_used}/${c.daily_interaction_budget_target}` };
}

const AdminWarmupDiagnostic = () => {
  const [search, setSearch] = useState("");
  const [expandedCycle, setExpandedCycle] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "ok" | "warning" | "error">("all");

  const { data: cycles = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-warmup-diagnostic"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warmup_cycles")
        .select("id, user_id, device_id, chip_state, day_index, days_total, phase, is_running, daily_interaction_budget_target, daily_interaction_budget_used, last_daily_reset_at, last_error, started_at, first_24h_ends_at, devices(name, status, number), profiles(full_name)")
        .or("is_running.eq.true,phase.in.(paused,error)")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as CycleDiag[];
    },
    refetchInterval: 120_000,
  });

  const { data: recentLogs = [] } = useQuery({
    queryKey: ["admin-warmup-diag-logs", expandedCycle],
    enabled: !!expandedCycle,
    queryFn: async () => {
      const { data } = await supabase
        .from("warmup_audit_logs")
        .select("id, event_type, level, message, created_at, meta")
        .eq("cycle_id", expandedCycle!)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data || []) as AuditEntry[];
    },
  });

  const { data: pendingJobs = [] } = useQuery({
    queryKey: ["admin-warmup-diag-jobs", expandedCycle],
    enabled: !!expandedCycle,
    queryFn: async () => {
      const { data } = await supabase
        .from("warmup_jobs")
        .select("cycle_id, job_type, status")
        .eq("cycle_id", expandedCycle!)
        .in("status", ["pending", "running", "failed"]);
      const summary: Record<string, number> = {};
      (data || []).forEach((j: any) => {
        const key = `${j.job_type}:${j.status}`;
        summary[key] = (summary[key] || 0) + 1;
      });
      return Object.entries(summary).map(([k, cnt]) => {
        const [job_type, status] = k.split(":");
        return { cycle_id: expandedCycle!, job_type, status, cnt };
      }) as JobSummary[];
    },
  });

  const enriched = cycles.map(c => ({ ...c, diag: getCycleStatus(c) }));
  const filtered = enriched.filter(c => {
    if (filter !== "all" && c.diag.status !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      const name = ((c.devices as any)?.name || "").toLowerCase();
      const userName = (c.profiles?.full_name || "").toLowerCase();
      if (!name.includes(s) && !userName.includes(s) && !c.id.includes(s)) return false;
    }
    return true;
  });

  const counts = { ok: 0, warning: 0, error: 0 };
  enriched.forEach(c => counts[c.diag.status]++);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="cursor-pointer border-emerald-500/30 hover:border-emerald-500/60 transition-colors" onClick={() => setFilter(f => f === "ok" ? "all" : "ok")}>
          <CardContent className="p-3 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <div>
              <p className="text-xl font-bold text-emerald-400">{counts.ok}</p>
              <p className="text-xs text-muted-foreground">Executando OK</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer border-amber-500/30 hover:border-amber-500/60 transition-colors" onClick={() => setFilter(f => f === "warning" ? "all" : "warning")}>
          <CardContent className="p-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <div>
              <p className="text-xl font-bold text-amber-400">{counts.warning}</p>
              <p className="text-xs text-muted-foreground">Atenção</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer border-destructive/30 hover:border-destructive/60 transition-colors" onClick={() => setFilter(f => f === "error" ? "all" : "error")}>
          <CardContent className="p-3 flex items-center gap-2">
            <XCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-xl font-bold text-destructive">{counts.error}</p>
              <p className="text-xs text-muted-foreground">Falhas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, dispositivo, ID..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
        {filter !== "all" && (
          <Button variant="ghost" size="sm" onClick={() => setFilter("all")}>Limpar filtro</Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <ScrollArea className="h-[600px]">
          <div className="space-y-2">
            {filtered.map(c => {
              const isExpanded = expandedCycle === c.id;
              const Icon = c.diag.status === "ok" ? CheckCircle2 : c.diag.status === "warning" ? AlertTriangle : XCircle;
              const iconColor = c.diag.status === "ok" ? "text-emerald-400" : c.diag.status === "warning" ? "text-amber-400" : "text-destructive";
              const devName = (c.devices as any)?.name || "???";
              const userName = c.profiles?.full_name || "—";

              return (
                <Card key={c.id} className={`transition-colors ${c.diag.status === "error" ? "border-destructive/40" : c.diag.status === "warning" ? "border-amber-500/40" : "border-border/50"}`}>
                  <div
                    className="p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedCycle(isExpanded ? null : c.id)}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{devName}</span>
                        <Badge variant="outline" className={`text-[10px] ${phaseColor[c.phase] || "bg-muted"}`}>
                          {phaseLabel[c.phase] || c.phase}
                        </Badge>
                        <span className="text-xs text-muted-foreground">Dia {c.day_index}/{c.days_total}</span>
                        <Badge variant="outline" className="text-[10px]">{c.chip_state}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.diag.reason} • {userName}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <p className="text-xs font-mono">{c.daily_interaction_budget_used}/{c.daily_interaction_budget_target}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Reset: {c.last_daily_reset_at ? timeSince(c.last_daily_reset_at) : "nunca"}
                        </p>
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <CardContent className="pt-0 pb-3 px-3 space-y-3 border-t border-border/30">
                      {/* Details grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div><span className="text-muted-foreground">Início:</span> {brtTime(c.started_at)}</div>
                        <div><span className="text-muted-foreground">Último reset:</span> {c.last_daily_reset_at ? brtTime(c.last_daily_reset_at) : "—"}</div>
                        <div><span className="text-muted-foreground">Device:</span> {(c.devices as any)?.status || "?"}</div>
                        <div><span className="text-muted-foreground">Número:</span> {(c.devices as any)?.number || "—"}</div>
                      </div>

                      {c.last_error && (
                        <div className="text-xs text-destructive bg-destructive/10 rounded p-2 font-mono">{c.last_error}</div>
                      )}

                      {/* Jobs summary */}
                      {pendingJobs.length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-1">Jobs pendentes:</p>
                          <div className="flex flex-wrap gap-1">
                            {pendingJobs.map((j, i) => (
                              <Badge key={i} variant="outline" className="text-[10px]">
                                {j.job_type.replace("_interaction", "").replace("_", " ")} ({j.status}): {j.cnt}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recent logs */}
                      <div>
                        <p className="text-xs font-medium mb-1">Últimos eventos:</p>
                        <div className="space-y-1 max-h-[200px] overflow-y-auto">
                          {recentLogs.slice(0, 20).map(log => {
                            const LIcon = levelIcon[log.level] || Activity;
                            const lColor = levelColor[log.level] || "text-muted-foreground";
                            return (
                              <div key={log.id} className="flex gap-2 text-[11px] items-start">
                                <LIcon className={`h-3 w-3 shrink-0 mt-0.5 ${lColor}`} />
                                <span className="text-muted-foreground shrink-0 font-mono w-[70px]">
                                  {new Date(log.created_at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
                                </span>
                                <span className="text-muted-foreground shrink-0 w-[100px] truncate">{log.event_type}</span>
                                <span className="flex-1 truncate">{log.message}</span>
                              </div>
                            );
                          })}
                          {recentLogs.length === 0 && <p className="text-muted-foreground text-xs">Nenhum log recente</p>}
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground py-8 text-sm">
                {search ? "Nenhum ciclo encontrado" : "Nenhum ciclo ativo"}
              </p>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default AdminWarmupDiagnostic;
