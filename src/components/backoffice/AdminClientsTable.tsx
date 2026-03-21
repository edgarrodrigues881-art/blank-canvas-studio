import { useState, useMemo, useCallback, memo } from "react";
import { Search, ChevronRight, Shield, ChevronDown, Trash2, Users, Filter, Phone, Calendar, Layers, UserCheck, Send, Loader2, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AdminUser } from "@/hooks/useAdmin";

interface Props {
  users: AdminUser[];
  onSelectClient: (u: AdminUser) => void;
}

const planConfig: Record<string, { color: string; bg: string; border: string }> = {
  Trial: { color: "text-zinc-400", bg: "bg-zinc-500/10", border: "border-zinc-500/20" },
  Start: { color: "text-zinc-400", bg: "bg-zinc-500/10", border: "border-zinc-500/20" },
  Pro: { color: "text-teal-400", bg: "bg-teal-500/10", border: "border-teal-500/20" },
  Scale: { color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
  Elite: { color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
};

function getDaysLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
}

function getSubStatus(u: { plan_name: string | null; plan_expires_at: string | null }): { label: string; color: string; bg: string; border: string } {
  if (!u.plan_name) return { label: "Sem plano", color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border" };
  const d = getDaysLeft(u.plan_expires_at);
  if (d === null) return { label: "Sem plano", color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border" };
  if (d <= 0) return { label: "Vencida", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" };
  if (d <= 3) return { label: "Vencendo", color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20" };
  return { label: "Ativa", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" };
}

const statusLabels: Record<string, string> = { active: "Ativo", suspended: "Suspenso", cancelled: "Cancelado" };
const statusConfig: Record<string, { color: string; bg: string; border: string }> = {
  active: { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  suspended: { color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
  cancelled: { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
};

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)} ${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}`;
  }
  if (digits.length === 11) {
    return `+55 ${digits.slice(0, 2)} ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `+55 ${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
  }
  return `+${digits.replace(/(\d{2})(\d{2,5})(\d{4,})/, "$1 $2 $3")}`;
}

const PAGE_SIZE = 30;

const AdminClientsTable = memo(({ users, onSelectClient }: Props) => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDispatch, setShowDispatch] = useState(false);
  const [dispatchType, setDispatchType] = useState("custom");
  const [dispatchMessage, setDispatchMessage] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<{ ok: number; fail: number } | null>(null);
  const queryClient = useQueryClient();

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data?action=delete-client`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ target_user_id: deleteTarget.id }),
        }
      );
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || "Erro ao excluir");
      toast.success("Cliente excluído com sucesso");
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir cliente");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, queryClient]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter(u => {
      const sub = getSubStatus(u);
      if (filter === "expiring" && sub.label !== "Vencendo") return false;
      if (filter === "expired" && sub.label !== "Vencida") return false;
      if (["Start", "Pro", "Scale", "Elite", "Trial"].includes(filter) && u.plan_name !== filter) return false;
      if (filter === "active" && u.status !== "active") return false;
      if (filter === "suspended" && u.status !== "suspended") return false;
      if (filter === "cancelled" && u.status !== "cancelled") return false;
      if (q && !u.full_name?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q) && !u.phone?.includes(q)) return false;
      return true;
    });
  }, [users, search, filter]);

  const handleDispatch = useCallback(async () => {
    if (!dispatchMessage.trim() && dispatchType === "custom") {
      toast.error("Digite a mensagem para enviar");
      return;
    }
    setDispatching(true);
    setDispatchResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const targetUsers = filtered.map(u => ({
        user_id: u.id,
        phone: u.phone,
        name: u.full_name || u.email,
        email: u.email,
        plan_name: u.plan_name,
      }));

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data?action=bulk-dispatch`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            targets: targetUsers,
            message_type: dispatchType,
            message_content: dispatchMessage.trim(),
          }),
        }
      );
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || "Erro ao disparar");
      setDispatchResult({ ok: result.enqueued || targetUsers.length, fail: result.failed || 0 });
      toast.success(`Disparo enfileirado para ${result.enqueued || targetUsers.length} clientes`);
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    } catch (e: any) {
      toast.error(e.message || "Erro ao disparar mensagens");
    } finally {
      setDispatching(false);
    }
  }, [filtered, dispatchType, dispatchMessage, queryClient]);

  const handleSearch = useCallback((val: string) => { setSearch(val); setPage(0); }, []);
  const handleFilter = useCallback((val: string) => { setFilter(f => f === val ? "all" : val); setPage(0); }, []);

  const paginatedItems = useMemo(() => {
    const start = page * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const counts = useMemo(() => {
    const exp = users.filter(u => getSubStatus(u).label === "Vencida").length;
    const expiring = users.filter(u => getSubStatus(u).label === "Vencendo").length;
    const active = users.filter(u => u.status === "active").length;
    return { exp, expiring, active };
  }, [users]);

  const FilterChip = ({ label, value, count, variant = "default" }: { label: string; value: string; count?: number; variant?: "default" | "danger" | "warning" }) => {
    const isActive = filter === value;
    return (
      <button
        onClick={() => handleFilter(value)}
        className={`
          shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all duration-150
          ${isActive
            ? "bg-primary/15 text-primary border-primary/40 shadow-sm shadow-primary/10"
            : variant === "danger" && (count ?? 0) > 0
              ? "bg-card border-red-500/20 text-red-400/80 hover:bg-red-500/5 hover:border-red-500/30"
              : variant === "warning" && (count ?? 0) > 0
                ? "bg-card border-yellow-500/20 text-yellow-400/80 hover:bg-yellow-500/5 hover:border-yellow-500/30"
                : "bg-card border-border/60 text-muted-foreground hover:border-border hover:text-foreground/80"
          }
        `}
      >
        {label}
        {count !== undefined && count > 0 && (
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
            isActive ? "bg-primary/20 text-primary" :
            variant === "danger" ? "bg-red-500/15 text-red-400" :
            variant === "warning" ? "bg-yellow-500/15 text-yellow-400" :
            "bg-muted text-muted-foreground"
          }`}>
            {count}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* ═══ SEARCH & FILTERS ═══ */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder="Nome, email ou telefone..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
              className="pl-9 h-9 bg-card/50 border-border/60 text-sm placeholder:text-muted-foreground/40"
            />
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium border transition-all ${
              showFilters || filter !== "all"
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-card/50 border-border/60 text-muted-foreground hover:border-border hover:text-foreground/80"
            }`}
          >
            <Filter size={13} />
            Filtros
            {filter !== "all" && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
            <ChevronDown size={13} className={`transition-transform duration-200 ${showFilters ? "rotate-180" : ""}`} />
          </button>
          <div className="hidden sm:flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-1.5">
              <Users size={13} className="text-muted-foreground/50" />
              <span className="text-[11px] text-muted-foreground/70 font-medium">{filtered.length} clientes</span>
            </div>
            <button
              onClick={() => { setShowDispatch(true); setDispatchResult(null); setDispatchMessage(""); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all"
            >
              <Send size={12} />
              Disparar
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="p-3 bg-card/60 border border-border/50 rounded-xl space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/50 font-bold w-14 shrink-0">Status</span>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                <FilterChip label="Ativos" value="active" count={counts.active} />
                <FilterChip label="Suspensos" value="suspended" />
                <FilterChip label="Vencendo" value="expiring" count={counts.expiring} variant="warning" />
                <FilterChip label="Vencidos" value="expired" count={counts.exp} variant="danger" />
              </div>
            </div>
            <div className="h-px bg-border/30" />
            <div className="flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/50 font-bold w-14 shrink-0">Plano</span>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                <FilterChip label="Trial" value="Trial" />
                <FilterChip label="Start" value="Start" />
                <FilterChip label="Pro" value="Pro" />
                <FilterChip label="Scale" value="Scale" />
                <FilterChip label="Elite" value="Elite" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ MOBILE: Card layout ═══ */}
      <div className="space-y-2 sm:hidden">
        {paginatedItems.length === 0 ? (
          <div className="text-center py-12">
            <Users size={24} className="mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-muted-foreground/60 text-sm">Nenhum cliente encontrado</p>
          </div>
        ) : paginatedItems.map(u => {
          const daysLeft = getDaysLeft(u.plan_expires_at);
          const isExpired = daysLeft !== null && daysLeft <= 0;
          const isExpiring = daysLeft !== null && daysLeft > 0 && daysLeft <= 3;
          const sub = getSubStatus(u);
          const plan = planConfig[u.plan_name || ""] || planConfig.Start;

          return (
            <div
              key={u.id}
              onClick={() => onSelectClient(u)}
              className="group bg-card/60 border border-border/50 rounded-xl p-4 active:bg-muted/20 transition-all cursor-pointer hover:border-border"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-semibold text-sm truncate">{u.full_name || "—"}</span>
                    {u.roles.includes("admin") && <Shield size={12} className="text-primary shrink-0" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">{u.email}</p>
                  {u.phone && <p className="text-[11px] text-muted-foreground/50 font-mono mt-0.5">{formatPhone(u.phone)}</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${plan.color} ${plan.bg} ${plan.border}`}>
                    {u.plan_name || "—"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <Layers size={11} className="text-muted-foreground/40" />
                  <span className={u.devices_count >= u.max_instances && u.max_instances > 0 ? "text-red-400 font-semibold" : "text-foreground/70 font-medium"}>
                    {u.devices_count}/{u.max_instances}
                  </span>
                </div>
                <span className="text-border">·</span>
                <span className={`font-medium px-1.5 py-0.5 rounded ${sub.bg} ${sub.color} text-[10px]`}>{sub.label}</span>
                {daysLeft !== null && (
                  <>
                    <span className="text-border">·</span>
                    <span className={`font-medium ${isExpired ? "text-red-400" : isExpiring ? "text-yellow-400" : "text-muted-foreground/60"}`}>
                      {isExpired ? `${Math.abs(daysLeft)}d atrás` : `${daysLeft}d`}
                    </span>
                  </>
                )}
                <ChevronRight size={14} className="ml-auto text-muted-foreground/30 group-active:text-primary transition-colors" />
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ DESKTOP: Table layout ═══ */}
      <div className="border border-border/50 rounded-xl overflow-hidden hidden sm:block bg-card/30">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/50 font-semibold">Cliente</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/50 font-semibold">Telefone</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/50 font-semibold">Plano</th>
                <th className="text-center px-4 py-3 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/50 font-semibold">Instâncias</th>
                <th className="text-center px-4 py-3 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/50 font-semibold">Conta</th>
                <th className="text-center px-4 py-3 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/50 font-semibold">Assinatura</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/50 font-semibold">Vencimento</th>
                <th className="w-28 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <Users size={24} className="mx-auto text-muted-foreground/20 mb-2" />
                    <p className="text-muted-foreground/50 text-sm">Nenhum cliente encontrado</p>
                  </td>
                </tr>
              ) : paginatedItems.map(u => {
                const daysLeft = getDaysLeft(u.plan_expires_at);
                const isExpired = daysLeft !== null && daysLeft <= 0;
                const isExpiring = daysLeft !== null && daysLeft > 0 && daysLeft <= 3;
                const sub = getSubStatus(u);
                const plan = planConfig[u.plan_name || ""] || planConfig.Start;
                const sConf = statusConfig[u.status] || statusConfig.active;

                return (
                  <tr
                    key={u.id}
                    className="group border-b border-border/30 last:border-0 hover:bg-muted/10 transition-colors cursor-pointer"
                    onClick={() => onSelectClient(u)}
                  >
                    {/* Cliente */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-foreground/90 font-medium text-[13px] truncate">{u.full_name || "—"}</span>
                            {u.roles.includes("admin") && <Shield size={11} className="text-primary shrink-0" />}
                          </div>
                          <p className="text-[11px] text-muted-foreground/40 truncate mt-0.5">{u.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Telefone */}
                    <td className="px-4 py-3">
                      <span className="text-[12px] text-muted-foreground/70 font-mono tracking-wide whitespace-nowrap">
                        {formatPhone(u.phone)}
                      </span>
                    </td>

                    {/* Plano */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-md border ${plan.color} ${plan.bg} ${plan.border}`}>
                        {u.plan_name || "—"}
                      </span>
                    </td>

                    {/* Instâncias */}
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[13px] font-bold ${u.devices_count >= u.max_instances && u.max_instances > 0 ? "text-red-400" : "text-foreground/80"}`}>
                        {u.devices_count}
                      </span>
                      <span className="text-muted-foreground/30 text-[13px]">/{u.max_instances}</span>
                    </td>

                    {/* Conta */}
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-md border ${sConf.color} ${sConf.bg} ${sConf.border}`}>
                        {statusLabels[u.status] || u.status}
                      </span>
                    </td>

                    {/* Assinatura */}
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-md border ${sub.color} ${sub.bg} ${sub.border}`}>
                        {sub.label}
                      </span>
                    </td>

                    {/* Vencimento */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-muted-foreground/50">
                          {u.plan_expires_at ? new Date(u.plan_expires_at).toLocaleDateString("pt-BR") : "—"}
                        </span>
                        {daysLeft !== null && (
                          <span className={`text-[10px] font-bold ${
                            isExpired ? "text-red-400" : isExpiring ? "text-yellow-400" : "text-muted-foreground/40"
                          }`}>
                            {isExpired ? "(vencido)" : `(${daysLeft}d)`}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Ações */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        {!u.roles.includes("admin") && (
                          <button
                            className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(u); }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                        <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-primary/70 hover:text-primary hover:bg-primary/10 transition-colors text-[11px] font-semibold">
                          Gerenciar
                          <ChevronRight size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ PAGINATION ═══ */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-[11px] text-muted-foreground/50">{filtered.length} de {users.length} clientes</p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-[11px] px-2.5 border-border/50" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              Anterior
            </Button>
            <span className="text-[11px] text-muted-foreground/50 px-2 font-medium">{page + 1}/{totalPages}</span>
            <Button variant="outline" size="sm" className="h-7 text-[11px] px-2.5 border-border/50" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              Próxima
            </Button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os dados de <strong>{deleteTarget?.full_name || deleteTarget?.email}</strong> serão removidos permanentemente: instâncias, campanhas, contatos, assinatura, logs e a conta de autenticação. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Excluir definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dispatch Dialog */}
      <Dialog open={showDispatch} onOpenChange={setShowDispatch}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send size={16} className="text-primary" />
              Disparar mensagem
            </DialogTitle>
            <DialogDescription>
              Enviar para <strong>{filtered.length}</strong> cliente{filtered.length !== 1 ? "s" : ""} {filter !== "all" ? "(filtrados)" : ""}
            </DialogDescription>
          </DialogHeader>

          {dispatchResult ? (
            <div className="py-6 text-center space-y-3">
              <CheckCircle2 size={40} className="mx-auto text-emerald-400" />
              <div>
                <p className="text-foreground font-semibold text-lg">{dispatchResult.ok} enfileirado{dispatchResult.ok !== 1 ? "s" : ""}</p>
                {dispatchResult.fail > 0 && (
                  <p className="text-sm text-red-400 mt-1">{dispatchResult.fail} falha{dispatchResult.fail !== 1 ? "s" : ""}</p>
                )}
              </div>
              <Button variant="outline" className="mt-2" onClick={() => setShowDispatch(false)}>Fechar</Button>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Tipo da mensagem</label>
                  <Select value={dispatchType} onValueChange={setDispatchType}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">📝 Mensagem personalizada</SelectItem>
                      <SelectItem value="WELCOME">👋 Boas-vindas</SelectItem>
                      <SelectItem value="DUE_3_DAYS">⏰ Faltam 3 dias</SelectItem>
                      <SelectItem value="DUE_TODAY">⚠️ Vence hoje</SelectItem>
                      <SelectItem value="OVERDUE_1">❌ Vencido 1 dia</SelectItem>
                      <SelectItem value="OVERDUE_7">❌ Vencido 7 dias</SelectItem>
                      <SelectItem value="OVERDUE_30">💀 Vencido 30 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    {dispatchType === "custom" ? "Mensagem *" : "Mensagem (opcional — usa template se vazio)"}
                  </label>
                  <Textarea
                    placeholder="Digite a mensagem..."
                    value={dispatchMessage}
                    onChange={e => setDispatchMessage(e.target.value)}
                    rows={4}
                    className="resize-none text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground/50">
                    Variáveis: {"{{nome}}"}, {"{{email}}"}, {"{{plano}}"}
                  </p>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setShowDispatch(false)} disabled={dispatching}>
                  Cancelar
                </Button>
                <Button onClick={handleDispatch} disabled={dispatching || filtered.length === 0} className="gap-2">
                  {dispatching ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {dispatching ? "Enviando..." : `Disparar para ${filtered.length}`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
});
AdminClientsTable.displayName = "AdminClientsTable";

export default AdminClientsTable;
