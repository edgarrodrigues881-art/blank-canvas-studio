import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search, MessageCircle, Clock, AlertTriangle, XCircle, Skull,
  Loader2, Check, Mail, RefreshCw, RotateCcw, Filter, Hourglass,
  Phone, Calendar, User, Send, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const MESSAGE_TYPE_CONFIG: Record<string, { label: string; shortLabel: string; icon: any; color: string; bg: string; border: string }> = {
  WELCOME:      { label: "Boas-vindas",    shortLabel: "Welcome",  icon: Mail,          color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  DUE_3_DAYS:   { label: "Faltam 3 dias",  shortLabel: "3 dias",   icon: Clock,         color: "text-yellow-400",  bg: "bg-yellow-500/10",  border: "border-yellow-500/20" },
  DUE_TODAY:    { label: "Vence hoje",      shortLabel: "Hoje",     icon: AlertTriangle,  color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20" },
  OVERDUE_1:    { label: "Vencido 1 dia",   shortLabel: "1d",       icon: XCircle,        color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20" },
  OVERDUE_7:    { label: "Vencido 7 dias",  shortLabel: "7d",       icon: XCircle,        color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20" },
  OVERDUE_30:   { label: "Vencido 30 dias", shortLabel: "30d",      icon: Skull,          color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20" },
  "boas-vindas":    { label: "Boas-vindas",    shortLabel: "Welcome", icon: Mail,          color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  "faltam-3-dias":  { label: "Faltam 3 dias",  shortLabel: "3 dias",  icon: Clock,         color: "text-yellow-400",  bg: "bg-yellow-500/10",  border: "border-yellow-500/20" },
  "vence-hoje":     { label: "Vence hoje",      shortLabel: "Hoje",    icon: AlertTriangle,  color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20" },
  "vencido-1-dia":  { label: "Vencido 1 dia",   shortLabel: "1d",      icon: XCircle,        color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20" },
  "vencido-7-dias": { label: "Vencido 7 dias",  shortLabel: "7d",      icon: XCircle,        color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20" },
  "vencido-30-dias":{ label: "Vencido 30 dias", shortLabel: "30d",     icon: Skull,          color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20" },
};

const STATUS_FILTERS = [
  { value: "all", label: "Todas", icon: Filter },
  { value: "pending", label: "Pendentes", icon: Hourglass },
  { value: "sent", label: "Enviadas", icon: Check },
  { value: "failed", label: "Falhas", icon: XCircle },
] as const;

const TYPE_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "WELCOME", label: "Boas-vindas" },
  { value: "DUE_3_DAYS", label: "3 dias" },
  { value: "DUE_TODAY", label: "Hoje" },
  { value: "OVERDUE_1", label: "1 dia" },
  { value: "OVERDUE_7", label: "7 dias" },
  { value: "OVERDUE_30", label: "30 dias" },
] as const;

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55"))
    return `+${digits.slice(0,2)} ${digits.slice(2,4)} ${digits.slice(4,9)} ${digits.slice(9)}`;
  if (digits.length === 12 && digits.startsWith("55"))
    return `+${digits.slice(0,2)} ${digits.slice(2,4)} ${digits.slice(4,8)} ${digits.slice(8)}`;
  if (digits.length === 11)
    return `+55 ${digits.slice(0,2)} ${digits.slice(2,7)} ${digits.slice(7)}`;
  return phone;
}

const AdminMessages = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [resending, setResending] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: history = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["message-queue-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_queue" as any)
        .select("id, user_id, client_name, client_email, client_phone, plan_name, expires_at, message_type, message_content, status, created_at, sent_at, error_message")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as any[];
    },
    refetchInterval: 120_000,
  });

  const filtered = useMemo(() => {
    let items = history;
    if (statusFilter !== "all") items = items.filter((m: any) => m.status === statusFilter);
    if (typeFilter !== "all") items = items.filter((m: any) => m.message_type === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((m: any) =>
        m.client_name?.toLowerCase().includes(q) ||
        m.client_email?.toLowerCase().includes(q) ||
        m.client_phone?.includes(q) ||
        m.plan_name?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [history, search, statusFilter, typeFilter]);

  const pendingCount = history.filter((m: any) => m.status === "pending").length;
  const sentCount = history.filter((m: any) => m.status === "sent").length;
  const failedCount = history.filter((m: any) => m.status === "failed").length;

  const resendMessage = async (id: string) => {
    setResending(id);
    try {
      await supabase
        .from("message_queue" as any)
        .update({ status: "pending", error_message: null, sent_at: null, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      toast.success("Mensagem reenfileirada para envio");
      queryClient.invalidateQueries({ queryKey: ["message-queue-all"] });
    } catch (e) {
      toast.error("Erro ao reenviar");
    } finally {
      setResending(null);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
  };

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === "sent") return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <Check size={9} /> Enviada
      </span>
    );
    if (status === "pending") return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
        <Hourglass size={9} /> Pendente
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
        <XCircle size={9} /> Falha
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Send size={17} className="text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground tracking-tight">Fila de Mensagens</h2>
            <p className="text-[11px] text-muted-foreground/50">Automação do ciclo de vida · {history.length} registros</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Summary pills */}
          <div className="hidden sm:flex items-center gap-1.5 mr-2">
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg bg-yellow-500/8 text-yellow-400/80 border border-yellow-500/15">
                <Hourglass size={10} /> {pendingCount}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg bg-emerald-500/8 text-emerald-400/80 border border-emerald-500/15">
              <Check size={10} /> {sentCount}
            </span>
            {failedCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg bg-red-500/8 text-red-400/80 border border-red-500/15">
                <XCircle size={10} /> {failedCount}
              </span>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}
            className="text-[11px] h-8 gap-1.5 rounded-lg border-border/50 hover:bg-muted/20">
            {isFetching ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Atualizar
          </Button>
        </div>
      </div>

      {/* ═══ FILTERS ═══ */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-0.5 bg-muted/20 rounded-lg p-0.5 border border-border/30">
          {STATUS_FILTERS.map((f) => {
            const Icon = f.icon;
            const isActive = statusFilter === f.value;
            const count = f.value === "pending" ? pendingCount : f.value === "sent" ? sentCount : f.value === "failed" ? failedCount : null;
            return (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium rounded-md transition-all ${
                  isActive
                    ? "bg-card text-foreground shadow-sm border border-border/50"
                    : "text-muted-foreground/60 hover:text-foreground/80 border border-transparent"
                }`}
              >
                <Icon size={11} />
                {f.label}
                {count !== null && count > 0 && (
                  <span className={`text-[8px] font-bold px-1 py-0.5 rounded-full ${
                    isActive ? "bg-primary/15 text-primary" : "bg-muted/50 text-muted-foreground/50"
                  }`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex gap-0.5 bg-muted/20 rounded-lg p-0.5 overflow-x-auto border border-border/30">
          {TYPE_FILTERS.map((f) => {
            const isActive = typeFilter === f.value;
            const cfg = MESSAGE_TYPE_CONFIG[f.value];
            return (
              <button
                key={f.value}
                onClick={() => setTypeFilter(f.value)}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium rounded-md transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-card text-foreground shadow-sm border border-border/50"
                    : "text-muted-foreground/60 hover:text-foreground/80 border border-transparent"
                }`}
              >
                {cfg && <cfg.icon size={10} className={isActive ? cfg.color : ""} />}
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ SEARCH ═══ */}
      <div className="relative">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
        <Input
          placeholder="Buscar por cliente, email, telefone ou plano..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10 h-9 bg-card/50 border-border/50 text-sm rounded-xl placeholder:text-muted-foreground/30"
        />
      </div>

      {/* ═══ LIST ═══ */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <Send size={28} className="text-muted-foreground/20 mx-auto" />
          <p className="text-muted-foreground/50 text-sm">
            {search || statusFilter !== "all" || typeFilter !== "all" ? "Nenhum resultado encontrado" : "Nenhuma mensagem na fila"}
          </p>
          <p className="text-muted-foreground/30 text-xs">Mensagens são geradas automaticamente pelo sistema</p>
        </div>
      ) : (
        <div className="overflow-y-auto max-h-[calc(100vh-380px)] min-h-[200px] md:max-h-[calc(100vh-420px)]">
          <div className="space-y-1.5">
            {filtered.map((m: any) => {
              const config = MESSAGE_TYPE_CONFIG[m.message_type] || { label: m.message_type, shortLabel: m.message_type, icon: Mail, color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border" };
              const isFailed = m.status === "failed";

              return (
                <div
                  key={m.id}
                  className={`group bg-card/40 border rounded-xl px-4 py-3 transition-colors hover:bg-card/60 ${
                    isFailed ? "border-red-500/15" : m.status === "pending" ? "border-yellow-500/15" : "border-border/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Left: client info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-foreground/90 truncate">{m.client_name || "—"}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground/40 flex-wrap">
                        <span className="truncate max-w-[180px]">{m.client_email}</span>
                        {m.client_phone && (
                          <>
                            <span>·</span>
                            <span className="font-mono tracking-wide text-muted-foreground/50">{formatPhone(m.client_phone)}</span>
                          </>
                        )}
                        <span>·</span>
                        <span>{m.plan_name || "—"}</span>
                        {m.expires_at && (
                          <>
                            <span>·</span>
                            <span>Venc: {new Date(m.expires_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Right: type + status + date */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md ${config.bg} ${config.color} ${config.border} border`}>
                        {config.label}
                      </span>
                      <StatusBadge status={m.status} />
                      {isFailed && (
                        <button
                          onClick={() => resendMessage(m.id)}
                          disabled={resending === m.id}
                          className="p-1 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-muted/20 transition-colors"
                          title="Reenviar"
                        >
                          {resending === m.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                        </button>
                      )}
                      <span className="text-[10px] text-muted-foreground/30 whitespace-nowrap min-w-[100px] text-right">
                        {formatDate(m.sent_at || m.created_at)}
                      </span>
                    </div>
                  </div>

                  {isFailed && m.error_message && (
                    <p className="text-[10px] text-red-400/60 mt-1.5 pl-0 truncate">⚠ {m.error_message}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMessages;
