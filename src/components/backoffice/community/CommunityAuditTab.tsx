import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ScrollText } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

const EVENT_TYPES = [
  { value: "all", label: "Todos eventos" },
  { value: "eligibility_changed", label: "Eligibilidade" },
  { value: "pair_created", label: "Par criado" },
  { value: "pair_rejected", label: "Par rejeitado" },
  { value: "pair_repeat_forced", label: "Par repetido forçado" },
  { value: "pair_orphan_cleanup", label: "Par órfão limpo" },
  { value: "session_started", label: "Sessão iniciada" },
  { value: "session_completed", label: "Sessão concluída" },
  { value: "session_ended", label: "Sessão encerrada" },
  { value: "session_failed", label: "Sessão falhada" },
  { value: "session_resumed", label: "Sessão retomada" },
  { value: "session_stale_cleanup", label: "Sessão travada" },
  { value: "session_start_failed", label: "Início falhado" },
  { value: "cooldown_released", label: "Cooldown liberado" },
  { value: "daily_reset", label: "Reset diário" },
  { value: "tick_completed", label: "Tick concluído" },
];

const CommunityAuditTab = () => {
  const [eventType, setEventType] = useState("all");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["community-audit-v2", eventType],
    queryFn: async () => {
      let query = supabase
        .from("community_audit_logs" as any)
        .select("id, device_id, user_id, session_id, pair_id, partner_device_id, event_type, level, message, reason, meta, community_mode, community_day, created_at")
        .order("created_at", { ascending: false })
        .limit(200);

      if (eventType !== "all") {
        query = query.eq("event_type", eventType);
      }

      const { data: logs, error } = await query;
      if (error) throw error;
      return logs || [];
    },
  });

  const levelColor = (l: string) => {
    if (l === "error") return "bg-red-500/15 text-red-400 border-red-500/30";
    if (l === "warn") return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    return "bg-teal-500/15 text-teal-400 border-teal-500/30";
  };

  const logs = data || [];

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border">
          <ScrollText size={13} className="text-primary" />
          <span className="text-xs text-muted-foreground">{logs.length} registro(s)</span>
        </div>
        <div className="flex items-center gap-2">
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger className="w-[180px] h-8 bg-card border-border text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EVENT_TYPES.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-8 px-2">
            <RefreshCw size={13} />
          </Button>
        </div>
      </div>

      {/* MOBILE */}
      <div className="space-y-2 sm:hidden">
        {logs.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">Nenhum registro encontrado</p>
        ) : logs.map((log: any) => (
          <div key={log.id} className="bg-card border border-border rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className={`text-[10px] ${levelColor(log.level)}`}>{log.level}</Badge>
                <Badge variant="outline" className="text-[10px]">{log.event_type}</Badge>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {new Date(log.created_at).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
              </span>
            </div>
            <p className="text-xs text-foreground">{log.message}</p>
            {log.reason && (
              <div className="text-[10px] text-muted-foreground">Motivo: <span className="text-foreground">{log.reason}</span></div>
            )}
            {log.device_id && (
              <div className="text-[10px] text-muted-foreground">
                Device: <span className="font-mono text-foreground">{log.device_id.substring(0, 8)}…</span>
                {log.partner_device_id && (
                  <> ↔ <span className="font-mono text-foreground">{log.partner_device_id.substring(0, 8)}…</span></>
                )}
              </div>
            )}
            {log.meta && Object.keys(log.meta).length > 0 && (
              <pre className="text-[10px] text-muted-foreground bg-background rounded-lg p-2 overflow-x-auto border border-border/50">
                {JSON.stringify(log.meta, null, 2).substring(0, 300)}
              </pre>
            )}
          </div>
        ))}
      </div>

      {/* DESKTOP */}
      <div className="border border-border rounded-lg overflow-hidden hidden sm:block">
        <ScrollArea className="max-h-[600px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/50 text-muted-foreground text-[10px] uppercase tracking-wider">
                <th className="text-left px-3 py-2.5">Data</th>
                <th className="text-left px-3 py-2.5">Nível</th>
                <th className="text-left px-3 py-2.5">Evento</th>
                <th className="text-left px-3 py-2.5">Device</th>
                <th className="text-left px-3 py-2.5">Mensagem</th>
                <th className="text-left px-3 py-2.5">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">Nenhum registro encontrado</td></tr>
              ) : logs.map((log: any) => (
                <tr key={log.id} className="hover:bg-muted/30 transition-colors text-xs">
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{new Date(log.created_at).toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className={`text-[10px] ${levelColor(log.level)}`}>{log.level}</Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className="text-[10px]">{log.event_type}</Badge>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[10px]">
                    {log.device_id ? log.device_id.substring(0, 8) + "…" : "—"}
                    {log.partner_device_id && (
                      <span className="text-muted-foreground"> ↔ {log.partner_device_id.substring(0, 8)}…</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 max-w-[300px] truncate text-foreground">{log.message}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{log.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  );
};

export default CommunityAuditTab;
