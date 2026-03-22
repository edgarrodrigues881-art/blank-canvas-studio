import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Users, Search, Phone, User, Filter, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useAdminDashboard, type AdminUser } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55"))
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)} ${digits.slice(9)}`;
  if (digits.length === 11)
    return `+55 ${digits.slice(0, 2)} ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return phone;
}

function getPlanCategory(planName: string | null): string {
  if (!planName || planName === "Sem plano") return "Sem plano";
  const lower = planName.toLowerCase();
  if (lower.includes("trial")) return "Trial";
  if (lower.includes("10") || lower.includes("start")) return "10 instâncias";
  if (lower.includes("30") || lower.includes("pro")) return "30 instâncias";
  if (lower.includes("50") || lower.includes("scale")) return "50 instâncias";
  if (lower.includes("100") || lower.includes("elite")) return "100 instâncias";
  return planName;
}

const PLAN_FILTERS = [
  { value: "all", label: "Todos os clientes" },
  { value: "Sem plano", label: "Sem plano" },
  { value: "Trial", label: "Trial" },
  { value: "10 instâncias", label: "10 instâncias" },
  { value: "30 instâncias", label: "30 instâncias" },
  { value: "50 instâncias", label: "50 instâncias" },
  { value: "100 instâncias", label: "100 instâncias" },
];

const planBadgeStyle: Record<string, string> = {
  "Sem plano": "bg-muted/40 text-muted-foreground border-border/40",
  "Trial": "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  "10 instâncias": "bg-teal-500/10 text-teal-400 border-teal-500/20",
  "30 instâncias": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "50 instâncias": "bg-purple-500/10 text-purple-400 border-purple-500/20",
  "100 instâncias": "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const AdminClientBase = () => {
  const { data } = useAdminDashboard();
  const users = data?.users || [];

  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 20;

  // Map users with plan category
  const clientsWithPlan = useMemo(() => {
    return users
      .filter((u) => !u.roles.includes("admin"))
      .map((u) => ({
        ...u,
        planCategory: getPlanCategory(u.plan_name),
      }));
  }, [users]);

  const filtered = useMemo(() => {
    return clientsWithPlan.filter((c) => {
      const matchSearch =
        (c.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (c.phone || "").includes(search) ||
        (c.email || "").toLowerCase().includes(search.toLowerCase());
      const matchPlan = planFilter === "all" || c.planCategory === planFilter;
      return matchSearch && matchPlan;
    });
  }, [clientsWithPlan, search, planFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  // Stats by plan
  const planStats = useMemo(() => {
    const stats: Record<string, number> = {};
    for (const f of PLAN_FILTERS) {
      if (f.value === "all") continue;
      stats[f.value] = clientsWithPlan.filter((c) => c.planCategory === f.value).length;
    }
    return stats;
  }, [clientsWithPlan]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
          Base de Contatos
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          Todos os clientes cadastrados no sistema
        </p>
      </div>

      {/* Plan Stats Cards */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {PLAN_FILTERS.filter((f) => f.value !== "all").map((f) => (
          <button
            key={f.value}
            onClick={() => {
              setPlanFilter(planFilter === f.value ? "all" : f.value);
              setCurrentPage(1);
            }}
            className={cn(
              "rounded-xl border px-3 py-3 text-center transition-all duration-150",
              planFilter === f.value
                ? "border-primary/40 bg-primary/5 shadow-sm"
                : "border-border/40 bg-card hover:border-border/60"
            )}
          >
            <p className="text-lg sm:text-xl font-bold text-foreground tabular-nums">
              {planStats[f.value] || 0}
            </p>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5 truncate">
              {f.label}
            </p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            placeholder="Buscar por nome, telefone ou email..."
            className="pl-9 h-10 text-sm rounded-xl bg-muted/30 border-border/50 focus:bg-background transition-colors"
          />
        </div>
        <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="h-10 w-44 text-sm rounded-xl bg-muted/30 border-border/50">
            <SelectValue placeholder="Plano" />
          </SelectTrigger>
          <SelectContent>
            {PLAN_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.value === "all" ? "Todos" : f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5 ml-auto">
          <Users className="w-4 h-4 text-muted-foreground/50" />
          <span className="text-sm font-medium text-foreground tabular-nums">{filtered.length}</span>
          <span className="text-xs text-muted-foreground">contatos</span>
        </div>
      </div>

      {/* Contact List */}
      {paginated.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <Users className="w-10 h-10 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">Nenhum contato encontrado</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {paginated.map((c, idx) => {
            const badgeStyle = planBadgeStyle[c.planCategory] || planBadgeStyle["Sem plano"];
            return (
              <div
                key={c.id}
                className="group flex items-center gap-4 px-4 py-3 rounded-xl border border-border/40 bg-card hover:border-primary/20 hover:shadow-[0_2px_12px_-4px_hsl(var(--primary)/0.08)] transition-all duration-200"
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-primary" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {c.full_name || "Sem nome"}
                  </p>
                  <p className="text-xs text-muted-foreground/60 truncate mt-0.5">
                    {c.email}
                  </p>
                </div>

                {/* Phone */}
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground/60 shrink-0">
                  <Phone className="w-3 h-3" />
                  <span className="font-mono tabular-nums">{formatPhone(c.phone)}</span>
                </div>

                {/* Plan Badge */}
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-medium shrink-0 rounded-lg px-2.5 py-0.5",
                    badgeStyle
                  )}
                >
                  {c.planCategory}
                </Badge>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {filtered.length > perPage && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground pt-1">
          <span className="text-muted-foreground/50">
            {(currentPage - 1) * perPage + 1}-{Math.min(currentPage * perPage, filtered.length)} de {filtered.length}
          </span>
          <div className="flex items-center gap-1 ml-2">
            <button
              className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border/40 hover:bg-muted/40 disabled:opacity-30 transition-colors"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-semibold">
              {currentPage}
            </span>
            <button
              className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border/40 hover:bg-muted/40 disabled:opacity-30 transition-colors"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminClientBase;
