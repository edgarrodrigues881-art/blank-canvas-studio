import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useAdminAction, type AdminUser } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, CreditCard, RefreshCw, AlertTriangle, PauseCircle, Undo2, CheckCircle2, Clock, MinusCircle, Zap, Radio, Calendar, DollarSign, Layers, Trash2, BotMessageSquare } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const NOTIFICATION_PRICE = 18.90;
const AUTOREPLY_PRICES = { none: 0, basic: 29.90, pro: 49.90 };
type AutoreplyTier = keyof typeof AUTOREPLY_PRICES;

const PLANS: Record<string, { price: number; max_instances: number; defaultDays?: number; reports_whatsapp_enabled?: boolean }> = {
  "Sem plano": { price: 0, max_instances: 0 },
  Trial: { price: 0, max_instances: 3, defaultDays: 3 },
  Essencial: { price: 89.9, max_instances: 5 },
  Start: { price: 159.9, max_instances: 10 },
  Pro: { price: 349.9, max_instances: 30 },
  Scale: { price: 549.9, max_instances: 50, reports_whatsapp_enabled: true },
  Elite: { price: 999.9, max_instances: 100, reports_whatsapp_enabled: true },
};

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function toLocalDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

interface Props { client: AdminUser; detail: any; }

const cycleStatusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  paid: { label: "Pago", color: "text-green-500", icon: CheckCircle2 },
  partial: { label: "Parcial", color: "text-yellow-500", icon: MinusCircle },
  pending: { label: "Pendente", color: "text-destructive", icon: Clock },
};

const ClientPlanTab = ({ client, detail }: Props) => {
  const sub = detail?.subscription;
  const cycles: any[] = detail?.cycles || [];
  const [planName, setPlanName] = useState<string>(sub?.plan_name || client.plan_name || "Start");
  const [startedAt, setStartedAt] = useState<string>(
    sub?.started_at ? sub.started_at.split("T")[0] : new Date().toISOString().split("T")[0]
  );
  const [trialDays, setTrialDays] = useState<number>(3);
  const [manualExpires, setManualExpires] = useState<string>("");
  const [includeNotification, setIncludeNotification] = useState<boolean>(detail?.profile?.notificacao_liberada ?? false);
  const [autoreplyTier, setAutoreplyTier] = useState<AutoreplyTier>("none");

  const planConfig = PLANS[planName] || PLANS.Start;
  const isTrial = planName === "Trial";
  const isNoPlan = planName === "Sem plano";
  const notificationPrice = isTrial ? 0 : NOTIFICATION_PRICE;
  const autoreplyPrice = isTrial ? 0 : AUTOREPLY_PRICES[autoreplyTier];
  const autoTotal = planConfig.price + (includeNotification ? notificationPrice : 0) + autoreplyPrice;
  // Initialize manualPrice from saved subscription if it differs from auto-calculated value
  const [manualPrice, setManualPrice] = useState<string>(() => {
    if (sub?.plan_price != null) {
      const savedPrice = Number(sub.plan_price);
      // If saved price differs from auto, treat as manual override
      if (savedPrice !== autoTotal) {
        return savedPrice.toFixed(2);
      }
    }
    return "";
  });
  const totalPrice = manualPrice !== "" ? (Number(manualPrice.replace(",", ".")) || 0) : autoTotal;
  const cycleDays = isTrial ? trialDays : 30;
  
  const autoExpiresAt = useMemo(() => isNoPlan ? startedAt : addDays(startedAt, cycleDays), [startedAt, isNoPlan, cycleDays]);
  const expiresAt = manualExpires || autoExpiresAt;
  const { mutate, isPending, invalidateClient, invalidateDashboard } = useAdminAction();
  const { toast } = useToast();

  const daysLeft = sub?.expires_at ? Math.ceil((new Date(sub.expires_at).getTime() - Date.now()) / 86400000) : null;
  const isExpired = daysLeft !== null && daysLeft <= 0;
  const isExpiring = daysLeft !== null && daysLeft > 0 && daysLeft <= 3;

  const [provisioning, setProvisioning] = useState(false);
  const loading = isPending || provisioning;

  // Auto-provision tokens via API
  const handleAutoProvision = (quantity: number) => {
    setProvisioning(true);
    const clientName = client.full_name || client.email || "cliente";
    mutate({
      action: "auto-provision-tokens",
      body: { target_user_id: client.id, quantity, client_name: clientName },
    }, {
      onSuccess: (data: any) => {
        setProvisioning(false);
        if (data.created > 0) {
          toast({ title: `${data.created} token(s) criado(s) automaticamente`, description: data.errors > 0 ? `${data.errors} erro(s): ${data.error_details?.join(", ")}` : undefined });
        } else if (data.existing >= quantity) {
          toast({ title: `Cliente já possui ${data.existing} token(s) — nenhum novo necessário` });
        } else {
          toast({ title: "Nenhum token criado", description: data.error_details?.join(", "), variant: "destructive" });
        }
      },
      onError: (e) => {
        setProvisioning(false);
        toast({ title: "Erro ao provisionar", description: e.message, variant: "destructive" });
      },
    });
  };

  const handleSave = () => {
    if (isTrial && (!trialDays || trialDays < 1)) {
      toast({ title: "Dias inválidos", description: "Informe ao menos 1 dia para o Trial.", variant: "destructive" });
      return;
    }
    if (isNoPlan) {
      mutate({
        action: "remove-subscription",
        body: { target_user_id: client.id },
      }, {
        onSuccess: () => {
          toast({ title: "Plano removido — cliente sem plano" });
          // Force refresh client detail and dashboard
          invalidateClient(client.id);
          invalidateDashboard();
        },
        onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
      });
      return;
    }

    const cycleStart = new Date(startedAt).toISOString();
    const cycleEnd = new Date(expiresAt).toISOString();

    setProvisioning(true);
    mutate({
      action: "update-subscription",
      body: {
        target_user_id: client.id,
        plan_name: planName,
        plan_price: totalPrice,
        max_instances: planConfig.max_instances,
        started_at: cycleStart,
        expires_at: cycleEnd,
      },
    }, {
      onSuccess: (data: any) => {
        const prov = data?.provision;
        mutate({
          action: "create-cycle",
          body: {
            target_user_id: client.id,
            plan_name: planName,
            cycle_amount: totalPrice,
            cycle_start: cycleStart,
            cycle_end: cycleEnd,
          },
        }, {
          onSuccess: () => {
            mutate({
              action: "toggle-notification",
              body: { target_user_id: client.id, enabled: includeNotification },
            }, { onSuccess: () => {}, onError: () => {} });

            // Addon notification is already included in totalPrice, no separate subscription needed

            setProvisioning(false);
            let desc = "Ciclo criado.";
            if (includeNotification) desc += " Relatório via WhatsApp ativado.";
            if (prov?.created > 0) desc += ` ${prov.created} token(s) provisionados.`;
            if (prov?.blocked > 0) desc += ` ${prov.blocked} token(s) bloqueados por downgrade.`;
            if (prov?.unblocked > 0) desc += ` ${prov.unblocked} token(s) desbloqueados.`;
            if (prov?.errors?.length > 0) desc += ` ${prov.errors.length} erro(s).`;
            toast({ title: "Plano atualizado", description: desc });
            invalidateClient(client.id);
            invalidateDashboard();
          },
          onError: (e) => {
            setProvisioning(false);
            toast({ title: "Plano salvo, mas ciclo falhou", description: e.message, variant: "destructive" });
          },
        });
      },
      onError: (e) => {
        setProvisioning(false);
        toast({ title: "Erro", description: e.message, variant: "destructive" });
      },
    });
  };

  const handleRenew = () => {
    const currentExpiry = sub?.expires_at ? sub.expires_at.split("T")[0] : expiresAt;
    const newStart = currentExpiry;
    const newEnd = addDays(currentExpiry, 30);

    mutate({
      action: "create-cycle",
      body: {
        target_user_id: client.id,
        plan_name: sub?.plan_name || planName,
        cycle_amount: sub?.plan_price || planConfig.price,
        cycle_start: new Date(newStart).toISOString(),
        cycle_end: new Date(newEnd).toISOString(),
      },
    }, {
      onSuccess: () => toast({ title: "Ciclo renovado +30 dias" }),
      onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
    });
  };

  const handleRevert = () => {
    mutate({
      action: "revert-cycle",
      body: { target_user_id: client.id },
    }, {
      onSuccess: () => toast({ title: "Último ciclo revertido" }),
      onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
    });
  };

  const updateCycleStatus = (cycleId: string, status: string) => {
    mutate({
      action: "update-cycle-status",
      body: { cycle_id: cycleId, status, target_user_id: client.id },
    }, {
      onSuccess: () => toast({ title: `Ciclo marcado como ${cycleStatusConfig[status]?.label || status}` }),
      onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
    });
  };

  const handleSuspend = () => {
    mutate({
      action: "update-subscription",
      body: {
        target_user_id: client.id,
        plan_name: sub?.plan_name || planName,
        plan_price: sub?.plan_price || planConfig.price,
        max_instances: sub?.max_instances || planConfig.max_instances,
        started_at: sub?.started_at || new Date(startedAt).toISOString(),
        expires_at: new Date().toISOString(),
      },
    }, {
      onSuccess: () => toast({ title: "Assinatura suspensa" }),
      onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-4">
      {/* ── Assinatura Atual ── */}
      {sub && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Assinatura Atual</p>
            {daysLeft !== null && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                isExpired ? "bg-destructive/15 text-destructive" : isExpiring ? "bg-yellow-500/15 text-yellow-500" : "bg-primary/10 text-primary"
              }`}>
                {isExpired ? "Vencida" : isExpiring ? `${daysLeft}d restantes` : `${daysLeft}d restantes`}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Plano", value: sub.plan_name },
              { label: "Valor", value: `R$ ${Number(sub.plan_price).toFixed(2)}` },
              { label: "Instâncias", value: sub.max_instances },
              { label: "Início", value: sub.started_at ? toLocalDate(sub.started_at) : "—" },
              { label: "Vencimento", value: sub.expires_at ? toLocalDate(sub.expires_at) : "—", className: isExpired ? "text-destructive" : isExpiring ? "text-yellow-500" : "" },
            ].map((item, i) => (
              <div key={i} className="bg-muted/30 rounded-lg px-3 py-2">
                <p className="text-[9px] text-muted-foreground uppercase font-medium">{item.label}</p>
                <p className={`text-sm font-semibold text-foreground mt-0.5 ${item.className || ""}`}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Alterar Plano ── */}
      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Alterar Plano</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Plano */}
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-medium">Plano</Label>
            <Select value={planName} onValueChange={(val) => { 
              setPlanName(val); 
              setStartedAt(new Date().toISOString().split("T")[0]);
              if (val === "Sem plano") {
                setManualPrice("");
                setIncludeNotification(false);
              }
            }}>
              <SelectTrigger className="w-full h-9 rounded-lg border-border bg-muted/30 text-foreground text-sm">
                <SelectValue placeholder="Selecione um plano" />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(PLANS).map(p => (
                  <SelectItem key={p} value={p}>
                    {p === "Sem plano" ? "Sem plano" : `${p} — ${PLANS[p].max_instances} inst. — R$ ${PLANS[p].price.toFixed(2)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Valor do Plano */}
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-medium flex items-center gap-1">
              Valor do Plano
              {manualPrice !== "" && (
                <span className="text-primary text-[8px] bg-primary/10 px-1 rounded">manual</span>
              )}
            </Label>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">R$</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  disabled={isNoPlan}
                  value={isNoPlan ? "0" : (manualPrice !== "" ? manualPrice : autoTotal.toFixed(2))}
                  onFocus={e => {
                    if (!isNoPlan && manualPrice === "") setManualPrice(e.target.value);
                  }}
                  onChange={e => {
                    if (isNoPlan) return;
                    const v = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".");
                    setManualPrice(v);
                  }}
                  className="bg-muted/30 border-border text-foreground h-9 rounded-lg pl-9"
                />
              </div>
              {manualPrice !== "" && (
                <Button size="sm" variant="ghost" onClick={() => setManualPrice("")} className="h-9 px-2 text-[10px] text-muted-foreground hover:text-foreground shrink-0">
                  Auto
                </Button>
              )}
            </div>
            {includeNotification && (
              <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full whitespace-nowrap">
                {isTrial ? "Relatório incluso" : `Relatório + R$ ${NOTIFICATION_PRICE.toFixed(2)}`}
              </span>
            )}
          </div>

          {/* Data de Início */}
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-medium">Data de Início</Label>
            <Input type="date" value={startedAt} onChange={e => setStartedAt(e.target.value)} className="bg-muted/30 border-border text-foreground h-9 rounded-lg" />
          </div>

          {/* Trial days */}
          {isTrial && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground uppercase font-medium">Dias de Trial</Label>
              <Input type="number" min={1} max={90} value={trialDays === 0 ? "" : trialDays} onChange={e => setTrialDays(e.target.value === "" ? 0 : Math.max(1, Math.min(90, Number(e.target.value))))} className="bg-muted/30 border-border text-foreground h-9 rounded-lg" />
            </div>
          )}

          {/* Data de Vencimento */}
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-medium flex items-center gap-1">
              Vencimento
              {manualExpires ? (
                <span className="text-primary text-[8px] bg-primary/10 px-1 rounded">manual</span>
              ) : (
                <span className="text-[8px] text-muted-foreground/60">início + {cycleDays}d</span>
              )}
            </Label>
            <div className="flex items-center gap-1.5">
              <Input 
                type="date" 
                value={manualExpires || expiresAt} 
                onChange={e => setManualExpires(e.target.value)} 
                className="bg-muted/30 border-border text-foreground h-9 rounded-lg flex-1" 
              />
              {manualExpires && (
                <Button size="sm" variant="ghost" onClick={() => setManualExpires("")} className="h-9 px-2 text-[10px] text-muted-foreground hover:text-foreground shrink-0">
                  Auto
                </Button>
              )}
            </div>
          </div>

          {/* Relatório via WhatsApp */}
          <div className="md:col-span-2">
            <div 
              onClick={() => setIncludeNotification(!includeNotification)}
              className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                includeNotification 
                  ? "border-emerald-500/40 bg-emerald-500/5" 
                  : "border-border bg-muted/20 hover:border-muted-foreground/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${includeNotification ? "bg-emerald-500/15" : "bg-muted/50"}`}>
                  <Radio size={15} className={includeNotification ? "text-emerald-500" : "text-muted-foreground"} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Relatório via WhatsApp</p>
                  <p className="text-[10px] text-muted-foreground">Alertas de desconexão, campanhas e aquecimento</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-semibold ${includeNotification ? "text-emerald-500" : "text-muted-foreground"}`}>
                  {isTrial ? "Grátis" : `+ R$ ${NOTIFICATION_PRICE.toFixed(2)}/mês`}
                </span>
                <Switch checked={includeNotification} onCheckedChange={setIncludeNotification} />
              </div>
            </div>
          </div>

          {/* Resposta Automática Inteligente */}
          <div className="md:col-span-2">
            <div className={`p-3 rounded-lg border transition-all ${
              autoreplyTier !== "none"
                ? "border-violet-500/40 bg-violet-500/5"
                : "border-border bg-muted/20"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${autoreplyTier !== "none" ? "bg-violet-500/15" : "bg-muted/50"}`}>
                    <BotMessageSquare size={15} className={autoreplyTier !== "none" ? "text-violet-500" : "text-muted-foreground"} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">Resposta Automática Inteligente</p>
                    <p className="text-[10px] text-muted-foreground">Fluxos de resposta automática por WhatsApp</p>
                  </div>
                </div>
                <Select value={autoreplyTier} onValueChange={(v) => setAutoreplyTier(v as AutoreplyTier)}>
                  <SelectTrigger className="w-[160px] h-8 rounded-lg border-border bg-muted/30 text-foreground text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Desativado</SelectItem>
                    <SelectItem value="basic">Básico — R$ 29,90/mês</SelectItem>
                    <SelectItem value="pro">Pro — R$ 49,90/mês</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {autoreplyTier !== "none" && (
                <div className="mt-2 ml-11 flex gap-2">
                  <span className="text-[9px] bg-violet-500/10 text-violet-400 px-1.5 py-0.5 rounded-full">
                    {autoreplyTier === "basic" ? "Até 3 fluxos" : "Fluxos ilimitados + automação"}
                  </span>
                  <span className="text-[9px] bg-violet-500/10 text-violet-400 px-1.5 py-0.5 rounded-full">
                    {isTrial ? "Grátis" : `+ R$ ${AUTOREPLY_PRICES[autoreplyTier].toFixed(2)}/mês`}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Ações ── */}
      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Ações do Plano</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {/* Salvar */}
          <Button onClick={handleSave} disabled={loading} size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground h-9 text-xs">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save size={13} className="mr-1.5" />}
            {isNoPlan ? "Remover Plano" : isTrial ? `Ativar Trial` : "Salvar Plano"}
          </Button>

          {/* Provisionar */}
          {sub && !isNoPlan && (
            <Button onClick={() => handleAutoProvision(sub?.max_instances || planConfig.max_instances)} disabled={loading} size="sm" variant="outline" className="border-primary/30 text-primary hover:bg-primary/5 h-9 text-xs">
              {provisioning ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Zap size={13} className="mr-1.5" />}
              Provisionar
            </Button>
          )}

          {/* Renovar */}
          {sub && (
            <Button onClick={handleRenew} disabled={loading} size="sm" variant="outline" className="border-border text-muted-foreground hover:text-foreground h-9 text-xs">
              <RefreshCw size={13} className="mr-1.5" /> +30 dias
            </Button>
          )}

          {/* Reverter */}
          {cycles.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="border-border text-muted-foreground hover:text-foreground h-9 text-xs" disabled={loading}>
                  <Undo2 size={13} className="mr-1.5" /> Reverter Ciclo
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-card border-border">
                <AlertDialogHeader>
                  <AlertDialogTitle>Reverter última renovação?</AlertDialogTitle>
                  <AlertDialogDescription className="text-muted-foreground">
                    O ciclo mais recente será excluído e o vencimento será recalculado.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-border">Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRevert} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Reverter</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Suspender */}
          {sub && !isExpired && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/5 h-9 text-xs" disabled={loading}>
                  <PauseCircle size={13} className="mr-1.5" /> Suspender
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-card border-border">
                <AlertDialogHeader>
                  <AlertDialogTitle>Suspender assinatura?</AlertDialogTitle>
                  <AlertDialogDescription className="text-muted-foreground">Isso forçará o vencimento imediato.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-border">Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSuspend} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Suspender</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

    </div>
  );
};

export default ClientPlanTab;
