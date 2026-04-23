import { useState, useMemo, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, STATUS_MAP } from "./WelcomeStatusBadge";
import { WelcomeSmartHint } from "./WelcomeSmartStatus";
import { WelcomeQueueRowActions } from "./WelcomeQueueRowActions";
import { WelcomeEditQueueDialog } from "./WelcomeEditQueueDialog";
import { WelcomeQueueItemLogs } from "./WelcomeQueueItemLogs";
import { useWelcomeQueue, useReprocessAllFailed, type WelcomeQueueItem } from "@/hooks/useWelcomeAutomation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Search, Download, ListChecks, Flame, RefreshCw, Inbox } from "lucide-react";

// ── Live "X seconds ago" ticker (updates every second) ──
function useSecondsAgo(timestamp: number | undefined) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!timestamp) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
}

// ── Countdown for pending items with a future send_at ──
function CountdownLabel({ sendAt }: { sendAt: string | null }) {
  const target = sendAt ? new Date(sendAt).getTime() : 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target || target <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return null;
  const diff = Math.max(0, Math.floor((target - now) / 1000));
  if (diff === 0) return <span className="text-[10px] text-muted-foreground italic">enviando...</span>;
  const mm = Math.floor(diff / 60);
  const ss = diff % 60;
  return (
    <span className="text-[10px] text-muted-foreground italic tabular-nums">
      aguardando {mm > 0 ? `${mm}m ` : ""}{ss}s
    </span>
  );
}

export function WelcomeQueueTable({ automationId, maxRetries = 3 }: { automationId: string; maxRetries?: number }) {
  const { data: queue } = useWelcomeQueue(automationId);
  const { dataUpdatedAt } = useQuery({ queryKey: ["welcome-queue", automationId], enabled: false });
  const reprocessAll = useReprocessAllFailed();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editItem, setEditItem] = useState<WelcomeQueueItem | null>(null);
  const [logsItem, setLogsItem] = useState<WelcomeQueueItem | null>(null);

  // ── Track items that just transitioned from non-sent → sent for the green flash ──
  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!queue) return;
    const prev = prevStatusRef.current;
    const justSent: string[] = [];
    for (const item of queue) {
      const before = prev.get(item.id);
      if (before && before !== "sent" && item.status === "sent") {
        justSent.push(item.id);
      }
    }
    // refresh ref snapshot
    const next = new Map<string, string>();
    for (const item of queue) next.set(item.id, item.status);
    prevStatusRef.current = next;

    if (justSent.length) {
      setFlashIds(prevSet => {
        const merged = new Set(prevSet);
        justSent.forEach(id => merged.add(id));
        return merged;
      });
      // auto-clear flash after animation completes
      setTimeout(() => {
        setFlashIds(prevSet => {
          const next2 = new Set(prevSet);
          justSent.forEach(id => next2.delete(id));
          return next2;
        });
      }, 1700);
    }
  }, [queue]);

  const secondsAgo = useSecondsAgo(dataUpdatedAt);
  const failedCount = useMemo(
    () => (queue || []).filter(q => q.status === "failed").length,
    [queue]
  );

  const filtered = useMemo(() => {
    if (!queue) return [];
    const list = queue.filter(item => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return item.participant_phone?.toLowerCase().includes(s)
          || item.participant_name?.toLowerCase().includes(s)
          || item.group_name?.toLowerCase().includes(s);
      }
      return true;
    });
    return [...list].sort((a, b) => {
      const pa = a.priority ?? 0, pb = b.priority ?? 0;
      if (pa !== pb) return pb - pa;
      const sa = a.send_at ? new Date(a.send_at).getTime() : 0;
      const sb = b.send_at ? new Date(b.send_at).getTime() : 0;
      if (sa !== sb) return sa - sb;
      return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
    });
  }, [queue, search, statusFilter]);

  const exportCSV = () => {
    if (!filtered.length) return;
    const headers = ["Participante", "Nome", "Grupo", "Status", "Prioridade", "Detectado", "Agendado", "Processado", "Tentativas", "Erro"];
    const rows = filtered.map(q => [
      q.participant_phone, q.participant_name || "", q.group_name || q.group_id, q.status,
      String(q.priority ?? 0), q.detected_at, q.send_at || "", q.processed_at || "",
      String(q.attempts), q.error_reason || "",
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `boas-vindas-fila-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <ListChecks className="w-4 h-4 text-primary" />
              </div>
              Fila de Processamento
              <span className="text-xs text-muted-foreground font-normal ml-1">
                ({queue?.length || 0} itens · ordenado por prioridade)
              </span>
            </CardTitle>
            <div className="flex items-center gap-1.5 ml-10 text-[10.5px] text-muted-foreground">
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-500 opacity-60 animate-ping" />
                <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </span>
              {secondsAgo == null
                ? "atualizando..."
                : secondsAgo < 2
                  ? "atualizado agora"
                  : `atualizado há ${secondsAgo}s`}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => reprocessAll.mutate(automationId)}
              disabled={!failedCount || reprocessAll.isPending}
              className="h-9 gap-1.5 text-xs rounded-xl border-amber-500/30 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 disabled:opacity-40"
            >
              <RefreshCw className={`w-4 h-4 ${reprocessAll.isPending ? "animate-spin" : ""}`} />
              Reprocessar todos com falha {failedCount > 0 && `(${failedCount})`}
            </Button>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar número, nome ou grupo..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 w-56 text-xs rounded-xl bg-muted/20 border-border/50" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-36 text-xs rounded-xl border-border/50"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(STATUS_MAP).map(([k, v]) => (<SelectItem key={k} value={k}>{v.label}</SelectItem>))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={exportCSV} className="h-9 gap-1.5 text-xs rounded-xl">
              <Download className="w-4 h-4" /> Exportar CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[560px]">
          <Table>
            <TableHeader>
              <TableRow className="border-border/30 hover:bg-transparent">
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Participante</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Grupo</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Agendado</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Detectado</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center">Tent.</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Erro</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-muted/30 flex items-center justify-center">
                        <Inbox className="w-7 h-7 text-muted-foreground/50" />
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-foreground/80">
                          {queue?.length === 0 ? "Nenhuma mensagem na fila" : "Nenhum item encontrado"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {queue?.length === 0
                            ? "Quando alguém entrar em um grupo monitorado, a mensagem aparecerá aqui."
                            : "Tente ajustar os filtros de busca."}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {filtered.map(item => {
                const isFlash = flashIds.has(item.id);
                const isPendingWithFutureSend =
                  (item.status === "pending" || item.status === "aguardando_pausa" || item.status === "aguardando_janela") &&
                  item.send_at && new Date(item.send_at).getTime() > Date.now();
                return (
                  <TableRow
                    key={item.id}
                    className={`border-border/20 hover:bg-muted/30 transition-colors ${isFlash ? "row-flash-success" : ""}`}
                  >
                    <TableCell className="text-xs">
                      <div className="flex items-center gap-1.5">
                        {(item.priority ?? 0) > 0 && (
                          <Badge variant="outline" className="gap-1 text-[9px] px-1.5 py-0 border-amber-500/30 text-amber-400 bg-amber-500/10">
                            <Flame className="w-2.5 h-2.5" /> {item.priority}
                          </Badge>
                        )}
                        <div>
                          <div className="font-mono font-medium">{item.participant_phone}</div>
                          {item.participant_name && <div className="text-[10px] text-muted-foreground mt-0.5">{item.participant_name}</div>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs max-w-[140px] truncate text-muted-foreground">{item.group_name || item.group_id.slice(0, 12)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        <StatusBadge status={item.status} />
                        {isPendingWithFutureSend && <CountdownLabel sendAt={item.send_at} />}
                        <WelcomeSmartHint item={item} maxRetries={maxRetries} />
                      </div>
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">
                      {item.send_at ? format(new Date(item.send_at), "dd/MM HH:mm:ss") : "—"}
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">{format(new Date(item.detected_at), "dd/MM HH:mm")}</TableCell>
                    <TableCell className="text-xs text-center font-medium">
                      {item.attempts}<span className="text-muted-foreground">/{maxRetries}</span>
                    </TableCell>
                    <TableCell className="text-[11px] text-red-400 max-w-[140px] truncate" title={item.error_reason || ""}>{item.error_reason || "—"}</TableCell>
                    <TableCell>
                      <WelcomeQueueRowActions
                        item={item}
                        onEdit={setEditItem}
                        onShowLogs={setLogsItem}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>

      <WelcomeEditQueueDialog
        open={!!editItem}
        onClose={() => setEditItem(null)}
        item={editItem}
      />
      <WelcomeQueueItemLogs
        open={!!logsItem}
        onClose={() => setLogsItem(null)}
        item={logsItem}
      />
    </Card>
  );
}
