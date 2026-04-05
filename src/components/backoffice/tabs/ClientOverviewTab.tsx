import { useState } from "react";
import type { AdminUser } from "@/hooks/useAdmin";
import { User, CreditCard, Server, Clock, AlertTriangle, KeyRound, LogOut, ShieldAlert, ShieldCheck, Coins, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminAction } from "@/hooks/useAdmin";
import { memo } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Props { client: AdminUser; detail: any; }

function getDaysLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
}

const ClientOverviewTab = memo(({ client, detail }: Props) => {
  const sub = detail?.subscription;
  const devices = detail?.devices || [];
  const daysLeft = getDaysLeft(client.plan_expires_at);
  const isExpired = daysLeft !== null && daysLeft <= 0;
  const isExpiring = daysLeft !== null && daysLeft > 0 && daysLeft <= 3;
  const maxInst = sub?.max_instances ?? client.max_instances ?? 0;
  const connectedCount = devices.filter((d: any) => d.status === "Connected" || d.status === "Ready").length;
  const { mutate, isPending, invalidateClient } = useAdminAction();
  const { toast } = useToast();
  const [addCreditsAmount, setAddCreditsAmount] = useState("");
  const [addingCredits, setAddingCredits] = useState(false);
  const [creditBalance, setCreditBalance] = useState<number | null>(detail?.prospeccao_credits?.balance ?? null);

  const handleAddCredits = async () => {
    const amount = parseInt(addCreditsAmount);
    if (!amount || amount <= 0) { toast({ title: "Valor inválido", variant: "destructive" }); return; }
    setAddingCredits(true);
    try {
      const { data, error } = await supabase.rpc("credit_prospeccao_balance", {
        p_user_id: client.id,
        p_amount: amount,
        p_description: `Créditos adicionados via backoffice`,
      });
      if (error) throw error;
      const result = data as any;
      setCreditBalance(result?.balance ?? (creditBalance ?? 0) + amount);
      setAddCreditsAmount("");
      toast({ title: `${amount} créditos adicionados!` });
    } catch (err: any) {
      toast({ title: "Erro ao adicionar créditos", description: err.message, variant: "destructive" });
    } finally { setAddingCredits(false); }
  };

  const resetPassword = () => {
    mutate(
      { action: "reset-password", body: { target_user_id: client.id, email: client.email } },
      { onSuccess: () => toast({ title: "Link de redefinição enviado" }), onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }) }
    );
  };
  const forceLogout = () => {
    mutate(
      { action: "force-logout", body: { target_user_id: client.id } },
      { onSuccess: () => toast({ title: "Sessões encerradas" }), onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }) }
    );
  };
  const toggleStatus = (s: string) => {
    mutate(
      { action: "toggle-status", body: { target_user_id: client.id, new_status: s } },
      { onSuccess: () => { toast({ title: `Status: ${s}` }); invalidateClient(client.id); }, onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }) }
    );
  };

  return (
    <div className="space-y-5">
      {/* Alerts */}
      {isExpired && (
        <div className="flex items-center gap-2.5 bg-destructive/8 border border-destructive/20 rounded-lg px-4 py-3 text-sm text-destructive">
          <AlertTriangle size={15} /> Assinatura vencida — criação de instâncias bloqueada
        </div>
      )}
      {isExpiring && (
        <div className="flex items-center gap-2.5 bg-yellow-500/8 border border-yellow-500/20 rounded-lg px-4 py-3 text-sm text-yellow-500">
          <Clock size={15} /> Vence em {daysLeft} dia{daysLeft !== 1 ? "s" : ""}
        </div>
      )}

      {/* Info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Account */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <User size={13} className="text-primary" />
            </div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Conta</span>
          </div>
          <p className="text-sm font-semibold text-foreground truncate">{client.full_name || "—"}</p>
          <div className="space-y-0.5">
            <p className="text-[11px] text-muted-foreground truncate">{client.email}</p>
            <p className="text-[11px] text-muted-foreground">{client.phone || "Sem telefone"}</p>
          </div>
          <div className="pt-1 border-t border-border/50 space-y-0.5">
            <p className="text-[10px] text-muted-foreground/70">Cadastro: {new Date(client.created_at).toLocaleDateString("pt-BR")}</p>
            <p className="text-[10px] text-muted-foreground/70">Login: {client.last_sign_in_at ? new Date(client.last_sign_in_at).toLocaleString("pt-BR") : "Nunca"}</p>
          </div>
        </div>

        {/* Plan */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <CreditCard size={13} className="text-primary" />
            </div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Plano</span>
          </div>
          <p className="text-sm font-semibold text-foreground">{sub?.plan_name || "Sem plano"}</p>
          <div className="space-y-0.5">
            <p className="text-[11px] text-muted-foreground">R$ {sub ? Number(sub.plan_price).toFixed(2) : "0.00"}/mês</p>
            <p className="text-[11px] text-muted-foreground">{maxInst} instâncias</p>
          </div>
          <div className="pt-1 border-t border-border/50">
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              isExpired ? "bg-destructive/10 text-destructive" : isExpiring ? "bg-yellow-500/10 text-yellow-500" : sub ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                isExpired ? "bg-destructive" : isExpiring ? "bg-yellow-500" : sub ? "bg-emerald-500" : "bg-muted-foreground"
              }`} />
              {isExpired ? "Vencida" : isExpiring ? `Vence em ${daysLeft}d` : sub ? "Ativa" : "Inativa"}
            </span>
          </div>
        </div>

        {/* Instances */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Server size={13} className="text-emerald-500" />
            </div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Instâncias</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-foreground">{devices.length}</span>
            <span className="text-sm text-muted-foreground">/ {maxInst}</span>
          </div>
          <div className="space-y-1">
            <div className="w-full h-1.5 bg-muted/30 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  devices.length >= maxInst && maxInst > 0 ? "bg-destructive" : "bg-primary"
                }`}
                style={{ width: `${maxInst > 0 ? Math.min((devices.length / maxInst) * 100, 100) : 0}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">{connectedCount} online</p>
          </div>
        </div>

        {/* Expiration */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
              isExpired ? "bg-destructive/10" : isExpiring ? "bg-yellow-500/10" : "bg-primary/10"
            }`}>
              <Clock size={13} className={isExpired ? "text-destructive" : isExpiring ? "text-yellow-500" : "text-primary"} />
            </div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Renovação</span>
          </div>
          <p className={`text-2xl font-bold ${isExpired ? "text-destructive" : isExpiring ? "text-yellow-500" : "text-foreground"}`}>
            {daysLeft !== null ? (isExpired ? "Vencido" : `${daysLeft}d`) : "—"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {sub?.expires_at ? new Date(sub.expires_at).toLocaleDateString("pt-BR") : "—"}
          </p>
        </div>
      </div>

      {/* Prospecting Credits */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
            <Coins size={13} className="text-primary" />
          </div>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Créditos Prospecção</span>
        </div>
        <p className="text-2xl font-bold text-foreground">{creditBalance ?? "—"}</p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="Qtd"
            value={addCreditsAmount}
            onChange={e => setAddCreditsAmount(e.target.value)}
            className="h-8 w-24 text-xs"
          />
          <Button size="sm" className="h-8 text-xs gap-1" onClick={handleAddCredits} disabled={addingCredits}>
            <Plus size={12} /> Adicionar
          </Button>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Ações da Conta</p>
        <div className="flex flex-wrap gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 rounded-lg" disabled={isPending}>
                <KeyRound size={13} /> Nova Senha
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Resetar senha?</AlertDialogTitle>
                <AlertDialogDescription>Um link de redefinição será enviado para {client.email}.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={resetPassword}>Confirmar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 rounded-lg" disabled={isPending}>
                <LogOut size={13} /> Encerrar Sessões
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Encerrar todas as sessões?</AlertDialogTitle>
                <AlertDialogDescription>O usuário {client.full_name || client.email} será deslogado de todos os dispositivos.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={forceLogout} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Encerrar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {client.status === "active" ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 rounded-lg border-destructive/20 text-destructive hover:bg-destructive/5" disabled={isPending}>
                  <ShieldAlert size={13} /> Suspender Conta
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Suspender esta conta?</AlertDialogTitle>
                  <AlertDialogDescription>O usuário será bloqueado e não poderá acessar a plataforma.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => toggleStatus("suspended")} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Suspender</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 rounded-lg border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/5" onClick={() => toggleStatus("active")} disabled={isPending}>
              <ShieldCheck size={13} /> Reativar Conta
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});

ClientOverviewTab.displayName = "ClientOverviewTab";
export default ClientOverviewTab;