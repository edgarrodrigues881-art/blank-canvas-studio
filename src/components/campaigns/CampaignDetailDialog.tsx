import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
}

const contactStatusConfig: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  sent: { label: "Enviada", icon: CheckCircle2, className: "text-success" },
  delivered: { label: "Entregue", icon: CheckCircle2, className: "text-emerald-400" },
  failed: { label: "Falhou", icon: XCircle, className: "text-destructive" },
  pending: { label: "Pendente", icon: Clock, className: "text-yellow-500" },
  error: { label: "Erro", icon: AlertTriangle, className: "text-destructive" },
};

export function CampaignDetailDialog({ open, onOpenChange, campaignId, campaignName }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["campaign-contacts", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_contacts")
        .select("id, phone, name, status, sent_at, error_message, created_at")
        .eq("campaign_id", campaignId)
        .order("sent_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!campaignId,
  });

  const filtered = contacts.filter((c) => {
    const matchesSearch =
      (c.phone || "").includes(search) ||
      (c.name || "").toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" || c.status === filter;
    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: contacts.length,
    sent: contacts.filter((c) => c.status === "sent" || c.status === "delivered").length,
    failed: contacts.filter((c) => c.status === "failed" || c.status === "error").length,
    pending: contacts.filter((c) => c.status === "pending").length,
  };

  const filters = [
    { key: "all", label: "Todos", count: stats.total },
    { key: "sent", label: "Enviados", count: stats.sent },
    { key: "failed", label: "Falhas", count: stats.failed },
    { key: "pending", label: "Pendentes", count: stats.pending },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-foreground">
            {campaignName}
          </DialogTitle>
        </DialogHeader>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-lg p-2.5 text-center transition-colors border ${
                filter === f.key
                  ? "border-primary/50 bg-primary/10"
                  : "border-border/30 bg-muted/20 hover:bg-muted/40"
              }`}
            >
              <p className="text-lg font-bold text-foreground">{f.count}</p>
              <p className="text-[10px] text-muted-foreground">{f.label}</p>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou número..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        {/* Table */}
        <ScrollArea className="flex-1 min-h-0 max-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Contato</TableHead>
                <TableHead className="text-xs">Número</TableHead>
                <TableHead className="text-xs text-center">Status</TableHead>
                <TableHead className="text-xs hidden sm:table-cell">Enviado em</TableHead>
                <TableHead className="text-xs hidden md:table-cell">Erro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    Nenhum contato encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => {
                  const cfg = contactStatusConfig[c.status] || contactStatusConfig.pending;
                  const Icon = cfg.icon;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm text-foreground">
                        {c.name || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">
                        {c.phone}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className={`inline-flex items-center gap-1 ${cfg.className}`}>
                          <Icon className="w-3.5 h-3.5" />
                          <span className="text-xs">{cfg.label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                        {c.sent_at ? format(new Date(c.sent_at), "dd/MM HH:mm") : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-destructive hidden md:table-cell max-w-[150px] truncate" title={c.error_message || ""}>
                        {c.error_message || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
