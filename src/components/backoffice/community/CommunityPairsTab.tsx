import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Shuffle, XCircle, AlertTriangle, GitMerge } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

const CommunityPairsTab = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [actionDialog, setActionDialog] = useState<{ pair_id: string; action: "closed" | "failed" } | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["community-pairs"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-data?action=community-pairs-list");
      if (error) throw error;
      return data?.pairs || [];
    },
  });

  const updatePair = useMutation({
    mutationFn: async ({ pair_id, new_status, reason }: any) => {
      const { error } = await supabase.functions.invoke("admin-data?action=community-pair-update", {
        body: { pair_id, new_status, reason },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-pairs"] });
      setActionDialog(null);
      setReason("");
      toast({ title: "Par atualizado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const generatePairs = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-data?action=community-generate-pairs", {
        body: {},
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["community-pairs"] });
      toast({ title: `${data?.pairs_created || 0} par(es) gerado(s)`, description: data?.message || "" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const statusColor = (s: string) => {
    if (s === "active") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    if (s === "closed") return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
    return "bg-red-500/15 text-red-400 border-red-500/30";
  };

  const pairs = data || [];
  const activePairs = pairs.filter((p: any) => p.status === "active").length;

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      {/* Stats + Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border">
            <GitMerge size={13} className="text-primary" />
            <span className="text-xs text-muted-foreground">{pairs.length} total</span>
            <span className="w-px h-3 bg-border" />
            <span className="text-xs font-semibold text-emerald-400">{activePairs} ativos</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="default" size="sm" onClick={() => generatePairs.mutate()} disabled={generatePairs.isPending} className="gap-1.5 h-8 text-xs">
            {generatePairs.isPending ? <Loader2 size={13} className="animate-spin" /> : <Shuffle size={13} />}
            Gerar Pares
          </Button>
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-8 px-2">
            <RefreshCw size={13} />
          </Button>
        </div>
      </div>

      {/* ═══ MOBILE: Card layout ═══ */}
      <div className="space-y-2 sm:hidden">
        {pairs.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">Nenhum par encontrado</p>
        ) : pairs.map((p: any) => (
          <div key={p.id} className="bg-card border border-border rounded-xl p-3.5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <Badge variant="outline" className={`text-[10px] ${statusColor(p.status)}`}>{p.status}</Badge>
              <span className="text-[10px] text-muted-foreground">{new Date(p.created_at).toLocaleDateString("pt-BR")}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-background rounded-lg p-2.5 border border-border/50">
                <p className="text-[10px] text-muted-foreground/60 font-medium mb-0.5">Instância A</p>
                <p className="text-xs font-semibold text-foreground truncate">{p.instance_a_name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{p.instance_a_number}</p>
              </div>
              <div className="bg-background rounded-lg p-2.5 border border-border/50">
                <p className="text-[10px] text-muted-foreground/60 font-medium mb-0.5">Instância B</p>
                <p className="text-xs font-semibold text-foreground truncate">{p.instance_b_name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{p.instance_b_number}</p>
              </div>
            </div>

            {p.status === "active" && (
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px]" onClick={() => setActionDialog({ pair_id: p.id, action: "closed" })}>
                  <XCircle size={11} className="mr-1" /> Fechar
                </Button>
                <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px] text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => setActionDialog({ pair_id: p.id, action: "failed" })}>
                  <AlertTriangle size={11} className="mr-1" /> Falhou
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ═══ DESKTOP: Table layout ═══ */}
      <div className="border border-border rounded-lg overflow-hidden hidden sm:block">
        <ScrollArea className="max-h-[600px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/50 text-muted-foreground text-[10px] uppercase tracking-wider">
                <th className="text-left px-3 py-2.5">Instância A</th>
                <th className="text-left px-3 py-2.5">Instância B</th>
                <th className="text-left px-3 py-2.5">Status</th>
                <th className="text-left px-3 py-2.5">Criado</th>
                <th className="text-left px-3 py-2.5">Fechado</th>
                <th className="text-right px-3 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pairs.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">Nenhum par encontrado</td></tr>
              ) : pairs.map((p: any) => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors text-xs">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-foreground">{p.instance_a_name}</div>
                    <div className="text-[10px] text-muted-foreground">{p.instance_a_number} · {p.instance_a_owner}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-foreground">{p.instance_b_name}</div>
                    <div className="text-[10px] text-muted-foreground">{p.instance_b_number} · {p.instance_b_owner}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className={`text-[10px] ${statusColor(p.status)}`}>{p.status}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{new Date(p.created_at).toLocaleDateString("pt-BR")}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{p.closed_at ? new Date(p.closed_at).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-3 py-2.5 text-right">
                    {p.status === "active" && (
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setActionDialog({ pair_id: p.id, action: "closed" })}>
                          <XCircle size={11} className="mr-1" /> Fechar
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-destructive" onClick={() => setActionDialog({ pair_id: p.id, action: "failed" })}>
                          <AlertTriangle size={11} className="mr-1" /> Falhou
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      <Dialog open={!!actionDialog} onOpenChange={() => setActionDialog(null)}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{actionDialog?.action === "failed" ? "Marcar como falhou" : "Fechar par"}</DialogTitle>
          </DialogHeader>
          <Textarea placeholder="Motivo (opcional)" value={reason} onChange={e => setReason(e.target.value)} className="bg-background border-border text-xs" rows={3} />
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setActionDialog(null)}>Cancelar</Button>
            <Button size="sm" variant={actionDialog?.action === "failed" ? "destructive" : "default"} onClick={() => {
              if (actionDialog) updatePair.mutate({ pair_id: actionDialog.pair_id, new_status: actionDialog.action, reason });
            }} disabled={updatePair.isPending}>
              {updatePair.isPending ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CommunityPairsTab;
