import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAdminAction, type AdminUser } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, AlertTriangle, Server, Bell, User, Building2, Phone, Mail, ShieldAlert, Copy, Check } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";


interface Props {
  client: AdminUser;
  detail: any;
}

const ClientProfileTab = ({ client, detail }: Props) => {
  const profile = detail?.profile || {};
  const [form, setForm] = useState({
    full_name: profile.full_name || client.full_name || "",
    phone: profile.phone || client.phone || "",
    company: profile.company || client.company || "",
    admin_notes: profile.admin_notes || client.admin_notes || "",
    risk_flag: profile.risk_flag ?? client.risk_flag ?? false,
    status: profile.status || client.status || "active",
    instance_override: profile.instance_override ?? client.instance_override ?? 0,
  });
  const [notificacaoLiberada, setNotificacaoLiberada] = useState(profile.notificacao_liberada ?? false);
  const [copiedToken, setCopiedToken] = useState(false);
  const { mutate, isPending, invalidateClient } = useAdminAction();
  const { toast } = useToast();
  const monitorToken = profile.whatsapp_monitor_token || "";

  const planLimit = client.max_instances || 0;
  const totalAllowed = planLimit + (form.instance_override || 0);


  const handleSave = () => {
    mutate(
      { action: "update-client", body: { target_user_id: client.id, ...form } },
      {
        onSuccess: () => { toast({ title: "Dados atualizados com sucesso" }); invalidateClient(client.id); },
        onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
      }
    );
  };

  const statusLabel: Record<string, string> = { active: "Ativo", suspended: "Suspenso", cancelled: "Cancelado" };
  const statusColor: Record<string, string> = { active: "text-emerald-400", suspended: "text-amber-400", cancelled: "text-red-400" };

  return (
    <div className="space-y-4">

      {/* Grid: Dados + Configurações lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Coluna 1: Dados Pessoais */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <User size={14} className="text-primary" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dados Pessoais</h3>
          </div>

          <div className="space-y-2.5">
            <div>
              <Label className="text-muted-foreground text-[10px] uppercase tracking-wide">Nome Completo</Label>
              <Input value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} className="mt-1 h-8 text-xs" />
            </div>
            <div>
              <Label className="text-muted-foreground text-[10px] uppercase tracking-wide flex items-center gap-1">
                <Mail size={10} /> E-mail
              </Label>
              <Input value={client.email} disabled className="mt-1 h-8 text-xs opacity-60" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-muted-foreground text-[10px] uppercase tracking-wide flex items-center gap-1">
                  <Phone size={10} /> Telefone
                </Label>
                <Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="mt-1 h-8 text-xs" />
              </div>
              <div>
                <Label className="text-muted-foreground text-[10px] uppercase tracking-wide flex items-center gap-1">
                  <Building2 size={10} /> Empresa
                </Label>
                <Input value={form.company} onChange={e => setForm({...form, company: e.target.value})} className="mt-1 h-8 text-xs" placeholder="Opcional" />
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground text-[10px] uppercase tracking-wide">Status</Label>
              <select
                value={form.status}
                onChange={e => setForm({...form, status: e.target.value})}
                className="mt-1 w-full h-8 rounded-md border border-border bg-background text-foreground px-2 text-xs"
              >
                <option value="active">Ativo</option>
                <option value="suspended">Suspenso</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>
          </div>
        </div>

        {/* Coluna 2: Configurações */}
        <div className="space-y-4">
          {/* Override */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Server size={14} className="text-purple-400" />
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Override de Instâncias</h4>
            </div>
            <div className="grid grid-cols-3 gap-2 items-end">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Limite</p>
                <p className="text-lg font-bold text-foreground">{planLimit}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Override</p>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.instance_override}
                  onChange={e => setForm({...form, instance_override: Math.max(0, parseInt(e.target.value) || 0)})}
                  className="h-8 w-20 text-xs"
                />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</p>
                <p className="text-lg font-bold text-primary">{totalAllowed}</p>
              </div>
            </div>
            {form.instance_override > 0 && (
              <p className="text-[10px] text-amber-500/80 mt-2">
                ⚠ +{form.instance_override} instâncias extras ativas
              </p>
            )}
          </div>

          {/* Notificação */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-amber-400" />
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notificação WhatsApp</h4>
                <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${notificacaoLiberada ? "text-emerald-400 border-emerald-500/30" : "text-muted-foreground"}`}>
                  {notificacaoLiberada ? "Liberada" : "Bloqueada"}
                </Badge>
              </div>
              <Switch
                checked={notificacaoLiberada}
                onCheckedChange={(v) => {
                  setNotificacaoLiberada(v);
                  mutate(
                    { action: "toggle-notification", body: { target_user_id: client.id, enabled: v } },
                    {
                      onSuccess: (data: any) => {
                        const msg = v ? "Notificação liberada" : "Notificação bloqueada";
                        const desc = v && data?.monitor_token ? "Token de monitoramento provisionado automaticamente" : undefined;
                        toast({ title: msg, description: desc });
                      },
                      onError: (e) => {
                        toast({ title: "Erro", description: e.message, variant: "destructive" });
                        setNotificacaoLiberada(!v);
                      },
                    }
                  );
                }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Ao liberar, instâncias de notificação serão ativadas e um webhook será disparado.
            </p>
            {monitorToken && (
              <div className="mt-3 p-2.5 bg-muted/30 rounded-lg border border-border">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Token de Monitoramento</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-[11px] font-mono text-foreground/80 bg-background px-2 py-1 rounded-md flex-1 break-all select-all">
                    {monitorToken}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(monitorToken);
                      setCopiedToken(true);
                      setTimeout(() => setCopiedToken(false), 1500);
                    }}
                    className="text-muted-foreground/60 hover:text-foreground transition-colors shrink-0 p-1"
                  >
                    {copiedToken ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Observações */}
      <div className="bg-card border border-border rounded-xl p-4">
        <Label className="text-muted-foreground text-[10px] uppercase tracking-wide">Observações Internas (admin)</Label>
        <Textarea
          value={form.admin_notes}
          onChange={e => setForm({...form, admin_notes: e.target.value})}
          className="mt-2 text-xs"
          rows={3}
          placeholder="Anotações privadas sobre este cliente..."
        />
      </div>

      {/* Save */}
      <Button onClick={handleSave} disabled={isPending} size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground">
        {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save size={14} className="mr-1.5" />}
        Salvar Alterações
      </Button>
    </div>
  );
};

export default ClientProfileTab;
