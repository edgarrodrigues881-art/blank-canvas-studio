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
import {
  Bell, BellRing, X, Phone, Clock, Sparkles, MessageSquare, Settings as SettingsIcon,
  Trophy, UserCheck, Eye, CheckCircle2, Users, Loader2, RefreshCw,
  CalendarClock, ListTodo, Send, Repeat, Radio, Link2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

const ALERT_META: Record<string, { icon: any; label: string; color: string }> = {
  human_request:         { icon: UserCheck,     label: "Pediu humano",          color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
  closing_opportunity:   { icon: Trophy,        label: "Oportunidade",          color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  dispatch_event:        { icon: Send,          label: "Disparo agendado",      color: "text-violet-400 bg-violet-500/10 border-violet-500/30" },
  task_reminder:         { icon: ListTodo,      label: "Tarefa",                color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  appointment_reminder:  { icon: CalendarClock, label: "Compromisso",           color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" },
  followup_event:        { icon: Repeat,        label: "Follow-up",             color: "text-pink-400 bg-pink-500/10 border-pink-500/30" },
};

const CATEGORY_FILTERS = [
  { k: "all",                  l: "Todos",         types: [] as string[] },
  { k: "ia",                   l: "IA",            types: ["human_request", "closing_opportunity"] },
  { k: "dispatch_event",       l: "Disparos",      types: ["dispatch_event"] },
  { k: "task_reminder",        l: "Tarefas",       types: ["task_reminder"] },
  { k: "appointment_reminder", l: "Agenda",        types: ["appointment_reminder"] },
  { k: "followup_event",       l: "Follow-up",     types: ["followup_event"] },
];

export default function AISmartAlerts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { alerts, unreadCount, loading, markRead, markResolved, dismiss, markAllRead } = useSmartAlerts();
  const [statusFilter, setStatusFilter] = useState<"all" | "unread" | "resolved">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [tab, setTab] = useState<"alerts" | "settings">("alerts");

  // Settings
  const [config, setConfig] = useState<any>(null);
  const [reportDevice, setReportDevice] = useState<{ id: string; name: string; number: string | null; status: string } | null>(null);
  const [groups, setGroups] = useState<{ id: string; name: string; participants?: number }[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // 1. Carrega config
      const { data } = await supabase
        .from("ai_alerts_config" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      const cfg: any = data || {
        enabled: true,
        alert_human_request: true,
        alert_closing_opportunity: true,
        alert_scheduled_dispatch: true,
        alert_task_reminder: true,
        alert_appointment_reminder: true,
        alert_followup_event: true,
        notify_whatsapp: false,
        whatsapp_target_jid: null,
        whatsapp_target_label: null,
        appointment_lead_minutes: 15,
        task_lead_minutes: 30,
        share_with_report_wa: true,
      };
      setConfig(cfg);

      // 2. Pega o device do Relatório WA (instância compartilhada)
      const { data: devs } = await supabase
        .from("devices")
        .select("id, name, number, status, login_type")
        .eq("user_id", user.id)
        .eq("login_type", "report_wa")
        .maybeSingle();
      if (devs) setReportDevice(devs as any);
    })();
  }, [user]);

  const isReportConnected = reportDevice?.status === "Ready";

  const loadGroups = async () => {
    if (!user || !reportDevice?.id) return;
    setLoadingGroups(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whapi-chats?action=list_chats&device_id=${reportDevice.id}&count=200`,
        { headers: { Authorization: `Bearer ${session?.access_token}` } }
      );
      const data = await res.json();
      const list = (data?.chats || [])
        .filter((c: any) => (c.id || c.jid)?.includes("@g.us"))
        .map((c: any) => ({
          id: c.id || c.jid,
          name: c.name || c.subject || c.title || c.id || "Grupo sem nome",
          participants: c.participants?.length || c.participantsCount || c.size || undefined,
        }))
        .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
      setGroups(list);
      if (list.length === 0) toast.info("Nenhum grupo encontrado nessa instância.");
    } catch (e: any) {
      toast.error("Erro ao carregar grupos: " + (e.message || ""));
    } finally {
      setLoadingGroups(false);
    }
  };

  useEffect(() => {
    if (tab === "settings" && config?.notify_whatsapp && reportDevice?.status === "Ready" && groups.length === 0 && !loadingGroups) {
      loadGroups();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, config?.notify_whatsapp, reportDevice?.status]);

  const saveConfig = async () => {
    if (!user || !config) return;
    if (config.notify_whatsapp) {
      if (!reportDevice?.id) {
        toast.error("Conecte a instância de Relatório/Notificação primeiro.");
        return;
      }
      if (!config.whatsapp_target_jid) {
        toast.error("Selecione um grupo de destino.");
        return;
      }
    }
    const payload = {
      user_id: user.id,
      enabled: config.enabled,
      alert_human_request: config.alert_human_request,
      alert_closing_opportunity: config.alert_closing_opportunity,
      alert_scheduled_dispatch: config.alert_scheduled_dispatch,
      alert_task_reminder: config.alert_task_reminder,
      alert_appointment_reminder: config.alert_appointment_reminder,
      alert_followup_event: config.alert_followup_event,
      notify_whatsapp: config.notify_whatsapp,
      whatsapp_device_id: reportDevice?.id || null,
      whatsapp_target_phone: null,
      whatsapp_target_jid: config.whatsapp_target_jid || null,
      whatsapp_target_label: config.whatsapp_target_label || null,
      appointment_lead_minutes: Number(config.appointment_lead_minutes) || 15,
      task_lead_minutes: Number(config.task_lead_minutes) || 30,
      share_with_report_wa: true,
    };
    const { error } = await supabase.from("ai_alerts_config" as any).upsert(payload, { onConflict: "user_id" });
    if (error) toast.error("Erro ao salvar"); else toast.success("Configurações salvas");
  };

  const activeCategory = CATEGORY_FILTERS.find((c) => c.k === categoryFilter) || CATEGORY_FILTERS[0];

  const filteredAlerts = alerts.filter((a) => {
    if (statusFilter === "unread" && a.status !== "unread") return false;
    if (statusFilter === "resolved" && a.status !== "resolved") return false;
    if (statusFilter === "all" && a.status === "dismissed") return false;
    if (activeCategory.types.length > 0 && !activeCategory.types.includes(a.alert_type)) return false;
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
              Notificações
              {unreadCount > 0 && (
                <Badge className="bg-red-500 hover:bg-red-500 text-white">{unreadCount}</Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Avisos de disparos agendados, tarefas, agenda, follow-up e alertas da IA — tudo em um só lugar.
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
          <Bell className="w-3.5 h-3.5" /> Notificações
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
          {/* Categoria */}
          <div className="flex gap-2 flex-wrap">
            {CATEGORY_FILTERS.map((f) => {
              const count = f.types.length === 0
                ? alerts.filter((a) => a.status !== "dismissed").length
                : alerts.filter((a) => a.status !== "dismissed" && f.types.includes(a.alert_type)).length;
              return (
                <button
                  key={f.k}
                  onClick={() => setCategoryFilter(f.k)}
                  className={`px-3 py-1.5 text-xs rounded-full border transition flex items-center gap-1.5 ${
                    categoryFilter === f.k
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/30 border-border/40 text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {f.l}
                  <span className="opacity-70 tabular-nums">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Status */}
          <div className="flex gap-2 flex-wrap">
            {[
              { k: "all", l: "Todos" },
              { k: "unread", l: `Não lidos (${unreadCount})` },
              { k: "resolved", l: "Resolvidos" },
            ].map((f) => (
              <button
                key={f.k}
                onClick={() => setStatusFilter(f.k as any)}
                className={`px-3 py-1 text-[11px] rounded border transition ${
                  statusFilter === f.k
                    ? "bg-foreground/10 border-foreground/30 text-foreground"
                    : "bg-transparent border-border/30 text-muted-foreground hover:text-foreground"
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
              Nenhuma notificação no momento. As notificações aparecerão automaticamente conforme os eventos acontecem.
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
                <h3 className="font-medium">Ativar notificações</h3>
                <p className="text-xs text-muted-foreground">Quando desligado, nenhuma notificação será gerada.</p>
              </div>
              <Switch checked={config.enabled} onCheckedChange={(v) => setConfig({ ...config, enabled: v })} />
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <h3 className="font-medium">Tipos de notificação</h3>
            <div className="space-y-3">
              <ToggleRow
                icon={<Send className="w-4 h-4 text-violet-400" />}
                title="Disparos agendados"
                desc="Avisa quando um disparo programado é executado ou falha."
                checked={config.alert_scheduled_dispatch}
                onChange={(v) => setConfig({ ...config, alert_scheduled_dispatch: v })}
              />
              <ToggleRow
                icon={<ListTodo className="w-4 h-4 text-amber-400" />}
                title="Tarefas próximas / atrasadas"
                desc="Lembrete antes do prazo e quando uma tarefa atrasa."
                checked={config.alert_task_reminder}
                onChange={(v) => setConfig({ ...config, alert_task_reminder: v })}
                trailing={(
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number" min={5} max={1440}
                      value={config.task_lead_minutes ?? 30}
                      onChange={(e) => setConfig({ ...config, task_lead_minutes: e.target.value })}
                      className="h-7 w-16 text-xs"
                    />
                    <span className="text-[11px] text-muted-foreground">min antes</span>
                  </div>
                )}
              />
              <ToggleRow
                icon={<CalendarClock className="w-4 h-4 text-cyan-400" />}
                title="Compromissos da agenda"
                desc="Lembrete antes de cada compromisso do CRM."
                checked={config.alert_appointment_reminder}
                onChange={(v) => setConfig({ ...config, alert_appointment_reminder: v })}
                trailing={(
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number" min={5} max={1440}
                      value={config.appointment_lead_minutes ?? 15}
                      onChange={(e) => setConfig({ ...config, appointment_lead_minutes: e.target.value })}
                      className="h-7 w-16 text-xs"
                    />
                    <span className="text-[11px] text-muted-foreground">min antes</span>
                  </div>
                )}
              />
              <ToggleRow
                icon={<Repeat className="w-4 h-4 text-pink-400" />}
                title="Follow-up CRM"
                desc="Avisa quando um follow-up é disparado ou falha."
                checked={config.alert_followup_event}
                onChange={(v) => setConfig({ ...config, alert_followup_event: v })}
              />
              <div className="border-t border-border/40 my-2" />
              <ToggleRow
                icon={<UserCheck className="w-4 h-4 text-blue-400" />}
                title="IA: lead pediu atendimento humano"
                desc="A IA detecta quando o lead solicita falar com humano."
                checked={config.alert_human_request}
                onChange={(v) => setConfig({ ...config, alert_human_request: v })}
              />
              <ToggleRow
                icon={<Trophy className="w-4 h-4 text-emerald-400" />}
                title="IA: oportunidade de fechamento"
                desc="A IA identifica o melhor momento de fechar a venda."
                checked={config.alert_closing_opportunity}
                onChange={(v) => setConfig({ ...config, alert_closing_opportunity: v })}
              />
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-medium flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" /> Notificar em um grupo de WhatsApp
                </h3>
                <p className="text-xs text-muted-foreground">Envia cada notificação para um grupo. Compartilha a mesma instância do Relatório via WhatsApp.</p>
              </div>
              <Switch checked={config.notify_whatsapp} onCheckedChange={(v) => setConfig({ ...config, notify_whatsapp: v })} />
            </div>

            {config.notify_whatsapp && (
              <div className="space-y-4 pt-2 border-t border-border/40">
                {/* Instância compartilhada */}
                <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <Link2 className="w-3.5 h-3.5 text-primary" />
                    Instância compartilhada com Relatório WhatsApp
                  </div>
                  {reportDevice ? (
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Radio className={`w-4 h-4 ${isReportConnected ? "text-emerald-500" : "text-muted-foreground"}`} />
                        <div>
                          <p className="text-sm font-medium">{reportDevice.name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{reportDevice.number || "—"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] gap-1 ${isReportConnected ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/5" : "border-destructive/30 text-destructive bg-destructive/5"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isReportConnected ? "bg-emerald-500 animate-pulse" : "bg-destructive"}`} />
                          {isReportConnected ? "Conectado" : "Offline"}
                        </Badge>
                        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => navigate("/dashboard/report-connection")}>
                          Gerenciar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">Nenhuma instância de relatório provisionada ainda.</p>
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => navigate("/dashboard/report-connection")}>
                        Conectar agora
                      </Button>
                    </div>
                  )}
                </div>

                {/* Grupo destino */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Grupo de destino</Label>
                    <Button
                      type="button" variant="ghost" size="sm"
                      onClick={loadGroups} disabled={loadingGroups || !isReportConnected}
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
                    disabled={!isReportConnected}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={!isReportConnected ? "Conecte a instância primeiro" : loadingGroups ? "Carregando grupos..." : groups.length === 0 ? "Nenhum grupo (clique em Atualizar)" : "Selecione um grupo"} />
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
                </div>
              </div>
            )}
          </Card>

          <Button onClick={saveConfig} className="w-full sm:w-auto">Salvar configurações</Button>
        </div>
      )}
    </div>
  );
}

function ToggleRow({ icon, title, desc, checked, onChange, trailing }: {
  icon: React.ReactNode; title: string; desc: string;
  checked: boolean; onChange: (v: boolean) => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/40">
      <div className="flex items-center gap-3 min-w-0">
        {icon}
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground truncate">{desc}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {trailing}
        <Switch checked={!!checked} onCheckedChange={onChange} />
      </div>
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
              {alert.contact_name && alert.contact_phone && <span className="opacity-60">· {alert.contact_phone}</span>}
            </div>
          ) : null}
          {alert.context_message && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Detalhes</summary>
              <div className="mt-1.5 p-2 bg-muted/30 rounded border border-border/30 italic text-muted-foreground whitespace-pre-wrap">
                {alert.context_message}
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
