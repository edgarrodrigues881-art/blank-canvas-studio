import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, RotateCcw, XCircle, Loader2 } from "lucide-react";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  running: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  succeeded: "bg-green-500/15 text-green-400 border-green-500/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const AdminWarmupJobs = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["admin-warmup-jobs", statusFilter, typeFilter],
    queryFn: async () => {
      let query = supabase
        .from("warmup_jobs")
        .select("*, devices:device_id(name, number)")
        .order("run_at", { ascending: false })
        .limit(300);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as any);
      }
      if (typeFilter !== "all") {
        query = query.eq("job_type", typeFilter as any);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const retryJob = useMutation({
    mutationFn: async (jobId: string) => {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("warmup_jobs")
        .update({ status: "pending" as any, run_at: now, attempts: 0 })
        .eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-warmup-jobs"] });
      toast({ title: "Job reagendado" });
    },
  });

  const cancelJob = useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase
        .from("warmup_jobs")
        .update({ status: "cancelled" as any })
        .eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-warmup-jobs"] });
      toast({ title: "Job cancelado" });
    },
  });

  const jobTypes = ["join_group", "enable_autosave", "enable_community", "autosave_interaction", "community_interaction", "daily_reset", "phase_transition", "health_check"];

  const statusCounts = {
    pending: jobs.filter(j => j.status === "pending").length,
    running: jobs.filter(j => j.status === "running").length,
    failed: jobs.filter(j => j.status === "failed").length,
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-yellow-500/20 rounded-lg p-3 text-center">
          <p className="text-2xl font-black text-yellow-400">{statusCounts.pending}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Pendentes</p>
        </div>
        <div className="bg-card border border-teal-500/20 rounded-lg p-3 text-center">
          <p className="text-2xl font-black text-teal-400">{statusCounts.running}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Rodando</p>
        </div>
        <div className="bg-card border border-destructive/20 rounded-lg p-3 text-center">
          <p className="text-2xl font-black text-destructive">{statusCounts.failed}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Falhados</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9 text-sm bg-card border-border">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="running">Rodando</SelectItem>
            <SelectItem value="succeeded">Sucesso</SelectItem>
            <SelectItem value="failed">Falhado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px] h-9 text-sm bg-card border-border">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos tipos</SelectItem>
            {jobTypes.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["admin-warmup-jobs"] })}>
          <RefreshCw size={12} className="mr-1" /> Atualizar
        </Button>

        <span className="text-xs text-muted-foreground ml-auto">{jobs.length} jobs</span>
      </div>

      {/* Jobs table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Nenhum job encontrado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium">Tipo</th>
                  <th className="px-4 py-2.5 text-left font-medium">Instância</th>
                  <th className="px-4 py-2.5 text-left font-medium">Agendado</th>
                  <th className="px-4 py-2.5 text-left font-medium">Tentativas</th>
                  <th className="px-4 py-2.5 text-left font-medium">Erro</th>
                  <th className="px-4 py-2.5 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {jobs.map((j: any) => (
                  <tr key={j.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2">
                      <Badge className={`text-[10px] border ${statusColors[j.status] || ""}`}>{j.status}</Badge>
                    </td>
                    <td className="px-4 py-2 text-foreground font-mono text-xs">{j.job_type}</td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">{j.devices?.name || j.device_id.slice(0, 8)}</td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">
                      {new Date(j.run_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{j.attempts}/{j.max_attempts}</td>
                    <td className="px-4 py-2 text-destructive text-xs max-w-[200px] truncate">{j.last_error || "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {j.status === "failed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-emerald-400"
                            onClick={() => {
                              if (confirm("Resetar tentativas e reagendar este job?")) retryJob.mutate(j.id);
                            }}
                          >
                            <RotateCcw size={12} />
                          </Button>
                        )}
                        {j.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-destructive"
                            onClick={() => cancelJob.mutate(j.id)}
                          >
                            <XCircle size={12} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminWarmupJobs;
