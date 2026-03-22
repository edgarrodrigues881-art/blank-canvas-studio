import { useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdminAction, type AdminUser } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, Plus, Trash2, Loader2, Pencil, TrendingUp, TrendingDown, Receipt, Wallet, Calendar, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  client: AdminUser;
  detail: any;
}

const METHODS = ["PIX", "Cartão"];

const INSTANCE_PLANS = [
  { name: "Essencial — 5 instâncias", price: 89.90 },
  { name: "Start — 10 instâncias", price: 159.90 },
  { name: "Pro — 30 instâncias", price: 349.90 },
  { name: "Scale — 50 instâncias", price: 549.90 },
  { name: "Elite — 100 instâncias", price: 999.90 },
];

const NOTIFICATION_PRICE = 18.90;

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseBRL(s: string): number {
  const clean = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

const CurrencyInput = ({ value, onChange, placeholder, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) => {
  const ref = useRef<HTMLInputElement>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "");
    if (!digits) { onChange(""); return; }
    const cents = parseInt(digits, 10);
    const formatted = fmtBRL(cents / 100);
    onChange(formatted);
    requestAnimationFrame(() => {
      if (ref.current) {
        ref.current.selectionStart = ref.current.value.length;
        ref.current.selectionEnd = ref.current.value.length;
      }
    });
  }, [onChange]);

  return (
    <Input ref={ref} type="text" inputMode="numeric" value={value}
      onChange={handleChange} placeholder={placeholder || "0,00"}
      className={className} />
  );
};

const emptyForm = (planPrice = 0) => ({
  amount: "",
  method: "PIX",
  notes: "",
  paid_at: new Date().toISOString().split("T")[0],
  discount: "",
  fee: "",
  plan_value: planPrice > 0 ? fmtBRL(planPrice) : "",
  selected_plan_price: 0,
  include_notification: false,
});

const ClientPaymentsTab = ({ client }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { mutate: adminAction, isPending: actionPending } = useAdminAction();

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["admin-payments", client.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-data?action=list-payments", {
        body: { target_user_id: client.id },
      });
      if (error) throw error;
      return data?.payments || [];
    },
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editPayment, setEditPayment] = useState<any>(null);
  const [form, setForm] = useState(emptyForm());

  const openAdd = () => { setForm(emptyForm(client.plan_price)); setShowAdd(true); };

  const openEdit = (p: any) => {
    setForm({
      amount: Number(p.amount) > 0 ? fmtBRL(Number(p.amount)) : "",
      method: p.method,
      notes: p.notes || "",
      paid_at: p.paid_at?.split("T")[0] || new Date().toISOString().split("T")[0],
      discount: Number(p.discount) > 0 ? fmtBRL(Number(p.discount)) : "",
      fee: Number(p.fee) > 0 ? fmtBRL(Number(p.fee)) : "",
      plan_value: client.plan_price > 0 ? fmtBRL(client.plan_price) : "",
      selected_plan_price: 0,
      include_notification: false,
    });
    setEditPayment(p);
  };

  const buildBody = () => {
    const pv = parseBRL(form.plan_value);
    const am = parseBRL(form.amount);
    const feeVal = parseBRL(form.fee);
    const discount = pv > 0 && am > 0 && pv > am ? pv - am : 0;
    return {
      amount: am,
      method: form.method,
      notes: form.notes,
      paid_at: new Date(form.paid_at).toISOString(),
      discount: Math.round(discount * 100) / 100,
      fee: Math.round(feeVal * 100) / 100,
    };
  };

  const addPayment = () => {
    const am = parseBRL(form.amount);
    if (am < 0) return;
    adminAction(
      { action: "add-payment", body: { target_user_id: client.id, ...buildBody() } },
      {
        onSuccess: () => {
          toast({ title: "Pagamento registrado" });
          setShowAdd(false);
          setForm(emptyForm());
          queryClient.invalidateQueries({ queryKey: ["admin-payments", client.id] });
          queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
        },
        onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
      }
    );
  };

  const saveEdit = () => {
    const am = parseBRL(form.amount);
    if (am < 0) return;
    adminAction(
      { action: "update-payment", body: { payment_id: editPayment.id, target_user_id: client.id, ...buildBody() } },
      {
        onSuccess: () => {
          toast({ title: "Pagamento atualizado" });
          setEditPayment(null);
          queryClient.invalidateQueries({ queryKey: ["admin-payments", client.id] });
          queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
        },
        onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
      }
    );
  };

  const deletePayment = (paymentId: string) => {
    adminAction(
      { action: "delete-payment", body: { payment_id: paymentId, target_user_id: client.id } },
      {
        onSuccess: () => {
          toast({ title: "Pagamento removido" });
          queryClient.invalidateQueries({ queryKey: ["admin-payments", client.id] });
          queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
        },
        onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
      }
    );
  };

  const totalPaid = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
  const totalDiscount = payments.reduce((s: number, p: any) => s + Number(p.discount || 0), 0);
  const totalFees = payments.reduce((s: number, p: any) => s + Number(p.fee || 0), 0);
  const totalLiquido = totalPaid - totalFees;

  const autoDiscount = (() => {
    const pv = parseBRL(form.plan_value);
    const am = parseBRL(form.amount);
    if (pv > 0 && am > 0 && pv > am) return fmtBRL(pv - am);
    return "0,00";
  })();

  const formFields = (
    <div className="space-y-5">
      {/* Plan Selection Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
            <Receipt size={13} className="text-primary" />
          </div>
          <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Plano & Serviços</span>
        </div>
        <div className="bg-muted/30 rounded-xl border border-border p-4 space-y-3">
          <div>
            <Label className="text-muted-foreground text-[11px] uppercase tracking-wide font-medium">Plano de Instâncias</Label>
            <select
              value={String(form.selected_plan_price || "")}
              onChange={e => {
                const price = Number(e.target.value) || 0;
                const total = price + (form.include_notification ? NOTIFICATION_PRICE : 0);
                setForm(f => ({
                  ...f,
                  selected_plan_price: price,
                  plan_value: total > 0 ? fmtBRL(total) : "",
                }));
              }}
              className="mt-1.5 w-full h-10 rounded-lg border border-border bg-card text-foreground px-3 text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
            >
              <option value="" className="bg-card text-foreground">Selecione um plano</option>
              {INSTANCE_PLANS.map(p => (
                <option key={p.name} value={String(p.price)} className="bg-card text-foreground">
                  {p.name} — R$ {fmtBRL(p.price)}
                </option>
              ))}
            </select>
          </div>
          <div
            onClick={() => {
              const newVal = !form.include_notification;
              const total = (form.selected_plan_price || 0) + (newVal ? NOTIFICATION_PRICE : 0);
              setForm(f => ({
                ...f,
                include_notification: newVal,
                plan_value: total > 0 ? fmtBRL(total) : "",
              }));
            }}
            className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
              form.include_notification
                ? "border-primary/50 bg-primary/5"
                : "border-border hover:border-muted-foreground/30"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <input type="checkbox" checked={form.include_notification} readOnly
                className="w-4 h-4 rounded border-border accent-primary" />
              <span className="text-sm font-medium text-foreground">Relatório via WhatsApp</span>
            </div>
            <span className={`text-xs font-semibold ${form.include_notification ? "text-primary" : "text-muted-foreground"}`}>
              + R$ {fmtBRL(NOTIFICATION_PRICE)}/mês
            </span>
          </div>
        </div>
      </div>

      {/* Values Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
            <DollarSign size={13} className="text-primary" />
          </div>
          <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Valores</span>
        </div>
        <div className="bg-muted/30 rounded-xl border border-border p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-muted-foreground text-[11px] uppercase tracking-wide font-medium">Valor do Plano</Label>
              <div className="relative mt-1.5">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">R$</span>
                <CurrencyInput value={form.plan_value || "0,00"}
                  onChange={v => setForm(f => ({ ...f, plan_value: v }))}
                  className="bg-card border-border text-foreground font-semibold pl-9" />
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground text-[11px] uppercase tracking-wide font-medium">Valor Recebido</Label>
              <div className="relative mt-1.5">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-primary font-medium">R$</span>
                <CurrencyInput value={form.amount}
                  onChange={v => setForm(f => ({ ...f, amount: v }))}
                  className="bg-card border-border text-foreground font-semibold pl-9" />
              </div>
            </div>
          </div>

          <div className="h-px bg-border" />

          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label className="text-muted-foreground text-[10px] uppercase tracking-wide font-medium">Desconto</Label>
              <div className="relative mt-1.5">
                <Input type="text" readOnly value={autoDiscount}
                  className="bg-muted/60 border-border text-orange-500 font-semibold text-sm cursor-default" />
              </div>
              <p className="text-[9px] text-muted-foreground/70 mt-0.5 italic">Plano − Recebido</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-[10px] uppercase tracking-wide font-medium">Taxa</Label>
              <div className="relative mt-1.5">
                <CurrencyInput value={form.fee}
                  onChange={v => setForm(f => ({ ...f, fee: v }))}
                  className="bg-card border-border text-foreground text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground text-[10px] uppercase tracking-wide font-medium">Líquido</Label>
              <div className="relative mt-1.5">
                <Input type="text" readOnly value={(() => {
                  const am = parseBRL(form.amount);
                  const fe = parseBRL(form.fee);
                  const liq = am - fe;
                  return liq > 0 ? fmtBRL(liq) : "0,00";
                })()}
                  className="bg-primary/5 border-primary/20 text-primary font-bold text-sm cursor-default" />
              </div>
              <p className="text-[9px] text-muted-foreground/70 mt-0.5 italic">Recebido − Taxa</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-[10px] uppercase tracking-wide font-medium">Método</Label>
              <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}
                className="mt-1.5 w-full h-10 rounded-lg border border-border bg-card text-foreground px-3 text-sm focus:ring-2 focus:ring-primary/40 transition-all">
                {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Details Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
            <Calendar size={13} className="text-primary" />
          </div>
          <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Detalhes</span>
        </div>
        <div className="bg-muted/30 rounded-xl border border-border p-4 space-y-3">
          <div>
            <Label className="text-muted-foreground text-[11px] uppercase tracking-wide font-medium">Data do Pagamento</Label>
            <Input type="date" value={form.paid_at}
              onChange={e => setForm(f => ({ ...f, paid_at: e.target.value }))}
              className="bg-card border-border text-foreground mt-1.5 focus:ring-2 focus:ring-primary/40 transition-all" />
          </div>
          <div>
            <Label className="text-muted-foreground text-[11px] uppercase tracking-wide font-medium">Observação</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="bg-card border-border text-foreground mt-1.5 focus:ring-2 focus:ring-primary/40 transition-all resize-none" rows={2}
              placeholder="Ex: Pagamento referente ao mês de março" />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Wallet size={20} className="text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">Financeiro</h3>
            <p className="text-xs text-muted-foreground">{payments.length} pagamento{payments.length !== 1 ? "s" : ""} registrado{payments.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <Button size="sm" onClick={openAdd} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 rounded-lg shadow-sm">
          <Plus size={14} /> Novo Pagamento
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="group relative bg-card rounded-xl border border-border p-4 hover:shadow-md transition-all duration-200 overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-bl-[2rem] -mr-2 -mt-2" />
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <TrendingUp size={14} className="text-primary" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Recebido</span>
          </div>
          <p className="text-2xl font-bold text-foreground tabular-nums">
            R$ {fmtBRL(totalPaid)}
          </p>
        </div>

        <div className="group relative bg-card rounded-xl border border-border p-4 hover:shadow-md transition-all duration-200 overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-orange-500/5 rounded-bl-[2rem] -mr-2 -mt-2" />
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <TrendingDown size={14} className="text-orange-500" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Descontos</span>
          </div>
          <p className="text-2xl font-bold text-foreground tabular-nums">
            R$ {fmtBRL(totalDiscount)}
          </p>
        </div>

        <div className="group relative bg-card rounded-xl border border-border p-4 hover:shadow-md transition-all duration-200 overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-destructive/5 rounded-bl-[2rem] -mr-2 -mt-2" />
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center">
              <Receipt size={14} className="text-destructive" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Taxas</span>
          </div>
          <p className="text-2xl font-bold text-foreground tabular-nums">
            R$ {fmtBRL(totalFees)}
          </p>
        </div>

        <div className="group relative bg-card rounded-xl border border-primary/20 p-4 hover:shadow-md transition-all duration-200 overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-bl-[2rem] -mr-2 -mt-2" />
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <DollarSign size={14} className="text-primary" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Líquido</span>
          </div>
          <p className="text-2xl font-bold text-primary tabular-nums">
            R$ {fmtBRL(totalLiquido)}
          </p>
        </div>
      </div>

      {/* Payment List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : payments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Wallet size={32} className="mb-2 opacity-30" />
            <p className="text-sm">Nenhum pagamento registrado</p>
          </div>
        ) : payments.map((p: any) => {
          const amount = Number(p.amount);
          const discount = Number(p.discount || 0);
          const fee = Number(p.fee || 0);
          const liquid = amount - fee;

          return (
            <div key={p.id} className="group bg-card border border-border rounded-xl p-4 hover:border-primary/20 hover:shadow-sm transition-all duration-200">
              <div className="flex items-center justify-between">
                {/* Left: date + method */}
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex flex-col items-center min-w-[52px]">
                    <span className="text-lg font-bold text-foreground leading-none">
                      {new Date(p.paid_at).getDate().toString().padStart(2, "0")}
                    </span>
                    <span className="text-[10px] uppercase text-muted-foreground font-medium">
                      {new Date(p.paid_at).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })}
                    </span>
                  </div>

                  <div className="w-px h-10 bg-border" />

                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-primary tabular-nums">
                        R$ {fmtBRL(amount)}
                      </span>
                      {discount > 0 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-orange-500/30 text-orange-500 font-medium">
                          -R$ {fmtBRL(discount)}
                        </Badge>
                      )}
                      {fee > 0 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-destructive/30 text-destructive font-medium">
                          Taxa R$ {fmtBRL(fee)}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CreditCard size={11} />
                        {p.method}
                      </span>
                      {fee > 0 && (
                        <span className="text-muted-foreground/60">
                          · Líquido R$ {fmtBRL(liquid)}
                        </span>
                      )}
                      {p.notes && (
                        <span className="truncate max-w-[200px] text-muted-foreground/60" title={p.notes}>
                          · {p.notes}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(p)}
                    className="text-muted-foreground hover:text-foreground h-8 w-8 rounded-lg">
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deletePayment(p.id)}
                    className="text-muted-foreground hover:text-destructive h-8 w-8 rounded-lg">
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader><DialogTitle>Registrar Pagamento</DialogTitle></DialogHeader>
          {formFields}
          <DialogFooter>
            <Button onClick={addPayment} disabled={actionPending} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              {actionPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editPayment} onOpenChange={(open) => { if (!open) setEditPayment(null); }}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader><DialogTitle>Editar Pagamento</DialogTitle></DialogHeader>
          {formFields}
          <DialogFooter>
            <Button onClick={saveEdit} disabled={actionPending} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              {actionPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientPaymentsTab;
