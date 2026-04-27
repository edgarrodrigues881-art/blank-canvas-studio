import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useSmartAlerts, type SmartAlert } from "@/hooks/useSmartAlerts";
import { Bell, BellRing, Check, X, Phone, Clock, Sparkles, MessageSquare, Settings as SettingsIcon, Trophy, UserCheck, Eye, CheckCircle2, Users, Loader2, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const ALERT_META: Record<string, { icon: any; label: string; color: string }> = {
  human_request: { icon: UserCheck, label: "Pediu humano", color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
  closing_opportunity: { icon: Trophy, label: "Oportunidade de fechamento", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
};

export default function AISmartAlerts() {
  const { user } = useAuth();
  const { alerts, unreadCount, loading, markRead, markResolved, dismiss, markAllRead } = useSmartAlerts();
  const [filter, setFilter] = useState<"all" | "unread" | "resolved">("all");
  const [tab, setTab] = useState<"alerts" | "settings">("alerts");

  // Settings
  const [config, setConfig] = useState<any>(null);
  const [devices, setDevices] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("ai_alerts_config" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      setConfig(data || {
        enabled: true,
        alert_human_request: true,
        alert_closing_opportunity: true,
        notify_whatsapp: false,
        whatsapp_device_id: null,
        whatsapp_target_phone: "",
      });

      const { data: devs } = await supabase
        .from("devices")
        .select("id, name, number, status")
        .eq("user_id", user.id)
        .order("name");
      setDevices((devs as any[]) || []);
    })();
  }, [user]);

  const saveConfig = async () => {
    if (!user || !config) return;
    const payload = {
      user_id: user.id,
      enabled: config.enabled,
      alert_human_request: config.alert_human_request,
      alert_closing_opportunity: config.alert_closing_opportunity,
      notify_whatsapp: config.notify_whatsapp,
      whatsapp_device_id: config.whatsapp_device_id,
      whatsapp_target_phone: config.whatsapp_target_phone,
    };
    const { error } = await supabase.from("ai_alerts_config" as any).upsert(payload, { onConflict: "user_id" });
    if (error) toast.error("Erro ao salvar"); else toast.success("Configurações salvas");
  };

  const filteredAlerts = alerts.filter((a) => {
    if (filter === "all") return a.status !== "dismissed";
    if (filter === "unread") return a.status === "unread";
    if (filter === "resolved") return a.status === "resolved";
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20">
            <BellRing className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              Alertas Inteligentes
              {unreadCount > 0 && (
                <Badge className="bg-red-500 hover:bg-red-500 text-white">{unreadCount}</Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              A IA te avisa quando um lead pede atendimento humano ou quando há momento ideal de fechar.
            </p>
          </div>
        </div>
        {tab === "alerts" && unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} className="gap-1.5">
            <Eye className="w-3.5 h-3.5" /> Marcar todos como lidos
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/40">
        <button
          onClick={() => setTab("alerts")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition flex items-center gap-2 ${
            tab === "alerts" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Bell className="w-3.5 h-3.5" /> Alertas
        </button>
        <button
          onClick={() => setTab("settings")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition flex items-center gap-2 ${
            tab === "settings" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <SettingsIcon className="w-3.5 h-3.5" /> Configurações
        </button>
      </div>

      {tab === "alerts" && (
        <>
          <div className="flex gap-2 flex-wrap">
            {[
              { k: "all", l: "Todos" },
              { k: "unread", l: `Não lidos (${unreadCount})` },
              { k: "resolved", l: "Resolvidos" },
            ].map((f) => (
              <button
                key={f.k}
                onClick={() => setFilter(f.k as any)}
                className={`px-3 py-1.5 text-xs rounded-full border transition ${
                  filter === f.k
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/30 border-border/40 text-muted-foreground hover:border-primary/40"
                }`}
              >
                {f.l}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : filteredAlerts.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-40" />
              Nenhum alerta no momento. A IA criará alertas automaticamente conforme analisar suas conversas.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAlerts.map((a) => <AlertCard key={a.id} alert={a} onRead={markRead} onResolve={markResolved} onDismiss={dismiss} />)}
            </div>
          )}
        </>
      )}

      {tab === "settings" && config && (
        <div className="space-y-4">
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-medium">Ativar alertas inteligentes</h3>
                <p className="text-xs text-muted-foreground">Quando desligado, a IA não criará novos alertas.</p>
              </div>
              <Switch checked={config.enabled} onCheckedChange={(v) => setConfig({ ...config, enabled: v })} />
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <h3 className="font-medium">Tipos de alerta</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/40">
                <div className="flex items-center gap-3">
                  <UserCheck className="w-4 h-4 text-blue-400" />
                  <div>
                    <p className="text-sm font-medium">Lead pediu atendimento humano</p>
                    <p className="text-xs text-muted-foreground">Quando o lead solicitar explicitamente falar com você</p>
                  </div>
                </div>
                <Switch checked={config.alert_human_request} onCheckedChange={(v) => setConfig({ ...config, alert_human_request: v })} />
              </div>
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/40">
                <div className="flex items-center gap-3">
                  <Trophy className="w-4 h-4 text-emerald-400" />
                  <div>
                    <p className="text-sm font-medium">Oportunidade de fechamento</p>
                    <p className="text-xs text-muted-foreground">Quando a IA identificar momento ideal para você fechar a venda</p>
                  </div>
                </div>
                <Switch checked={config.alert_closing_opportunity} onCheckedChange={(v) => setConfig({ ...config, alert_closing_opportunity: v })} />
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-medium">Notificar no WhatsApp</h3>
                <p className="text-xs text-muted-foreground">A IA enviará uma mensagem para um número ou grupo sempre que precisar de atendimento humano.</p>
              </div>
              <Switch checked={config.notify_whatsapp} onCheckedChange={(v) => setConfig({ ...config, notify_whatsapp: v })} />
            </div>

            {config.notify_whatsapp && (
              <div className="space-y-4 pt-2 border-t border-border/40">
                <div className="space-y-1.5">
                  <Label className="text-xs">Instância que enviará o alerta</Label>
                  <Select
                    value={config.whatsapp_device_id || ""}
                    onValueChange={(v) => setConfig({ ...config, whatsapp_device_id: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione uma instância" /></SelectTrigger>
                    <SelectContent>
                      {devices.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name} {d.status === "ready" ? "✓" : "⚠"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Destination type tabs */}
                <div className="space-y-2">
                  <Label className="text-xs">Para onde enviar</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTargetMode("phone")}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md border text-xs transition ${
                        targetMode === "phone"
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border/40 text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      <Phone className="w-3.5 h-3.5" /> Número individual
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetMode("group")}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md border text-xs transition ${
                        targetMode === "group"
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border/40 text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" /> Grupo do WhatsApp
                    </button>
                  </div>
                </div>

                {targetMode === "phone" ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Número de destino (com DDD)</Label>
                    <Input
                      value={config.whatsapp_target_phone || ""}
                      onChange={(e) => setConfig({ ...config, whatsapp_target_phone: e.target.value.replace(/\D/g, "") })}
                      placeholder="ex: 11999999999"
                      maxLength={13}
                    />
                    <p className="text-[11px] text-muted-foreground/70">
                      Sem o +55. Apenas DDD + número.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Grupo de destino</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={loadGroups}
                        disabled={loadingGroups}
                        className="h-6 gap-1 text-[11px]"
                      >
                        {loadingGroups ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Atualizar
                      </Button>
                    </div>
                    <Select
                      value={config.whatsapp_target_jid || ""}
                      onValueChange={(v) => {
                        const g = groups.find((x) => x.id === v);
                        setConfig({ ...config, whatsapp_target_jid: v, whatsapp_target_label: g?.name || v });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={loadingGroups ? "Carregando grupos..." : groups.length === 0 ? "Nenhum grupo (clique em Atualizar)" : "Selecione um grupo"} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {groups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            <div className="flex items-center gap-2">
                              <Users className="w-3 h-3 opacity-60" />
                              <span>{g.name || g.id}</span>
                              {g.participants ? <span className="text-[10px] opacity-60">({g.participants})</span> : null}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {config.whatsapp_target_label && (
                      <p className="text-[11px] text-emerald-400">Selecionado: {config.whatsapp_target_label}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground/70">
                      A IA enviará no grupo: nome do cliente, número e o motivo do alerta.
                    </p>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Button onClick={saveConfig} className="w-full sm:w-auto">Salvar configurações</Button>
        </div>
      )}
    </div>
  );
}

function AlertCard({ alert, onRead, onResolve, onDismiss }: {
  alert: SmartAlert;
  onRead: (id: string) => void;
  onResolve: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const meta = ALERT_META[alert.alert_type] || { icon: Bell, label: alert.alert_type, color: "text-muted-foreground bg-muted/20 border-border/40" };
  const Icon = meta.icon;
  const isUnread = alert.status === "unread";

  return (
    <Card
      className={`p-4 transition cursor-pointer ${isUnread ? "border-primary/40 bg-primary/[0.03]" : "hover:border-border/80"}`}
      onClick={() => isUnread && onRead(alert.id)}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg border ${meta.color} shrink-0`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${meta.color}`}>{meta.label}</Badge>
            {isUnread && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
            {alert.whatsapp_sent && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                <MessageSquare className="w-2.5 h-2.5" /> Enviado no WhatsApp
              </Badge>
            )}
            <span className="text-[11px] text-muted-foreground ml-auto flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDistanceToNow(new Date(alert.created_at), { locale: ptBR, addSuffix: true })}
            </span>
          </div>
          <h3 className="font-semibold text-sm">{alert.title}</h3>
          <p className="text-sm text-muted-foreground">{alert.description}</p>
          {alert.contact_name || alert.contact_phone ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="w-3 h-3" />
              {alert.contact_name || alert.contact_phone}
              {alert.contact_name && <span className="opacity-60">· {alert.contact_phone}</span>}
            </div>
          ) : null}
          {alert.context_message && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Última mensagem</summary>
              <div className="mt-1.5 p-2 bg-muted/30 rounded border border-border/30 italic text-muted-foreground">
                "{alert.context_message}"
              </div>
            </details>
          )}
          <div className="flex gap-2 pt-1">
            {alert.status !== "resolved" && (
              <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onResolve(alert.id); }} className="gap-1.5 h-7 text-xs">
                <CheckCircle2 className="w-3 h-3" /> Resolver
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onDismiss(alert.id); }} className="gap-1.5 h-7 text-xs text-muted-foreground hover:text-destructive">
              <X className="w-3 h-3" /> Descartar
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
