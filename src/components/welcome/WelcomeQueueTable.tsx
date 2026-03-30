import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge, STATUS_MAP } from "./WelcomeStatusBadge";
import { useWelcomeQueue, useUpdateQueueItem, WelcomeQueueItem } from "@/hooks/useWelcomeAutomation";
import { toast } from "sonner";
import { format } from "date-fns";
import { Search, Download, RotateCcw, XCircle, ListChecks } from "lucide-react";

export function WelcomeQueueTable({ automationId }: { automationId: string }) {
  const { data: queue } = useWelcomeQueue(automationId);
  const updateQueueItem = useUpdateQueueItem();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    if (!queue) return [];
    return queue.filter(item => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return item.participant_phone?.toLowerCase().includes(s) || item.participant_name?.toLowerCase().includes(s) || item.group_name?.toLowerCase().includes(s);
      }
      return true;
    });
  }, [queue, search, statusFilter]);

  const exportCSV = () => {
    if (!filtered.length) return;
    const headers = ["Participante", "Nome", "Grupo", "Status", "Detectado", "Processado", "Tentativas", "Erro"];
    const rows = filtered.map(q => [q.participant_phone, q.participant_name || "", q.group_name || q.group_id, q.status, q.detected_at, q.processed_at || "", String(q.attempts), q.error_reason || ""]);
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
          <CardTitle className="text-base flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <ListChecks className="w-4 h-4 text-primary" />
            </div>
            Fila de Processamento
            <span className="text-xs text-muted-foreground font-normal ml-1">({queue?.length || 0} itens)</span>
          </CardTitle>
          <div className="flex gap-2 flex-wrap">
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
        <ScrollArea className="max-h-[520px]">
          <Table>
            <TableHeader>
              <TableRow className="border-border/30 hover:bg-transparent">
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Participante</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Grupo</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Detectado</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Processado</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center">Tent.</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Erro</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground text-sm py-12">
                    <div className="flex flex-col items-center gap-2">
                      <ListChecks className="w-8 h-8 text-muted-foreground/30" />
                      <span>Nenhum item encontrado</span>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {filtered.map(item => (
                <TableRow key={item.id} className="border-border/20 hover:bg-muted/30">
                  <TableCell className="text-xs">
                    <div className="font-mono font-medium">{item.participant_phone}</div>
                    {item.participant_name && <div className="text-[10px] text-muted-foreground mt-0.5">{item.participant_name}</div>}
                  </TableCell>
                  <TableCell className="text-xs max-w-[140px] truncate text-muted-foreground">{item.group_name || item.group_id.slice(0, 12)}</TableCell>
                  <TableCell><StatusBadge status={item.status} /></TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">{format(new Date(item.detected_at), "dd/MM HH:mm")}</TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">{item.processed_at ? format(new Date(item.processed_at), "dd/MM HH:mm") : "—"}</TableCell>
                  <TableCell className="text-xs text-center font-medium">{item.attempts}</TableCell>
                  <TableCell className="text-[11px] text-red-400 max-w-[140px] truncate">{item.error_reason || "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {(item.status === "failed" || item.status === "ignored") && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg hover:bg-primary/10" title="Reenfileirar" onClick={() => updateQueueItem.mutateAsync({ id: item.id, status: "pending" }).then(() => toast.success("Reenfileirado!"))}>
                          <RotateCcw className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {item.status === "pending" && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg hover:bg-destructive/10" title="Ignorar" onClick={() => updateQueueItem.mutateAsync({ id: item.id, status: "ignored" }).then(() => toast.success("Ignorado!"))}>
                          <XCircle className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
