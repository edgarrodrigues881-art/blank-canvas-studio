import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAdminAction, type AdminUser } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Wifi, WifiOff, Loader2, Server, AlertTriangle, Ban, ArrowUpCircle, Lock, Key, Save, RefreshCcw } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const PLANS: Record<string, { price: number; max_instances: number }> = {
  Essencial: { price: 89.9, max_instances: 5 },
  Start: { price: 159.9, max_instances: 10 },
  Pro: { price: 349.9, max_instances: 30 },
  Scale: { price: 549.9, max_instances: 50 },
  Elite: { price: 999.9, max_instances: 100 },
};
const PLAN_ORDER = ["Essencial", "Start", "Pro", "Scale", "Elite"];

interface Props { client: AdminUser; detail: any; }

const statusConfig: Record<string, { label: string; color: string; dot: string; icon: React.ElementType }> = {
  Connected: { label: "Conectada", color: "text-green-500", dot: "bg-green-500", icon: Wifi },
  Disconnected: { label: "Desconectada", color: "text-muted-foreground", dot: "bg-muted-foreground", icon: WifiOff },
  connecting: { label: "Conectando", color: "text-yellow-500", dot: "bg-yellow-500", icon: Wifi },
  Blocked: { label: "Bloqueada", color: "text-destructive", dot: "bg-destructive", icon: Lock },
};

const typeLabels: Record<string, { label: string; color: string }> = {
  principal: { label: "Principal", color: "bg-primary/10 text-primary" },
  contingencia: { label: "Contingência", color: "bg-yellow-500/10 text-yellow-500" },
  notificacao: { label: "Notificação", color: "bg-amber-500/10 text-amber-500" },
};

const ClientDevicesTab = ({ client, detail }: Props) => {
  const allDevices = detail?.devices || [];
  // Separate report_wa devices from plan-counted devices
  const devices = allDevices.filter((d: any) => d.login_type !== "report_wa");
  const reportDevices = allDevices.filter((d: any) => d.login_type === "report_wa");
  const subscription = detail?.subscription;
  const maxInstances = subscription?.max_instances ?? 0;
  const currentPlan = subscription?.plan_name || "Sem plano";
  const hasActivePlan = !!subscription && currentPlan !== "Sem plano";
  const [showCreate, setShowCreate] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showNoPlan, setShowNoPlan] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingReportDevice, setEditingReportDevice] = useState<string | null>(null);
  const [reportToken, setReportToken] = useState("");
  const [reportBaseUrl, setReportBaseUrl] = useState("");
  
  const { mutate, isPending, invalidateClient, invalidateDashboard } = useAdminAction();
  const { toast } = useToast();

  const atLimit = devices.length >= maxInstances;
  const isExpired = subscription?.expires_at ? new Date(subscription.expires_at).getTime() < Date.now() : false;
  const isBlocked = client.status === "suspended" || client.status === "cancelled";
  const noPlan = !hasActivePlan || isExpired;
  const canCreate = !atLimit && !noPlan && !isBlocked;

  const currentPlanIndex = PLAN_ORDER.indexOf(currentPlan);
  const nextPlan = currentPlanIndex >= 0 && currentPlanIndex < PLAN_ORDER.length - 1 ? PLAN_ORDER[currentPlanIndex + 1] : null;
  const nextPlanConfig = nextPlan ? PLANS[nextPlan] : null;

  const usagePercent = maxInstances > 0 ? Math.round((devices.length / maxInstances) * 100) : 0;
  const connectedCount = devices.filter((d: any) => d.status === "Connected").length;
  const disconnectedWithoutToken = devices.filter((d: any) => d.status === "Disconnected" && !d.uazapi_token).length;

  const bulkReassign = () => {
    mutate(
      { action: "bulk-reassign-tokens", body: { target_user_id: client.id } },
      {
        onSuccess: (data: any) => {
          toast({ title: `✅ ${data.reassigned} instância(s) reatribuída(s)`, description: data.reassigned < data.total_disconnected ? `${data.total_disconnected - data.reassigned} sem token disponível` : "Tokens atribuídos com sucesso" });
          invalidateClient(client.id);
        },
        onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
      }
    );
  };

  let blockReason = "";
  if (isBlocked) blockReason = `Conta ${client.status === "suspended" ? "suspensa" : "cancelada"}`;
  else if (noPlan) blockReason = !hasActivePlan ? "Sem plano ativo" : "Assinatura vencida";
  else if (atLimit) blockReason = `Limite atingido (${devices.length}/${maxInstances})`;

  const handleCreateClick = () => {
    if (noPlan || isBlocked) { setShowNoPlan(true); return; }
    if (atLimit && nextPlan) { setShowUpgrade(true); return; }
    if (canCreate) setShowCreate(true);
  };

  const createDevice = () => {
    if (!newName.trim()) return;
    mutate(
      { action: "create-device", body: { target_user_id: client.id, name: newName.trim(), login_type: "principal" } },
      {
        onSuccess: () => { toast({ title: "Instância criada" }); setNewName(""); setShowCreate(false); invalidateClient(client.id); },
        onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
      }
    );
  };

  const deleteDevice = (id: string, name: string) => {
    mutate(
      { action: "delete-device", body: { target_user_id: client.id, device_id: id, device_name: name } },
      { onSuccess: () => { toast({ title: "Instância removida" }); invalidateClient(client.id); invalidateDashboard(); }, onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }) }
    );
  };

  const saveReportCredentials = (deviceId: string) => {
    if (!reportToken.trim() || !reportBaseUrl.trim()) {
      toast({ title: "Preencha Token e URL Base", variant: "destructive" });
      return;
    }
    mutate(
      { action: "set-report-credentials", body: { target_user_id: client.id, device_id: deviceId, uazapi_token: reportToken, uazapi_base_url: reportBaseUrl } },
      {
        onSuccess: () => {
          toast({ title: "Credenciais de relatório salvas" });
          setEditingReportDevice(null);
          setReportToken("");
          setReportBaseUrl("");
          invalidateClient(client.id);
        },
        onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
      }
    );
  };

  const upgradePlan = () => {
    if (!nextPlan || !nextPlanConfig) return;
    const now = new Date();
    mutate({
      action: "update-subscription",
      body: {
        target_user_id: client.id, plan_name: nextPlan, plan_price: nextPlanConfig.price,
        max_instances: nextPlanConfig.max_instances, started_at: now.toISOString(),
        expires_at: new Date(now.getTime() + 30 * 86400000).toISOString(),
      },
    }, {
      onSuccess: () => { toast({ title: `Migrado para ${nextPlan}` }); setShowUpgrade(false); invalidateClient(client.id); invalidateDashboard(); },
      onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
    });
  };

  const getDeviceType = (d: any) => {
    if (d.instance_type === "notificacao") return "notificacao";
    if (d.login_type === "contingencia") return "contingencia";
    return "principal";
  };

  return (
    <div className="space-y-4">
      {/* ── Header com resumo ── */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Instâncias</p>
          <div className="flex items-center gap-2">
            {disconnectedWithoutToken > 0 && (
              <Button size="sm" variant="outline" onClick={bulkReassign} className="border-primary/30 text-primary hover:bg-primary/10 h-8 text-xs px-3" disabled={isPending}>
                {isPending ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <RefreshCcw size={12} className="mr-1.5" />}
                Reatribuir Tokens ({disconnectedWithoutToken})
              </Button>
            )}
            <Button size="sm" onClick={handleCreateClick} className="bg-primary hover:bg-primary/90 text-primary-foreground h-8 text-xs px-3" disabled={isPending || isBlocked}>
              {(isBlocked || noPlan) ? <Ban size={12} className="mr-1.5" /> : atLimit ? <ArrowUpCircle size={12} className="mr-1.5" /> : <Plus size={12} className="mr-1.5" />}
              {noPlan ? "Sem Plano" : atLimit && !isBlocked ? "Upgrade" : "Nova Instância"}
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="bg-muted/30 rounded-lg px-3 py-2">
            <p className="text-[9px] text-muted-foreground uppercase font-medium">Criadas</p>
            <p className="text-lg font-bold text-foreground">{devices.length}<span className="text-xs font-normal text-muted-foreground"> / {maxInstances}</span></p>
          </div>
          <div className="bg-muted/30 rounded-lg px-3 py-2">
            <p className="text-[9px] text-muted-foreground uppercase font-medium">Online</p>
            <p className="text-lg font-bold text-green-500">{connectedCount}</p>
          </div>
          <div className="bg-muted/30 rounded-lg px-3 py-2">
            <p className="text-[9px] text-muted-foreground uppercase font-medium">Ocupação</p>
            <p className="text-lg font-bold text-foreground">{usagePercent}%</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-muted/50 rounded-full h-1.5">
          <div className={`h-1.5 rounded-full transition-all ${usagePercent >= 90 ? "bg-destructive" : usagePercent >= 70 ? "bg-yellow-500" : "bg-primary"}`} style={{ width: `${Math.min(usagePercent, 100)}%` }} />
        </div>
      </div>

      {/* ── Alerta de bloqueio ── */}
      {!canCreate && blockReason && (
        <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2 text-xs text-destructive">
          <AlertTriangle size={13} className="shrink-0" /> {blockReason}
        </div>
      )}

      {/* ── Tabela de Instâncias ── */}
      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Lista de Instâncias</p>
        {devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <Server size={28} className="mb-2 opacity-30" />
            <p className="text-xs">Nenhuma instância criada</p>
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40 text-muted-foreground text-[9px] uppercase tracking-wider">
                  <th className="text-left px-3 py-2">Nome</th>
                  <th className="text-left px-3 py-2">Tipo</th>
                  <th className="text-left px-3 py-2">Número</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Criada em</th>
                  <th className="text-right px-3 py-2">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {devices.map((d: any) => {
                  const st = statusConfig[d.status] || statusConfig.Disconnected;
                  const tp = typeLabels[getDeviceType(d)] || typeLabels.principal;
                  const StIcon = st.icon;
                  return (
                    <tr key={d.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2 text-foreground font-medium">{d.name}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${tp.color}`}>{tp.label}</span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{d.number || "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] font-semibold flex items-center gap-1 ${st.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{new Date(d.created_at).toLocaleDateString("pt-BR")}</td>
                      <td className="px-3 py-2 text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive/50 hover:text-destructive hover:bg-destructive/10 h-7 w-7 rounded-lg"><Trash2 size={13} /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-card border-border">
                            <AlertDialogHeader><AlertDialogTitle>Remover "{d.name}"?</AlertDialogTitle><AlertDialogDescription className="text-muted-foreground">Ação permanente. O token será liberado para reutilização.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel className="border-border">Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteDevice(d.id, d.name)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Instâncias de Relatório (fora do limite do plano) ── */}
      {reportDevices.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Instâncias de Relatório <span className="text-muted-foreground/60">(fora do limite do plano)</span></p>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40 text-muted-foreground text-[9px] uppercase tracking-wider">
                  <th className="text-left px-3 py-2">Nome</th>
                  <th className="text-left px-3 py-2">Número</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">API</th>
                  <th className="text-left px-3 py-2">Criada em</th>
                  <th className="text-right px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reportDevices.map((d: any) => {
                  const st = statusConfig[d.status] || statusConfig.Disconnected;
                  const hasCredentials = !!d.uazapi_token && !!d.uazapi_base_url;
                  return (
                    <>
                      <tr key={d.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2 text-foreground font-medium">{d.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{d.number || "—"}</td>
                        <td className="px-3 py-2"><span className={`text-[10px] font-semibold flex items-center gap-1 ${st.color}`}><span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}</span></td>
                        <td className="px-3 py-2">
                          {hasCredentials ? (
                            <span className="text-[10px] font-semibold text-primary flex items-center gap-1"><Key size={10} />Configurada</span>
                          ) : (
                            <span className="text-[10px] font-semibold text-destructive/70 flex items-center gap-1"><AlertTriangle size={10} />Pendente</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{new Date(d.created_at).toLocaleDateString("pt-BR")}</td>
                        <td className="px-3 py-2 text-right flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-primary/60 hover:text-primary hover:bg-primary/10 h-7 w-7 rounded-lg"
                            onClick={() => {
                              if (editingReportDevice === d.id) {
                                setEditingReportDevice(null);
                              } else {
                                setEditingReportDevice(d.id);
                                setReportToken(d.uazapi_token || "");
                                setReportBaseUrl(d.uazapi_base_url || "");
                              }
                            }}
                          >
                            <Key size={13} />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive/50 hover:text-destructive hover:bg-destructive/10 h-7 w-7 rounded-lg"><Trash2 size={13} /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-card border-border">
                              <AlertDialogHeader><AlertDialogTitle>Remover "{d.name}"?</AlertDialogTitle><AlertDialogDescription className="text-muted-foreground">Ação permanente.</AlertDialogDescription></AlertDialogHeader>
                              <AlertDialogFooter><AlertDialogCancel className="border-border">Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteDevice(d.id, d.name)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </td>
                      </tr>
                      {editingReportDevice === d.id && (
                        <tr key={`${d.id}-creds`}>
                          <td colSpan={6} className="px-3 py-3 bg-muted/10">
                            <div className="flex flex-col sm:flex-row gap-2 items-end">
                              <div className="flex-1 space-y-1">
                                <Label className="text-[9px] text-muted-foreground uppercase font-medium">Token API</Label>
                                <Input
                                  placeholder="Token da instância"
                                  value={reportToken}
                                  onChange={(e) => setReportToken(e.target.value)}
                                  className="h-8 text-[11px] bg-card border-border rounded-lg font-mono"
                                />
                              </div>
                              <div className="flex-1 space-y-1">
                                <Label className="text-[9px] text-muted-foreground uppercase font-medium">URL Base</Label>
                                <Input
                                  placeholder="https://api.exemplo.com"
                                  value={reportBaseUrl}
                                  onChange={(e) => setReportBaseUrl(e.target.value)}
                                  className="h-8 text-[11px] bg-card border-border rounded-lg font-mono"
                                />
                              </div>
                              <Button
                                size="sm"
                                className="bg-primary hover:bg-primary/90 text-primary-foreground h-8 px-4"
                                onClick={() => saveReportCredentials(d.id)}
                                disabled={isPending}
                              >
                                {isPending ? <Loader2 size={12} className="animate-spin mr-1" /> : <Save size={12} className="mr-1" />}
                                Salvar
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader><DialogTitle>Nova Instância</DialogTitle></DialogHeader>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-medium">Nome</Label>
            <Input placeholder="Nome da instância" value={newName} onChange={e => setNewName(e.target.value)} className="bg-muted/30 border-border h-9 rounded-lg" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} className="border-border text-muted-foreground">Cancelar</Button>
            <Button onClick={createDevice} disabled={isPending || !newName.trim()} className="bg-primary hover:bg-primary/90 text-primary-foreground" size="sm">
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Plus size={13} className="mr-1.5" />} Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upgrade dialog */}
      <Dialog open={showUpgrade} onOpenChange={setShowUpgrade}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ArrowUpCircle size={16} className="text-primary" />Limite Atingido</DialogTitle>
            <DialogDescription className="text-muted-foreground pt-2 text-xs">
              Plano <strong className="text-foreground">{currentPlan}</strong> permite até {maxInstances} instâncias.
              {nextPlan && nextPlanConfig && <span className="block mt-1.5">Migrar para <strong className="text-primary">{nextPlan}</strong> ({nextPlanConfig.max_instances} inst., R$ {nextPlanConfig.price.toFixed(2)}/mês)?</span>}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowUpgrade(false)} className="border-border text-muted-foreground">Cancelar</Button>
            {nextPlan && <Button onClick={upgradePlan} disabled={isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground" size="sm"><ArrowUpCircle size={13} className="mr-1.5" />Migrar para {nextPlan}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* No Plan dialog */}
      <Dialog open={showNoPlan} onOpenChange={setShowNoPlan}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Ban size={16} className="text-destructive" />Criação Bloqueada</DialogTitle>
            <DialogDescription className="text-muted-foreground pt-2 text-xs">
              {isBlocked
                ? "Conta suspensa/cancelada. Reative na aba Visão Geral."
                : !hasActivePlan
                  ? "Sem plano ativo. Atribua um plano na aba Plano & Assinatura."
                  : "Assinatura vencida. Renove na aba Plano & Assinatura."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNoPlan(false)} className="border-border">Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientDevicesTab;
