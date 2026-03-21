import { useState, useMemo } from "react";
import { Pencil, Check, X, TrendingUp, TrendingDown, DollarSign, CreditCard, Tag, AlertTriangle, BarChart3, Wallet, Receipt } from "lucide-react";
import RevenueChart from "./RevenueChart";
import type { AdminDashboard } from "@/hooks/useAdmin";
import { PeriodFilter, usePeriodFilter } from "./PeriodFilter";

const DEFAULT_MAX = 500;
const STORAGE_KEY_MAX = "dg-server-max-instances";

function loadMaxInstances(): number {
  try {
    const v = localStorage.getItem(STORAGE_KEY_MAX);
    return v ? Number(v) : DEFAULT_MAX;
  } catch { return DEFAULT_MAX; }
}

function getDaysLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
}

function fmt(v: number) {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle: string;
  accent?: "emerald" | "red" | "amber" | "default";
  highlight?: boolean;
}

const KpiCard = ({ icon, label, value, subtitle, accent = "default", highlight }: KpiCardProps) => {
  const borderColor = highlight
    ? accent === "emerald" ? "border-emerald-500/30" : accent === "red" ? "border-destructive/30" : "border-primary/30"
    : "border-border";
  const valueColor = accent === "emerald" ? "text-emerald-400" : accent === "red" ? "text-destructive" : accent === "amber" ? "text-primary" : "text-foreground";

  return (
    <div className={`bg-card rounded-xl border ${borderColor} p-4 flex flex-col gap-2`}>
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.12em]">{label}</p>
      </div>
      <p className={`text-2xl font-extrabold tracking-tight ${valueColor}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground/50">{subtitle}</p>
    </div>
  );
};

const AdminOverview = ({ data }: { data: AdminDashboard }) => {
  const { stats, users = [], cycles = [], payments = [], costs = [] } = data ?? { stats: { total_users: 0, total_devices: 0, active_devices: 0, total_campaigns: 0, total_contacts: 0, total_subscriptions: 0 }, users: [], cycles: [], payments: [], costs: [] };

  const periodFilter = usePeriodFilter();
  const { range } = periodFilter;
  const [maxInstances, setMaxInstances] = useState(loadMaxInstances);
  const [editingMax, setEditingMax] = useState(false);
  const [editMaxValue, setEditMaxValue] = useState("");
  const now = new Date();

  // ── Period-filtered calculations ──
  const revenueBrute = useMemo(() => {
    const filteredCycles = (cycles || []).filter((c: any) => {
      const start = new Date(c.cycle_start);
      const end = new Date(c.cycle_end);
      return end >= range.start && start <= range.end;
    });
    const usersWithCycles = new Set(filteredCycles.map((c: any) => c.user_id));
    let total = filteredCycles.reduce((s: number, c: any) => s + Number(c.cycle_amount), 0);
    users.forEach(u => {
      if (!usersWithCycles.has(u.id) && u.plan_expires_at && new Date(u.plan_expires_at) > now && u.plan_price > 0) {
        total += u.plan_price;
      }
    });
    return total;
  }, [users, cycles, range]);

  const filteredPayments = useMemo(() =>
    (payments || []).filter((p: any) => {
      const d = new Date(p.paid_at);
      return d >= range.start && d <= range.end;
    }),
  [payments, range]);

  const revenueReceived = useMemo(() =>
    filteredPayments.reduce((s: number, p: any) => s + Number(p.amount), 0),
  [filteredPayments]);

  const paymentsCount = filteredPayments.length;

  const discounts = useMemo(() =>
    filteredPayments.reduce((s: number, p: any) => s + Number(p.discount || 0), 0),
  [filteredPayments]);

  const paymentFees = useMemo(() =>
    filteredPayments.reduce((s: number, p: any) => s + Number(p.fee || 0), 0),
  [filteredPayments]);

  const periodCosts = useMemo(() =>
    (costs || []).reduce((s: number, c: any) => {
      const d = new Date(c.cost_date);
      return d >= range.start && d <= range.end ? s + Number(c.amount) : s;
    }, 0),
  [costs, range]);

  const totalCosts = periodCosts + paymentFees;
  const netRevenue = revenueReceived - totalCosts;
  const isPositive = netRevenue >= 0;
  const hasMovements = paymentsCount > 0 || periodCosts > 0;

  // ── Operational ──
  const revenueAtRisk = useMemo(() =>
    users.reduce((sum, u) => {
      const d = getDaysLeft(u.plan_expires_at);
      if (d !== null && d > 0 && d <= 3 && u.plan_price > 0) return sum + u.plan_price;
      return sum;
    }, 0),
  [users]);

  const expiringSoon = useMemo(() =>
    users.filter(u => { const d = getDaysLeft(u.plan_expires_at); return d !== null && d > 0 && d <= 3; }),
  [users]);

  const expired = useMemo(() =>
    users.filter(u => { const d = getDaysLeft(u.plan_expires_at); return d !== null && d <= 0; }),
  [users]);

  const revenueExpired = useMemo(() =>
    users.reduce((sum, u) => {
      const d = getDaysLeft(u.plan_expires_at);
      if (d !== null && d <= 0 && u.plan_price > 0) return sum + u.plan_price;
      return sum;
    }, 0),
  [users]);

  const blocked = useMemo(() =>
    users.filter(u => u.status === "suspended" || u.status === "cancelled"),
  [users]);

  const totalAllocated = useMemo(() => users.reduce((s, u) => s + u.max_instances + (u.instance_override || 0), 0), [users]);
  const totalInUse = stats.total_devices;
  const serverOccupancy = Math.round((totalInUse / maxInstances) * 100);

  const startEditMax = () => { setEditMaxValue(String(maxInstances)); setEditingMax(true); };
  const confirmEditMax = () => {
    const v = parseInt(editMaxValue);
    if (v > 0) { setMaxInstances(v); localStorage.setItem(STORAGE_KEY_MAX, String(v)); }
    setEditingMax(false);
  };
  const activePlans = users.filter(u => u.plan_expires_at && new Date(u.plan_expires_at) > now && u.plan_price > 0).length;

  return (
    <div className="space-y-6">

      {/* ═══ FINANCEIRO SECTION ═══ */}
      <section className="bg-card rounded-xl border border-border p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <Wallet size={16} className="text-primary" />
            <h3 className="text-xs font-bold text-foreground uppercase tracking-[0.12em]">Financeiro</h3>
          </div>
          <div className="hidden sm:block h-4 w-px bg-border" />
          <PeriodFilter {...periodFilter} />
        </div>

        {/* KPI Grid — 2x2 on mobile, 5 cols on desktop */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard
            icon={isPositive ? <TrendingUp size={14} className="text-emerald-400" /> : <TrendingDown size={14} className="text-destructive" />}
            label="Receita Líquida"
            value={fmt(netRevenue)}
            subtitle={!hasMovements ? "Sem movimentos" : isPositive ? "▲ Positivo" : "▼ Negativo"}
            accent={isPositive ? "emerald" : "red"}
            highlight
          />
          <KpiCard
            icon={<CreditCard size={14} className="text-emerald-400" />}
            label="Recebida"
            value={fmt(revenueReceived)}
            subtitle={`${paymentsCount} pgto${paymentsCount !== 1 ? "s" : ""}`}
          />
          <KpiCard
            icon={<DollarSign size={14} className="text-primary" />}
            label="Contratada"
            value={fmt(revenueBrute)}
            subtitle={`${activePlans} planos`}
            accent="amber"
          />
          <KpiCard
            icon={<Tag size={14} className="text-primary" />}
            label="Descontos"
            value={fmt(discounts)}
            subtitle="Concedidos"
          />
          <KpiCard
            icon={<Receipt size={14} className="text-destructive" />}
            label="Taxas & Custos"
            value={fmt(totalCosts)}
            subtitle={`Op ${fmt(periodCosts)} · Tx ${fmt(paymentFees)}`}
            accent="red"
          />
        </div>
      </section>

      {/* ═══ OPERAÇÃO SECTION ═══ */}
      <section className="bg-card rounded-xl border border-border p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-primary" />
            <h3 className="text-xs font-bold text-foreground uppercase tracking-[0.12em]">Operação</h3>
          </div>
          {editingMax ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Capacidade:</span>
              <input
                type="number"
                value={editMaxValue}
                onChange={e => setEditMaxValue(e.target.value)}
                onKeyDown={e => e.key === "Enter" && confirmEditMax()}
                className="w-20 h-7 text-xs font-bold bg-muted border border-border rounded-lg px-2 text-foreground focus:outline-none focus:border-primary"
                autoFocus
              />
              <button onClick={confirmEditMax} className="text-primary hover:text-primary/80"><Check size={14} /></button>
              <button onClick={() => setEditingMax(false)} className="text-muted-foreground/50 hover:text-muted-foreground"><X size={14} /></button>
            </div>
          ) : (
            <button onClick={startEditMax} className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors group">
              <span>Capacidade: {maxInstances}</span>
              <Pencil size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Liberadas", value: totalAllocated, suffix: `/ ${maxInstances}` },
            { label: "Em Uso", value: totalInUse, suffix: `${stats.active_devices} on` },
            { label: "Ocupação", value: `${serverOccupancy}%`, isWarning: serverOccupancy >= 80 },
            { label: "Bloqueados", value: blocked.length },
          ].map((item, i) => (
            <div key={i} className="bg-muted/50 rounded-lg px-4 py-3 border border-border/50">
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">{item.label}</p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <p className={`text-xl font-extrabold ${(item as any).isWarning ? "text-destructive" : "text-foreground"}`}>
                  {item.value}
                </p>
                {item.suffix && (
                  <span className="text-[11px] font-medium text-muted-foreground/50">{item.suffix}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="relative h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                serverOccupancy >= 90 ? "bg-destructive" : serverOccupancy >= 70 ? "bg-primary/80" : "bg-primary"
              }`}
              style={{ width: `${Math.max(Math.min(serverOccupancy, 100), 2)}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground/50">{totalInUse} / {maxInstances} instâncias</p>
        </div>
      </section>

      {/* ═══ GRÁFICO DE RECEITA ═══ */}
      <RevenueChart payments={payments} costs={costs} />
    </div>
  );
};

export default AdminOverview;
